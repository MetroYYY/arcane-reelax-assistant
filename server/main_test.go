package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestRequestedDownloadLatestKeepsLegacyPath(t *testing.T) {
	filename, version, ok := requestedDownload("")
	if !ok || filename != downloadFile || version != readLatestVersion() {
		t.Fatalf("latest download mismatch: %q %q %v", filename, version, ok)
	}
}

func testDatabase(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	if err = createSchema(db); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestTicketLifecycle(t *testing.T) {
	db := testDatabase(t)
	rl := newRateLimiter(time.Minute, 30)
	createBody := `{"uid":"10001","name":"玩家","version":"2.1.2","category":"bug","title":"测试工单","content":"首次描述"}`
	request := httptest.NewRequest(http.MethodPost, "/tickets", strings.NewReader(createBody))
	response := httptest.NewRecorder()
	createTicketHandler(db, rl)(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("create failed: %d %s", response.Code, response.Body.String())
	}
	var created struct {
		TicketID int64 `json:"ticketId"`
	}
	if json.Unmarshal(response.Body.Bytes(), &created) != nil || created.TicketID == 0 {
		t.Fatalf("missing ticket id: %s", response.Body.String())
	}
	var adminUnread bool
	if err := db.QueryRow(`SELECT admin_unread FROM tickets WHERE id=?`, created.TicketID).Scan(&adminUnread); err != nil || !adminUnread {
		t.Fatalf("new ticket should notify admin: %v %v", adminUnread, err)
	}

	reply := httptest.NewRequest(http.MethodPost, "/tickets/1/messages", strings.NewReader(`{"uid":"10001","content":"补充内容"}`))
	replyResponse := httptest.NewRecorder()
	playerTicketHandler(db)(replyResponse, reply)
	if replyResponse.Code != http.StatusOK {
		t.Fatalf("reply failed: %d %s", replyResponse.Code, replyResponse.Body.String())
	}

	detail := httptest.NewRequest(http.MethodGet, "/tickets/1?uid=10001", nil)
	detailResponse := httptest.NewRecorder()
	playerTicketHandler(db)(detailResponse, detail)
	if detailResponse.Code != http.StatusOK || !strings.Contains(detailResponse.Body.String(), "补充内容") {
		t.Fatalf("detail failed: %d %s", detailResponse.Code, detailResponse.Body.String())
	}

	foreign := httptest.NewRequest(http.MethodGet, "/tickets/1?uid=other", nil)
	foreignResponse := httptest.NewRecorder()
	playerTicketHandler(db)(foreignResponse, foreign)
	if foreignResponse.Code != http.StatusNotFound {
		t.Fatalf("foreign uid should not read ticket: %d", foreignResponse.Code)
	}
}

func TestCSVImportsOnceThenCollectorWritesSQLite(t *testing.T) {
	db := testDatabase(t)
	file := filepath.Join(t.TempDir(), "usage.csv")
	if err := os.WriteFile(file, []byte("uid,name,version,ts\n1,测试,1.0.0,2026-01-01 00:00:00\n"), 0644); err != nil {
		t.Fatal(err)
	}
	header := []string{"uid", "name", "version", "ts"}
	collector := newDBCollector(db, "usage", file, header, nil)
	if _, err := collector.append([]string{"2", "新增", "2.1.2", nowStr()}); err != nil {
		t.Fatal(err)
	}
	_ = newDBCollector(db, "usage", file, header, nil)
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM collector_rows WHERE dataset='usage'`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("unexpected imported rows: %d %v", count, err)
	}
	content, _ := os.ReadFile(file)
	if strings.Count(string(content), "\n") != 2 {
		t.Fatalf("legacy CSV should not be modified: %q", content)
	}
}

func TestAdminCanReplyAndCloseTicket(t *testing.T) {
	db := testDatabase(t)
	now := time.Now().Format(time.RFC3339)
	result, err := db.Exec(`INSERT INTO tickets(uid,title,status,created_at,updated_at) VALUES(?,'问题','open',?,?)`, "1", now, now)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := result.LastInsertId()
	reply := httptest.NewRequest(http.MethodPost, "/admin/tickets/1", strings.NewReader("action=reply&content=后台答复"))
	reply.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	replyResponse := httptest.NewRecorder()
	adminTicketHandler(db)(replyResponse, reply)
	if replyResponse.Code != http.StatusSeeOther {
		t.Fatalf("admin reply failed: %d %s", replyResponse.Code, replyResponse.Body.String())
	}
	var status, content string
	var playerUnread bool
	if err := db.QueryRow(`SELECT status FROM tickets WHERE id=?`, id).Scan(&status); err != nil || status != "answered" {
		t.Fatalf("unexpected status: %q %v", status, err)
	}
	if err := db.QueryRow(`SELECT content FROM ticket_messages WHERE ticket_id=? AND author='admin'`, id).Scan(&content); err != nil || content != "后台答复" {
		t.Fatalf("missing reply: %q %v", content, err)
	}
	if err := db.QueryRow(`SELECT player_unread FROM tickets WHERE id=?`, id).Scan(&playerUnread); err != nil || !playerUnread {
		t.Fatalf("admin reply should notify player: %v %v", playerUnread, err)
	}
	read := httptest.NewRequest(http.MethodGet, "/tickets/1?uid=1", nil)
	playerTicketHandler(db)(httptest.NewRecorder(), read)
	_ = db.QueryRow(`SELECT player_unread FROM tickets WHERE id=?`, id).Scan(&playerUnread)
	if playerUnread {
		t.Fatal("opening ticket detail should clear the player unread state")
	}
	playerReply := httptest.NewRequest(http.MethodPost, "/tickets/1/messages", strings.NewReader(`{"uid":"1","content":"玩家补充"}`))
	playerTicketHandler(db)(httptest.NewRecorder(), playerReply)
	_ = db.QueryRow(`SELECT player_unread FROM tickets WHERE id=?`, id).Scan(&playerUnread)
	if playerUnread {
		t.Fatal("player reply should clear player unread")
	}

	closeRequest := httptest.NewRequest(http.MethodPost, "/admin/tickets/1", strings.NewReader("action=status&status=closed"))
	closeRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	adminTicketHandler(db)(httptest.NewRecorder(), closeRequest)
	_ = db.QueryRow(`SELECT status FROM tickets WHERE id=?`, id).Scan(&status)
	if status != "closed" {
		t.Fatalf("ticket not closed: %q", status)
	}
	_ = db.QueryRow(`SELECT player_unread FROM tickets WHERE id=?`, id).Scan(&playerUnread)
	if !playerUnread {
		t.Fatal("closing a ticket should notify the player")
	}
}

func TestRequestedDownloadHistoricalVersion(t *testing.T) {
	filename, version, ok := requestedDownload("1.6.0")
	want := filepath.Join(releaseDir, "arcane-assistant-v1.6.0.user.js")
	if !ok || filename != want || version != "1.6.0" {
		t.Fatalf("historical download mismatch: %q %q %v", filename, version, ok)
	}
}

func TestRequestedDownloadRejectsUnsafeVersion(t *testing.T) {
	for _, version := range []string{"1.6", "v1.6.0", "../1.6.0", "1.6.0/extra", "1.6.x"} {
		if _, _, ok := requestedDownload(version); ok {
			t.Fatalf("unsafe version accepted: %q", version)
		}
	}
}

func TestAdminUsageShowsUniquePlayersByVersion(t *testing.T) {
	db := testDatabase(t)
	for _, raw := range []string{
		`{"uid":"u1","version":"2.1.2"}`,
		`{"uid":"u1","version":"2.1.2"}`,
		`{"uid":"u2","version":"2.1.2"}`,
		`{"uid":"u3","version":"2.1.1"}`,
	} {
		if _, err := db.Exec(`INSERT INTO collector_rows(dataset,values_json,created_at) VALUES('usage',?,?)`, raw, nowStr()); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/admin/data?dataset=usage", nil)
	response := httptest.NewRecorder()
	adminDataHandler(db)(response, request)
	body := response.Body.String()
	if response.Code != http.StatusOK || !strings.Contains(body, "各版本使用人数") || !strings.Contains(body, "2.1.2") || !strings.Contains(body, ">2</td>") {
		t.Fatalf("usage summary missing: %d %s", response.Code, body)
	}
}

func TestAdminLogsListsAndServesSavedLogs(t *testing.T) {
	db := testDatabase(t)
	dir := t.TempDir()
	t.Setenv("ASMY_DATA_DIR", dir)
	attachments := filepath.Join(dir, "attachments")
	if err := os.MkdirAll(attachments, 0755); err != nil {
		t.Fatal(err)
	}
	name := "u1_20260827-120000_0_log.txt"
	if err := os.WriteFile(filepath.Join(attachments, name), []byte("test log content"), 0644); err != nil {
		t.Fatal(err)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/admin/data?dataset=logs", nil)
	listResponse := httptest.NewRecorder()
	adminDataHandler(db)(listResponse, listRequest)
	if listResponse.Code != http.StatusOK || !strings.Contains(listResponse.Body.String(), name) {
		t.Fatalf("log listing missing: %d %s", listResponse.Code, listResponse.Body.String())
	}

	logRequest := httptest.NewRequest(http.MethodGet, "/admin/logs/"+name, nil)
	logResponse := httptest.NewRecorder()
	adminLogHandler(logResponse, logRequest)
	if logResponse.Code != http.StatusOK || !strings.Contains(logResponse.Body.String(), "test log content") {
		t.Fatalf("log content missing: %d %s", logResponse.Code, logResponse.Body.String())
	}
}

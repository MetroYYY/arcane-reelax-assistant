package main

import (
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

var adminToken = strings.TrimSpace(os.Getenv("ADMIN_TOKEN"))

const adminCookie = "asmy_admin"

const adminCSS = `body{margin:0;background:#f3f6f8;color:#20354d;font:14px/1.6 system-ui,sans-serif}header{background:#20354d;color:white;padding:14px 24px}header a{color:white;margin-right:16px}main{max-width:1180px;margin:auto;padding:22px}.card{background:white;border:1px solid #d8e1e8;border-radius:9px;padding:16px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #e7edf2;vertical-align:top}input,select,textarea,button{font:inherit;padding:7px;border:1px solid #bdcad4;border-radius:5px}textarea{width:100%;box-sizing:border-box;min-height:110px}button{background:#2a8790;color:white;cursor:pointer}.status{padding:2px 7px;border-radius:10px;background:#e8f1f3}.unread{color:#b42318;font-weight:700}.unread:before{content:'●';font-size:9px;margin-right:5px}.msg{padding:10px;border-radius:7px;margin:8px 0;background:#edf4f7}.msg div{white-space:pre-wrap}.msg.admin{background:#e8f5ea}.muted{color:#71869b}.filters{display:flex;gap:8px;flex-wrap:wrap}.json{white-space:pre-wrap;word-break:break-all;font:12px/1.5 ui-monospace,monospace}`

func adminAuthenticated(r *http.Request) bool {
	if adminToken == "" {
		return false
	}
	cookie, err := r.Cookie(adminCookie)
	return err == nil && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(adminToken)) == 1
}

func adminLoginHandler(w http.ResponseWriter, r *http.Request) {
	if adminToken == "" {
		http.Error(w, "ADMIN_TOKEN is not configured", http.StatusServiceUnavailable)
		return
	}
	if r.Method == http.MethodPost {
		_ = r.ParseForm()
		if subtle.ConstantTimeCompare([]byte(r.FormValue("token")), []byte(adminToken)) == 1 {
			http.SetCookie(w, &http.Cookie{Name: adminCookie, Value: adminToken, Path: "/admin", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, MaxAge: 86400 * 7})
			http.Redirect(w, r, "/admin/", http.StatusSeeOther)
			return
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>` + adminCSS + `</style><main><div class="card"><h1>奥术摸鱼大师后台</h1><form method="post"><input type="password" name="token" placeholder="管理员 Token" required autofocus> <button>登录</button></form></div></main>`))
}

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !adminAuthenticated(r) {
			http.Redirect(w, r, "/admin/login", http.StatusSeeOther)
			return
		}
		next(w, r)
	}
}

func adminLayout(title, body string) string {
	return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>` + template.HTMLEscapeString(title) + `</title><style>` + adminCSS + `</style><header><strong>奥术摸鱼大师后台</strong>　<a href="/admin/">工单</a><a href="/admin/data">数据</a></header><main>` + body + `</main></html>`
}

func adminTicketsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		uid := strings.TrimSpace(r.URL.Query().Get("uid"))
		query := `SELECT id,uid,player_name,script_version,category,title,status,player_unread,admin_unread,created_at,updated_at FROM tickets WHERE 1=1`
		args := []any{}
		if status == "open" {
			query += ` AND status<>'closed'`
		} else if status == "closed" {
			query += ` AND status='closed'`
		}
		if uid != "" {
			query += ` AND uid=?`
			args = append(args, uid)
		}
		query += ` ORDER BY updated_at DESC LIMIT 300`
		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()
		items := []ticketSummary{}
		for rows.Next() {
			var item ticketSummary
			if rows.Scan(&item.ID, &item.UID, &item.Name, &item.Version, &item.Category, &item.Title, &item.Status, &item.PlayerUnread, &item.AdminUnread, &item.CreatedAt, &item.UpdatedAt) == nil {
				items = append(items, item)
			}
		}
		const page = `<div class="card"><h1>工单</h1><p class="muted">列表每 30 秒自动刷新；玩家有新回复时显示红点。</p><form class="filters"><select name="status"><option value="">全部工单</option><option value="open" {{if eq .Status "open"}}selected{{end}}>开启中</option><option value="closed" {{if eq .Status "closed"}}selected{{end}}>已关闭</option></select><input name="uid" value="{{.UID}}" placeholder="玩家 ID"><button>筛选</button></form></div><div class="card"><table><tr><th>ID</th><th>状态</th><th>玩家</th><th>类别</th><th>标题</th><th>更新时间</th></tr>{{range .Items}}<tr><td><a href="/admin/tickets/{{.ID}}">#{{.ID}}</a></td><td>{{if .AdminUnread}}<span class="unread">玩家有新回复</span>{{else if eq .Status "closed"}}<span class="status">已关闭</span>{{else}}<span class="status">待处理</span>{{end}}</td><td>{{.Name}}<br><span class="muted">{{.UID}} · {{.Version}}</span></td><td>{{.Category}}</td><td><a href="/admin/tickets/{{.ID}}">{{.Title}}</a></td><td>{{.UpdatedAt}}</td></tr>{{else}}<tr><td colspan="6">暂无工单</td></tr>{{end}}</table></div><script>setTimeout(function(){location.reload()},30000)</script>`
		tpl := template.Must(template.New("tickets").Parse(page))
		var body strings.Builder
		_ = tpl.Execute(&body, map[string]any{"Items": items, "Status": status, "UID": uid})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(adminLayout("工单", body.String())))
	}
}

func adminTicketHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/tickets/"), "/")
		parts := strings.Split(path, "/")
		id, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		if r.Method == http.MethodPost {
			_ = r.ParseForm()
			action := r.FormValue("action")
			now := time.Now().Format(time.RFC3339)
			switch action {
			case "reply":
				content := truncate(strings.TrimSpace(r.FormValue("content")), 12000)
				if content != "" {
					tx, _ := db.Begin()
					_, err = tx.Exec(`INSERT INTO ticket_messages(ticket_id,author,content,created_at) VALUES(?,'admin',?,?)`, id, content, now)
					if err == nil {
						_, err = tx.Exec(`UPDATE tickets SET status='answered',player_unread=1,admin_unread=0,updated_at=? WHERE id=? AND status<>'closed'`, now, id)
					}
					if err == nil {
						err = tx.Commit()
					} else {
						tx.Rollback()
					}
				}
			case "status":
				status := r.FormValue("status")
				if status == "open" || status == "closed" {
					playerUnread := 0
					if status == "closed" {
						playerUnread = 1
					}
					_, err = db.Exec(`UPDATE tickets SET status=?,player_unread=?,admin_unread=0,updated_at=? WHERE id=?`, status, playerUnread, now, id)
				}
			}
			if err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			http.Redirect(w, r, "/admin/tickets/"+strconv.FormatInt(id, 10), http.StatusSeeOther)
			return
		}
		var ticket ticketSummary
		err = db.QueryRow(`SELECT id,uid,player_name,script_version,category,title,status,player_unread,admin_unread,created_at,updated_at FROM tickets WHERE id=?`, id).Scan(&ticket.ID, &ticket.UID, &ticket.Name, &ticket.Version, &ticket.Category, &ticket.Title, &ticket.Status, &ticket.PlayerUnread, &ticket.AdminUnread, &ticket.CreatedAt, &ticket.UpdatedAt)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		_, _ = db.Exec(`UPDATE tickets SET admin_unread=0 WHERE id=?`, id)
		rows, _ := db.Query(`SELECT id,author,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id`, id)
		defer rows.Close()
		messages := []ticketMessage{}
		for rows.Next() {
			var message ticketMessage
			if rows.Scan(&message.ID, &message.Author, &message.Content, &message.CreatedAt) == nil {
				messages = append(messages, message)
			}
		}
		type attachment struct {
			ID   int64
			Name string
		}
		attachments := []attachment{}
		attachmentRows, _ := db.Query(`SELECT id,display_name FROM ticket_attachments WHERE ticket_id=? ORDER BY id`, id)
		if attachmentRows != nil {
			defer attachmentRows.Close()
			for attachmentRows.Next() {
				var item attachment
				if attachmentRows.Scan(&item.ID, &item.Name) == nil {
					attachments = append(attachments, item)
				}
			}
		}
		const page = `<div class="card"><a href="/admin/">← 返回</a><h1>#{{.Ticket.ID}} {{.Ticket.Title}}</h1><p>{{if eq .Ticket.Status "closed"}}<span class="status">已关闭</span>{{else}}<span class="status">开启中</span>{{end}}　{{.Ticket.Category}}　玩家：{{.Ticket.Name}}（{{.Ticket.UID}}）　版本：{{.Ticket.Version}}</p><form method="post" class="filters"><input type="hidden" name="action" value="status"><select name="status"><option value="open" {{if ne .Ticket.Status "closed"}}selected{{end}}>开启工单</option><option value="closed" {{if eq .Ticket.Status "closed"}}selected{{end}}>关闭工单</option></select><button>更新</button></form>{{if .Attachments}}<p>附件：{{range .Attachments}}<a href="/admin/attachments/{{.ID}}">{{.Name}}</a>　{{end}}</p>{{end}}</div><div class="card"><h2>对话</h2>{{range .Messages}}<div class="msg {{.Author}}"><strong>{{if eq .Author "admin"}}后台回复{{else}}玩家{{end}}</strong> <span class="muted">{{.CreatedAt}}</span><div>{{.Content}}</div></div>{{end}}</div>{{if ne .Ticket.Status "closed"}}<div class="card"><h2>回复玩家</h2><form method="post"><input type="hidden" name="action" value="reply"><textarea name="content" required></textarea><p><button>发送回复</button></p></form></div>{{end}}`
		tpl := template.Must(template.New("ticket").Parse(page))
		var body strings.Builder
		_ = tpl.Execute(&body, map[string]any{"Ticket": ticket, "Messages": messages, "Attachments": attachments})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(adminLayout(ticket.Title, body.String())))
	}
}

func adminAttachmentHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(strings.TrimPrefix(r.URL.Path, "/admin/attachments/"), 10, 64)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		var stored, display string
		if db.QueryRow(`SELECT stored_name,display_name FROM ticket_attachments WHERE id=?`, id).Scan(&stored, &display) != nil {
			http.NotFound(w, r)
			return
		}
		if filepath.Base(stored) != stored {
			http.Error(w, "invalid attachment", 400)
			return
		}
		w.Header().Set("Content-Disposition", `attachment; filename="`+fileNameRe.ReplaceAllString(display, "_")+`"`)
		http.ServeFile(w, r, filepath.Join(dataDirectory(), "attachments", stored))
	}
}

func adminLogHandler(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(strings.TrimPrefix(r.URL.Path, "/admin/logs/"))
	if name == "" || name == "." || name != strings.TrimPrefix(r.URL.Path, "/admin/logs/") {
		http.NotFound(w, r)
		return
	}
	for _, dir := range []string{filepath.Join(dataDirectory(), "attachments"), logsDir} {
		path := filepath.Join(dir, name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			http.ServeFile(w, r, path)
			return
		}
	}
	http.NotFound(w, r)
}

func adminDataHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dataset := strings.TrimSpace(r.URL.Query().Get("dataset"))
		allowed := map[string]bool{"usage": true, "logs": true, "doc_views": true, "reports": true, "suggestions": true, "surveys": true, "downloads": true}
		if !allowed[dataset] {
			dataset = "usage"
		}
		type rowItem struct {
			ID              string
			JSON, CreatedAt string
		}
		items := []rowItem{}
		type logItem struct {
			Name, Source, Modified, URL string
			Size                        int64
		}
		logs := []logItem{}
		if dataset == "logs" {
			for _, source := range []struct{ dir, label string }{{filepath.Join(dataDirectory(), "attachments"), "附件"}, {logsDir, "旧日志"}} {
				entries, _ := os.ReadDir(source.dir)
				for _, entry := range entries {
					info, err := entry.Info()
					if err != nil || info.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".txt") {
						continue
					}
					logs = append(logs, logItem{Name: entry.Name(), Source: source.label, Modified: info.ModTime().Format("2006-01-02 15:04:05"), Size: info.Size(), URL: "/admin/logs/" + entry.Name()})
				}
			}
			sort.Slice(logs, func(i, j int) bool { return logs[i].Modified > logs[j].Modified })
			if len(logs) > 300 {
				logs = logs[:300]
			}
		} else {
			rows, err := db.Query(`SELECT id,values_json,created_at FROM collector_rows WHERE dataset=? ORDER BY id DESC LIMIT 300`, dataset)
			if err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			defer rows.Close()
			for rows.Next() {
				var id int64
				var item rowItem
				if rows.Scan(&id, &item.JSON, &item.CreatedAt) == nil {
					item.ID = strconv.FormatInt(id, 10)
					items = append(items, item)
				}
			}
		}
		type usageStat struct {
			Version        string
			Users, Reports int
		}
		usageStats := []usageStat{}
		if dataset == "usage" {
			rows, err := db.Query(`SELECT values_json FROM collector_rows WHERE dataset='usage'`)
			if err == nil {
				defer rows.Close()
				type usageRow struct{ UID, Version string }
				users := map[string]map[string]struct{}{}
				reports := map[string]int{}
				for rows.Next() {
					var raw string
					var value usageRow
					if rows.Scan(&raw) != nil || json.Unmarshal([]byte(raw), &value) != nil {
						continue
					}
					version := strings.TrimSpace(value.Version)
					if version == "" {
						version = "未知"
					}
					if users[version] == nil {
						users[version] = map[string]struct{}{}
					}
					if value.UID != "" {
						users[version][value.UID] = struct{}{}
					}
					reports[version]++
				}
				for version, set := range users {
					usageStats = append(usageStats, usageStat{version, len(set), reports[version]})
				}
				sort.Slice(usageStats, func(i, j int) bool {
					if usageStats[i].Users == usageStats[j].Users {
						return usageStats[i].Version > usageStats[j].Version
					}
					return usageStats[i].Users > usageStats[j].Users
				})
			}
		}
		const page = `<div class="card"><h1>数据浏览</h1><div class="filters">{{range .Datasets}}<a href="?dataset={{.}}">{{.}}</a>{{end}}</div><p class="muted">当前显示 {{.Dataset}} 最近 300 条。数据库文件请通过服务器备份，不提供网页删除和任意 SQL。</p></div>{{if .UsageStats}}<div class="card"><h2>各版本使用人数</h2><table><tr><th>版本</th><th>唯一玩家</th><th>上报记录</th></tr>{{range .UsageStats}}<tr><td>{{.Version}}</td><td>{{.Users}}</td><td>{{.Reports}}</td></tr>{{end}}</table></div>{{end}}{{if eq .Dataset "logs"}}<div class="card"><table><tr><th>日志</th><th>来源</th><th>大小</th><th>写入时间</th></tr>{{range .Logs}}<tr><td><a href="{{.URL}}" target="_blank">{{.Name}}</a></td><td>{{.Source}}</td><td>{{.Size}} B</td><td>{{.Modified}}</td></tr>{{else}}<tr><td colspan="4">暂无日志</td></tr>{{end}}</table></div>{{else}}<div class="card"><table><tr><th>ID</th><th>写入时间</th><th>内容</th></tr>{{range .Items}}<tr><td>{{.ID}}</td><td>{{.CreatedAt}}</td><td class="json">{{.JSON}}</td></tr>{{end}}</table></div>{{end}}`
		tpl := template.Must(template.New("data").Parse(page))
		var body strings.Builder
		_ = tpl.Execute(&body, map[string]any{"Dataset": dataset, "Datasets": []string{"usage", "logs", "doc_views", "reports", "suggestions", "surveys", "downloads"}, "Items": items, "Logs": logs, "UsageStats": usageStats})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(adminLayout("数据浏览", body.String())))
	}
}

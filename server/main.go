package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ===================== 配置 =====================

const (
	surveyFile      = "survey.csv"
	usageFile       = "usage.csv"
	docViewFile     = "doc_views.csv"
	reportFile      = "reports.csv"
	suggestionFile  = "suggestions.csv"
	downloadFile    = "arcane-assistant.user.js"
	releaseDir      = "releases"
	downloadLogFile = "downloads.csv"
	logsDir         = "logs"

	maxSurveyBody = 64 << 10 // 问卷 64KB
	maxUsageBody  = 16 << 10 // 统计 16KB
	maxReportBody = 20 << 20 // 反馈（含日志）20MB

	rateWindow   = time.Minute
	rateMaxPerIP = 30 // 每 IP 每分钟最多 30 次

	reportCooldown = 10 * time.Minute // 同一 uid 两次报告至少间隔 10 分钟
)

// 可选鉴权：设置环境变量 COLLECTOR_TOKEN 后，请求需带 X-Auth-Token 头匹配
var authToken = os.Getenv("COLLECTOR_TOKEN")

// ===================== CSV 收集器（去重 + 追加） =====================

// 采集数据已经迁移到 database.go 中的 SQLite DBCollector。

// dedupeKey 计算一行记录的去重键（多列拼接）

// loadSeen 启动时把已有数据的去重键加载进内存，保证重启后仍能去重

// append 返回 (dup, err)；dup 为 true 时不写入

// ===================== 限频 / 冷却 =====================

type RateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
	win  time.Duration
	max  int
}

func newRateLimiter(win time.Duration, max int) *RateLimiter {
	return &RateLimiter{hits: map[string][]time.Time{}, win: win, max: max}
}

func (r *RateLimiter) allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cut := now.Add(-r.win)
	kept := r.hits[key][:0]
	for _, t := range r.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	r.hits[key] = kept
	if len(kept) >= r.max {
		return false
	}
	r.hits[key] = append(kept, now)
	return true
}

// gc 周期性清理过期记录，防止内存无限增长
func (r *RateLimiter) gc() {
	for {
		time.Sleep(10 * time.Minute)
		r.mu.Lock()
		cut := time.Now().Add(-r.win)
		for k, arr := range r.hits {
			kept := arr[:0]
			for _, t := range arr {
				if t.After(cut) {
					kept = append(kept, t)
				}
			}
			if len(kept) == 0 {
				delete(r.hits, k)
			} else {
				r.hits[k] = kept
			}
		}
		r.mu.Unlock()
	}
}

type Cooldown struct {
	mu  sync.Mutex
	win time.Duration
	m   map[string]time.Time
}

func newCooldown(win time.Duration) *Cooldown {
	return &Cooldown{win: win, m: map[string]time.Time{}}
}

// allow 同一 key 在窗口内只允许一次
func (c *Cooldown) allow(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if last, ok := c.m[key]; ok && time.Since(last) < c.win {
		return false
	}
	c.m[key] = time.Now()
	return true
}

// ===================== 通用 =====================

func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if authToken != "" && r.URL.Path != "/version" && r.URL.Path != "/download" && r.Header.Get("X-Auth-Token") != authToken {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "err": "unauthorized"})
			return
		}
		next(w, r)
	}
}

// truncate 按 rune 截断，避免截断多字节中文产生乱码
func truncate(s string, n int) string {
	rs := []rune(s)
	if len(rs) > n {
		return string(rs[:n])
	}
	return s
}

func nowStr() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

func requirePost(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "err": "method"})
		return false
	}
	return true
}

// ===================== 请求体 =====================

type surveyPayload struct {
	UID      string         `json:"uid"`
	Name     string         `json:"name"`
	Version  string         `json:"version"`
	SurveyID string         `json:"surveyId"`
	Answers  map[string]any `json:"answers"`
}

type usagePayload struct {
	UID     string `json:"uid"`
	Name    string `json:"name"`
	Version string `json:"version"`
}

type docViewPayload struct {
	VisitorID string `json:"visitorId"`
	UID       string `json:"uid"`
	Name      string `json:"name"`
	Version   string `json:"version"`
	Path      string `json:"path"`
	Source    string `json:"source"`
}

type reportPayload struct {
	UID      string          `json:"uid"`
	Name     string          `json:"name"`
	Version  string          `json:"version"`
	Desc     string          `json:"desc"`
	Settings json.RawMessage `json:"settings"`
	Logs     []logFile       `json:"logs"`
}

type suggestionPayload struct {
	UID     string `json:"uid"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Desc    string `json:"desc"`
}

type logFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ===================== 处理器 =====================

func surveyHandler(c *DBCollector, rl *RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxSurveyBody)
		var p surveyPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		p.UID = truncate(p.UID, 64)
		if p.UID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing uid"})
			return
		}
		answers, _ := json.Marshal(p.Answers)
		row := []string{p.UID, truncate(p.Name, 64), truncate(p.Version, 32), truncate(p.SurveyID, 64), truncate(string(answers), 8000), nowStr()}
		dup, err := c.append(row)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "io error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": !dup, "dup": dup})
	}
}

func usageHandler(c *DBCollector, rl *RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxUsageBody)
		var p usagePayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		p.UID = truncate(p.UID, 64)
		if p.UID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing uid"})
			return
		}
		row := []string{p.UID, truncate(p.Name, 64), truncate(p.Version, 32), nowStr()}
		dup, err := c.append(row)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "io error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "dup": dup})
	}
}

func docViewHandler(c *DBCollector, rl *RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxUsageBody)
		var p docViewPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		p.VisitorID = truncate(strings.TrimSpace(p.VisitorID), 64)
		p.UID = truncate(strings.TrimSpace(p.UID), 64)
		p.Path = truncate(strings.TrimSpace(p.Path), 240)
		if p.VisitorID == "" || !strings.HasPrefix(p.Path, "/faq/") || strings.ContainsAny(p.Path, "?#\r\n") {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "invalid view"})
			return
		}
		row := []string{p.VisitorID, p.UID, truncate(p.Name, 64), truncate(p.Version, 32), p.Path, truncate(p.Source, 32), nowStr()}
		if _, err := c.append(row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "io error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

var fileNameRe = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func saveLog(uid string, idx int, name, content string) (string, error) {
	attachmentsDir := filepath.Join(dataDirectory(), "attachments")
	if err := os.MkdirAll(attachmentsDir, 0755); err != nil {
		return "", err
	}
	safe := fileNameRe.ReplaceAllString(name, "_")
	safe = strings.Trim(safe, "._-")
	if safe == "" {
		safe = "log.txt"
	}
	fname := fmt.Sprintf("%s_%s_%d_%s", uid, time.Now().Format("20060102-150405"), idx, safe)
	if len(fname) > 160 {
		fname = fname[:160]
	}
	if err := os.WriteFile(filepath.Join(attachmentsDir, fname), []byte(content), 0644); err != nil {
		return "", err
	}
	return fname, nil
}

func reportHandler(c *DBCollector, rl *RateLimiter, cd *Cooldown) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxReportBody)
		var p reportPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		p.UID = truncate(p.UID, 64)
		p.Desc = truncate(p.Desc, 8000)
		if p.UID == "" || p.Desc == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing uid or desc"})
			return
		}
		if !cd.allow(p.UID) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "err": "cooldown"})
			return
		}
		var saved []string
		for i, l := range p.Logs {
			if strings.TrimSpace(l.Content) == "" {
				continue
			}
			fname, err := saveLog(p.UID, i, l.Name, l.Content)
			if err == nil {
				saved = append(saved, fname)
			}
		}
		row := []string{
			p.UID,
			truncate(p.Name, 64),
			truncate(p.Version, 32),
			p.Desc,
			truncate(string(p.Settings), 20000),
			strings.Join(saved, "|"),
			nowStr(),
		}
		if _, err := c.append(row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "io error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func suggestionHandler(c *DBCollector, rl *RateLimiter, cd *Cooldown) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxReportBody)
		var p suggestionPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		p.UID = truncate(p.UID, 64)
		p.Desc = truncate(p.Desc, 8000)
		if p.UID == "" || p.Desc == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing uid or desc"})
			return
		}
		if !cd.allow(p.UID) {
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "err": "cooldown"})
			return
		}
		row := []string{
			p.UID,
			truncate(p.Name, 64),
			truncate(p.Version, 32),
			p.Desc,
			nowStr(),
		}
		if _, err := c.append(row); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "io error"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

// 读取最新脚本版本号（从 latest_version.txt 读取，失败用默认值）
func readLatestVersion() string {
	version := "1.5.3"
	if b, err := os.ReadFile("latest_version.txt"); err == nil {
		if v := strings.TrimSpace(string(b)); v != "" {
			version = v
		}
	}
	return version
}

// 版本检查：返回最新脚本版本号
func versionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "err": "method"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"version": readLatestVersion()})
}

func requestedDownload(version string) (string, string, bool) {
	if version == "" {
		return downloadFile, readLatestVersion(), true
	}
	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(version) {
		return "", "", false
	}
	return filepath.Join(releaseDir, "arcane-assistant-v"+version+".user.js"), version, true
}

// 下载脚本：记录下载日志（ip/版本/UA/时间）+ 返回脚本文件
func downloadHandler(c *DBCollector) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "err": "method"})
			return
		}
		// 记录下载（不去重，每次下载都记）
		filename, servedVersion, valid := requestedDownload(strings.TrimSpace(r.URL.Query().Get("version")))
		if !valid {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "invalid version"})
			return
		}
		content, err := os.ReadFile(filename)
		if err != nil {
			http.Error(w, "script not found", http.StatusNotFound)
			return
		}
		_, _ = c.append([]string{clientIP(r), servedVersion, truncate(r.UserAgent(), 200), nowStr()})
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Disposition", `inline; filename="arcane-assistant-v`+servedVersion+`.user.js"`)
		if r.Method == http.MethodGet {
			_, _ = w.Write(content)
		}
	}
}

// ===================== 主程序 =====================

func main() {
	db, err := openDatabase()
	if err != nil {
		log.Fatal("open database: ", err)
	}
	defer db.Close()
	survey := newDBCollector(db, "surveys", surveyFile, []string{"uid", "name", "version", "surveyId", "answers", "ts"}, []string{"uid", "surveyId"})
	usage := newDBCollector(db, "usage", usageFile, []string{"uid", "name", "version", "ts"}, nil)
	docView := newDBCollector(db, "doc_views", docViewFile, []string{"visitor_id", "uid", "name", "version", "path", "source", "ts"}, nil)
	report := newDBCollector(db, "reports", reportFile, []string{"uid", "name", "version", "desc", "settings", "logfiles", "ts"}, nil)
	suggestion := newDBCollector(db, "suggestions", suggestionFile, []string{"uid", "name", "version", "desc", "ts"}, nil)
	download := newDBCollector(db, "downloads", downloadLogFile, []string{"ip", "version", "ua", "ts"}, nil)

	rl := newRateLimiter(rateWindow, rateMaxPerIP)
	go rl.gc()
	reportCD := newCooldown(reportCooldown)
	suggestionCD := newCooldown(reportCooldown)

	mux := http.NewServeMux()
	mux.HandleFunc("/survey", cors(surveyHandler(survey, rl)))
	mux.HandleFunc("/usage", cors(usageHandler(usage, rl)))
	mux.HandleFunc("/doc-view", cors(docViewHandler(docView, rl)))
	mux.HandleFunc("/report", cors(reportHandler(report, rl, reportCD)))
	mux.HandleFunc("/feedback", cors(suggestionHandler(suggestion, rl, suggestionCD)))
	mux.HandleFunc("/version", cors(versionHandler))
	mux.HandleFunc("/download", cors(downloadHandler(download)))
	mux.HandleFunc("/tickets", cors(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			listPlayerTicketsHandler(db)(w, r)
			return
		}
		createTicketHandler(db, rl)(w, r)
	}))
	mux.HandleFunc("/tickets/", cors(playerTicketHandler(db)))
	mux.HandleFunc("/admin/login", adminLoginHandler)
	mux.HandleFunc("/admin/data", requireAdmin(adminDataHandler(db)))
	mux.HandleFunc("/admin/logs/", requireAdmin(adminLogHandler))
	mux.HandleFunc("/admin/attachments/", requireAdmin(adminAttachmentHandler(db)))
	mux.HandleFunc("/admin/tickets/", requireAdmin(adminTicketHandler(db)))
	mux.HandleFunc("/admin/", requireAdmin(adminTicketsHandler(db)))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"service": "reelax-collector", "ok": true})
	})

	addr := "127.0.0.1:8000" // 只绑定本机回环，仅通过 nginx 反代对外
	log.Printf("reelax-collector listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

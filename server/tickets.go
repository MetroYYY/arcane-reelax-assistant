package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ticketPayload struct {
	UID      string    `json:"uid"`
	Name     string    `json:"name"`
	Version  string    `json:"version"`
	Category string    `json:"category"`
	Title    string    `json:"title"`
	Content  string    `json:"content"`
	Settings string    `json:"settings"`
	Logs     []logFile `json:"logs"`
}

type ticketMessagePayload struct {
	UID     string `json:"uid"`
	Content string `json:"content"`
}

type ticketSummary struct {
	ID           int64  `json:"id"`
	UID          string `json:"uid"`
	Name         string `json:"name"`
	Version      string `json:"version"`
	Category     string `json:"category"`
	Title        string `json:"title"`
	Status       string `json:"status"`
	PlayerUnread bool   `json:"playerUnread"`
	AdminUnread  bool   `json:"adminUnread"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type ticketMessage struct {
	ID        int64  `json:"id"`
	Author    string `json:"author"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

func validTicketCategory(category string) bool {
	return category == "bug" || category == "suggestion" || category == "question" || category == "other"
}

func createTicketHandler(db *sql.DB, rl *RateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requirePost(w, r) {
			return
		}
		if !rl.allow(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "err": "rate limited"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxReportBody)
		var payload ticketPayload
		if json.NewDecoder(r.Body).Decode(&payload) != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
			return
		}
		payload.UID = truncate(strings.TrimSpace(payload.UID), 64)
		payload.Title = truncate(strings.TrimSpace(payload.Title), 120)
		payload.Content = truncate(strings.TrimSpace(payload.Content), 12000)
		payload.Category = strings.TrimSpace(payload.Category)
		if payload.Category == "" {
			payload.Category = "bug"
		}
		if payload.UID == "" || payload.Title == "" || payload.Content == "" || !validTicketCategory(payload.Category) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "invalid ticket"})
			return
		}
		now := time.Now().Format(time.RFC3339)
		tx, err := db.Begin()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
			return
		}
		defer tx.Rollback()
		result, err := tx.Exec(`INSERT INTO tickets(uid,player_name,script_version,category,title,status,player_unread,admin_unread,created_at,updated_at) VALUES(?,?,?,?,?,'open',0,1,?,?)`, payload.UID, truncate(payload.Name, 64), truncate(payload.Version, 32), payload.Category, payload.Title, now, now)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
			return
		}
		id, _ := result.LastInsertId()
		if _, err = tx.Exec(`INSERT INTO ticket_messages(ticket_id,author,content,created_at) VALUES(?,'player',?,?)`, id, payload.Content, now); err != nil || tx.Commit() != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
			return
		}
		for index, item := range payload.Logs {
			if strings.TrimSpace(item.Content) == "" {
				continue
			}
			stored, saveErr := saveLog(payload.UID, index, item.Name, item.Content)
			if saveErr == nil {
				_, _ = db.Exec(`INSERT INTO ticket_attachments(ticket_id,stored_name,display_name,created_at) VALUES(?,?,?,?)`, id, stored, truncate(item.Name, 120), now)
			}
		}
		if strings.TrimSpace(payload.Settings) != "" {
			stored, saveErr := saveLog(payload.UID, len(payload.Logs), "settings.json", truncate(payload.Settings, 20000))
			if saveErr == nil {
				_, _ = db.Exec(`INSERT INTO ticket_attachments(ticket_id,stored_name,display_name,created_at) VALUES(?,?,?,?)`, id, stored, "settings.json", now)
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "ticketId": id})
	}
}

func listPlayerTicketsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "err": "method"})
			return
		}
		uid := truncate(strings.TrimSpace(r.URL.Query().Get("uid")), 64)
		if uid == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing uid"})
			return
		}
		rows, err := db.Query(`SELECT id,uid,player_name,script_version,category,title,status,player_unread,admin_unread,created_at,updated_at FROM tickets WHERE uid=? ORDER BY updated_at DESC LIMIT 100`, uid)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
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
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tickets": items})
	}
}

func playerTicketHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/tickets/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		id, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || id <= 0 {
			http.NotFound(w, r)
			return
		}
		if len(parts) == 1 && r.Method == http.MethodGet {
			readPlayerTicket(w, r, db, id)
			return
		}
		if len(parts) == 2 && parts[1] == "messages" && r.Method == http.MethodPost {
			addPlayerTicketMessage(w, r, db, id)
			return
		}
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "err": "method"})
	}
}

func readPlayerTicket(w http.ResponseWriter, r *http.Request, db *sql.DB, id int64) {
	uid := truncate(strings.TrimSpace(r.URL.Query().Get("uid")), 64)
	var ticket ticketSummary
	err := db.QueryRow(`SELECT id,uid,player_name,script_version,category,title,status,player_unread,admin_unread,created_at,updated_at FROM tickets WHERE id=? AND uid=?`, id, uid).Scan(&ticket.ID, &ticket.UID, &ticket.Name, &ticket.Version, &ticket.Category, &ticket.Title, &ticket.Status, &ticket.PlayerUnread, &ticket.AdminUnread, &ticket.CreatedAt, &ticket.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
		return
	}
	rows, _ := db.Query(`SELECT id,author,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY id`, id)
	defer rows.Close()
	messages := []ticketMessage{}
	for rows.Next() {
		var message ticketMessage
		if rows.Scan(&message.ID, &message.Author, &message.Content, &message.CreatedAt) == nil {
			messages = append(messages, message)
		}
	}
	_, _ = db.Exec(`UPDATE tickets SET player_unread=0 WHERE id=? AND uid=?`, id, uid)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "ticket": ticket, "messages": messages})
}

func addPlayerTicketMessage(w http.ResponseWriter, r *http.Request, db *sql.DB, id int64) {
	var payload ticketMessagePayload
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, maxReportBody)).Decode(&payload) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "bad json"})
		return
	}
	payload.UID = truncate(strings.TrimSpace(payload.UID), 64)
	payload.Content = truncate(strings.TrimSpace(payload.Content), 12000)
	var status string
	if db.QueryRow(`SELECT status FROM tickets WHERE id=? AND uid=?`, id, payload.UID).Scan(&status) != nil {
		http.NotFound(w, r)
		return
	}
	if status == "closed" {
		writeJSON(w, http.StatusConflict, map[string]any{"ok": false, "err": "ticket closed"})
		return
	}
	if payload.Content == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "err": "missing content"})
		return
	}
	now := time.Now().Format(time.RFC3339)
	tx, _ := db.Begin()
	defer tx.Rollback()
	_, err := tx.Exec(`INSERT INTO ticket_messages(ticket_id,author,content,created_at) VALUES(?,'player',?,?)`, id, payload.Content, now)
	if err == nil {
		_, err = tx.Exec(`UPDATE tickets SET status='open',player_unread=0,admin_unread=1,updated_at=? WHERE id=?`, now, id)
	}
	if err != nil || tx.Commit() != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "err": "database error"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

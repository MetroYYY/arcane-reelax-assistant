package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const databaseFile = "asmy.db"

func dataDirectory() string {
	if dir := strings.TrimSpace(os.Getenv("ASMY_DATA_DIR")); dir != "" {
		return dir
	}
	return "data"
}

func openDatabase() (*sql.DB, error) {
	dir := dataDirectory()
	if err := os.MkdirAll(filepath.Join(dir, "attachments"), 0755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, databaseFile))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`); err != nil {
		db.Close()
		return nil, err
	}
	if err = createSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func createSchema(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS collector_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset TEXT NOT NULL,
  values_json TEXT NOT NULL,
  dedupe_key TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS collector_rows_dedupe
  ON collector_rows(dataset, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS collector_rows_dataset_id ON collector_rows(dataset, id DESC);
CREATE TABLE IF NOT EXISTS csv_imports (
  source_file TEXT PRIMARY KEY,
  imported_rows INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  script_version TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'bug',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','processing','answered','closed')),
  player_unread INTEGER NOT NULL DEFAULT 0,
  admin_unread INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_uid_updated ON tickets(uid, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_status_updated ON tickets(status, updated_at DESC);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK(author IN ('player','admin')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ticket_messages_ticket_id ON ticket_messages(ticket_id, id);
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);`)
	if err != nil {
		return err
	}
	// Existing SQLite files are upgraded in place. Duplicate-column errors mean
	// the migration has already been applied.
	for _, statement := range []string{
		`ALTER TABLE tickets ADD COLUMN player_unread INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE tickets ADD COLUMN admin_unread INTEGER NOT NULL DEFAULT 0`,
	} {
		if _, alterErr := db.Exec(statement); alterErr != nil && !strings.Contains(strings.ToLower(alterErr.Error()), "duplicate column") {
			return alterErr
		}
	}
	return nil
}

type DBCollector struct {
	db         *sql.DB
	dataset    string
	legacyFile string
	header     []string
	dedupeCols []string
}

func newDBCollector(db *sql.DB, dataset, file string, header, dedupeCols []string) *DBCollector {
	c := &DBCollector{db: db, dataset: dataset, legacyFile: file, header: header, dedupeCols: dedupeCols}
	if err := c.importCSV(); err != nil {
		fmt.Fprintf(os.Stderr, "CSV import %s failed: %v\n", file, err)
	}
	return c
}

func (c *DBCollector) dedupeKey(row []string) string {
	if len(c.dedupeCols) == 0 {
		return ""
	}
	index := make(map[string]int, len(c.header))
	for i, name := range c.header {
		index[name] = i
	}
	parts := make([]string, 0, len(c.dedupeCols))
	for _, column := range c.dedupeCols {
		if i, ok := index[column]; ok && i < len(row) && row[i] != "" {
			parts = append(parts, row[i])
		}
	}
	return strings.Join(parts, "|")
}

func (c *DBCollector) rowObject(row []string) map[string]string {
	value := make(map[string]string, len(c.header))
	for i, column := range c.header {
		if i < len(row) {
			value[column] = row[i]
		} else {
			value[column] = ""
		}
	}
	return value
}

func (c *DBCollector) append(row []string) (bool, error) {
	return c.appendContext(context.Background(), row)
}

func (c *DBCollector) appendContext(ctx context.Context, row []string) (bool, error) {
	payload, err := json.Marshal(c.rowObject(row))
	if err != nil {
		return false, err
	}
	key := c.dedupeKey(row)
	var result sql.Result
	if key == "" {
		result, err = c.db.ExecContext(ctx, `INSERT INTO collector_rows(dataset, values_json, created_at) VALUES(?,?,?)`, c.dataset, string(payload), nowStr())
	} else {
		result, err = c.db.ExecContext(ctx, `INSERT OR IGNORE INTO collector_rows(dataset, values_json, dedupe_key, created_at) VALUES(?,?,?,?)`, c.dataset, string(payload), key, nowStr())
	}
	if err != nil {
		return false, err
	}
	affected, err := result.RowsAffected()
	return affected == 0, err
}

func (c *DBCollector) importCSV() error {
	if c.legacyFile == "" {
		return nil
	}
	var exists int
	if err := c.db.QueryRow(`SELECT COUNT(*) FROM csv_imports WHERE source_file=?`, c.legacyFile).Scan(&exists); err != nil || exists > 0 {
		return err
	}
	file, err := os.Open(c.legacyFile)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()
	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return err
	}
	if strings.Join(header, "\x00") != strings.Join(c.header, "\x00") {
		return fmt.Errorf("unexpected header")
	}
	tx, err := c.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	count := 0
	for {
		row, readErr := reader.Read()
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return readErr
		}
		payload, _ := json.Marshal(c.rowObject(row))
		key := c.dedupeKey(row)
		if key == "" {
			_, err = tx.Exec(`INSERT INTO collector_rows(dataset, values_json, created_at) VALUES(?,?,?)`, c.dataset, string(payload), nowStr())
		} else {
			_, err = tx.Exec(`INSERT OR IGNORE INTO collector_rows(dataset, values_json, dedupe_key, created_at) VALUES(?,?,?,?)`, c.dataset, string(payload), key, nowStr())
		}
		if err != nil {
			return err
		}
		count++
	}
	_, err = tx.Exec(`INSERT INTO csv_imports(source_file, imported_rows, imported_at) VALUES(?,?,?)`, c.legacyFile, count, time.Now().Format(time.RFC3339))
	if err != nil {
		return err
	}
	return tx.Commit()
}

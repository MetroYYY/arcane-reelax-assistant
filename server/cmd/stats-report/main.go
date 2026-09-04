package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type row map[string]string

func readCSV(path string) []row {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	records, err := csv.NewReader(f).ReadAll()
	if err != nil || len(records) < 2 {
		return nil
	}
	result := make([]row, 0, len(records)-1)
	for _, record := range records[1:] {
		item := row{}
		for i, key := range records[0] {
			if i < len(record) {
				item[key] = record[i]
			}
		}
		result = append(result, item)
	}
	return result
}

func parseTime(value string) time.Time {
	t, _ := time.ParseInLocation("2006-01-02 15:04:05", value, time.Local)
	return t
}

func main() {
	dir := "."
	days := 7
	if len(os.Args) > 1 && strings.TrimSpace(os.Args[1]) != "" {
		dir = os.Args[1]
	}
	if len(os.Args) > 2 {
		_, _ = fmt.Sscanf(os.Args[2], "%d", &days)
	}
	latestBytes, _ := os.ReadFile(filepath.Join(dir, "latest_version.txt"))
	latestVersion := strings.TrimSpace(string(latestBytes))
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)

	latestByUID := map[string]row{}
	for _, item := range readCSV(filepath.Join(dir, "usage.csv")) {
		uid := item["uid"]
		if uid == "" {
			continue
		}
		if previous := latestByUID[uid]; previous == nil || parseTime(item["ts"]).After(parseTime(previous["ts"])) {
			latestByUID[uid] = item
		}
	}
	old := make([]row, 0)
	for _, item := range latestByUID {
		if item["version"] != latestVersion && !parseTime(item["ts"]).Before(cutoff) {
			old = append(old, item)
		}
	}
	sort.Slice(old, func(i, j int) bool { return parseTime(old[i]["ts"]).After(parseTime(old[j]["ts"])) })
	fmt.Printf("最近 %d 天仍活跃的旧版本玩家（最新版本 %s）：%d\n", days, latestVersion, len(old))
	for _, item := range old {
		fmt.Printf("- %s (%s): v%s，最后上报 %s\n", item["name"], item["uid"], item["version"], item["ts"])
	}

	views := readCSV(filepath.Join(dir, "doc_views.csv"))
	pageCounts := map[string]int{}
	identified := 0
	for _, item := range views {
		pageCounts[item["path"]]++
		if item["uid"] != "" {
			identified++
		}
	}
	type pageCount struct {
		path  string
		count int
	}
	pages := make([]pageCount, 0, len(pageCounts))
	for path, count := range pageCounts {
		pages = append(pages, pageCount{path, count})
	}
	sort.Slice(pages, func(i, j int) bool { return pages[i].count > pages[j].count })
	fmt.Printf("\n文档访问：%d 次，其中可关联玩家 %d 次\n", len(views), identified)
	for _, page := range pages {
		fmt.Printf("- %4d  %s\n", page.count, page.path)
	}

	fmt.Println("\n最近可关联的玩家访问：")
	start := len(views) - 30
	if start < 0 {
		start = 0
	}
	for i := len(views) - 1; i >= start; i-- {
		item := views[i]
		if item["uid"] == "" {
			continue
		}
		fmt.Printf("- %s  %s (%s) v%s  %s\n", item["ts"], item["name"], item["uid"], item["version"], item["path"])
	}
}

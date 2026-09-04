# SQLite 与工单后台部署

本文用于把线上采集服务从根目录 CSV 迁移到 SQLite，并启用玩家工单和管理员后台。以下示例部署目录为 `/opt/asmy`。

## 1. 新目录

```text
/opt/asmy/
├─ collector
├─ latest_version.txt
├─ arcane-assistant.user.js
├─ releases/
├─ data/
│  ├─ asmy.db
│  ├─ attachments/
│  ├─ backups/
│  └─ archive/
└─ logs/
```

服务读取 `ASMY_DATA_DIR`；未设置时使用工作目录下的 `data/`。生产环境建议明确设置为 `/opt/asmy/data`。

## 2. 兼容性

以下旧接口和地址保持不变：

- `/version`
- `/arcane-assistant.user.js`
- `/usage`
- `/doc-view`
- `/report`
- `/feedback`
- `/survey`

历史下载仍使用 `/arcane-assistant.user.js?version=X.Y.Z`。首次启动 SQLite 版本时会读取工作目录中现有 CSV，导入成功后记录到 `csv_imports`，后续重启不会重复导入。

新增接口：

- `POST /tickets`：创建工单。
- `GET /tickets?uid=玩家ID`：读取玩家历史工单。
- `GET /tickets/{id}?uid=玩家ID`：读取工单对话。
- `POST /tickets/{id}/messages`：玩家补充内容。
- `/admin/`：管理员后台。

## 3. 管理员认证

后台使用环境变量 `ADMIN_TOKEN`。必须设置一个足够长的随机值；玩家接口不需要该 Token。

```bash
openssl rand -hex 32
```

不要为面向公开脚本的服务设置 `COLLECTOR_TOKEN`，旧脚本不会发送该请求头。

推荐的 systemd 服务配置：

```ini
[Unit]
Description=Arcane Assistant Collector
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/asmy
ExecStart=/opt/asmy/collector
Environment=ASMY_DATA_DIR=/opt/asmy/data
Environment=ADMIN_TOKEN=替换为openssl生成的随机值
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

如果现有服务不是以 `www-data` 运行，请保留原来的用户和组，并把下文目录权限赋给实际运行用户。

## 4. 数据迁移原则

1. 停止旧服务后备份整个 `/opt/asmy`。
2. 保留 CSV 在工作目录中启动一次新服务。
3. 确认 `data/asmy.db` 已生成，并在后台“数据”页核对各数据集。
4. 确认 `csv_imports` 已记录导入结果后，再把 CSV 移到 `data/archive/`。
5. 不要在首次成功启动前移动或删除 CSV。

旧 `logs/` 中的历史反馈附件可以原样归档；新附件写入 `data/attachments/`。

## 5. 备份

SQLite 使用 WAL 模式。在线备份建议使用 SQLite 自带备份命令，而不是只复制正在写入的主文件：

```bash
sqlite3 /opt/asmy/data/asmy.db ".backup '/opt/asmy/data/backups/asmy-$(date +%F-%H%M%S).db'"
```

也可以停服务后同时复制 `asmy.db`、`asmy.db-wal` 和 `asmy.db-shm`。

## 6. 回滚

如果新服务启动失败：

1. 停止新服务。
2. 恢复旧 collector 可执行文件。
3. 把 CSV 从备份或 `data/archive/` 放回 `/opt/asmy`。
4. 恢复旧 systemd 环境配置并启动。

新服务不会自动删除或改写原 CSV，因此首次迁移前可以安全回滚。

## 7. 推荐上线命令

在本地 `server/` 构建 Linux 程序：

```bash
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o collector .
```

将新程序、历史脚本目录和 Nginx 配置上传到服务器临时目录后，在服务器执行：

```bash
sudo systemctl stop arcane-assistant
sudo cp -a /opt/asmy "/opt/asmy-backup-$(date +%F-%H%M%S)"
sudo mkdir -p /opt/asmy/data/{attachments,backups,archive}
sudo install -m 0755 /tmp/asmy-upload/collector /opt/asmy/collector
sudo rsync -a /tmp/asmy-upload/releases/ /opt/asmy/releases/
sudo chown -R www-data:www-data /opt/asmy/data
```

更新 systemd 配置后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl start arcane-assistant
sudo journalctl -u arcane-assistant -n 100 --no-pager
```

首次启动确认无误后再归档 CSV：

```bash
sqlite3 /opt/asmy/data/asmy.db "SELECT dataset, COUNT(*) FROM collector_rows GROUP BY dataset;"
sqlite3 /opt/asmy/data/asmy.db "SELECT source_file, imported_rows, imported_at FROM csv_imports;"
sudo mv /opt/asmy/*.csv /opt/asmy/data/archive/
```

最后访问 `https://reelax.hsiyue.com/admin/` 登录后台，并创建一张测试工单验证玩家端读取、后台回复和关闭。

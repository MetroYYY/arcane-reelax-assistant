# 奥术摸鱼大师辅助

我是本项目原作者 **y**。这是适用于 Arcane Reelax / Reelax 的浏览器用户脚本。本仓库保存正式版 **v2.1.3** 的前端构建源码、可安装脚本、历史版本、Go 后台及相关文档，使用 MIT 协议。

## 为什么放到 GitHub

后续没有足够时间继续维护脚本了，我准备去做游戏，因此把能够复现 v2.1.3 的项目文件放到 GitHub。有时间和精力的朋友可以 Fork 后继续修复问题、适配游戏更新或接手维护。

本项目不是游戏官方项目，也不代表游戏官方立场。使用自动化功能前，请自行确认游戏规则并承担相应风险。仓库不包含线上数据库、玩家日志、生产环境密钥、管理员 Token 或其他私人数据。

## 仓库结构

```text
.
├─ src/          v2.1.3 前端构建源码
├─ build.mjs     前端构建入口
├─ dist/         当前可安装脚本
├─ releases/     前端历史正式版本
├─ server/       Go 后台、管理页面和后台脚本归档
├─ faq-site/     v2.1.3 文档站源码与静态产物
├─ docs/
│  ├─ reference/ 接口与游戏数据参考
│  └─ developer/ 构建、发布和部署流程
└─ assets/       README 使用的赞赏码图片
```

# 前端：用户脚本

## 前端架构

v2.1.3 最终运行在 Tampermonkey 中，是一个没有运行时模块加载器的单文件用户脚本。正式构建采用“完整基线源码 + 唯一匹配补丁”的方式：

```text
src/
├─ arcane-assistant-v2.1.3.base.js  构建前的完整脚本基线
└─ constants.js                      版本、默认配置和正式更新说明

build.mjs                            读取基线、执行补丁并写出所有发布文件
```

基线源码内部依次包含：

1. UserScript 元信息、常量、默认配置和运行状态。
2. 本地设置持久化、日志、请求签名、API 请求和安全锁。
3. 地图导航、比赛报名与切图、鱼饵、Buff、签到和断线恢复。
4. 属性加点、洗点、配装、鱼竿、船队、世界 Boss。
5. 奥秘献祭、地图专精献祭、自动出售和统计显示。
6. 原设置面板、游戏内嵌载入、事件订阅和启动入口。

`build.mjs` 会同步正式更新说明、关闭未发布功能入口、应用 v2.1.3 的发布修正，并把原设置面板嵌入游戏页面。每项替换都要求在基线中只匹配一次；找不到或重复匹配都会中止构建，防止静默产生错误脚本。

新 UI、方案库、原型和实验验证源码没有纳入仓库。

## 前端开发与构建

要求 Node.js 18 或更高版本：

```bash
npm install
npm run build
```

构建会同时更新：

```text
dist/奥术摸鱼大师辅助.user.js
releases/奥术摸鱼大师辅助-v2.1.3.js
server/arcane-assistant.user.js
server/releases/arcane-assistant-v2.1.3.user.js
```

构建后建议执行：

```bash
node --check "dist/奥术摸鱼大师辅助.user.js"
```

然后比较上述四个文件的 SHA-256，确保内容完全一致。仓库中的正式 v2.1.3 文件 SHA-256 为：

```text
2F59227CA5BF3443821C8ED87E04D8A11D60E2775C0118077C119FE158C05B6E
```

## 安装与测试

把 `dist/奥术摸鱼大师辅助.user.js` 导入 Tampermonkey 即可。正式发布前应在游戏测试服验证本次修改涉及的功能，尤其是购买、洗点、献祭、出售等会消耗资源的操作。本仓库不提供独立的顶层自动化测试目录。

## 前端发布

1. 修改 `src/arcane-assistant-v2.1.3.base.js` 或 `src/constants.js`，不要直接修改生成文件。
2. 更新 `package.json`、`package-lock.json`、脚本中的 `@version`、`SCRIPT_VERSION` 和 `server/latest_version.txt`。
3. 执行 `npm run build`，再进行语法检查、哈希检查和测试服验证。
4. 把新版本保存在 `releases/`，并同步到 `server/releases/`。
5. 先部署 `server/arcane-assistant.user.js`，确认公开下载内容正确，再更新线上 `latest_version.txt`。
6. 验证 `/version`、`/download` 和公开用户脚本地址，最后创建 Git 标签或 Release。

详细检查项见 [`docs/developer/流程/发布版本.md`](docs/developer/流程/发布版本.md)。

# 后端：采集、下载与工单服务

## 后端架构

后台使用 Go 标准 HTTP 服务和 SQLite：

```text
server/
├─ main.go          路由、限频、采集接口、版本和脚本下载
├─ database.go      SQLite 初始化、数据采集和旧 CSV 导入
├─ tickets.go       玩家工单创建、查询和回复
├─ admin.go         管理员登录、工单管理、附件与数据查看
├─ cmd/stats-report 独立统计报告命令
├─ releases/        可供历史版本下载的用户脚本
├─ latest_version.txt
└─ nginx.conf       原部署环境的 Nginx/OpenResty 参考配置
```

主要接口：

- `/version`：返回最新脚本版本。
- `/download`：下载最新版或指定历史版本。
- `/usage`、`/doc-view`、`/survey`、`/report`、`/feedback`：原有采集和反馈接口。
- `/tickets`、`/tickets/{id}`：玩家工单接口。
- `/admin/`：管理员后台。

服务只监听 `127.0.0.1:8000`，生产环境应通过 Nginx/OpenResty 反向代理提供 HTTPS。

## 后端本地运行

要求 Go 1.22 或兼容版本：

```bash
cd server
go test ./...
go run .
```

默认数据目录为 `server/data/`。也可以显式指定：

```bash
ASMY_DATA_DIR=/absolute/path/to/data ADMIN_TOKEN=替换为随机值 go run .
```

Windows PowerShell 示例：

```powershell
$env:ASMY_DATA_DIR = "C:\asmy-data"
$env:ADMIN_TOKEN = "替换为足够长的随机值"
go run .
```

环境变量：

- `ASMY_DATA_DIR`：SQLite、附件等持久化数据目录；默认是当前工作目录下的 `data/`。
- `ADMIN_TOKEN`：管理员后台登录 Token，生产部署必须设置。
- `COLLECTOR_TOKEN`：可选的旧采集接口鉴权。公开部署原版脚本时不要设置，因为旧脚本不会发送该请求头。

启动后可访问 `http://127.0.0.1:8000/` 检查服务状态，通过 `/admin/login` 登录管理后台。

## 构建 Linux 后端

为 Debian 12 amd64 构建静态程序：

```bash
cd server
go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o collector-linux-amd64 .
```

## 后端生产部署

推荐目录：

```text
/opt/asmy/
├─ collector
├─ arcane-assistant.user.js
├─ latest_version.txt
├─ releases/
└─ data/
   ├─ asmy.db
   ├─ attachments/
   ├─ backups/
   └─ archive/
```

最小 systemd 服务示例：

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

管理员 Token 可使用 `openssl rand -hex 32` 生成。

部署顺序：

1. 备份现有程序、脚本、版本文件和数据目录。
2. 上传新二进制、`arcane-assistant.user.js`、`latest_version.txt` 和 `releases/`。
3. 创建数据目录并把权限交给实际运行服务的用户。
4. 安装或更新 systemd 服务，执行 `systemctl daemon-reload` 和 `systemctl restart arcane-assistant`。
5. 从 Nginx/OpenResty 把 HTTPS 请求反向代理到 `127.0.0.1:8000`。
6. 检查服务日志、首页、版本接口、脚本下载和管理员登录。

`server/nginx.conf` 来自原服务器，除本项目配置外还包含其他站点示例。不要整份直接覆盖生产配置；只提取 `reelax_collector`、脚本下载和对应反向代理部分，并修改域名、证书及目录。

SQLite 使用 WAL 模式。在线备份应使用 SQLite 的 `.backup`，或停服后同时备份 `asmy.db`、`asmy.db-wal` 和 `asmy.db-shm`。完整部署和回滚方式见 [`docs/developer/流程/SQLite与工单部署.md`](docs/developer/流程/SQLite与工单部署.md)。

## 文档

- `faq-site/`：从服务器取回的 v2.1.3 文档站；保留源码、配置、图片和 `dist`，未包含依赖缓存及未发布方案库页面。
- `docs/reference/`：浏览器脚本 API、数据源、游戏数据、世界 Boss 和采集服务参考。
- `docs/developer/`：前端发布、服务端构建以及 SQLite/工单部署流程。

文档站要求 Node.js 18 或更高版本：

```bash
cd faq-site
npm install
npm run build
```

构建结果写入 `faq-site/dist/`。默认站点地址和路径前缀在 `faq-site/astro.config.mjs` 中配置，部署到其他域名时需要同步修改 `site`、`base` 和 Nginx 静态目录。

## 支持作者

如果脚本使用期间给你带来了便利，或者你认为脚本还挺好用，可以自愿支持一下作者。是否支持不会影响脚本功能；请量力而行。

### 爱发电

[前往爱发电支持作者](https://ifdian.net/a/asmyfz)

### 微信赞赏码

<img src="assets/support/wechat_pay.png" alt="微信赞赏码" width="360" />

### 支付宝收款码

<img src="assets/support/alipay.jpg" alt="支付宝收款码" width="360" />

## 许可证

代码使用 [MIT License](LICENSE) 发布。游戏名称、页面素材及其他第三方内容的权利归各自权利人所有。

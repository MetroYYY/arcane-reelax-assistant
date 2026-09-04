# 世界 Boss（渊潮围猎）

> 维护者参考。记录世界事件「渊潮围猎」（世界 Boss）的接口路径、返回结构、规则，供后续「自动报名选属性」「自动登记遗珍」等功能开发使用。
>
> 数据来源：
> - `reference/世界boss_files/index-CSle76zM.js.下载`（前端 bundle，接口路径 + 校验器 + 渲染逻辑）
> - `reference/世界boss.html`（离线保存的页面）
> - `reference/reelax.cn/api/events/world-boss.html`（离线保存的主状态响应）
>
> 与 [数据源](数据源.md) 的分工：本文专注**世界 Boss 事件**这块。当前游戏版本 v0.19.2。

---

## 一、事件概述

世界事件页有两个 tab：**奥术献祭**（未上线/未做）和 **渊潮围猎**（世界 Boss，已上线）。渊潮围猎是「全服共打一个 Boss」，玩家先报名选属性，然后正常钓鱼，伤害按所选属性 + Boss 的弱/防属性结算，最后按伤害排名发奖励、掉「遗珍」进收藏册。

### 生命周期

```
scheduled(未开始) → preparing(报名开放) → active(围猎进行中) → settling(结算中)
                                                              ↓
                                    defeated(围猎成功) / escaped(Boss逃走) / canceled(取消)
```

| status | 含义 |
|--------|------|
| `scheduled` | 尚未开始 |
| `preparing` | 准备中（报名开放，可选属性） |
| `active` | 围猎进行中 |
| `settling` | 结算中 |
| `defeated` | 围猎成功（Boss 被击败） |
| `escaped` | Boss 逃走了 |
| `canceled` | 本场次已取消 |

---

## 二、接口清单（来自 bundle）

| 接口 | 方法 | 用途 | 结构是否已确认 |
|------|------|------|--------------|
| `/api/events/world-boss` | GET | 主状态 `{session, nextPrepareAt, serverTime}` | ✅ 有响应文件 |
| `/api/events/world-boss/selection` | POST | 报名选属性，body `{stat}` | ✅ 见下（bundle 推断） |
| `/api/events/world-boss/collections` | GET | 收藏册（遗珍收集进度） | ⚠️ 结构未抓 |
| `/api/events/world-boss/collections/register` | POST | 登记一件遗珍，body `{itemId}` | ✅ 见下（bundle 推断） |
| `/api/events/world-boss/history` | GET | 历史记录 `{cursor, limit=20}` | ⚠️ 结构未抓 |

> `selection` 和 `collections/register` 都带 `idempotencyKey`（脚本现有 `generateIdempotencyKey` 可用）。
> 「未抓」的接口：在游戏里触发对应操作（打开收藏册、翻历史记录、点登记遗珍），用 DevTools Network 面板看返回即可确认结构。

### 刷新节奏（bundle 里 `refetchInterval` 逻辑）

- `session.status` 为 `preparing` / `active` / `settling` 时：每 **~10s**（`1e4 + random(2e3)` ms）重拉一次。
- 无场次或 `defeated` / `escaped` / `canceled` 时：按 `nextPrepareAt - serverTime` 算下一次刷新时间（最小间隔 1s）。
- 游戏还内置了 localStorage 提醒键 `arcane-reelax:world-boss-reminder:${t}:${a}`（`t`/`a` 为事件类型与场次标识），脚本可复用或自行提醒。

---

## 三、返回结构

### 1. `/api/events/world-boss`（主状态）

无进行中场次时的真实响应：

```json
{
  "session": null,
  "nextPrepareAt": "2026-08-19T11:00:00.000Z",
  "serverTime": "2026-08-19T10:10:04.087Z"
}
```

`session` 非空时结构（由 bundle 渲染逻辑还原）：

```json
{
  "session": {
    "status": "preparing",           // 见生命周期表
    "battleAt": "2026-08-19T12:00:00.000Z",  // 开战时间（围猎开始，报名为 battleAt - 1h）
    "boss": {
      "id": "junhai",
      "name": "濬海",
      "epithet": "深渊巨鳄",
      "weaknessStat": "intelligence",  // 弱点属性
      "defenseStat": "endurance",      // 防御属性
      "imagePath": "/world-boss/bosses/junhai.webp"
    },
    "player": {
      "selectedStat": "strength",     // 玩家所选属性；null = 未报名（判为「未参加」）
      "isLocked": false,              // 锁定后不能再改选
      "recentDamage": 12345,          // 最近一次伤害
      "dropWeight": 0.15              // 收藏品掉落权重；null = 结算时确定
    }
  },
  "nextPrepareAt": "...",
  "serverTime": "..."
}
```

| 字段 | 含义 |
|------|------|
| `session.boss.weaknessStat` | 打该 Boss 有加成的属性（选它伤害最大化） |
| `session.boss.defenseStat` | 打该 Boss 被减免的属性（选它伤害打折扣） |
| `session.player.selectedStat` | 报名所选属性；**`null` 会被判成「未参加」，拿不到奖励** |
| `session.player.isLocked` | 是否已锁定选择（锁定后不能再改选） |
| `session.player.dropWeight` | 收藏品掉落权重（由所选属性决定，影响掉哪件遗珍） |

### 2. `/api/events/world-boss/selection`（报名选属性）

```js
// POST，body {stat}，带 idempotencyKey
fetch("/api/events/world-boss/selection", {
  method: "POST",
  body: { "stat": "intelligence" },   // strength / intelligence / luck / endurance
  idempotencyKey: "..."
});
// 返回 → 更新主状态 overview（session.player.selectedStat 变化）
```

- 可选值：`strength`（力量）/ `intelligence`（智力）/ `luck`（运气）/ `endurance`（耐力）。
- 报名窗口：`status === "preparing" || status === "active"` 且 `!player.isLocked`。
- 成功提示原文：「已选择 XX 作为本次围猎属性」。

### 3. `/api/events/world-boss/collections/register`（登记遗珍）

```js
// POST，body {itemId}，带 idempotencyKey
fetch("/api/events/world-boss/collections/register", {
  method: "POST",
  body: { "itemId": "junhai_3" },   // 遗珍 id，形如 {bossId}_{序号}
  idempotencyKey: "..."
});
```

- 遗珍 id 形如 `{bossId}_{1..8}`（如 `junhai_3`、`sereia_7`）。
- 遗珍图片路径 `/world-boss/collectibles/{bossId}-{两位序号}.webp`（如 `junhai-03.webp`）。

### 4. `/api/events/world-boss/history`（历史记录）

```js
// GET，query {cursor, limit:20}
fetch("/api/events/world-boss/history?cursor=...&limit=20");
```

历史条目关键字段（bundle 渲染还原）：

```json
{
  "battleAt": "2026-08-18T12:00:00.000Z",
  "boss": { "name": "濬海", "epithet": "深渊巨鳄" },
  "selectedStat": "intelligence",   // null = 未参加
  "finalRank": 42                   // 最终名次；null = 无效名次
}
```

---

## 四、Boss 数据

四个 Boss，每个有「弱点属性 + 防御属性 + 称号 + 8 件遗珍」。弱点/防御正好覆盖四维各一次：

| Boss | 弱点属性 | 防御属性 | 称号 id |
|------|---------|---------|---------|
| sereia 塞雷亚 | `strength` 力量 | `intelligence` 智力 | `sereia_tidebreaker` |
| junhai 濬海 | `intelligence` 智力 | `endurance` 耐力 | `junhai_scholar` |
| miguang 弥光 | `luck` 运气 | `strength` 力量 | `miguang_stargazer` |
| wumo 乌墨 | `endurance` 耐力 | `luck` 运气 | `wumo_watchkeeper` |

Boss 对象结构：

```js
{
  "id": "junhai",
  "name": "濬海",
  "epithet": "深渊巨鳄",
  "description": "...",
  "weaknessStat": "intelligence",   // 弱点（打它有加成）
  "defenseStat": "endurance",       // 防御（打它被减免）
  "imagePath": "/world-boss/bosses/junhai.webp",
  "title": { "id": "junhai_scholar", "name": "深渊构想师", "description": "..." },
  "collectibles": [ /* 8 件遗珍，每件 {id, name, description} */ ]
}
```

---

## 五、规则小结

- **报名必须**：`selectedStat` 为 `null` 即「未参加」，拿不到结算奖励。
- **选属性时机**：`preparing` 或 `active` 且 `!isLocked` 时可改选。
- **选属性决定两件事**：① 伤害（受 Boss 弱/防属性影响）；② 收藏品掉落权重 `dropWeight`。
- **伤害倍率**：弱点属性 ×200%，防御属性 ×50%，其余属性 ×100%。洗点全加弱点时直接选 `weaknessStat`；不洗点时应按实际面板乘倍率后比较，弱点不一定总是最高。
- **四 Boss 轮换**：弱点/防御覆盖四维各一次，无固定「一劳永逸」的最优属性，需按当前场次 Boss 动态选。
- **结算**：按伤害排名发奖励（`finalRank`），掉落的「遗珍」进收藏册，可 `register` 登记。

---

## 六、可能的自动化

> 已实现（脚本 `autoWorldBoss` 总开关下）：① 按游戏的错峰报名事件自动报名；洗点模式报名弱点，不洗点模式（`worldBossNoRespecMaxDamage`）读取指定 Boss 配装后的四维面板，按 200%/50%/100% 倍率选择预计伤害最高的属性；② 按接口返回的 `battleAt` 在首击前 N 分钟切换并锁定 Boss 配装，不洗点模式不会触发属性重置；③ 第一次攻击产生、`player.isLocked` 锁定属性与数值快照后，若当前仍在有效比赛地图则优先交给公会赛/个人赛切装洗点，否则恢复常驻方案。自动登记遗珍与额外 Boss 提醒未实现。
>
> 时间规则：每天北京时间 11:00、20:00 开战（`session.battleAt`），报名窗口提前 1 小时开启（`nextPrepareAt`）。

### 1. 自动报名 + 自动选最优属性（价值最高，推荐先做）

- **触发**：优先监听 `world-boss:registration-opened`（游戏已经按玩家错峰），并用 `/api/events/world-boss` 状态更新兜底；仅在 `player.selectedStat == null` 时执行。
- **动作**：读 `session.boss.weaknessStat`，`POST /api/events/world-boss/selection` 选该弱点属性。
- **价值**：不报名 = 无奖励，这一步是拿奖励的前置。本质是「零额外请求」——只劫持游戏自己的主状态请求 + 一次报名 POST。
- **要点**：需防重复报名（`isLocked` 或 `selectedStat` 已非空就跳过）；用 `generateIdempotencyKey` 保证幂等。

### 2. 结算后自动登记遗珍

- **触发**：读到 `session.status` 从 `settling` 进入 `defeated` / `escaped`（或结算完成）。
- **动作**：拉 `/api/events/world-boss/collections`，对未登记的遗珍批量 `POST /api/events/world-boss/collections/register`。
- **要点**：需先确认 `collections` 的返回结构（哪些字段表示「已登记」vs「待登记」）。

### 3. Boss 开始前提醒

- 复用游戏自己的 `arcane-reelax:world-boss-reminder:${t}:${a}` 机制，或脚本弹窗/操作日志。
- 在 `preparing`（报名开放）或 `active`（开打）时提醒玩家。
- **价值最低**：因为第 1 项已能自动报名，提醒主要用于「提醒玩家该去盯着打伤害了」。

---

## 七、与现有功能的关系

- 世界 Boss 主状态优先复用游戏自身 `/api/events/world-boss` 请求及 `world-boss:*` 生命周期事件；另有 30 秒低频状态校准，用于页面未刷新主状态时及时识别首击锁定并恢复比赛方案。校准采用任务完成后再安排下一次的非重叠调度，关闭功能或暂停时只保留空闲唤醒，不会请求接口。
- 世界 Boss 与比赛同时发生时，首击锁定前由 Boss 临时持有属性/配装控制权；锁定后若玩家正在比赛地图，公会赛/个人赛全幸运与比赛配装优先，否则恢复进入 Boss 准备前的加点和配装。
- 报名/登记是脚本「主动发请求」，需在 [数据源](数据源.md) 的「脚本主动请求」表里声明（触发条件、用途、去重限制）。
- 若做成开关，按 [新增功能流程](../developer/流程/新增功能.md) 走：DEFAULTS / SETTING_SCHEMA / state / 业务函数 / applySettings / onTeardown / 日志。

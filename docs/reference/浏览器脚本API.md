# 浏览器脚本 API

Arcane Reelax 在玩家登录后通过 `window.arcaneReelax` 提供不可变、版本化的浏览器脚本接口。它只映射前端已经存在于 TanStack Query 内存中的状态，不会为了脚本读取而发起额外 HTTP 请求。接口用于油猴等同页脚本读取地图环境、钓鱼批次、鱼饵和签到状态，监听基础事件，以及表达签到、换图、按阈值补满和选择鱼饵等受控操作意图；不开放客户端决定的资产结算、随机结果、交易操作或内部 React 状态。

## 接入

推荐使用 `@grant none`，让脚本运行在页面上下文并直接读取 `window.arcaneReelax`。Tampermonkey 官方文档说明该模式会关闭 userscript sandbox，最适合直接调用页面对象和注册回调。

```js
// ==UserScript==
// @grant        none
// @run-at       document-idle
// ==/UserScript==

const game = window.arcaneReelax;
const initialSnapshot = await game.ready;

console.log(game.apiVersion, initialSnapshot.biomes);
```

如果脚本在页面应用加载前注入，可以先检查对象；`arcane-reelax:ready` 仅作为首次就绪信号，天气、增益和比赛等业务事件仍通过游戏对象订阅：

```js
async function getGameApi() {
  const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
  if (pageWindow.arcaneReelax) {
    await pageWindow.arcaneReelax.ready;
    return pageWindow.arcaneReelax;
  }
  return new Promise((resolve) => {
    document.addEventListener('arcane-reelax:ready', () => resolve(pageWindow.arcaneReelax), { once: true });
  });
}
```

如果脚本必须使用 `GM_*` 权限，可以声明 `@grant unsafeWindow` 后从 `unsafeWindow.arcaneReelax` 读取对象。需要注意，Tampermonkey 官方文档指出 Firefox 的 `@sandbox JavaScript` 上下文在跨页面共享对象或函数时可能需要 `cloneInto` / `exportFunction`；因此需要直接注册本 API 回调的脚本，优先使用 `@grant none` 或能够进入页面主上下文的 `@sandbox raw`。参见 [Tampermonkey `@grant` 文档](https://www.tampermonkey.net/documentation.php?locale=en#meta:grant)与 [`@sandbox` 文档](https://www.tampermonkey.net/documentation.php?locale=en#meta:sandbox)。

## 快照

`ready` 在前端内存中出现第一份可映射的地图与组队状态时解析并返回快照。之后可通过 `getSnapshot()`、`biomes.getAll()`、`biomes.getCurrent()` 和 `party.getCurrent()` 同步读取最新内存快照；就绪前分别返回 `null`、空数组、`null` 和 `null`。

快照以登录会话为边界。会话过期或退出后，`getSnapshot()` 会恢复为 `null`，换图会以 `NOT_READY` 失败；再次读取 `ready` 会得到下一次登录对应的新 Promise。重新登录时会先清理上一账号的玩家级前端缓存，新账号的第一份快照不会与旧快照比较或产生天气、增益、比赛事件。脚本已经保存到自身变量中的旧快照是不可变副本，调用方应在会话变化后重新读取 `ready` 或 `getSnapshot()`。

```js
const snapshot = game.getSnapshot();
console.log(snapshot.party);
console.log(snapshot.fishing, snapshot.baits, snapshot.dailyCheckIn);
for (const biome of snapshot.biomes) {
  console.log({
    id: biome.id,
    requiredLevel: biome.requiredLevel,
    unlocked: biome.isUnlocked,
    masteryXp: biome.masteryExperienceBonusBasisPoints,
    weather: biome.weather,
    guildBoost: biome.guildBoost,
    competitions: biome.activeCompetitions,
  });
}
```

接口不会因为脚本读取而补取信息。登录后 Web 会常驻加载地图专精 overview，并根据共享天气算法、服务端时间和 fishing state 中的奥秘涌流窗口维护所有地图天气；公会区域增益由现有 fishing state/sync 一并下发，个人赛和公会赛由全局比赛提醒维护。正常初始化完成后，这些字段不再依赖玩家是否进入地图、专精、公会或比赛页面。仅在相关常驻状态仍在加载或请求失败时，字段才会暂时返回 `null`；脚本应把 `null` 理解为“当前前端内存未知”。

经验加成统一使用整数基点：`100` 表示 `1%`，`5_000` 表示 `50%`。已存在于前端内存时，每张地图包含：

- `id`、`name`、`requiredLevel`、`isUnlocked`、`isCurrent`，其中 `requiredLevel` 是当前内容定义中的地图需求等级；
- `masteryExperienceBonusBasisPoints`：玩家在该地图的专精经验加成；
- `weather`：天气 ID、名称、效果说明、经验加成、开始和结束时间；
- `guildBoost`：公会区域增益是否生效、经验加成和结束时间；
- `activeCompetitions`：当前在该地图进行中的个人赛或公会赛。

返回对象和嵌套数组均被冻结，不要尝试修改游戏快照。官方航线助手脚本不再另存自动换图、自动鱼饵、自动签到、优先级或场景鱼饵配置，统一读取下文的游戏内航线助手设置；只有脚本独有的自动补杆和面板折叠状态仍保存在本机。

`snapshot.fishing` 在存在批次时包含 `status`、`mode`、`totalCasts`、`remainingCasts`、`cycleDurationMs` 和 `nextCastAt`，没有批次时为 `null`。脚本可以用这些服务端时间字段计算阈值，不需要高频调用补满方法。

`snapshot.baits` 包含内容配置中的全部鱼饵以及 `id`、`name`、`tier`、`isUnlimited`、`quantity` 和 `isSelected`。无限基础饵的 `quantity` 为 `null`；有限鱼饵尚未进入现有前端 Query 内存时数量也可能暂时为 `null`，它表示“未知”而不是无限。当前选中状态以 session 为准，不会因脚本读取发起鱼饵列表请求。

`snapshot.dailyCheckIn` 在签到 Query 已进入前端内存后包含 `checkedInToday`、`canClaim`、`chinaDate` 和 `nextResetAt`，尚未加载时为 `null`。跨过北京时间 0 点后，现有签到 Query 会按 `nextResetAt` 自动刷新，脚本无需自行推算日期。

## 事件

`on(eventName, listener)` 返回取消订阅函数。初始快照以及字段从 `null` 变为已知值时都不会重放为事件；只有前端内存中连续两个已知状态之间的真实变化才会触发。脚本应先读取 `ready` 返回的快照，再监听后续变化。

```js
const stopWeatherListener = game.on('weather:changed', ({ biomeId, previous, current }) => {
  console.log(`${biomeId}: ${previous.name} -> ${current.name}`);
});

game.on('guild-boost:started', ({ biomeId, current }) => {
  console.log(`${biomeId} 公会增益开启，结束于 ${current.endsAt}`);
});

game.on('guild-boost:ended', ({ biomeId }) => {
  console.log(`${biomeId} 公会增益结束`);
});

game.on('competition:started', ({ biomeId, competition }) => {
  console.log(`${competition.kind} #${competition.sequence} 在 ${biomeId} 开始`);
});

game.on('world-boss:registration-opened', ({ session }) => {
  console.log(`${session.boss.name} 可以报名了`);
});

game.on('world-boss:started', ({ session }) => {
  console.log(`${session.boss.name} 已开战`);
});

game.on('world-boss:ended', ({ session }) => {
  console.log(`${session.boss.name} 围猎结束：${session.status}`);
});

game.on('arcane-sacrifice:opened', ({ resourceType, roundNumber }) => {
  console.log(`第 ${roundNumber} 轮奥术献祭开放：${resourceType}`);
});

game.on('arcane-sacrifice:completed', ({ resourceType, surge }) => {
  console.log(`${resourceType} 献祭完成，奥秘涌流持续至 ${surge.endsAt}`);
});

stopWeatherListener();
```

事件列表：

| 事件                               | 触发条件                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| `weather:changed`                  | 任意地图的天气窗口或天气类型发生变化                          |
| `guild-boost:started`              | 当前玩家所属公会在某地图的区域经验增益从未生效变为生效        |
| `guild-boost:ended`                | 当前玩家所属公会在某地图的区域经验增益从生效变为未生效        |
| `competition:started`              | 某地图新增一场正在进行的个人赛或公会赛                        |
| `route-assistant:settings-changed` | 游戏内保存的航线助手设置或内置执行状态发生变化                |
| `world-boss:registration-opened`   | 到达当前玩家本场世界 Boss 的错峰报名提醒时间                  |
| `world-boss:started`               | 本场世界 Boss 到达开战时间或实际进入战斗                      |
| `world-boss:ended`                 | 本场世界 Boss 停止战斗并进入结算、击败、逃离或取消状态        |
| `arcane-sacrifice:opened`          | 某轮奥术献祭到达开放时间，携带 `fish / gold / relic` 资源类型 |
| `arcane-sacrifice:completed`       | 某轮奥术献祭完成，携带已完成的资源类型和奥秘涌流窗口          |

事件来自 Web 已有的常驻前端状态，不是 WebSocket 推送，也不会因为脚本订阅而额外启动轮询或请求。天气按共享两小时日程在本地推进，奥秘涌流边界由 fishing state 校准；比赛和公会增益按缓存的 `serverTime`、`startAt` / `startsAt`、`endAt` / `endsAt` 在本地推进。世界 Boss 复用全局提醒已有的 overview 缓存：报名通知使用与页面弹窗完全相同的玩家级 `reminderAt`，开战由已知 `battleAt` 的单次本地定时器触发，结束由已有状态转换触发。奥术献祭开放按 fishing state 已知 `opensAt` 使用单次本地定时器，完成由现有 fishing state/sync 的轮次变化触发。

同一次状态变化产生的 `weather:changed` 和 `competition:started` 会合并为同一投递批次，并在浏览器内随机延迟最多 `10` 秒，避免大量页面在固定边界同时发起后续操作；连续批次始终按快照转换顺序投递，快照本身仍会立即更新。世界 Boss、奥术献祭和航线助手设置事件不另外增加错峰延迟。每轮献祭完成时，各地图仍会分别发出原有的 `weather:changed` 奥秘涌流天气通知；`arcane-sacrifice:completed` 是只发一次且携带献祭资源类型的轮次通知。页面关闭后不会收到事件；仍在加载或失败的数据不会产生事件。

## 航线助手设置

`routeAssistant.getSettings()` 同步返回游戏内当前保存的航线助手设置，就绪前返回 `null`。返回值包含自动换图、自动鱼饵、自动签到、换图优先级、船队限制和五类场景鱼饵，并额外提供 `isEnabled`、`isOperational` 与 `serverTime`。对象及其嵌套数组、对象均被冻结；读取不会发起额外请求。

```js
const settings = game.routeAssistant.getSettings();
if (settings && !settings.isOperational && settings.isAutoTravelEnabled) {
  await game.routeAssistant.travel();
}

game.on('route-assistant:settings-changed', ({ current }) => {
  console.log(current.isAutoBaitEnabled, current.baitByScene);
});
```

`isOperational` 表示游戏内置航线助手当前已经取得有效权益并负责执行。官方脚本在它为 `true` 时暂停自动换图、自动鱼饵和自动签到，避免同一份设置被两个执行器重复处理；内置助手未运行时，官方脚本按同一份子开关、优先级和场景鱼饵执行。自动补杆不是内置航线助手功能，仍由官方脚本单独保存和执行。

`routeAssistant.openSettings()` 直接打开游戏原生“航线助手设置”弹窗并返回是否成功提交了打开请求。官方脚本的“设置”按钮只调用这个方法，不再渲染另一份自动化设置界面。弹窗保存后，`getSettings()` 会立即读取新值并触发 `route-assistant:settings-changed`。

## 换图

```js
try {
  const result = await game.routeAssistant.travel();
  console.log({
    status: result.status,
    scope: result.scope,
    target: result.targetBiomeId,
    executeAt: result.executeAt,
  });
} catch (error) {
  console.error(error.code, error.message);
}
```

`routeAssistant.travel()` 不接收目标地图。它和游戏内置航线助手使用同一个 `POST /api/route-assistant/travel` 入口，由服务端读取玩家保存的“比赛 / 金风 / 经验”优先级、地图解锁、天气、公会区域增益、个人赛、公会赛分配地图和当前船队状态，再决定个人或整船应前往的地图。前端和脚本只申请重新判断，不自行提交航线目标。组队时整船操作沿用内置助手的唯一带队占用；没有占用者时由船长带队。其他成员只会为自己的公会赛切换个人地图，不会改变船的权威地图。

`status` 为 `traveled`、`unchanged`、`deferred` 或 `no_target`。比赛提前换图或天气错峰尚未到达执行时间时返回 `deferred`，并提供 `executeAt`；下一次已知比赛边界通过 `reevaluateAt` 返回。内置航线助手和官方脚本会按这些绝对时间再次申请，第三方脚本也应按返回时间安排单次调用，不要轮询。成功执行时，`personalTravel` 或 `partyTravel` 会包含对应服务端写后结果。请求必须携带 `Idempotency-Key`；首次服务端计划会在换图前持久化，个人或船队换图也使用同一 key 保存结果。因此同一 key 在连接中断或进程重启后重试，仍会继续首次计划并回放首次完整结果，不会重新择图或再次换图。

同一页面同一时刻只处理一个航线申请；并发调用会以 `ROUTE_ASSISTANT_TRAVEL_IN_PROGRESS` 失败。服务端仍会验证登录、地图解锁、船队权限和运行状态，并在切换地图前结算旧批次。其他失败继续提供稳定的 `code` 和可展示的中文 `message`。

为兼容已有脚本，`game.biomes.travelTo(biomeId)` 和 `game.party.travelTo(biomeId)` 暂时保留为显式目标换图接口；新脚本应使用 `game.routeAssistant.travel()`，避免在浏览器中复制航线选择规则。

## 组队船

`snapshot.party` 与 `party.getCurrent()` 返回当前会话已有的轻量组队状态：

```js
const party = game.party.getCurrent();
if (party?.isInParty) {
  console.log({
    role: party.role,
    canTravel: party.canChangeBoatBiome,
    status: party.status,
    source: party.source,
    boat: party.boatName,
    visibility: party.visibility,
    biomeId: party.boatBiomeId,
    rentalEndsAt: party.rentalEndsAt,
    maintenanceDueAt: party.maintenanceDueAt,
  });
}
```

完整字段为：`isInParty`、`role`、`canChangeBoatBiome`、`status`、`source`、`boatDefinitionId`、`boatName`、`visibility`、`boatBiomeId`、`rentalEndsAt` 和 `maintenanceDueAt`。不在船队时 `isInParty` 为 `false`，其他关系字段为 `null`；即使玩家拥有停泊永久船，也不会把所有权误报成当前船队。对象来自现有 session/fishing Query 内存，不会因脚本读取发起 HTTP 请求，也不会暴露邀请码、成员列表、资产、Cookie 或内部 ID。

旧脚本仍可由船长或舵手表达显式整船切图意图：

```js
try {
  const result = await game.party.travelTo('b_003');
  console.log({
    from: result.previousBoatBiomeId,
    to: result.currentBoatBiomeId,
    moved: result.movedCount,
    locked: result.skippedLockedCount,
    away: result.skippedAwayCount,
    guildCompetition: result.skippedGuildCompetitionCount,
  });
} catch (error) {
  console.error(error.code, error.message);
}
```

该兼容方法调用 `POST /api/party-boats/current-biome`。服务端重新验证会话、船队身份、运营状态、地图 ID 和每名成员的个人解锁，并在一个事务时间点结算或切换符合条件成员。成员默认允许在离开船当前地图时被召集并随船前往；关闭“允许被召集”的成员离开船边时保持原地图。从公会赛开赛前两分钟的准备窗口起，每名成员自己的已分配比赛地图始终优先，船前往另一张公会赛地图时不会把该成员带走。未解锁目标地图的成员也保持原地图。

同一页面同一时刻只处理一个 `party.travelTo()`；并发调用返回 `PARTY_BOAT_TRAVEL_IN_PROGRESS`。非组队、无权限、保养逾期、租赁到期、地图非法或未解锁等服务端失败继续使用稳定错误码和中文消息。返回结果与快照均被冻结。

## 按阈值补满

便捷脚本应通过浏览器对象请求补满，不要循环调用原始钓鱼接口：

```js
const didRefill = await game.fishing.refill();
console.log(didRefill ? '已补满' : '当前无需补满');
```

`fishing.refill()` 只读取 Web 已有的钓鱼 Query 内存。当前批次处于运行中或已完成状态，并且剩余次数严格少于批次总次数一半时，它才会调用服务端权威的 `POST /api/fishing/refill`；等于一半、超过一半、没有合格批次或已有补满调用在途时，不发起 HTTP 请求并返回 `false`。请求实际发出且服务端成功处理后返回 `true`，服务端错误仍以 Promise rejection 返回。

补满继续使用服务端幂等、离线补算和资产事务，不会因为脚本调用而跳过规则。登录后的玩家 API 还会校验 Web 下发的短时请求签名，并按登录会话共享总请求频率预算；这些限制用于避免粗暴轮询影响其他玩家，不改变本浏览器脚本 API 的开放使用方式。

不要通过 DOM 的 `.click()` 或 `dispatchEvent()` 合成页面补满按钮点击。顶部状态区和钓鱼页的补满按钮只响应 `isTrusted` 用户事件；首次检测到合成点击时，页面会显示一次本节文档入口，后续合成点击会被静默忽略。脚本补满统一调用 `game.fishing.refill()`。

## 选择鱼饵

```js
const didSelect = await game.fishing.selectBait('bait_high');
console.log(didSelect ? '已切换鱼饵' : '鱼饵未变化');
```

`selectBait(baitId)` 复用游戏的 `POST /api/baits/:baitId/equip`。服务端重新验证鱼饵 ID、有限鱼饵库存和当前批次是否允许调整构筑；成功后更新现有 session 和鱼饵 Query 缓存，在线批次从下一杆使用新鱼饵。选择已经生效的鱼饵、会话未就绪或同一页面已有选择请求在途时返回 `false`，服务端拒绝则继续以包含稳定 `code` 和中文 `message` 的 Promise rejection 返回。

该方法只切换当前玩家自己的全局鱼饵，不购买库存、不修改自动购买设置，也不能由船长或舵手控制其他成员鱼饵。有限鱼饵耗尽后的服务端回退规则保持不变。

## 签到与提醒

```js
if (game.getSnapshot()?.dailyCheckIn?.canClaim) {
  const didClaim = await game.dailyCheckIn.claim();
  if (didClaim) game.ui.dismissReminder('daily-check-in');
}
```

`dailyCheckIn.claim()` 只在现有签到快照为可领取状态且当前没有签到请求在途时调用服务端幂等签到接口，否则返回 `false`。成功后会同步签到状态和玩家余额缓存，并关闭已打开的签到弹窗；服务端仍负责日期、连续天数和奖励资产的最终校验。

`ui.dismissReminder(kind)` 只处理 Web 的临时界面状态，不伪造点击或改变赛事与奖励业务状态。`kind` 支持 `daily-check-in` 和 `competition`。关闭比赛提醒时，当前已经开始且尚未结束的比赛会被记为本页面已处理，避免弹窗立即再次打开；未来比赛仍会按原规则提醒。

## 航线助手示例

可直接导入 Tampermonkey 的完整示例：[下载并安装航线助手](https://reelax.abang666.com/docs/userscripts/arcane-reelax-auto.user.js)。它提供右下角折叠状态面板、脚本独有的自动补杆开关，以及直接打开游戏原生航线助手设置弹窗的“设置”按钮。自动签到、自动航线和五类场景鱼饵全部读取游戏内保存的同一份设置；签到成功和自动前往已开始的比赛时，脚本会通过浏览器 API 收起对应游戏弹窗。

脚本不再保存独立的自动换图、自动鱼饵、自动签到、换图优先级、船长/舵手开船或场景鱼饵设置；这些行为统一读取游戏内航线助手设置。经验倍率相同时，服务端优先选择候选范围内解锁等级要求最高的地图；组队开启全员解锁限制时，候选范围先收窄为全员交集。倍率和等级仍相同时才优先留在当前地图，最后使用稳定地图 ID 打破平局。天气、增益或比赛状态变化后，脚本会在 `0–10` 秒内随机错峰申请一次；服务端返回计划时间后按该绝对时间再次申请，不使用固定换图轮询。场景鱼饵仍按玩家实际所在地图判断，重叠时依次采用个人赛、公会赛、金风、奥秘涌流和普通天气。

遗物商店的内置航线助手与官方 userscript 使用执行权交接：内置助手有效运行时，脚本暂停自动换图、自动鱼饵和自动签到；内置助手停止运行后，脚本继续按当前共享设置执行，不恢复任何旧的本地副本。脚本独有的自动补杆不参与交接。这项协调只保证仓库官方脚本；第三方脚本仍必须自行避免重复操作。

示例 metadata 匹配线上旧域名 `https://reelax.abang666.com/*`、新域名 `https://reelax.cn/*` 和本地 `http://127.0.0.1:5173/*`。

`@downloadURL` 与 `@updateURL` 均固定为线上脚本地址。发布新版时提升 metadata 中的 `@version`，Tampermonkey 会从同一地址检查并下载更新。

## 兼容性

`apiVersion` 当前为 `2`。v2 移除了 v1 的 `market` 对象，浏览器脚本不再订阅市场事件或发起市场买卖；当前兼容版本新增了由服务端择图的 `routeAssistant.travel()`、共享设置读取 `getSettings()`、原生弹窗入口 `openSettings()`、设置变更事件，以及世界 Boss 和奥术献祭生命周期事件，原有显式目标换图方法暂时保留。同一主版本内只添加兼容字段、事件和方法；如果未来需要不兼容改动，将继续提升主版本并提供迁移说明。脚本不应依赖未写入本文档的对象属性、原始 HTTP 接口响应或页面 DOM。

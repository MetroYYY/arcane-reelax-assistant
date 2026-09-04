// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.8.0
// @description  自动切图、补杆、自动报名、买Buff、签到、加点/比赛洗点、场景切饵、卖鱼卖装备、每日盈亏、奇异奥秘记录
// @author       deepseek & yy
// @match        https://reelax.abang666.com/*
// @match        https://reelax.cn/*
// @match        https://test.reelax.cn/*
// @match        https://test.reelax.com/*
// @grant        none
// @run-at       document-end
// @noframes
// @icon         https://reelax.abang666.com/branding/arcane-reelax-favicon-64.png
// @updateURL    https://reelax.hsiyue.com/arcane-assistant.user.js
// @downloadURL  https://reelax.hsiyue.com/arcane-assistant.user.js
// @license      MIT
// ==/UserScript==
(() => {
  // src/constants.js
  var SCRIPT_VERSION = "1.8.0";
  var STORAGE_KEY = "arcane_auto_settings";
  var DEFAULTS = {
    autoCompetition: true,
    autoGeneral: true,
    showEnhancements: true,
    autoRefill: true,
    autoSwitchMap: true,
    autoGuild: true,
    autoPersonal: true,
    autoRegisterPersonal: true,
    autoRegisterGuild: false,
    autoBuyBuffs: false,
    debugLog: false,
    buffSelections: {},
    autoCheckIn: true,
    autoDismissCompetition: true,
    autoDismissOffline: true,
    mapPriority: ["competition", "designated", "goldwind", "experience", "gold", "strengthluck"],
    designatedBiomeId: "",
    partyDesignatedBiomeId: "",
    isPanelCollapsed: false,
    dockRight: -1,
    dockTop: -1,
    ballRight: -1,
    ballTop: -1,
    autoBait: false,
    baitByScene: {},
    baitFallback: true,
    baitAutoBuy: true,
    autoPartyTravel: false,
    partyLimitByCrew: false,
    partyMapPriority: ["competition", "designated", "goldwind", "experience", "gold", "strengthluck"],
    autoAllocateStats: false,
    statAllocationTarget: "intelligence",
    statAllocationOrder: ["strength", "intelligence", "endurance", "luck"],
    excludeMasteryBonus: false,
    excludeGuildBoost: false,
    autoRespecPersonal: false,
    autoRespecGuild: false,
    respecStrengthTarget: 1700,
    postRespecRemainderStat: "luck",
    postRespecFixed: { strength: 1700, intelligence: 2e3, luck: 0, endurance: 100 },
    autoLoadout: false,
    loadoutSlot: 2,
    loadoutAfter: 1,
    skipWitherTidePersonal: false,
    witherTideDipPersonal: false,
    dipPersonal: false,
    partyDipPersonal: false,
    partyDipMinutes: 10,
    autoWorldBoss: false,
    autoWorldBossRegister: false,
    autoWorldBossRespec: false,
    autoWorldBossLoadout: false,
    worldBossRespecBeforeMin: 3,
    worldBossRespecAfterMin: 3,
    worldBossLoadoutDuring: 2,
    worldBossLoadoutAfter: 1,
    sectionCollapsed: {},
    settingsCategory: "daily",
    viewMode: "settings",
    paused: false,
    showPity: true,
    showTheoreticalCasts: true,
    showBalance: true,
    showGearPercent: true,
    surveySubmittedAt: 0,
    lastReportAt: 0,
    lastSuggestionAt: 0,
    surveySubmittedId: "",
    // 卖鱼
    sellFishEnabled: false,
    sellFishRarities: ["common", "uncommon", "fine", "rare", "epic"],
    // 默认卖到史诗
    sellFishIntervalMin: 30,
    // 定时分钟 3~1440
    // 卖装备
    sellGearEnabled: false,
    sellGearRarities: ["common", "uncommon", "fine", "rare", "epic"],
    sellGearQualities: { common: 60, uncommon: 60, fine: 60, rare: 60, epic: 60 },
    // 每档品质阈值 0~100
    sellGearIntervalMin: 30
  };
  var BUFF_CONFIG = {
    "relic-xp-i": { productId: "relic-xp-i", name: "\u7ECF\u9A8C +30%", price: 75, group: "experience" },
    "relic-xp-ii": { productId: "relic-xp-ii", name: "\u7ECF\u9A8C +75%", price: 150, group: "experience" },
    "relic-strength-i": { productId: "relic-strength-i", name: "\u529B\u91CF +10%", price: 75, group: "strength" },
    "relic-strength-ii": { productId: "relic-strength-ii", name: "\u529B\u91CF +25%", price: 150, group: "strength" },
    "relic-luck-i": { productId: "relic-luck-i", name: "\u8FD0\u6C14 +10%", price: 75, group: "luck" },
    "relic-luck-ii": { productId: "relic-luck-ii", name: "\u8FD0\u6C14 +25%", price: 150, group: "luck" },
    "fragment-personal-xp": { productId: "fragment-personal-xp", name: "\u788E\u5149\u987F\u609F +25%\u7ECF\u9A8C", price: 20, group: "fragment", currency: "fragments", buffType: "experience" }
  };
  var BUFF_GROUPS = {
    experience: { label: "\u7ECF\u9A8C\u52A0\u6210\uFF08\u9057\u7269\uFF09", options: ["relic-xp-i", "relic-xp-ii"] },
    strength: { label: "\u529B\u91CF\u52A0\u6210\uFF08\u9057\u7269\uFF09", options: ["relic-strength-i", "relic-strength-ii"] },
    luck: { label: "\u8FD0\u6C14\u52A0\u6210\uFF08\u9057\u7269\uFF09", options: ["relic-luck-i", "relic-luck-ii"] },
    fragment: { label: "\u788E\u7247Buff", options: ["fragment-personal-xp"] }
  };
  var WEATHER_ID_TO_NAME = {
    "clear": "\u6674\u6717",
    "rain": "\u96E8\u5E55",
    "gale": "\u5F3A\u98CE",
    "mist": "\u6D53\u96FE",
    "heatwave": "\u70ED\u6D6A",
    "tempest": "\u96F7\u66B4",
    "wither_tide": "\u67AF\u6F6E",
    "gilded_current": "\u91D1\u98CE",
    "arcane_surge": "\u5965\u79D8\u6D8C\u6D41"
  };
  var WEATHER_NAME_TO_ID = Object.fromEntries(Object.entries(WEATHER_ID_TO_NAME).map(([k, v]) => [v, k]));
  var BIOME_VALUE_MULTIPLIER = {
    b_001: 1,
    b_002: 1.05,
    b_003: 1.1,
    b_004: 1.15,
    b_005: 1.2,
    b_006: 1.25,
    b_007: 1.3,
    b_008: 1.35,
    b_009: 1.4,
    b_010: 1.45,
    b_011: 1.5,
    b_012: 1.55,
    b_013: 1.6,
    b_014: 1.65,
    b_015: 1.7
  };
  var STRENGTHLUCK_WEATHER_FACTOR = {
    clear: 1,
    rain: 1.02,
    gale: 1.03,
    mist: 1.08,
    heatwave: 1.13,
    tempest: 1.25,
    wither_tide: 0.75,
    gilded_current: 1.17
  };
  var BAIT_SCENES = [
    { key: "personalCompetition", label: "\u4E2A\u4EBA\u8D5B" },
    { key: "guildCompetition", label: "\u516C\u4F1A\u8D5B" },
    { key: "golden", label: "\u91D1\u98CE" },
    { key: "arcaneSurge", label: "\u5965\u79D8\u6D8C\u6D41" },
    { key: "normal", label: "\u5176\u4ED6\u5929\u6C14" }
  ];
  var BAIT_TIER_ORDER = ["bait_supreme", "bait_high", "bait_medium", "bait_low", "bait_basic"];
  var BUFF_COOLDOWN_MS = 25 * 60 * 1e3;
  var RESPEC_COST = 1e4;
  var INIT_ENDURANCE = 0;
  var RESPEC_COOLDOWN_MS = 30 * 1e3;
  var RESPEC_BURST_WINDOW_MS = 2 * 60 * 1e3;
  var RESPEC_BURST_MAX = 3;
  var DAILY_RESPEC_MAX = 20;
  var DAILY_RESPEC_GOLD_LIMIT = 2e5;
  var PRIORITY_TYPES = [
    { key: "competition", label: "\u6BD4\u8D5B", short: "\u8D5B", desc: "\u6709\u5DF2\u62A5\u540D\u4E14\u8FDB\u884C\u4E2D\u7684\u6BD4\u8D5B\u65F6\uFF0C\u4F18\u5148\u524D\u5F80\u6BD4\u8D5B\u5730\u56FE" },
    { key: "designated", label: "\u6307\u5B9A\u56FE", short: "\u5B9A", desc: "\u524D\u5F80\u4F60\u624B\u52A8\u9009\u62E9\u7684\u5730\u56FE\uFF0C\u9002\u5408\u5237\u4E13\u7CBE" },
    { key: "goldwind", label: "\u91D1\u98CE", short: "\u91D1", desc: "\u51FA\u73B0\u91D1\u98CE\u5929\u6C14\u65F6\u524D\u5F80\uFF0C\u6BCF\u6761\u9C7C\u989D\u5916\u83B7\u5F97 300~500 \u91D1\u5E01" },
    { key: "experience", label: "\u7ECF\u9A8C", short: "XP", desc: "\u603B\u7ECF\u9A8C\u52A0\u6210\u6700\u9AD8\u7684\u5730\u56FE" },
    { key: "gold", label: "\u91D1\u5E01", short: "G", desc: "\u53BB\u5DF2\u89E3\u9501\u6700\u9AD8\u7B49\u7EA7\u5730\u56FE" },
    { key: "strengthluck", label: "\u529B\u8FD0", short: "\u529B", desc: "\u529B\u8FD0\u73A9\u5BB6\u4E13\u7528\uFF1A\u7EFC\u5408\u300C\u56FE\u4EF7\u503C\u500D\u7387 \xD7 \u5929\u6C14\u52A0\u6210\u300D\u6253\u5206\u9009\u56FE\uFF08\u56FE\u7B49\u7EA7\u8D8A\u9AD8\u9C7C\u8D8A\u503C\u94B1\uFF1B\u96F7\u66B4/\u91D1\u98CE/\u70ED\u6D6A/\u6D53\u96FE/\u5F3A\u98CE/\u96E8\u5E55\u4F9D\u6B21\u52A0\u6210\uFF0C\u67AF\u6F6E\u964D\u4F4E\uFF0C\u5965\u79D8\u6D8C\u6D41\u76F4\u63A5\u53BB\u6700\u9AD8\u7B49\u7EA7\u56FE\uFF09" }
  ];
  var RARITY_META = {
    common: { label: "\u666E\u901A", color: "#9ca3af" },
    uncommon: { label: "\u7F55\u89C1", color: "#22c55e" },
    fine: { label: "\u7CBE\u826F", color: "#14b8a6" },
    rare: { label: "\u7A00\u6709", color: "#3b82f6" },
    epic: { label: "\u53F2\u8BD7", color: "#a855f7" },
    legendary: { label: "\u4F20\u8BF4", color: "#f59e0b" }
  };
  var FISH_SELL_RARITIES = ["common", "uncommon", "fine", "rare", "epic", "legendary"];
  var GEAR_SELL_RARITIES = ["common", "uncommon", "fine", "rare", "epic"];
  var COLLECT_BASE = "https://reelax.hsiyue.com";
  var DOWNLOAD_URL = "https://reelax.hsiyue.com/arcane-assistant.user.js";
  var REPORT_COOLDOWN_MS = 10 * 60 * 1e3;
  var UPDATE_NOTES = "\u3010\u65B0\u589E\u3011\n- \u8BBE\u7F6E\u9762\u677F\u6309\u300C\u65E5\u5E38 / \u8D5B\u4E8B / \u8D44\u4EA7 / \u5176\u4ED6 / \u5173\u4E8E\u300D\u91CD\u65B0\u5206\u7C7B\uFF0C\u624B\u98CE\u7434\u6807\u9898\u589E\u52A0\u9192\u76EE\u5E95\u8272\u3001\u5DE6\u4FA7\u6807\u8BB0\u548C\u5C55\u5F00\u72B6\u6001\u6309\u94AE\uFF0C\u5C55\u5F00\u540E\u4E5F\u80FD\u5FEB\u901F\u627E\u5230\u6807\u9898\u6536\u62E2\n- \u516C\u4F1A\u8D5B\u652F\u6301\u5B98\u5458\u53CA\u4EE5\u4E0A\u81EA\u52A8\u62A5\u540D\uFF1B\u4E16\u754C Boss \u652F\u6301\u6309\u5F31\u70B9\u5C5E\u6027\u81EA\u52A8\u62A5\u540D\n- \u5730\u56FE\u5BFC\u822A\u65B0\u589E\u300C\u529B\u8FD0\u300D\u7B56\u7565\uFF0C\u5E76\u652F\u6301\u6309\u5168\u8239\u6700\u4F4E\u8239\u5458\u7B49\u7EA7\u9650\u5236\u53EF\u9009\u5730\u56FE\n- \u663E\u793A\u589E\u5F3A\u65B0\u589E\u88C5\u5907\u56DB\u7EF4\u5C5E\u6027\u5360\u6BD4\uFF0C\u53EF\u76F4\u89C2\u770B\u51FA\u529B\u91CF\u3001\u667A\u529B\u3001\u8FD0\u6C14\u548C\u8010\u529B\u5206\u5E03\n\n\u3010\u4F18\u5316\u3011\n- \u81EA\u52A8\u5C5E\u6027\u5206\u914D\u5347\u7EA7\u4E3A\u56DB\u7EF4\u6392\u5E8F\u65B9\u6848\uFF1A\u524D\u4E09\u9879\u8BBE\u7F6E\u6700\u7EC8\u9762\u677F\u76EE\u6807\uFF0C\u6700\u540E\u4E00\u9879\u63A5\u6536\u5269\u4F59\u70B9\u6570\uFF1B\u81EA\u52A8\u6263\u9664\u88C5\u5907\u3001\u9C7C\u7AFF\u3001\u5956\u676F\u3001\u56FE\u817E\u548C\u9C7C\u9975\u7B49\u975E\u5C5E\u6027\u70B9\u52A0\u6210\n- \u6BD4\u8D5B\u914D\u88C5\u62C6\u5206\u4E3A\u6BD4\u8D5B\u914D\u88C5\u4E0E\u65E5\u5E38\u914D\u88C5\uFF0C\u6BD4\u8D5B\u6D17\u70B9\u7ED3\u675F\u540E\u6309\u5E38\u9A7B\u65B9\u6848\u6062\u590D\n- \u5730\u56FE\u5BFC\u822A\u3001\u6BD4\u8D5B\u8F85\u52A9\u3001\u901A\u7528\u8F85\u52A9\u548C\u663E\u793A\u589E\u5F3A\u589E\u52A0\u72EC\u7ACB\u603B\u5F00\u5173\uFF0C\u6682\u505C\u72B6\u6001\u7EDF\u4E00\u963B\u6B62\u81EA\u52A8\u64CD\u4F5C\n- \u8FD0\u884C\u65E5\u5FD7\u652F\u6301\u529F\u80FD\u4E0E\u52A8\u4F5C\u4E24\u7EA7\u7B5B\u9009\u3001\u590D\u5236\u548C\u5BFC\u51FA\uFF0C\u9762\u677F\u4FE1\u606F\u5C42\u7EA7\u4E0E\u8BF4\u660E\u63D0\u793A\u540C\u6B65\u6574\u7406\n\n\u3010\u4FEE\u590D\u3011\n- \u4FEE\u590D\u6BD4\u8D5B\u8BC6\u522B\u3001\u8D5B\u540E\u5C5E\u6027\u6062\u590D\u53CA\u914D\u88C5\u5207\u6362\u5728\u90E8\u5206\u72B6\u6001\u4E0B\u53EF\u80FD\u8BEF\u5224\u6216\u91CD\u590D\u6267\u884C\u7684\u95EE\u9898\n- \u4FEE\u590D\u9875\u9762\u91CD\u8F7D\u3001\u9000\u51FA\u8239\u961F\u53CA\u8239\u53EA\u79DF\u8D41/\u4FDD\u517B\u5F02\u5E38\u65F6\u81EA\u52A8\u5BFC\u822A\u72B6\u6001\u4E0D\u540C\u6B65\u7684\u95EE\u9898\n- \u4FEE\u590D\u88C5\u5907\u91CD\u94F8\u540E\u5C5E\u6027\u5360\u6BD4\u672A\u53CA\u65F6\u5237\u65B0\uFF0C\u4EE5\u53CA\u90E8\u5206\u5F39\u7A97\u81EA\u52A8\u5904\u7406\u4E0D\u7A33\u5B9A\u7684\u95EE\u9898";
  var SURVEY_ID = "push-survey-v1";
  var SURVEY_QUESTIONS = [
    { id: "needPush", type: "choice", label: "\u4F60\u9700\u8981\u4FE1\u606F\u63A8\u9001\u529F\u80FD\u5417\uFF1F", options: ["\u9700\u8981", "\u4E0D\u9700\u8981", "\u65E0\u6240\u8C13"] },
    { id: "channel", type: "multi", label: "\u6700\u5E0C\u671B\u63A8\u9001\u5230\u54EA\u91CC\uFF1F\uFF08\u53EF\u591A\u9009\uFF09", options: ["\u4E2A\u4EBA\u5FAE\u4FE1", "\u4E2A\u4EBAQQ", "\u4F01\u4E1A\u5FAE\u4FE1", "\u9489\u9489", "\u98DE\u4E66", "\u72EC\u7ACBApp\uFF08Bark\u7B49\uFF09"] },
    { id: "appOk", type: "choice", label: "\u80FD\u63A5\u53D7\u88C5\u4E00\u4E2A App \u6765\u6536\u63A8\u9001\u5417\uFF1F", options: ["\u80FD", "\u4E0D\u80FD\uFF0C\u53EA\u60F3\u7528\u5FAE\u4FE1/QQ"] },
    { id: "content", type: "multi", label: "\u60F3\u63A5\u6536\u54EA\u4E9B\u63A8\u9001\u5185\u5BB9\uFF1F\uFF08\u53EF\u591A\u9009\uFF09", options: ["\u4FDD\u5E95\u8FDB\u5EA6\uFF08\u903C\u8FD1\u786C\u4FDD\u5E95\uFF09", "\u4E0A\u5947\u5F02/\u5965\u79D8\u7684\u9C7C/\u88C5\u5907", "\u6BCF\u5C0F\u65F6\u9C7C\u83B7\u6C47\u603B", "\u5965\u672F\u6D8C\u52A8\u5929\u6C14", "\u91D1\u98CE\u5929\u6C14", "\u6BD4\u8D5B\u5F00\u8D5B\u9884\u544A/\u7ED3\u679C", "\u8239\u961F\u822A\u7EBF\u53D8\u52A8", "\u516C\u4F1A\u589E\u76CA\u53D8\u5316"] },
    { id: "freq", type: "multi", label: "\u4F60\u80FD\u63A5\u53D7\u7684\u63A8\u9001\u9891\u7387\uFF1F\uFF08\u53EF\u591A\u9009\uFF09", options: ["\u53EA\u63A8\u91CD\u8981\u4E8B\u4EF6\uFF08\u4FDD\u5E95/\u4E0A\u7A00\u6709\uFF09", "\u6BCF\u5C0F\u65F6\u6C47\u603B\u4E5F\u884C", "\u8D8A\u8BE6\u7EC6\u8D8A\u597D"] },
    { id: "suggest", type: "text", label: "\u5176\u4ED6\u60F3\u63A8\u7684\u5185\u5BB9\u6216\u5EFA\u8BAE", placeholder: "\u9009\u586B" }
  ];
  var RARITY_GRADIENTS = {
    exotic: "linear-gradient(135deg, #06B6D4, #8B5CF6)",
    arcane: "linear-gradient(135deg, #A855F7, #EC4899, #F59E0B)"
  };
  var BAIT_LUCK = { bait_basic: 0, bait_low: 0, bait_medium: 250, bait_high: 500, bait_supreme: 1e3 };
  var PITY_CALIBRATION_MS = 10 * 60 * 1e3;
  var PITY_CYCLE_MS = 6e3;
  var CATCH_LOG_KEY = "arcane_rare_catch_log";
  var BALANCE_HISTORY_KEY = "arcane_daily_balance_history";
  var BALANCE_SNAPSHOT_KEY = "arcane_daily_balance_snapshot";
  var LEDGER_KEY = "arcane_daily_ledger";
  var CURRENCY_COLORS = { gold: "#f0bd61", relic: "#a78bfa", fragment: "#ec4899" };

  // src/core.js
  var state = {
    playerProof: null,
    playerKey: null,
    serverTimeOffset: 0,
    appGame: null,
    competitionCache: { personal: null, guild: null },
    worldBoss: null,
    _worldBossPreparedBattleAt: "",
    _worldBossRestoreTimer: null,
    _worldBossStats: null,
    worldBossRestorePending: false,
    partyLowestLevel: null,
    _partyLevelAt: 0,
    partyTravelUnavailableReason: "",
    partyTravelInProgress: false,
    partyTravelTarget: "",
    registeredPersonalIds: /* @__PURE__ */ new Set(),
    lastSwitchTime: 0,
    _lastFishingSig: "",
    playerRelics: 0,
    playerFragments: 0,
    currentWeatherId: "",
    buffExpiryCache: /* @__PURE__ */ new Map(),
    buffCheckInProgress: false,
    domObserver: null,
    domObserverThrottle: 0,
    unspentStatPoints: 0,
    statAllocateInProgress: false,
    baitCache: null,
    lastBaitScene: null,
    playerGold: 0,
    playerStats: null,
    respecInProgress: false,
    guildTotemLevels: null,
    dailyHarvestCasts: 0,
    nextHarvestResetAt: 0,
    dailyHarvestAt: 0,
    playerUid: "",
    playerName: "",
    sellFishRunning: false,
    sellGearRunning: false,
    logBuffer: [],
    logBufferBytes: 0,
    logPaused: false,
    logTagFilter: "",
    logActionFilter: "",
    paused: false,
    _needsPostRespec: false,
    _witherDipSeq: "",
    _dipSeq: "",
    _partyDipSeq: "",
    _partyDipStartAt: 0,
    _partyBlockedSeq: "",
    pity: null,
    _pityDryCasts: { arcane: 0, exotic: 0 },
    _pityFishCaught: { arcane: 0, exotic: 0 },
    _lastLuckTier: -1,
    _lastBaitId: "",
    _pityLoaded: false,
    _rareCatchLog: [],
    _fishNameMap: {},
    _biomeNameMap: {},
    _pityCatchLogOpen: false,
    _catchFilter: "all",
    _catchPage: 0,
    _balanceSnapshot: null,
    _balanceHistory: [],
    _balanceLogOpen: false,
    _balanceFilter: "all",
    _balancePage: 0,
    _ledger: {},
    _ledgerSeen: { gold: false, relic: false, fragment: false },
    shadowRoot: null
  };
  function updateState(p) {
    Object.assign(state, p);
  }
  var bus = /* @__PURE__ */ (() => {
    const h = {};
    return { on(e, fn) {
      (h[e] || (h[e] = [])).push(fn);
    }, emit(e, d) {
      (h[e] || []).forEach((f) => {
        try {
          f(d);
        } catch (x) {
          error("[bus]", e, x);
        }
      });
    } };
  })();
  var teardowns = [];
  function onTeardown(fn) {
    teardowns.push(fn);
  }
  var originalFetch = window.fetch;
  var settings = loadSettings();
  function loadSettings() {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) {
        const s = JSON.parse(r);
        if (typeof s.respecPostMode === "string" && s.respecPostMode.startsWith("str")) {
          s.respecStrengthTarget = parseInt(s.respecPostMode.slice(3), 10) || 1700;
          delete s.respecPostMode;
        }
        if (!s.postRespecRemainderStat) s.postRespecRemainderStat = s.statAllocationTarget || DEFAULTS.postRespecRemainderStat;
        const migratedFixed = { ...DEFAULTS.postRespecFixed, ...s.postRespecFixed || {} };
        if (!s.postRespecFixed && s.postRespecRemainderStat !== "strength") migratedFixed.strength = Math.max(0, Number(s.respecStrengthTarget) || 0);
        s.postRespecFixed = migratedFixed;
        if (!Array.isArray(s.statAllocationOrder) || new Set(s.statAllocationOrder).size !== 4) {
          const remainder = s.postRespecRemainderStat || DEFAULTS.postRespecRemainderStat;
          s.statAllocationOrder = ["strength", "intelligence", "luck", "endurance"].filter((x) => x !== remainder).concat(remainder);
        }
        if (s.triggerWeathers?.length && s.buffSelections && !s.buffSelections[s.triggerWeathers[0]]) {
          const old = s.buffSelections;
          s.buffSelections = {};
          for (const w of s.triggerWeathers) s.buffSelections[w] = { ...old };
          delete s.triggerWeathers;
        }
        if (s.sellGearQualities && typeof s.sellGearQualities === "object") s.sellGearQualities = { ...DEFAULTS.sellGearQualities, ...s.sellGearQualities };
        for (const k of ["mapPriority", "partyMapPriority"]) {
          if (Array.isArray(s[k])) {
            for (const t of PRIORITY_TYPES) if (!s[k].includes(t.key)) s[k].push(t.key);
          }
        }
        s.autoWorldBoss = false;
        s.autoWorldBossRespec = false;
        s.autoWorldBossLoadout = false;
        return { ...DEFAULTS, ...s };
      }
    } catch (e) {
    }
    return { ...DEFAULTS };
  }
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
    }
  }
  function ts() {
    return (/* @__PURE__ */ new Date()).toLocaleTimeString();
  }
  var _utf8 = new TextEncoder();
  function strBytes(s) {
    try {
      return _utf8.encode(String(s)).length;
    } catch (_) {
      return String(s).length;
    }
  }
  function warn(...a) {
    OpLog.warn("\u8F85\u52A9\u811A\u672C", a.join(" "));
  }
  function error(...a) {
    OpLog.error("\u8F85\u52A9\u811A\u672C", a.join(" "));
  }
  function logger(tag, color) {
    const s = `color:${color};font-weight:bold`;
    return (...a) => {
      if (settings.debugLog) console.log(`${ts()} %c[${tag}] ${a.join(" ")}`, s);
    };
  }
  var L = { map: logger("\u5207\u56FE", "#4a9eff"), reg: logger("\u62A5\u540D", "#4ade80"), buff: logger("Buff", "#f59e0b"), bait: logger("\u9C7C\u9975", "#fbbf24"), fetch: logger("\u62E6\u622A", "#9ca3af"), event: logger("\u4E8B\u4EF6", "#c084fc"), cfg: logger("\u8BBE\u7F6E", "#2dd4bf"), dlg: logger("\u5F39\u7A97", "#f472b6"), refill: logger("\u8865\u6746", "#a78bfa"), spc: logger("\u6D17\u70B9", "#f97316"), pity: logger("\u4FDD\u5E95", "#c084fc"), init: logger("\u4E3B\u7A0B\u5E8F", "#64748b") };
  var TAG_COLORS = { "\u5730\u56FE\u5BFC\u822A": "#4a9eff", "\u6BD4\u8D5B\u8F85\u52A9": "#4ade80", "\u4E16\u754C Boss": "#f472b6", "\u5C5E\u6027\u52A0\u70B9": "#f59e0b", "\u9C7C\u9975\u5207\u6362": "#fbbf24", "Buff \u8D2D\u4E70": "#e6a23c", "\u51FA\u552E\u9C7C\u7C7B": "#eab308", "\u51FA\u552E\u88C5\u5907": "#a855f7", "\u901A\u7528\u8F85\u52A9": "#2dd4bf", "\u663E\u793A\u4E0E\u7EDF\u8BA1": "#c084fc", "\u53CD\u9988": "#38bdf8", "\u4E3B\u7A0B\u5E8F": "#64748b" };
  var LOG_SCOPE = {
    "\u62A5\u540D": ["\u6BD4\u8D5B\u8F85\u52A9", "\u62A5\u540D", true],
    "\u6D17\u70B9": ["\u6BD4\u8D5B\u8F85\u52A9", "\u6D17\u70B9", true],
    "\u914D\u88C5": ["\u6BD4\u8D5B\u8F85\u52A9", "\u914D\u88C5", true],
    "\u5207\u56FE": ["\u5730\u56FE\u5BFC\u822A", "\u5207\u56FE"],
    "\u52A0\u70B9": ["\u5C5E\u6027\u52A0\u70B9", "\u5206\u914D"],
    "\u9C7C\u9975": ["\u9C7C\u9975\u5207\u6362", "\u5207\u6362"],
    "Buff": ["Buff \u8D2D\u4E70", "\u8D2D\u4E70"],
    "\u5356\u9C7C": ["\u51FA\u552E\u9C7C\u7C7B", "\u51FA\u552E"],
    "\u5356\u88C5\u5907": ["\u51FA\u552E\u88C5\u5907", "\u51FA\u552E"],
    "\u8865\u6746": ["\u901A\u7528\u8F85\u52A9", "\u8865\u6746", true],
    "\u7B7E\u5230": ["\u901A\u7528\u8F85\u52A9", "\u7B7E\u5230", true],
    "\u5F39\u7A97": ["\u901A\u7528\u8F85\u52A9", "\u5F39\u7A97", true],
    "\u4FDD\u5E95": ["\u663E\u793A\u4E0E\u7EDF\u8BA1", "\u4FDD\u5E95"],
    "\u4E16\u754CBoss": ["\u4E16\u754C Boss", "\u4E8B\u4EF6"],
    "\u53CD\u9988": ["\u53CD\u9988", "\u63D0\u4EA4"],
    "\u62E6\u622A": ["\u4E3B\u7A0B\u5E8F", "\u8BF7\u6C42", true],
    "\u4E8B\u4EF6": ["\u4E3B\u7A0B\u5E8F", "\u4E8B\u4EF6", true],
    "\u8BBE\u7F6E": ["\u4E3B\u7A0B\u5E8F", "\u8BBE\u7F6E", true],
    "\u8F85\u52A9\u811A\u672C": ["\u4E3B\u7A0B\u5E8F", "\u5F02\u5E38", true],
    "\u4E3B\u7A0B\u5E8F": ["\u4E3B\u7A0B\u5E8F", "\u72B6\u6001", true]
  };
  function pushLog(time, level, tag, color, msg, action = "", hasSecondary = false) {
    state.logBuffer.push({ time, level, tag, color, msg, action, hasSecondary });
    state.logBufferBytes += strBytes(msg) + 10;
    while (state.logBufferBytes > 10 * 1024 * 1024 && state.logBuffer.length > 100) {
      state.logBufferBytes -= strBytes((state.logBuffer.shift() || { msg: "" }).msg) + 10;
    }
    bus.emit("log:updated");
  }
  (function() {
    const _log = console.log.bind(console), _warn = console.warn.bind(console), _error = console.error.bind(console);
    function intercept(level, orig, args) {
      orig(...args);
      const fmt = String(args[0] || "");
      const tagM = fmt.match(/%c\[([^\]]+)\]/);
      const rawTag = tagM ? tagM[1] : "";
      let msg = fmt.replace(/%c/g, "").replace(/^\[?\d{2}:\d{2}:\d{2}\]?\s*/, "").trim();
      if (rawTag) {
        const p = `[${rawTag}]`;
        if (msg.startsWith(p)) msg = msg.slice(p.length).trim();
      }
      const scoped = LOG_SCOPE[rawTag] || [rawTag, "\u5176\u4ED6"];
      let [tag, action, hasSecondary = false] = scoped;
      const actionM = msg.match(/^\[([^\]]+)\]\s*/);
      if (actionM) {
        action = actionM[1];
        hasSecondary = true;
        msg = msg.slice(actionM[0].length);
      }
      const color = tag ? TAG_COLORS[tag] || "#64748b" : null;
      if (tag && msg && !/^\d{2}:\d{2}:\d{2}$/.test(msg)) pushLog(ts(), level, tag, color, msg, action, hasSecondary);
    }
    console.log = function() {
      intercept("info", _log, arguments);
    };
    console.warn = function() {
      intercept("warn", _warn, arguments);
    };
    console.error = function() {
      intercept("error", _error, arguments);
    };
  })();
  var OpLog = {
    _out(level, t, m) {
      const c = TAG_COLORS[t] || "#64748b";
      (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(`[${ts()}] %c[${t}]%c ${m}`, `color:${c};font-weight:bold`, "");
    },
    info(t, m) {
      this._out("info", t, m);
    },
    warn(t, m) {
      this._out("warn", t, m);
    },
    error(t, m) {
      this._out("error", t, m);
    }
  };
  function calculateTotalExpBonus(b) {
    const mastery = !settings.excludeMasteryBonus && typeof b.masteryExperienceBonusBasisPoints === "number" ? 1 + b.masteryExperienceBonusBasisPoints / 1e4 : 1;
    const weather = b.weather && typeof b.weather.experienceBonusBasisPoints === "number" ? 1 + b.weather.experienceBonusBasisPoints / 1e4 : 1;
    const guild = !settings.excludeGuildBoost && b.guildBoost?.isActive && typeof b.guildBoost.experienceBonusBasisPoints === "number" ? 1 + b.guildBoost.experienceBonusBasisPoints / 1e4 : 1;
    return mastery * weather * guild;
  }
  function formatBasisPoints(multiplier) {
    const p = ((multiplier - 1) * 100).toFixed(1);
    return `${multiplier >= 1 ? "+" : ""}${p}%`;
  }
  function generateIdempotencyKey(pre, det) {
    return det ? `${pre}-${det}` : `${pre}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }
  var _frontendVersion = "";
  async function refreshFrontendVersion() {
    if (_frontendVersion) return;
    try {
      const r = await originalFetch("/api/meta/frontend-release", { headers: { "Accept": "application/json" }, credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (j?.latestVersion) _frontendVersion = j.latestVersion;
    } catch (_) {
    }
  }
  function getFrontendVersion() {
    if (_frontendVersion) return _frontendVersion;
    const el = document.querySelector('[aria-label*="\u5F53\u524D\u7248\u672C"]');
    if (el) {
      const m = el.getAttribute("aria-label").match(/v([\d.]+)/);
      if (m) return m[1];
    }
    return "0.18.0";
  }
  function updateServerTimeOffset(headers) {
    try {
      const st = Number(headers.get("x-arcane-server-time"));
      if (Number.isSafeInteger(st) && st > 0) state.serverTimeOffset = st - Date.now();
    } catch (_) {
    }
  }
  function base64Url(bytes) {
    let b = "";
    for (const x of new Uint8Array(bytes)) b += String.fromCharCode(x);
    return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
  async function apiFetch(path, opts = {}) {
    if (!state.playerProof) {
      try {
        await refreshFrontendVersion();
        const meResp = await originalFetch("/api/me", { headers: { "Accept": "application/json", "x-frontend-version": getFrontendVersion() }, credentials: "include" });
        const proof = meResp.headers.get("x-arcane-request-proof");
        if (proof) {
          state.playerProof = proof;
          state.playerKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(proof), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        }
        updateServerTimeOffset(meResp.headers);
        const meData = await meResp.json();
        if (meData.player?.fragments !== void 0) updateState({ playerFragments: meData.player.fragments });
        if (meData.player?.relics !== void 0) updateState({ playerRelics: meData.player.relics });
        if (meData.player?.gold !== void 0) updateState({ playerGold: meData.player.gold });
        if (meData.player?.unspentStatPoints !== void 0) {
          const prev = state.unspentStatPoints;
          updateState({ unspentStatPoints: meData.player.unspentStatPoints });
          if (meData.player.unspentStatPoints > 0 && meData.player.unspentStatPoints !== prev) bus.emit("stats:unspent-changed");
        }
        if (meData.player?.stats) {
          const hadStats = !!state.playerStats;
          updateState({ playerStats: meData.player.stats });
          if (!hadStats) bus.emit("stats:first-loaded");
        }
        if (meData.publicIdentity?.publicId !== void 0) updateState({ playerUid: String(meData.publicIdentity.publicId) });
        if (meData.player?.nickname !== void 0) updateState({ playerName: meData.player.nickname });
      } catch (_) {
      }
    }
    const h = { "Accept": "application/json", "x-frontend-version": getFrontendVersion() };
    if (opts.body !== void 0) h["Content-Type"] = "application/json";
    if (opts.idempotencyKey) h["Idempotency-Key"] = opts.idempotencyKey;
    if (state.playerProof && state.playerKey) {
      const body = opts.body !== void 0 ? JSON.stringify(opts.body) : "";
      const ts2 = String(Date.now() + state.serverTimeOffset);
      const url = new URL(path, "https://arcane-reelax.invalid");
      const payload = `v1
${(opts.method || "GET").toUpperCase()}
${url.pathname}${url.search}
${ts2}
${body}`;
      h["x-arcane-request-proof"] = state.playerProof;
      h["x-arcane-request-timestamp"] = ts2;
      h["x-arcane-request-signature"] = base64Url(await crypto.subtle.sign("HMAC", state.playerKey, new TextEncoder().encode(payload)));
    }
    const r = await fetch(path, { method: opts.method || "GET", headers: h, credentials: "include", ...opts.body === void 0 ? {} : { body: JSON.stringify(opts.body) } });
    if (!r.ok) {
      let msg = `${r.status}`, raw = "";
      try {
        const e = await r.clone().json();
        raw = JSON.stringify(e);
        if (e.error?.message) msg = e.error.message;
        else if (e.message) msg = e.message;
        else if (e.code) msg = e.code;
      } catch (_) {
      }
      if ((msg.includes("\u7B7E\u540D") || /SIGNATURE/i.test(raw) || /SIGNATURE/i.test(msg)) && !opts._retried) {
        state.playerProof = null;
        state.playerKey = null;
        return apiFetch(path, { ...opts, _retried: true });
      }
      throw new Error(msg);
    }
    return r.json();
  }
  function createCooldownMap(defaultMs) {
    const map = /* @__PURE__ */ new Map();
    return {
      isCooling(key, now) {
        const u = map.get(key);
        return u != null && now < u;
      },
      set(key, until) {
        map.set(key, until);
      },
      clearExpired(now) {
        for (const [k, v] of map) if (now >= v) map.delete(k);
      }
    };
  }
  function createSafetyLock(config) {
    const { cooldownMs, burstWindowMs, burstMax, maxCount, spendLimit, daily, onTrip } = config;
    const timestamps = [];
    let cooldownUntil = 0, count = 0, spent = 0, currentDate = "";
    function rollDaily() {
      if (!daily) return;
      const d = /* @__PURE__ */ new Date();
      const today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (today !== currentDate) {
        currentDate = today;
        count = 0;
        spent = 0;
      }
    }
    return {
      check(amount = 0) {
        rollDaily();
        const now = Date.now();
        if (cooldownMs && now < cooldownUntil) return { blocked: true, reason: `\u51B7\u5374\u4E2D (${((cooldownUntil - now) / 1e3).toFixed(0)}s)` };
        if (burstWindowMs && burstMax) {
          const recent = timestamps.filter((t) => t > now - burstWindowMs);
          if (recent.length >= burstMax) {
            const msg = `${(burstWindowMs / 6e4).toFixed(0)}min\u5185${recent.length}\u6B21`;
            if (onTrip) onTrip(msg);
            return { blocked: true, reason: `\u7206\u53D1\u68C0\u6D4B: ${msg}` };
          }
        }
        if (maxCount && count >= maxCount) {
          const msg = `\u4ECA\u65E5\u5DF2\u8FBE${count}\u6B21`;
          if (onTrip) onTrip(msg);
          return { blocked: true, reason: msg };
        }
        if (spendLimit != null && spent >= spendLimit) {
          const msg = `\u4ECA\u65E5\u6D88\u8D39\u5DF2\u8FBE${spent}`;
          if (onTrip) onTrip(msg);
          return { blocked: true, reason: msg };
        }
        if (spendLimit != null && spent + amount > spendLimit) {
          const msg = `\u4ECA\u65E5\u6D88\u8D39\u5C06\u8D85\u9650${spent}+${amount}`;
          if (onTrip) onTrip(msg);
          return { blocked: true, reason: msg };
        }
        return { blocked: false };
      },
      record(amount = 0) {
        rollDaily();
        const now = Date.now();
        if (cooldownMs) cooldownUntil = now + cooldownMs;
        timestamps.push(now);
        const cutoff = now - (burstWindowMs || 6e4) * 2;
        while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
        count++;
        spent += amount;
      },
      getSpent() {
        rollDaily();
        return spent;
      },
      getCount() {
        rollDaily();
        return count;
      }
    };
  }
  var buffTypeCooldown = createCooldownMap(BUFF_COOLDOWN_MS);
  var respecLock = createSafetyLock({
    cooldownMs: RESPEC_COOLDOWN_MS,
    burstWindowMs: RESPEC_BURST_WINDOW_MS,
    burstMax: RESPEC_BURST_MAX,
    maxCount: DAILY_RESPEC_MAX,
    spendLimit: DAILY_RESPEC_GOLD_LIMIT,
    daily: true,
    onTrip: (r) => {
      bus.emit("respec:tripped", r);
    }
  });
  function waitForGameAPI() {
    return new Promise((resolve) => {
      if (window.arcaneReelax) {
        resolve(window.arcaneReelax);
        return;
      }
      document.addEventListener("arcane-reelax:ready", () => {
        if (window.arcaneReelax) resolve(window.arcaneReelax);
      }, { once: true });
      const start = Date.now();
      (function poll() {
        if (window.arcaneReelax) resolve(window.arcaneReelax);
        else if (Date.now() - start < 3e4) setTimeout(poll, 250);
        else resolve(null);
      })();
    });
  }
  async function autoRegisterPersonal() {
    if (!settings.autoCompetition || !settings.autoRegisterPersonal) return;
    const p = state.competitionCache.personal;
    if (!p) {
      L.reg("\u7B49\u5F85\u4E2A\u4EBA\u8D5B\u6570\u636E");
      return;
    }
    const cand = [];
    if (p.current?.canRegister && !p.current.isRegistered) cand.push(p.current);
    if (p.upcoming) {
      for (const c of p.upcoming) if (c.canRegister && !c.isRegistered && c.status === "scheduled") cand.push(c);
    }
    if (!cand.length) {
      L.reg("\u6CA1\u6709\u53EF\u62A5\u540D\u7684\u4E2A\u4EBA\u8D5B");
      return;
    }
    cand.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    for (const c of cand) {
      if (state.registeredPersonalIds.has(c.id)) continue;
      try {
        await apiFetch(`/api/tournaments/${c.id}/register`, { method: "POST", idempotencyKey: generateIdempotencyKey("register", c.id), body: {} });
        state.registeredPersonalIds.add(c.id);
        c.isRegistered = true;
        OpLog.info("\u62A5\u540D", "\u2705 #" + c.sequence + " \u62A5\u540D\u6210\u529F");
      } catch (err) {
        OpLog.error("\u62A5\u540D", "\u62A5\u540D\u5931\u8D25: " + err.message);
      }
    }
  }
  async function autoRegisterGuild() {
    if (!settings.autoCompetition || !settings.autoRegisterGuild) return;
    const g = state.competitionCache.guild;
    if (!g) {
      L.reg("\u7B49\u5F85\u516C\u4F1A\u8D5B\u6570\u636E");
      return;
    }
    let role = "";
    try {
      const guild = await apiFetch("/api/guilds/me");
      role = guild?.membership?.role || "";
    } catch (err) {
      L.reg("\u68C0\u67E5\u516C\u4F1A\u804C\u4F4D\u5931\u8D25: " + err.message);
      return;
    }
    if (!["officer", "co_leader", "leader"].includes(role)) {
      L.reg("\u5F53\u524D\u516C\u4F1A\u804C\u4F4D\u65E0\u62A5\u540D\u6743\u9650");
      return;
    }
    const cand = [g.current, ...g.upcoming || []].filter(
      (c) => c && (c.status === "active" || c.status === "scheduled") && !c.entryStatus && c.canRegister
    ).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    if (!cand.length) {
      L.reg("\u6CA1\u6709\u53EF\u62A5\u540D\u7684\u516C\u4F1A\u8D5B");
      return;
    }
    for (const c of cand) {
      try {
        await apiFetch(`/api/guild-tournaments/${c.id}/register`, {
          method: "POST",
          idempotencyKey: generateIdempotencyKey("guild-register", c.id),
          body: {}
        });
        c.entryStatus = "registered";
        c.canRegister = false;
        OpLog.info("\u62A5\u540D", "\u2705 \u516C\u4F1A\u8D5B #" + c.sequence + " \u62A5\u540D\u6210\u529F");
      } catch (err) {
        OpLog.error("\u62A5\u540D", "\u516C\u4F1A\u8D5B\u62A5\u540D\u5931\u8D25: " + err.message);
      }
    }
  }
  var COMP_SCHEDULE = { personal: [[600, 660], [900, 960]], guild: [[1200, 1260]] };
  function bjNowMin() {
    const d = new Date(Date.now() + 8 * 3600 * 1e3);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  function getActiveComp(kind) {
    const min = bjNowMin();
    const win = (COMP_SCHEDULE[kind] || []).some((w) => min >= w[0] - 5 && min < w[1]);
    if (!win) return null;
    const cc = state.competitionCache[kind];
    if (!cc) return null;
    const isReg = kind === "personal" ? (c) => c.isRegistered : (c) => c.entryStatus === "registered";
    const now = Date.now();
    const all = [cc.current, ...cc.upcoming || []].filter(Boolean);
    for (const c of all) {
      if (!isReg(c)) continue;
      const s = new Date(c.startAt).getTime();
      const e = new Date(c.endAt).getTime();
      if (now >= s - 3e5 && now <= e) return c;
    }
    return null;
  }
  function getCompetitionBiomeId(c) {
    if (c.assignedBiomeId) return c.assignedBiomeId;
    if (c.groups?.length) {
      const gid = c.myGroupId || c.defaultGroupId;
      const g = c.groups.find((g2) => g2.id === gid);
      if (g) return g.biomeId;
    }
    return c.biomeId;
  }
  function getPersonalCompContext() {
    const p = getActiveComp("personal");
    if (!p) return null;
    return { sequence: p.sequence, biomeId: getCompetitionBiomeId(p) };
  }
  function isPersonalBlocked() {
    if (!settings.partyDipPersonal) return false;
    const ctx = getPersonalCompContext();
    if (!ctx) return false;
    return state._partyBlockedSeq === ctx.sequence;
  }
  function personalDipScoreMet(needWither) {
    const p = getActiveComp("personal");
    if (!p) return false;
    const score = p.score || 0;
    if (score < 10) return false;
    if (needWither) {
      const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
      const biome = snap?.biomes?.find((b) => b.id === getCompetitionBiomeId(p));
      if (biome?.weather?.id !== "wither_tide") return false;
    }
    return true;
  }
  function getCompetitionTarget(unlocked, currentId) {
    if (!settings.autoSwitchMap || !settings.autoCompetition) return null;
    const cand = [];
    if (settings.autoPersonal) {
      const p = getActiveComp("personal");
      if (p) cand.push({ biomeId: getCompetitionBiomeId(p), startAt: new Date(p.startAt).getTime(), kind: "personal" });
    }
    if (settings.autoGuild) {
      const g = getActiveComp("guild");
      if (g) cand.push({ biomeId: getCompetitionBiomeId(g), startAt: new Date(g.startAt).getTime(), kind: "guild" });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.startAt - b.startAt);
    const pick = (x) => {
      const biome = unlocked.find((b) => b.id === x.biomeId && b.isUnlocked);
      return biome ? { biome, kind: x.kind } : null;
    };
    if (currentId) {
      const sticky = cand.find((x) => x.biomeId === currentId);
      if (sticky) {
        const r = pick(sticky);
        if (r) return r;
      }
    }
    for (const x of cand) {
      const r = pick(x);
      if (r) return r;
    }
    return null;
  }
  function isBoatLeader(p) {
    return p?.role === "captain" || p?.role === "helmsman";
  }
  function getPartyUnavailableReason(party) {
    if (!party?.isInParty) return "";
    if (party.status === "rental_due") return "\u8239\u961F\u79DF\u8D41\u5DF2\u5230\u671F\uFF0C\u8BF7\u7EED\u79DF\u540E\u518D\u5207\u56FE";
    if (party.status === "maintenance_due") return "\u8239\u53EA\u5DF2\u505C\u822A\u5F85\u4FDD\u517B\uFF0C\u8BF7\u5B8C\u6210\u4FDD\u517B\u540E\u518D\u5207\u56FE";
    return "";
  }

  // src/features/stats.js
  function computeEffectiveLuck() {
    const totalLuck = state.playerStats?.total?.luck || 0;
    const buffBp = (state._activeBuffs || []).filter((b) => b.buffType === "luck").reduce((s, b) => s + (b.bonusBasisPoints || 0), 0);
    const baitId = (state.appGame || window.arcaneReelax)?.getSnapshot()?.baits?.find((b) => b.isSelected)?.id || "";
    const baitLuck = BAIT_LUCK[baitId] ?? 0;
    return Math.round(totalLuck * (1 + buffBp / 1e4)) + baitLuck;
  }
  function getLuckTier() {
    return Math.floor(computeEffectiveLuck() / 1e3);
  }
  async function fetchPity() {
    try {
      const r = await apiFetch("/api/statistics");
      if (r?.pity) {
        state.pity = r.pity;
        state._pityDryCasts.arcane = r.pity.arcane?.currentDryCasts ?? 0;
        state._pityDryCasts.exotic = r.pity.exotic?.currentDryCasts ?? 0;
        if (Array.isArray(r.rarities)) {
          for (const rr of r.rarities) {
            if (rr.rarity === "arcane" || rr.rarity === "exotic") state._pityFishCaught[rr.rarity] = rr.fishCaught ?? 0;
          }
        }
        if (!state._pityLoaded) {
          state._pityLoaded = true;
          OpLog.info("\u4FDD\u5E95", "\u4FDD\u5E95\u6570\u636E\u5DF2\u52A0\u8F7D");
        }
        state._lastLuckTier = getLuckTier();
        state._lastBaitId = (state.appGame || window.arcaneReelax)?.getSnapshot()?.baits?.find((b) => b.isSelected)?.id || "";
        L.pity(`\u4FDD\u5E95\u6821\u51C6: \u5965\u79D8${r.pity.arcane?.currentDryCasts}/${r.pity.arcane?.hardPityCasts} \u5947\u5F02${r.pity.exotic?.currentDryCasts}/${r.pity.exotic?.hardPityCasts} \u6863\u4F4D${state._lastLuckTier}`);
        injectPityPanel();
      }
    } catch (e) {
      L.pity("\u4FDD\u5E95\u6821\u51C6\u5931\u8D25: " + e.message);
    }
  }
  function trackPityCast(rarity) {
    if (rarity === "arcane") {
      state._pityDryCasts.arcane = 0;
      state._pityDryCasts.exotic++;
    } else if (rarity === "exotic") {
      state._pityDryCasts.arcane++;
      state._pityDryCasts.exotic = 0;
    } else {
      state._pityDryCasts.arcane++;
      state._pityDryCasts.exotic++;
    }
  }
  function loadCatchLog() {
    try {
      const s = localStorage.getItem(CATCH_LOG_KEY);
      if (s) {
        const a = JSON.parse(s);
        if (Array.isArray(a)) state._rareCatchLog = a;
      }
    } catch (_) {
    }
  }
  function saveCatchLog() {
    try {
      localStorage.setItem(CATCH_LOG_KEY, JSON.stringify(state._rareCatchLog));
    } catch (_) {
    }
  }
  function recordRareCatch(r) {
    if (!r || r.rarity !== "exotic" && r.rarity !== "arcane") return;
    state._rareCatchLog.push({ t: Date.now(), fishId: r.fishId || "", rarity: r.rarity });
    saveCatchLog();
    L.pity(`\u9493\u83B7\u8BB0\u5F55: ${r.rarity === "arcane" ? "\u5965\u79D8" : "\u5947\u5F02"} ${state._fishNameMap[r.fishId] || r.fishId}`);
  }
  function formatDateTime(ts2) {
    const d = new Date(ts2), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function closeCatchLog() {
    state._pityCatchLogOpen = false;
    document.querySelector(".arc-catch-log-layer")?.remove();
  }
  function renderCatchLog() {
    document.querySelector(".arc-catch-log-layer")?.remove();
    if (!state._pityCatchLogOpen) return;
    const log2 = state._rareCatchLog;
    const exoticCount = log2.filter((x) => x.rarity === "exotic").length;
    const arcaneCount = log2.filter((x) => x.rarity === "arcane").length;
    const filter = state._catchFilter;
    const sorted = [...filter === "all" ? log2 : log2.filter((x) => x.rarity === filter)].sort((a, b) => b.t - a.t);
    const PAGE_SIZE = 50;
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const page = Math.min(Math.max(0, state._catchPage), totalPages - 1);
    state._catchPage = page;
    const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const grad = (g, t) => `<span style="background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:700;">${t}</span>`;
    const meta = { exotic: { name: "\u5947\u5F02", g: RARITY_GRADIENTS.exotic }, arcane: { name: "\u5965\u79D8", g: RARITY_GRADIENTS.arcane } };
    const items = pageItems.length ? pageItems.map((x) => {
      const m = meta[x.rarity] || meta.exotic;
      const fishName = state._fishNameMap[x.fishId] || x.fishId;
      const biomeId = x.fishId ? x.fishId.split("_").slice(0, 2).join("_") : "";
      const biomeName = biomeId ? state._biomeNameMap[biomeId] || "" : "";
      const biomeCode = biomeId ? "B" + parseInt(biomeId.split("_")[1], 10) : "";
      return `<article style="display:flex;flex-direction:column;gap:3px;padding:9px 0;border-bottom:1px dashed var(--divider,#e4edf2);">
                <time style="font-size:11px;color:var(--muted,#71869b);">${formatDateTime(x.t)}</time>
                <div style="display:flex;align-items:center;gap:6px;font-size:13px;">${grad(m.g, m.name)}<span style="color:var(--text,#20354d);">${fishName}</span></div>
                ${biomeName ? `<span style="font-size:11px;color:var(--muted,#71869b);">${biomeCode ? `[${biomeCode}] ` : ""}${biomeName}</span>` : ""}
            </article>`;
    }).join("") : '<div style="padding:24px 0;text-align:center;font-size:12px;color:var(--muted,#71869b);">\u6682\u65E0\u8BB0\u5F55</div>';
    const filterBtn = (val, label) => `<button data-filter="${val}" style="padding:4px 12px;border:1px solid ${filter === val ? "var(--tide,#52bac4)" : "var(--border,#d1dee7)"};border-radius:999px;background:${filter === val ? "color-mix(in srgb,var(--tide,#52bac4) 16%,transparent)" : "transparent"};color:${filter === val ? "var(--tide-deep,#2a8790)" : "var(--muted,#71869b)"};font-size:12px;font-weight:600;cursor:pointer;">${label}</button>`;
    const pagerBtn = (dir, label, disabled) => `<button data-page="${dir}" ${disabled ? "disabled" : ""} style="padding:3px 10px;border:1px solid var(--border,#d1dee7);border-radius:6px;background:transparent;color:${disabled ? "var(--muted,#71869b)" : "var(--text,#20354d)"};font-size:12px;cursor:${disabled ? "default" : "pointer"};opacity:${disabled ? "0.4" : "1"};">${label}</button>`;
    const footer = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 18px;border-top:1px solid var(--divider,#e4edf2);flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted,#71869b);">\u603B\u8BA1 ${grad(RARITY_GRADIENTS.exotic, exoticCount + " \u5947\u5F02")} \xB7 ${grad(RARITY_GRADIENTS.arcane, arcaneCount + " \u5965\u79D8")}</span>
            ${sorted.length > PAGE_SIZE ? `<span style="display:inline-flex;align-items:center;gap:8px;">${pagerBtn("prev", "\u2039 \u4E0A\u4E00\u9875", page === 0)}<span style="font-size:12px;color:var(--muted,#71869b);">${page + 1} / ${totalPages}</span>${pagerBtn("next", "\u4E0B\u4E00\u9875 \u203A", page >= totalPages - 1)}</span>` : ""}
        </div>`;
    const layer = document.createElement("div");
    layer.className = "arc-catch-log-layer";
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);padding:16px;";
    layer.innerHTML = `<section style="width:min(440px,100%);max-height:70vh;display:flex;flex-direction:column;background:var(--surface,#fffefa);border:1px solid var(--border,#d1dee7);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,0.25);overflow:hidden;">
            <header style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                <div style="min-width:0;">
                    <div style="font-size:11px;letter-spacing:1px;">${grad(RARITY_GRADIENTS.exotic, "\u5947\u5F02")} <span style="color:var(--muted,#71869b);">\xB7</span> ${grad(RARITY_GRADIENTS.arcane, "\u5965\u79D8")}</div>
                    <h2 style="margin:2px 0 0;font-size:16px;font-weight:700;color:var(--text,#20354d);">\u73CD\u7A00\u9493\u83B7\u8BB0\u5F55</h2>
                </div>
                <button class="arc-catch-log-close" style="margin-left:auto;width:30px;height:30px;display:grid;place-items:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted,#71869b);font-size:16px;cursor:pointer;" title="\u5173\u95ED">\u2715</button>
            </header>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                ${filterBtn("all", "\u5168\u90E8")}${filterBtn("exotic", "\u5947\u5F02")}${filterBtn("arcane", "\u5965\u79D8")}
            </div>
            <div style="overflow-y:auto;padding:4px 18px 12px;font-family:inherit;">${items}</div>
            ${footer}
        </section>`;
    layer.addEventListener("click", (e) => {
      if (e.target === layer || e.target.closest(".arc-catch-log-close")) {
        closeCatchLog();
        return;
      }
      const fb = e.target.closest("[data-filter]");
      if (fb) {
        state._catchFilter = fb.dataset.filter;
        state._catchPage = 0;
        renderCatchLog();
        return;
      }
      const pb = e.target.closest("[data-page]");
      if (pb && !pb.disabled) {
        state._catchPage = pb.dataset.page === "prev" ? page - 1 : page + 1;
        renderCatchLog();
      }
    });
    document.body.appendChild(layer);
  }
  function onDocClickCatchToggle(e) {
    if (e.target.closest(".pity-catch-toggle")) {
      state._pityCatchLogOpen = true;
      renderCatchLog();
    }
  }
  function todayStr() {
    const d = /* @__PURE__ */ new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function loadBalance() {
    try {
      const s = localStorage.getItem(BALANCE_SNAPSHOT_KEY);
      if (s) {
        const o = JSON.parse(s);
        if (o && typeof o === "object") state._balanceSnapshot = o;
      }
    } catch (_) {
    }
    try {
      const h = localStorage.getItem(BALANCE_HISTORY_KEY);
      if (h) {
        const a = JSON.parse(h);
        if (Array.isArray(a)) state._balanceHistory = a;
      }
    } catch (_) {
    }
  }
  function saveBalance() {
    try {
      localStorage.setItem(BALANCE_SNAPSHOT_KEY, JSON.stringify(state._balanceSnapshot));
    } catch (_) {
    }
    try {
      localStorage.setItem(BALANCE_HISTORY_KEY, JSON.stringify(state._balanceHistory));
    } catch (_) {
    }
  }
  function checkDailyReset() {
    if (state.playerGold <= 0) return;
    const today = todayStr();
    const snap = state._balanceSnapshot;
    if (!snap || snap.date !== today) {
      if (snap && snap.date) {
        const rec = {
          date: snap.date,
          gold: state.playerGold - (snap.gold || 0),
          relic: state.playerRelics - (snap.relic || 0),
          fragment: state.playerFragments - (snap.fragment || 0)
        };
        const idx = state._balanceHistory.findIndex((x) => x.date === rec.date);
        if (idx >= 0) state._balanceHistory[idx] = rec;
        else state._balanceHistory.push(rec);
      }
      state._balanceSnapshot = { date: today, gold: state.playerGold, relic: state.playerRelics, fragment: state.playerFragments };
      saveBalance();
    }
  }
  function computeBalanceDelta() {
    const snap = state._balanceSnapshot;
    if (!snap) return null;
    return { gold: state.playerGold - snap.gold, relic: state.playerRelics - snap.relic, fragment: state.playerFragments - snap.fragment };
  }
  function fmtSigned(v) {
    const n = Math.round(v);
    return (n > 0 ? "+" : "") + n.toLocaleString("zh-CN");
  }
  function signColor(v) {
    return v > 0 ? "#45a76f" : v < 0 ? "#e66b58" : "var(--muted,#71869b)";
  }
  function injectBalanceDisplay() {
    if (!settings.showEnhancements || !settings.showBalance) {
      document.querySelector(".arc-balance-group")?.remove();
      return;
    }
    const goldGroup = [...document.querySelectorAll(".harvest-group")].find((g) => g.querySelector(".harvest-group-label")?.textContent.trim() === "\u91D1\u5E01\u6536\u652F");
    if (!goldGroup) return;
    let el = document.querySelector(".arc-balance-group");
    if (!el) {
      el = document.createElement("div");
      el.className = "harvest-group arc-balance-group";
      goldGroup.insertAdjacentElement("afterend", el);
    }
    const delta = computeBalanceDelta();
    const chip = (label, color, v) => `<span class="harvest-chip"><span style="color:${color};font-weight:600;">${label}</span><strong style="color:${signColor(v)};">${fmtSigned(v)}</strong></span>`;
    const ledgerLink = window.__ledgerDebug ? '<span class="harvest-chip arc-ledger-toggle" style="cursor:pointer;text-decoration:underline;"><span>\u6536\u652F\u660E\u7EC6</span></span>' : "";
    el.innerHTML = `<span class="harvest-group-label">\u4ECA\u65E5\u51C0\u8D5A/\u76C8\u4E8F</span><div class="harvest-tags">${delta ? `${chip("\u91D1\u5E01", CURRENCY_COLORS.gold, delta.gold)}${chip("\u9057\u7269", CURRENCY_COLORS.relic, delta.relic)}${chip("\u788E\u7247", CURRENCY_COLORS.fragment, delta.fragment)}` : ""}<span class="harvest-chip arc-balance-toggle" style="cursor:pointer;text-decoration:underline;"><span>\u5386\u53F2\u8BB0\u5F55</span></span>${ledgerLink}</div>`;
  }
  function loadLedger() {
    try {
      const s = localStorage.getItem(LEDGER_KEY);
      if (s) {
        const o = JSON.parse(s);
        if (o && typeof o === "object") state._ledger = o;
      }
    } catch (_) {
    }
  }
  function saveLedger() {
    try {
      const cutoff = Date.now() - 30 * 24 * 3600 * 1e3;
      for (const date of Object.keys(state._ledger)) {
        if (Date.parse(date) < cutoff) delete state._ledger[date];
      }
      localStorage.setItem(LEDGER_KEY, JSON.stringify(state._ledger));
    } catch (_) {
    }
  }
  function classifyLedger(url, mode) {
    if (url.includes("/api/fishing/sync") || url.includes("/api/fishing/state")) return mode === "offline" ? "\u79BB\u7EBF\u7ED3\u7B97" : "\u5728\u7EBF\u9493\u9C7C";
    if (url.includes("/api/inventory/fish/sell")) return "\u5356\u9C7C";
    if (url.includes("/api/inventory/gear/sell")) return "\u5356\u88C5\u5907";
    if (url.includes("/api/baits/")) return "\u4E70\u9975";
    if (url.includes("/api/shop/purchases")) return "\u4E70Buff";
    if (url.includes("/api/player/stats/reset")) return "\u6D17\u70B9";
    if (url.includes("/api/chests/")) return "\u5F00\u5B9D\u7BB1";
    if (url.includes("/api/market/")) return "\u5E02\u573A";
    if (url.includes("/api/daily-check-in")) return "\u7B7E\u5230";
    if (url.includes("/api/quests")) return "\u4EFB\u52A1";
    if (url.includes("/api/tournaments/") || url.includes("/api/weekly-tournaments/")) return "\u6BD4\u8D5B";
    if (url.includes("/api/events/arcane-sacrifice")) return "\u5965\u79D8\u732E\u796D";
    if (url.includes("/api/sponsorship/")) return "CDK";
    if (url.includes("/api/rods/")) return "\u5347\u7EA7\u9C7C\u7AFF";
    if (url.includes("/api/guilds/me/donations") || url.includes("/api/party-boats/treasury/deposit")) return "\u516C\u4F1A\u6350\u732E";
    if (url.includes("/api/party-boats/")) return "\u8239";
    if (url.includes("/api/convenience/")) return "\u4FBF\u5229\u670D\u52A1";
    if (url.includes("/api/player/gold-penalty")) return "\u91D1\u5E01\u60E9\u7F5A";
    return "";
  }
  function recordLedger(url, d) {
    const gold = d.player?.gold ?? d.playerPatch?.gold ?? d.balances?.gold;
    const relic = d.player?.relics ?? d.playerPatch?.relics ?? d.balances?.relics;
    const frag = d.player?.fragments ?? d.playerPatch?.fragments ?? d.balances?.fragments;
    if (gold === void 0 && relic === void 0 && frag === void 0) return;
    const cat = classifyLedger(url, d.settlement?.mode) || "\u672A\u8BC6\u522B";
    const patch = {};
    const entries = [["gold", "playerGold", gold], ["relic", "playerRelics", relic], ["fragment", "playerFragments", frag]];
    for (const [cur, field, val] of entries) {
      if (val === void 0) continue;
      if (!state._ledgerSeen[cur]) {
        state._ledgerSeen[cur] = true;
        patch[field] = val;
        continue;
      }
      const delta = val - state[field];
      if (delta === 0) continue;
      const day = state._ledger[todayStr()] || (state._ledger[todayStr()] = { gold: {}, relic: {}, fragment: {} });
      const bucket = day[cur];
      bucket[cat] = (bucket[cat] || 0) + delta;
      patch[field] = val;
    }
    if (Object.keys(patch).length) {
      updateState(patch);
      saveLedger();
    }
  }
  function renderLedgerTab() {
    window.__ledgerData = () => {
      const today = todayStr();
      const day = state._ledger[today] || { gold: {}, relic: {}, fragment: {} };
      const snap = state._balanceSnapshot;
      const net = snap && snap.date === today ? { gold: state.playerGold - snap.gold, relic: state.playerRelics - snap.relic, fragment: state.playerFragments - snap.fragment } : null;
      return { today, day, net };
    };
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u4ECA\u65E5\u6536\u652F\u660E\u7EC6</title></head>
        <body style="margin:0;padding:20px;font-family:'Microsoft YaHei','PingFang SC',sans-serif;background:#fffefa;color:#20354d;">
            <h2 style="margin:0 0 4px;font-size:18px;">\u4ECA\u65E5\u6536\u652F\u660E\u7EC6</h2>
            <div id="date" style="font-size:12px;color:#71869b;margin-bottom:14px;">\u2014</div>
            <div id="content"></div>
            <div style="font-size:11px;color:#9aa7b5;margin-top:10px;line-height:1.7;">\u6B63\u6570=\u6536\u5165\u3001\u8D1F\u6570=\u652F\u51FA\u3002\u6BCF 3 \u79D2\u81EA\u52A8\u5237\u65B0\u3002<br>\u300C\u672A\u8BC6\u522B\u300D= \u51C0\u53D8\u5316 \u2212 \u5DF2\u8BC6\u522B\u4E4B\u548C\uFF0C\u542B\u811A\u672C\u672A\u8FD0\u884C\u671F\u95F4\u3001\u4EE5\u53CA\u6682\u672A\u5F52\u7C7B\u7684\u53D8\u5316\u3002</div>
        </body>
        <script>
        (function(){
            var CURS=[{key:'gold',label:'\u91D1\u5E01',color:'#f0bd61'},{key:'relic',label:'\u9057\u7269',color:'#a78bfa'},{key:'fragment',label:'\u788E\u7247',color:'#ec4899'}];
            function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
            function fmt(v){return (v>0?'+':'')+v.toLocaleString('zh-CN');}
            function signColor(v){return v>0?'#45a76f':v<0?'#e66b58':'#71869b';}
            function render(d){
                if(!d) return;
                document.getElementById('date').textContent=d.today;
                var html='';
                CURS.forEach(function(c){
                    var day=d.day[c.key]||{};
                    var cats=Object.keys(day).map(function(k){return [k,day[k]];}).sort(function(a,b){return b[1]-a[1];});
                    var inc=cats.filter(function(x){return x[1]>0;});
                    var exp=cats.filter(function(x){return x[1]<0;});
                    var sum=cats.reduce(function(s,x){return s+x[1];},0);
                    var unid=d.net?(d.net[c.key]-sum):null;
                    function item(x){return '<span style="margin-right:14px;white-space:nowrap;"><span style="font-weight:600;color:'+(x[1]>0?'#45a76f':'#e66b58')+';">'+fmt(x[1])+'</span> '+esc(x[0])+'</span>';}
                    function grp(t,arr){return arr.length?'<div style="margin:3px 0 3px 14px;font-size:13px;line-height:1.9;"><span style="color:#71869b;font-weight:600;margin-right:4px;">'+t+'</span>'+arr.map(item).join('')+'</div>':'';}
                    var uhtml=(unid!==null&&Math.abs(unid)>=1)?'<div style="margin:3px 0 3px 14px;font-size:13px;line-height:1.9;"><span style="color:#e6a23c;font-weight:600;margin-right:4px;">\u672A\u8BC6\u522B</span><span style="font-weight:600;color:#e6a23c;">'+fmt(unid)+'</span></div>':'';
                    var nhtml=d.net?'<span style="font-weight:700;color:'+signColor(d.net[c.key])+';">'+fmt(d.net[c.key])+'</span>':'<span style="color:#9aa7b5;">\u2014</span>';
                    html+='<section style="margin-bottom:16px;padding:12px 14px;border:1px solid #e4edf2;border-radius:8px;"><div style="font-size:15px;font-weight:700;color:'+c.color+';margin-bottom:2px;">'+c.label+'\u3000<span style="font-size:12px;color:#71869b;font-weight:400;">\u51C0\u53D8\u5316</span>\u3000'+nhtml+'</div>'+grp('\u6536\u5165',inc)+grp('\u652F\u51FA',exp)+uhtml+'</section>';
                });
                document.getElementById('content').innerHTML=html;
            }
            function poll(){
                try{ var d=window.opener&&window.opener.__ledgerData?window.opener.__ledgerData():null; if(d)render(d); }catch(e){}
            }
            poll();
            setInterval(poll,3000);
        })();
        <\/script>
        </html>`;
    try {
      const u = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(u, "_blank");
    } catch (_) {
    }
  }
  function onDocClickLedgerToggle(e) {
    if (window.__ledgerDebug && e.target.closest(".arc-ledger-toggle")) renderLedgerTab();
  }
  function weekKey(dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function aggregateBalance(records, granularity) {
    const day = (r) => ({ label: r.date, gold: r.gold, relic: r.relic, fragment: r.fragment });
    if (granularity === "all" || granularity === "day") return records.map(day);
    const today = todayStr();
    if (granularity === "week") {
      const wk = weekKey(today);
      return records.filter((r) => weekKey(r.date) === wk).map(day);
    }
    const m = today.slice(0, 7);
    return records.filter((r) => r.date.slice(0, 7) === m).map(day);
  }
  function closeBalanceLog() {
    state._balanceLogOpen = false;
    document.querySelector(".arc-balance-log-layer")?.remove();
  }
  function renderBalanceLog() {
    document.querySelector(".arc-balance-log-layer")?.remove();
    if (!state._balanceLogOpen) return;
    const sorted = aggregateBalance(state._balanceHistory, state._balanceFilter).sort((a, b) => a.label < b.label ? 1 : -1);
    const PAGE_SIZE = 50;
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const page = Math.min(Math.max(0, state._balancePage), totalPages - 1);
    state._balancePage = page;
    const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalGold = sorted.reduce((s, r) => s + r.gold, 0);
    const totalRelic = sorted.reduce((s, r) => s + r.relic, 0);
    const totalFragment = sorted.reduce((s, r) => s + r.fragment, 0);
    const headLabel = (r) => r.label;
    const cur = (label, color) => `<span style="color:${color};font-weight:600;">${label}</span>`;
    const items = pageItems.length ? pageItems.map((r) => `<article style="padding:9px 0;border-bottom:1px dashed var(--divider,#e4edf2);">
            <div style="font-size:12px;font-weight:600;color:var(--text,#20354d);margin-bottom:4px;">${headLabel(r)}</div>
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;"><span style="color:${signColor(r.gold)};">${fmtSigned(r.gold)} ${cur("\u91D1\u5E01", CURRENCY_COLORS.gold)}</span><span style="color:${signColor(r.relic)};">${fmtSigned(r.relic)} ${cur("\u9057\u7269", CURRENCY_COLORS.relic)}</span><span style="color:${signColor(r.fragment)};">${fmtSigned(r.fragment)} ${cur("\u788E\u7247", CURRENCY_COLORS.fragment)}</span></div>
        </article>`).join("") : '<div style="padding:24px 0;text-align:center;font-size:12px;color:var(--muted,#71869b);">\u6682\u65E0\u8BB0\u5F55</div>';
    const filterBtn = (val, label) => `<button data-bfilter="${val}" style="padding:4px 12px;border:1px solid ${state._balanceFilter === val ? "var(--tide,#52bac4)" : "var(--border,#d1dee7)"};border-radius:999px;background:${state._balanceFilter === val ? "color-mix(in srgb,var(--tide,#52bac4) 16%,transparent)" : "transparent"};color:${state._balanceFilter === val ? "var(--tide-deep,#2a8790)" : "var(--muted,#71869b)"};font-size:12px;font-weight:600;cursor:pointer;">${label}</button>`;
    const pagerBtn = (dir, label, disabled) => `<button data-bpage="${dir}" ${disabled ? "disabled" : ""} style="padding:3px 10px;border:1px solid var(--border,#d1dee7);border-radius:6px;background:transparent;color:${disabled ? "var(--muted,#71869b)" : "var(--text,#20354d)"};font-size:12px;cursor:${disabled ? "default" : "pointer"};opacity:${disabled ? "0.4" : "1"};">${label}</button>`;
    const layer = document.createElement("div");
    layer.className = "arc-balance-log-layer";
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);padding:16px;";
    layer.innerHTML = `<section style="width:min(460px,100%);max-height:70vh;display:flex;flex-direction:column;background:var(--surface,#fffefa);border:1px solid var(--border,#d1dee7);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,0.25);overflow:hidden;">
            <header style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                <div><h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text,#20354d);">\u6BCF\u65E5\u76C8\u4E8F</h2><div style="font-size:11px;color:var(--muted,#71869b);margin-top:2px;">${cur("\u91D1\u5E01", CURRENCY_COLORS.gold)} \xB7 ${cur("\u9057\u7269", CURRENCY_COLORS.relic)} \xB7 ${cur("\u788E\u7247", CURRENCY_COLORS.fragment)}</div></div>
                <button class="arc-balance-close" style="margin-left:auto;width:30px;height:30px;display:grid;place-items:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted,#71869b);font-size:16px;cursor:pointer;" title="\u5173\u95ED">\u2715</button>
            </header>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--divider,#e4edf2);">${filterBtn("all", "\u5168\u90E8")}${filterBtn("week", "\u5468")}${filterBtn("month", "\u6708")}</div>
            <div style="overflow-y:auto;padding:4px 18px 12px;font-family:inherit;">${items}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 18px;border-top:1px solid var(--divider,#e4edf2);flex-wrap:wrap;">
                <span style="font-size:12px;color:var(--muted,#71869b);">\u603B\u8BA1 <span style="color:${signColor(totalGold)};">${fmtSigned(totalGold)} ${cur("\u91D1\u5E01", CURRENCY_COLORS.gold)}</span> \xB7 <span style="color:${signColor(totalRelic)};">${fmtSigned(totalRelic)} ${cur("\u9057\u7269", CURRENCY_COLORS.relic)}</span> \xB7 <span style="color:${signColor(totalFragment)};">${fmtSigned(totalFragment)} ${cur("\u788E\u7247", CURRENCY_COLORS.fragment)}</span></span>
                ${sorted.length > PAGE_SIZE ? `<span style="display:inline-flex;align-items:center;gap:8px;">${pagerBtn("prev", "\u2039 \u4E0A\u4E00\u9875", page === 0)}<span style="font-size:12px;color:var(--muted,#71869b);">${page + 1} / ${totalPages}</span>${pagerBtn("next", "\u4E0B\u4E00\u9875 \u203A", page >= totalPages - 1)}</span>` : ""}
            </div>
        </section>`;
    layer.addEventListener("click", (e) => {
      if (e.target === layer || e.target.closest(".arc-balance-close")) {
        closeBalanceLog();
        return;
      }
      const fb = e.target.closest("[data-bfilter]");
      if (fb) {
        state._balanceFilter = fb.dataset.bfilter;
        state._balancePage = 0;
        renderBalanceLog();
        return;
      }
      const pb = e.target.closest("[data-bpage]");
      if (pb && !pb.disabled) {
        state._balancePage = pb.dataset.bpage === "prev" ? page - 1 : page + 1;
        renderBalanceLog();
      }
    });
    document.body.appendChild(layer);
  }
  function onDocClickBalanceToggle(e) {
    if (e.target.closest(".arc-balance-toggle")) {
      state._balanceLogOpen = true;
      state._balancePage = 0;
      renderBalanceLog();
    }
  }
  function formatDuration(sec) {
    if (!sec || sec <= 0) return "\u5DF2\u5230\u671F";
    if (sec < 60) return "\u4E0D\u8DB31\u5206";
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    if (d > 0) return `${d}\u5929${h}\u65F6${m}\u5206`;
    if (h > 0) return `${h}\u65F6${m}\u5206`;
    return `${m}\u5206`;
  }
  function computePityDisplay() {
    const p = state.pity;
    if (!p?.arcane || !p?.exotic) return null;
    const build = (key) => {
      const d = p[key];
      const cur = state._pityDryCasts[key];
      const hard = d.hardPityCasts ?? 0;
      const max = d.maxDryCasts ?? 0;
      const neverCaught = state._pityFishCaught[key] === 0;
      const pct = hard > 0 ? Math.min(100, cur / hard * 100).toFixed(1) : "--";
      const remainCasts = hard > 0 ? Math.max(0, hard - cur) : 0;
      const remainTime = hard > 0 ? formatDuration(remainCasts * (PITY_CYCLE_MS / 1e3)) : "--";
      const worstTime = neverCaught ? "\u4ECE\u6765\u6CA1\u89C1\u8FC7\u957F\u5565\u6837\uFF08\u7A7A\u519B\u4F6C\u7684\u75DB\uFF09" : max > 0 ? formatDuration(max * (PITY_CYCLE_MS / 1e3)) : "--";
      return { pct, remainCasts, remainTime, worstCasts: max, worstTime, neverCaught };
    };
    return { arcane: build("arcane"), exotic: build("exotic") };
  }
  var _pityCssInjected = false;
  function injectPityPanel() {
    if (!settings.showEnhancements || !settings.showPity) {
      document.querySelector(".pity-panel")?.remove();
      return;
    }
    const h2 = document.getElementById("batch-title");
    if (!h2 || !/自动钓鱼/.test(h2.textContent || "")) return;
    const heading = h2.closest(".panel-heading");
    if (!heading) return;
    const disp = computePityDisplay();
    let el = heading.parentElement.querySelector(".pity-panel");
    if (!el) {
      if (!_pityCssInjected) {
        _pityCssInjected = true;
        const st = document.createElement("style");
        st.id = "pity-panel-style";
        st.textContent = [
          ".pity-panel{display:grid;grid-template-columns:auto auto auto;gap:2px 14px;padding:8px 12px;border-bottom:1px solid var(--divider,#e4edf2);font-family:inherit;max-width:100%;overflow-x:auto;}",
          ".pity-panel .pity-t{font-size:11px;line-height:18px;color:var(--muted,#71869b);white-space:nowrap;}",
          ".pity-panel .pity-d{font-size:12px;line-height:18px;font-weight:600;white-space:nowrap;}",
          "@media (max-width:480px){.pity-panel{grid-template-columns:1fr;gap:1px 4px;}.pity-panel .pity-t{display:block;margin-top:4px;}.pity-panel .pity-d{white-space:normal;}}"
        ].join("");
        (document.head || document.documentElement).appendChild(st);
      }
      el = document.createElement("div");
      el.className = "pity-panel";
      heading.insertAdjacentElement("afterend", el);
    }
    const title = (t) => `<span class="pity-t">${t} \uFF1A</span>`;
    const data = (key, name, mode) => {
      const d = disp ? disp[key] : null;
      let text;
      if (!d) text = "--";
      else if (mode === "countdown") text = `${d.pct}%/${d.remainTime}/${d.remainCasts}\u7AFF`;
      else text = d.neverCaught ? d.worstTime : `${d.worstTime}/${d.worstCasts}\u7AFF`;
      const g = RARITY_GRADIENTS[key];
      return `<span class="pity-d" style="background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent">${name}\uFF1A${text}</span>`;
    };
    el.innerHTML = title("\u4FDD\u5E95(%/\u5012\u8BA1\u65F6/\u7AFF)") + data("exotic", "\u5947\u5F02", "countdown") + data("arcane", "\u5965\u79D8", "countdown") + title("\u5386\u53F2\u6700\u5012\u9709\u8BB0\u5F55") + data("exotic", "\u5947\u5F02", "worst") + data("arcane", "\u5965\u79D8", "worst") + '<span class="pity-catch-toggle" style="grid-column:1/-1;cursor:pointer;text-decoration:underline;font-size:12px;font-weight:600;color:var(--text,#20354d);">\u5386\u53F2\u8BB0\u5F55</span>';
  }
  var _pityCalibrationTimer = null;
  var _pityRenderTimer = null;
  function startPity() {
    stopPity();
    if (!settings.showEnhancements || !settings.showPity) return;
    fetchPity();
    _pityCalibrationTimer = setInterval(fetchPity, PITY_CALIBRATION_MS);
    _pityRenderTimer = setInterval(injectPityPanel, 2e3);
    document.addEventListener("click", onDocClickCatchToggle);
  }
  function stopPity() {
    if (_pityCalibrationTimer) {
      clearInterval(_pityCalibrationTimer);
      _pityCalibrationTimer = null;
    }
    if (_pityRenderTimer) {
      clearInterval(_pityRenderTimer);
      _pityRenderTimer = null;
    }
    document.querySelector(".pity-panel")?.remove();
    document.getElementById("pity-panel-style")?.remove();
    _pityCssInjected = false;
    closeCatchLog();
    document.removeEventListener("click", onDocClickCatchToggle);
  }
  onTeardown(stopPity);
  function injectCastStats() {
    if (!settings.showEnhancements || !settings.showTheoreticalCasts) {
      document.querySelector(".arc-cast-stats")?.remove();
      return;
    }
    const heading = document.querySelector(".harvest-panel-heading");
    if (!heading) return;
    const span = [...heading.children].find((c) => c.tagName === "SPAN");
    if (!span) return;
    const m = span.textContent.match(/今日\s*([\d,]+)\s*杆/);
    if (!m) return;
    const actualCasts = parseInt(m[1].replace(/[^\d]/g, ""), 10);
    if (actualCasts <= 0 || !state.nextHarvestResetAt) return;
    if (actualCasts !== state.dailyHarvestCasts) {
      updateState({ dailyHarvestCasts: actualCasts, dailyHarvestAt: Date.now() });
    }
    const cycleMs = state.appGame?.getSnapshot()?.fishing?.cycleDurationMs || 6e3;
    const todayStart = state.nextHarvestResetAt - 24 * 3600 * 1e3;
    const theoretical = Math.floor(Math.max(0, (state.dailyHarvestAt || Date.now()) - todayStart) / cycleMs);
    const lost = Math.max(0, theoretical - actualCasts);
    let el = heading.querySelector(".arc-cast-stats");
    if (!el) {
      el = document.createElement("span");
      el.className = "arc-cast-stats";
      span.insertAdjacentElement("afterend", el);
    }
    el.style.cssText = "display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-left:8px;font-size:12px;";
    el.innerHTML = [
      `<span style="color:#52bac4;font-weight:600;white-space:nowrap;">\u7406\u8BBA ${theoretical.toLocaleString("zh-CN")} \u7AFF</span>`,
      `<span style="color:var(--muted,#8b9ab0);">/</span>`,
      `<span style="color:${lost > 0 ? "#e6a23c" : "#45a76f"};font-weight:600;white-space:nowrap;">\u6389\u7AFF ${lost.toLocaleString("zh-CN")}</span>`
    ].join("");
  }
  var GEAR_PERCENT_ATTRS = /* @__PURE__ */ new Set(["\u529B\u91CF", "\u667A\u529B", "\u8FD0\u6C14", "\u8010\u529B"]);
  var _gearPercentObserver = null;
  var _gearPercentTimer = null;
  var _gearPercentRoots = /* @__PURE__ */ new Set();
  var _gearPercentClickHandler = null;
  function walkGearLabels(root) {
    const labels = [];
    if (!root) return labels;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest(".arc-gear-stat-percent")) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest(".stat-comparison")) return NodeFilter.FILTER_REJECT;
        return GEAR_PERCENT_ATTRS.has(node.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) labels.push(walker.currentNode.parentElement);
    return labels;
  }
  function gearContainerFor(label) {
    let node = label;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      const labels = walkGearLabels(node);
      const names = labels.map((el) => el.textContent.trim()).filter((x) => GEAR_PERCENT_ATTRS.has(x));
      if (names.length >= 2 && names.length <= 4 && new Set(names).size === names.length) return node;
    }
    return null;
  }
  function gearValueTarget(label, container) {
    const parseValue = (el) => {
      if (!el || el.closest(".arc-gear-stat-percent")) return null;
      const text = el.textContent.trim();
      if (!/^[+＋\-－]?\s*[\d,]+$/.test(text)) return null;
      const value = Number(text.replace(/[+＋\-－\s,]/g, ""));
      return Number.isFinite(value) ? { el, value } : null;
    };
    let row = label;
    for (let depth = 0; row && row !== container && depth < 4; depth++, row = row.parentElement) {
      const labels = walkGearLabels(row);
      if (labels.length === 1) {
        const rerolled = parseValue(row.querySelector(":scope > b"));
        if (rerolled) return rerolled;
        const adjacent = parseValue(label.nextElementSibling);
        if (adjacent) return adjacent;
        for (const el of row.children) {
          if (el === label || el.tagName === "SVG") continue;
          const parsed = parseValue(el);
          if (parsed) return parsed;
        }
      }
    }
    return null;
  }
  function gearPercentColor(percent) {
    const t = Math.min(1, Math.max(0, percent / 100));
    const mix = (from, to) => Math.round(from + (to - from) * t);
    return `rgb(${mix(176, 255)}, ${mix(176, 215)}, ${mix(176, 0)})`;
  }
  function renderGearContainer(container) {
    const rows = [];
    for (const label of walkGearLabels(container)) {
      const name = label.textContent.trim();
      const target = gearValueTarget(label, container);
      if (target && Number.isFinite(target.value)) rows.push({ name, ...target });
    }
    if (rows.length < 2 || new Set(rows.map((x) => x.name)).size !== rows.length) return;
    const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
    if (total <= 0) return;
    const signature = rows.map((row) => `${row.name}:${row.value}`).join("|");
    if (container.dataset.arcGearPercentSignature === signature) return;
    container.dataset.arcGearPercentSignature = signature;
    container.querySelectorAll(".arc-gear-stat-percent").forEach((el) => el.remove());
    for (const row of rows) {
      const percent = row.value / total * 100;
      const badge = document.createElement("span");
      badge.className = "arc-gear-stat-percent";
      badge.textContent = `${percent.toFixed(1)}%`;
      badge.style.color = gearPercentColor(percent);
      badge.title = `${row.name}\u5360\u672C\u4EF6\u88C5\u5907\u56DB\u7EF4\u5C5E\u6027\u603B\u548C\u7684\u6BD4\u4F8B`;
      row.el.insertAdjacentElement("afterend", badge);
    }
  }
  function scanGearPercent(root) {
    if (root?.matches?.(".stat-comparison")) {
      root.querySelectorAll(".arc-gear-stat-percent").forEach((el) => el.remove());
      delete root.dataset.arcGearPercentSignature;
      return;
    }
    root?.querySelectorAll?.(".stat-comparison .arc-gear-stat-percent").forEach((el) => el.remove());
    root?.querySelectorAll?.(".stat-comparison[data-arc-gear-percent-signature]").forEach((el) => delete el.dataset.arcGearPercentSignature);
    const containers = /* @__PURE__ */ new Set();
    for (const label of walkGearLabels(root)) {
      const container = gearContainerFor(label);
      if (container) containers.add(container);
    }
    containers.forEach(renderGearContainer);
  }
  function flushGearPercent() {
    _gearPercentTimer = null;
    const roots = [..._gearPercentRoots];
    _gearPercentRoots.clear();
    roots.forEach(scanGearPercent);
  }
  function queueGearPercent(root) {
    if (root?.nodeType === Node.TEXT_NODE) root = root.parentElement;
    if (root?.nodeType === Node.ELEMENT_NODE) {
      root = root.closest(".stat-comparison, .gear-slot-stats") || root;
    }
    if (root?.nodeType === Node.ELEMENT_NODE || root?.nodeType === Node.DOCUMENT_NODE) _gearPercentRoots.add(root);
    if (!_gearPercentTimer) _gearPercentTimer = setTimeout(flushGearPercent, 60);
  }
  function forceRefreshGearPercent(scope) {
    if (!_gearPercentObserver || !scope?.isConnected) return;
    scope.querySelectorAll("[data-arc-gear-percent-signature]").forEach((el) => delete el.dataset.arcGearPercentSignature);
    queueGearPercent(scope);
  }
  function startGearPercent() {
    if (_gearPercentObserver) return;
    let style = document.getElementById("arc-gear-percent-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "arc-gear-percent-style";
      style.textContent = ".arc-gear-stat-percent{display:inline-block;margin-left:5px;font-size:.82em;font-weight:700;white-space:nowrap;}";
      (document.head || document.documentElement).appendChild(style);
    }
    _gearPercentObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") queueGearPercent(mutation.target.parentElement);
        else for (const node of mutation.addedNodes) queueGearPercent(node);
      }
    });
    _gearPercentObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    _gearPercentClickHandler = (event) => {
      const button = event.target.closest("button");
      if (!button || !/重铸/.test(button.textContent || "")) return;
      const scope = button.closest(".gear-workshop, .gear-page") || document.body;
      for (const delay of [0, 180, 700, 1600]) {
        setTimeout(() => forceRefreshGearPercent(scope), delay);
      }
    };
    document.addEventListener("click", _gearPercentClickHandler, true);
    queueGearPercent(document.body);
  }
  function stopGearPercent() {
    _gearPercentObserver?.disconnect();
    _gearPercentObserver = null;
    if (_gearPercentClickHandler) document.removeEventListener("click", _gearPercentClickHandler, true);
    _gearPercentClickHandler = null;
    if (_gearPercentTimer) clearTimeout(_gearPercentTimer);
    _gearPercentTimer = null;
    _gearPercentRoots.clear();
    document.querySelectorAll(".arc-gear-stat-percent").forEach((el) => el.remove());
    document.querySelectorAll("[data-arc-gear-percent-signature]").forEach((el) => delete el.dataset.arcGearPercentSignature);
    document.getElementById("arc-gear-percent-style")?.remove();
  }
  onTeardown(stopGearPercent);

  // src/ui.js
  var _lastCollectTs = 0;
  async function postCollect(path, payload) {
    try {
      const r = await originalFetch(COLLECT_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok && d.ok === true, dup: d.dup === true, err: d.err || "" };
    } catch (e) {
      return { ok: false, dup: false, err: e.message };
    }
  }
  function collectBase() {
    return { uid: state.playerUid || "", name: state.playerName || "", version: SCRIPT_VERSION };
  }
  function compareVersion(a, b) {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }
  var VERSION_CACHE_KEY = "arcane_latest_version";
  async function checkVersion() {
    try {
      const cached = localStorage.getItem(VERSION_CACHE_KEY) || "";
      if (cached && compareVersion(cached, SCRIPT_VERSION) > 0) showUpdateBanner(cached);
      const r = await originalFetch(COLLECT_BASE + "/version", { method: "GET" });
      const d = await r.json().catch(() => ({}));
      if (d.version) {
        localStorage.setItem(VERSION_CACHE_KEY, d.version);
        if (compareVersion(d.version, SCRIPT_VERSION) > 0) showUpdateBanner(d.version);
      }
    } catch (e) {
    }
  }
  function showUpdateBanner(latest) {
    if (!state.shadowRoot) return;
    const b = state.shadowRoot.getElementById("update-banner");
    const uv = state.shadowRoot.getElementById("update-version");
    const cv = state.shadowRoot.getElementById("current-version");
    if (b) {
      b.style.display = "";
      b.style.cursor = "pointer";
      b.title = "\u70B9\u51FB\u6253\u5F00\u4E0B\u8F7D\u9875";
      if (!b.dataset.bound) {
        b.dataset.bound = "1";
        b.addEventListener("click", () => {
          try {
            window.open(DOWNLOAD_URL, "_blank");
          } catch (e) {
          }
        });
      }
    }
    if (uv) uv.textContent = "v" + latest;
    if (cv) cv.textContent = "v" + SCRIPT_VERSION;
  }
  var SEEN_VERSION_KEY = "arcane_seen_version";
  function getSeenVersion() {
    try {
      return localStorage.getItem(SEEN_VERSION_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function setSeenVersion(v) {
    try {
      localStorage.setItem(SEEN_VERSION_KEY, v);
    } catch (e) {
    }
  }
  function showUpdatePopup() {
    if (!state.shadowRoot) return;
    const p = state.shadowRoot.getElementById("update-popup");
    const t = state.shadowRoot.getElementById("update-popup-title");
    const b = state.shadowRoot.getElementById("update-popup-body");
    if (p) {
      if (t) t.textContent = "\u5965\u672F\u6478\u9C7C\u5927\u5E08 v" + SCRIPT_VERSION + " \u66F4\u65B0\u8BF4\u660E";
      if (b) b.textContent = UPDATE_NOTES || "\u672C\u6B21\u66F4\u65B0\u4E86\u82E5\u5E72\u529F\u80FD\u4E0E\u4FEE\u590D\u3002";
      p.style.display = "flex";
    }
  }
  function closeUpdatePopup() {
    if (!state.shadowRoot) return;
    const p = state.shadowRoot.getElementById("update-popup");
    if (p) p.style.display = "none";
  }
  function maybeShowUpdateLog() {
    if (getSeenVersion() === SCRIPT_VERSION) return;
    setSeenVersion(SCRIPT_VERSION);
    try {
      showUpdatePopup();
    } catch (e) {
    }
  }
  function collectCooldownReady() {
    const now = Date.now();
    if (now - _lastCollectTs < 3e3) return false;
    _lastCollectTs = now;
    return true;
  }
  function buildLogText(maxEntries) {
    return state.logBuffer.slice(-maxEntries).map((e) => `[${e.time}] [${e.tag || ""}]${e.action ? "[" + e.action + "]" : ""} ${e.msg}`).join("\n");
  }
  var USAGE_REPORT_KEY = "arcane_last_usage_report";
  function reportUsage(retry) {
    retry = retry || 0;
    if (!state.playerUid) {
      if (retry < 10) setTimeout(() => reportUsage(retry + 1), 3e3);
      return;
    }
    try {
      const now = Date.now();
      const last = parseInt(localStorage.getItem(USAGE_REPORT_KEY) || "0", 10);
      if (now - last < 24 * 60 * 60 * 1e3) return;
      localStorage.setItem(USAGE_REPORT_KEY, String(now));
    } catch (e) {
    }
    postCollect("/usage", collectBase()).catch(() => {
    });
  }
  function isSurveyFilled() {
    if (settings.surveySubmittedId === SURVEY_ID) return true;
    if (!settings.surveySubmittedId && settings.surveySubmittedAt > 0) {
      settings.surveySubmittedId = SURVEY_ID;
      saveSettings();
      return true;
    }
    return false;
  }
  async function submitSurvey(answers) {
    if (!state.playerUid) return { ok: false, err: "\u672A\u83B7\u53D6\u5230\u73A9\u5BB6\u8EAB\u4EFD\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5" };
    if (!collectCooldownReady()) return { ok: false, err: "\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u7A0D\u540E\u518D\u8BD5" };
    const res = await postCollect("/survey", { ...collectBase(), surveyId: SURVEY_ID, answers });
    if (res.ok || res.dup) {
      settings.surveySubmittedAt = Date.now();
      settings.surveySubmittedId = SURVEY_ID;
      saveSettings();
    }
    return res;
  }
  async function submitReport(desc) {
    if (!state.playerUid) return { ok: false, err: "\u672A\u83B7\u53D6\u5230\u73A9\u5BB6\u8EAB\u4EFD\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5" };
    if (!collectCooldownReady()) return { ok: false, err: "\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u7A0D\u540E\u518D\u8BD5" };
    if (Date.now() - settings.lastReportAt < REPORT_COOLDOWN_MS) return { ok: false, err: "\u62A5\u544A\u51B7\u5374\u4E2D\uFF0C10 \u5206\u949F\u540E\u518D\u8BD5" };
    const res = await postCollect("/report", {
      ...collectBase(),
      desc,
      settings: JSON.stringify(settings),
      logs: [{ name: "log.txt", content: buildLogText(2e3) }]
    });
    if (res.ok) {
      settings.lastReportAt = Date.now();
      saveSettings();
    }
    return res;
  }
  async function submitSuggestion(desc) {
    if (!state.playerUid) return { ok: false, err: "\u672A\u83B7\u53D6\u5230\u73A9\u5BB6\u8EAB\u4EFD\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5" };
    if (!collectCooldownReady()) return { ok: false, err: "\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u7A0D\u540E\u518D\u8BD5" };
    if (Date.now() - settings.lastSuggestionAt < REPORT_COOLDOWN_MS) return { ok: false, err: "10 \u5206\u949F\u5185\u5DF2\u63D0\u4EA4\u8FC7\u5EFA\u8BAE" };
    const res = await postCollect("/feedback", {
      ...collectBase(),
      desc
    });
    if (res.ok) {
      settings.lastSuggestionAt = Date.now();
      saveSettings();
    }
    return res;
  }
  function updateFeedbackBadge() {
    if (!state.shadowRoot) return;
    const b = state.shadowRoot.getElementById("feedback-badge");
    if (b) b.style.display = "none";
  }
  function renderFeedbackUI() {
    if (!state.shadowRoot) return;
    const ctr = state.shadowRoot.getElementById("view-feedback");
    if (!ctr) return;
    ctr.innerHTML = "";
    const btnStyle = "width:100%;margin:6px 0;padding:7px 10px;border:1px solid var(--as-tide);border-radius:3px;background:var(--as-control);color:var(--as-tide-deep);cursor:pointer;font-size:12px;font-weight:650;";
    const surveySec = document.createElement("div");
    surveySec.className = "section";
    surveySec.innerHTML = '<div class="section-heading"><strong>\u95EE\u5377\u8C03\u67E5</strong><span style="font-size:11px;color:var(--as-muted)">\u6BCF\u4EBA\u4EC5\u4E00\u6B21</span></div>';
    if (isSurveyFilled()) {
      const done = document.createElement("div");
      done.style.cssText = "font-size:12px;color:var(--as-reed,#45a76f);line-height:1.7;padding:4px 0;";
      done.textContent = "\u5DF2\u63D0\u4EA4\uFF0C\u611F\u8C22\u53CD\u9988\uFF01";
      surveySec.appendChild(done);
      ctr.appendChild(surveySec);
    } else {
      const inputs = {};
      const custom = {};
      const restWrap = document.createElement("div");
      restWrap.style.display = "none";
      const addQuestion = (q, parent) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin:8px 0;";
        const lbl = document.createElement("div");
        lbl.style.cssText = "font-size:12px;font-weight:650;margin-bottom:4px;";
        lbl.textContent = q.label;
        wrap.appendChild(lbl);
        if (q.type === "choice" || q.type === "multi") {
          const optWrap = document.createElement("div");
          optWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
          q.options.forEach((opt) => {
            const o = document.createElement("label");
            o.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;";
            const inp = document.createElement("input");
            inp.type = q.type === "multi" ? "checkbox" : "radio";
            inp.name = "q-" + q.id;
            inp.value = opt;
            inp.addEventListener("change", () => {
              if (q.type === "multi") {
                const arr = inputs[q.id] = (inputs[q.id] || []).filter((v) => v !== opt);
                if (inp.checked) arr.push(opt);
              } else {
                inputs[q.id] = opt;
                if (q.id === "needPush") {
                  restWrap.style.display = opt === "\u4E0D\u9700\u8981" ? "none" : "";
                  if (opt === "\u4E0D\u9700\u8981") {
                    for (const qq of SURVEY_QUESTIONS) if (qq.id !== "needPush") {
                      delete inputs[qq.id];
                      delete custom[qq.id];
                    }
                  }
                }
              }
            });
            o.appendChild(inp);
            o.appendChild(document.createTextNode(opt));
            optWrap.appendChild(o);
          });
          wrap.appendChild(optWrap);
          if (q.type === "multi") {
            const otherWrap = document.createElement("div");
            otherWrap.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:4px;";
            const otherLabel = document.createElement("span");
            otherLabel.textContent = "\u5176\u4ED6\uFF1A";
            otherLabel.style.cssText = "font-size:12px;color:var(--as-muted);";
            const otherInput = document.createElement("input");
            otherInput.type = "text";
            otherInput.placeholder = "\u81EA\u5B9A\u4E49\u5185\u5BB9\uFF08\u9009\u586B\uFF09";
            otherInput.style.cssText = "flex:1;min-width:0;height:22px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:0 4px;";
            otherInput.addEventListener("input", () => {
              custom[q.id] = otherInput.value.trim();
            });
            otherWrap.appendChild(otherLabel);
            otherWrap.appendChild(otherInput);
            wrap.appendChild(otherWrap);
          }
        } else {
          const ta = document.createElement("textarea");
          ta.rows = 2;
          ta.placeholder = q.placeholder || "";
          ta.style.cssText = "width:100%;resize:vertical;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:4px 6px;";
          ta.addEventListener("input", () => {
            inputs[q.id] = ta.value.trim();
          });
          wrap.appendChild(ta);
        }
        parent.appendChild(wrap);
      };
      for (const q of SURVEY_QUESTIONS) {
        addQuestion(q, q.id === "needPush" ? surveySec : restWrap);
      }
      surveySec.appendChild(restWrap);
      const surveyStatus = document.createElement("div");
      surveyStatus.style.cssText = "font-size:12px;line-height:1.6;margin-top:6px;min-height:16px;";
      const showSurveyStatus = (text, isError) => {
        surveyStatus.textContent = text;
        surveyStatus.style.color = isError ? "var(--as-coral,#e66b58)" : "var(--as-reed,#45a76f)";
      };
      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.textContent = "\u63D0\u4EA4\u95EE\u5377";
      submitBtn.style.cssText = btnStyle;
      let armed = false, armTimer = null;
      const disarm = () => {
        armed = false;
        submitBtn.textContent = "\u63D0\u4EA4\u95EE\u5377";
        submitBtn.style.background = "";
        submitBtn.style.color = "";
        if (armTimer) {
          clearTimeout(armTimer);
          armTimer = null;
        }
      };
      submitBtn.addEventListener("click", async () => {
        const merged = { ...inputs };
        for (const q of SURVEY_QUESTIONS) {
          if (q.type === "multi" && custom[q.id]) merged[q.id] = (merged[q.id] || []).concat(custom[q.id]);
        }
        if (!armed) {
          if (!merged.needPush) {
            showSurveyStatus("\u8BF7\u5148\u9009\u62E9\u662F\u5426\u9700\u8981\u63A8\u9001", true);
            return;
          }
          if (merged.needPush !== "\u4E0D\u9700\u8981") {
            for (const q of SURVEY_QUESTIONS) {
              if (q.id === "needPush") continue;
              if ((q.type === "choice" || q.type === "multi") && !(merged[q.id] && merged[q.id].length)) {
                showSurveyStatus("\u8BF7\u5148\u5B8C\u6210\u6240\u6709\u9009\u9879", true);
                return;
              }
            }
          }
          armed = true;
          submitBtn.textContent = "\u786E\u8BA4\u63D0\u4EA4\uFF1F";
          submitBtn.style.background = "var(--as-tide)";
          submitBtn.style.color = "#fff";
          armTimer = setTimeout(disarm, 5e3);
          return;
        }
        disarm();
        submitBtn.disabled = true;
        submitBtn.textContent = "\u63D0\u4EA4\u4E2D\u2026";
        const res = await submitSurvey(merged);
        if (res.ok || res.dup) {
          renderFeedbackUI();
          OpLog.info("\u53CD\u9988", "\u95EE\u5377\u5DF2\u63D0\u4EA4\uFF0C\u611F\u8C22\u53CD\u9988");
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = "\u63D0\u4EA4\u95EE\u5377";
          showSurveyStatus("\u63D0\u4EA4\u5931\u8D25\uFF1A" + (res.err || "\u672A\u77E5\u9519\u8BEF"), true);
          OpLog.warn("\u53CD\u9988", "\u95EE\u5377\u63D0\u4EA4\u5931\u8D25\uFF1A" + (res.err || "\u672A\u77E5\u9519\u8BEF"));
        }
      });
      surveySec.appendChild(submitBtn);
      surveySec.appendChild(surveyStatus);
      ctr.appendChild(surveySec);
    }
    surveySec.remove();
    const addFeedbackModule = (title, subtitle, placeholder, onSubmit) => {
      const sec = document.createElement("div");
      sec.className = "section";
      sec.innerHTML = `<div class="section-heading"><strong>${title}</strong><span style="font-size:11px;color:var(--as-muted)">${subtitle}</span></div>`;
      const ta = document.createElement("textarea");
      ta.rows = 4;
      ta.placeholder = placeholder;
      ta.style.cssText = "width:100%;resize:vertical;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:4px 6px;margin-top:6px;";
      sec.appendChild(ta);
      const status = document.createElement("div");
      status.style.cssText = "font-size:12px;line-height:1.6;margin-top:6px;min-height:16px;";
      const show = (t, err) => {
        status.textContent = t;
        status.style.color = err ? "var(--as-coral,#e66b58)" : "var(--as-reed,#45a76f)";
      };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "\u53D1\u9001";
      btn.style.cssText = btnStyle;
      let armed = false, timer = null;
      const disarm = () => {
        armed = false;
        btn.textContent = "\u53D1\u9001";
        btn.style.background = "";
        btn.style.color = "";
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
      btn.addEventListener("click", async () => {
        const text = ta.value.trim();
        if (!text) {
          show("\u8BF7\u5148\u586B\u5199\u5185\u5BB9", true);
          return;
        }
        if (!armed) {
          armed = true;
          btn.textContent = "\u786E\u8BA4\u53D1\u9001\uFF1F";
          btn.style.background = "var(--as-tide)";
          btn.style.color = "#fff";
          timer = setTimeout(disarm, 5e3);
          return;
        }
        disarm();
        btn.disabled = true;
        btn.textContent = "\u53D1\u9001\u4E2D\u2026";
        const res = await onSubmit(text);
        if (res.ok) {
          ta.value = "";
          show("\u5DF2\u53D1\u9001\uFF0C\u611F\u8C22\u53CD\u9988", false);
        } else {
          show("\u53D1\u9001\u5931\u8D25\uFF1A" + (res.err || "\u672A\u77E5\u9519\u8BEF"), true);
        }
        btn.disabled = false;
        btn.textContent = "\u53D1\u9001";
      });
      sec.appendChild(btn);
      sec.appendChild(status);
      return sec;
    };
    ctr.appendChild(addFeedbackModule("bug\u53CD\u9988", "\u81EA\u52A8\u9644\u5E26\u65E5\u5FD7\u548C\u9762\u677F\u8BBE\u7F6E", "\u63CF\u8FF0\u4F60\u9047\u5230\u7684\u95EE\u9898\uFF08\u5FC5\u586B\uFF09\u2026", submitReport));
    ctr.appendChild(addFeedbackModule("\u610F\u89C1\u5EFA\u8BAE", "\u8BF4\u8BF4\u4F60\u7684\u60F3\u6CD5", "\u4F60\u7684\u5EFA\u8BAE\u6216\u9700\u6C42\uFF08\u5FC5\u586B\uFF09\u2026", submitSuggestion));
    updateFeedbackBadge();
  }
  function _sellSwitchRow(label, checked, onChange, hint) {
    const row = document.createElement("label");
    row.className = "switch-item";
    const span = document.createElement("span");
    span.textContent = label;
    if (hint) span.appendChild(makeHint(hint));
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.addEventListener("change", () => onChange(cb.checked));
    row.appendChild(span);
    row.appendChild(cb);
    return row;
  }
  function _sellNumRow(label, min, max, value, onChange, hint) {
    const row = document.createElement("label");
    row.className = "switch-item";
    const span = document.createElement("span");
    span.textContent = label;
    if (hint) span.appendChild(makeHint(hint));
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = value;
    input.style.cssText = "width:60px;height:22px;margin-left:8px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;";
    input.addEventListener("change", () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) v = min;
      v = Math.min(Math.max(v, min), max);
      input.value = v;
      onChange(v);
    });
    row.appendChild(span);
    row.appendChild(input);
    return row;
  }
  function _sellBtn(text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.style.cssText = "width:calc(100% - 24px);margin:6px 12px;padding:6px 10px;border:1px solid var(--as-tide);border-radius:3px;background:var(--as-control);color:var(--as-tide-deep);cursor:pointer;font-size:12px;font-weight:650;";
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = "\u5904\u7406\u4E2D\u2026";
      let result;
      try {
        result = await onClick();
      } catch (e) {
        result = "\u5931\u8D25: " + (e?.message || e);
      }
      const isError = /失败|出错|异常/.test(result || "");
      const isDone = /^✅/.test(result || "");
      btn.style.color = isError ? "#e66b58" : isDone ? "#45a76f" : "var(--as-tide-deep)";
      btn.textContent = result || "\u5B8C\u6210";
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = text;
        btn.style.color = "var(--as-tide-deep)";
      }, 2500);
    });
    return btn;
  }
  function renderSellFishSection() {
    const ctr = state.shadowRoot.getElementById("sellfish-body");
    if (!ctr) return;
    ctr.innerHTML = "";
    const master = _sellSwitchRow("\u542F\u7528\u81EA\u52A8\u5356\u9C7C", settings.sellFishEnabled, (v) => {
      settings.sellFishEnabled = v;
      saveSettings();
      v ? startSellFish() : stopSellFish();
    }, HINTS.sellFish);
    master.classList.add("master-switch");
    ctr.appendChild(master);
    for (const rarity of FISH_SELL_RARITIES) {
      const meta = RARITY_META[rarity] || { label: rarity, color: "#888" };
      const row = document.createElement("label");
      row.className = "switch-item";
      const left = document.createElement("span");
      left.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      const dot = document.createElement("span");
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${meta.color};`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = settings.sellFishRarities.includes(rarity);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!settings.sellFishRarities.includes(rarity)) settings.sellFishRarities.push(rarity);
        } else settings.sellFishRarities = settings.sellFishRarities.filter((r) => r !== rarity);
        saveSettings();
      });
      left.appendChild(dot);
      left.appendChild(document.createTextNode(meta.label));
      left.appendChild(cb);
      row.appendChild(left);
      ctr.appendChild(row);
    }
    ctr.appendChild(_sellNumRow("\u5B9A\u65F6(\u5206\u949F)", 3, 1440, settings.sellFishIntervalMin, (v) => {
      settings.sellFishIntervalMin = v;
      saveSettings();
      if (settings.sellFishEnabled) startSellFish();
    }));
    ctr.appendChild(_sellBtn("\u7ACB\u5373\u5356\u9C7C", () => checkAndSellFish(true)));
  }
  function renderSellGearSection() {
    const ctr = state.shadowRoot.getElementById("sellgear-body");
    if (!ctr) return;
    ctr.innerHTML = "";
    const master = _sellSwitchRow("\u542F\u7528\u81EA\u52A8\u5356\u88C5\u5907", settings.sellGearEnabled, (v) => {
      settings.sellGearEnabled = v;
      saveSettings();
      v ? startSellGear() : stopSellGear();
    }, HINTS.sellGear);
    master.classList.add("master-switch");
    ctr.appendChild(master);
    for (const rarity of GEAR_SELL_RARITIES) {
      const meta = RARITY_META[rarity] || { label: rarity, color: "#888" };
      const row = document.createElement("label");
      row.className = "switch-item";
      const left = document.createElement("span");
      left.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
      const dot = document.createElement("span");
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${meta.color};`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = settings.sellGearRarities.includes(rarity);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!settings.sellGearRarities.includes(rarity)) settings.sellGearRarities.push(rarity);
        } else settings.sellGearRarities = settings.sellGearRarities.filter((r) => r !== rarity);
        saveSettings();
      });
      left.appendChild(dot);
      left.appendChild(document.createTextNode(meta.label));
      left.appendChild(cb);
      const qInput = document.createElement("input");
      qInput.type = "number";
      qInput.min = 0;
      qInput.max = 100;
      qInput.value = settings.sellGearQualities?.[rarity] ?? 60;
      qInput.title = "\u54C1\u8D28\u2264\u6B64\u503C\u624D\u5356\uFF080~100\uFF09";
      qInput.style.cssText = "width:48px;height:20px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;";
      qInput.addEventListener("change", () => {
        let v = parseInt(qInput.value, 10);
        if (isNaN(v)) v = 60;
        v = Math.min(Math.max(v, 0), 100);
        qInput.value = v;
        if (!settings.sellGearQualities) settings.sellGearQualities = {};
        settings.sellGearQualities[rarity] = v;
        saveSettings();
      });
      row.appendChild(left);
      row.appendChild(qInput);
      ctr.appendChild(row);
    }
    ctr.appendChild(_sellNumRow("\u5B9A\u65F6(\u5206\u949F)", 3, 1440, settings.sellGearIntervalMin, (v) => {
      settings.sellGearIntervalMin = v;
      saveSettings();
      if (settings.sellGearEnabled) startSellGear();
    }));
    ctr.appendChild(_sellBtn("\u7ACB\u5373\u5356\u88C5\u5907", () => checkAndSellGear(true)));
  }
  function renderSellUI() {
    if (!state.shadowRoot) return;
    renderSellFishSection();
    renderSellGearSection();
  }
  function renderWorldBossSection() {
    if (!state.shadowRoot) return;
    const ctr = state.shadowRoot.getElementById("worldboss-body");
    if (!ctr) return;
    ctr.innerHTML = "";
    ctr.appendChild(_sellSwitchRow("\u81EA\u52A8\u62A5\u540D\u5F31\u70B9\u5C5E\u6027", settings.autoWorldBossRegister, (v) => {
      settings.autoWorldBossRegister = v;
      saveSettings();
    }, "\u62A5\u540D\u7A97\u53E3\u5F00\u542F\u540E\uFF0C\u968F\u673A 0~10 \u5206\u949F\u5185\u81EA\u52A8\u9009\u672C\u573A Boss \u7684\u5F31\u70B9\u5C5E\u6027\u62A5\u540D\uFF08\u4E0D\u62A5\u540D\u62FF\u4E0D\u5230\u7ED3\u7B97\u5956\u52B1\uFF09\u3002\u968F\u673A\u5206\u6563\u907F\u514D\u6240\u6709\u4EBA\u540C\u65F6\u6253\u7206\u670D\u52A1\u5668\uFF0C\u6240\u4EE5\u5F00\u542F\u540E\u53EF\u80FD\u8FC7\u51E0\u5206\u949F\u624D\u62A5\u540D\uFF0C\u5C5E\u6B63\u5E38\u73B0\u8C61"));
  }
  function switchView(mode) {
    if (!state.shadowRoot) return;
    if (mode !== "settings" && mode !== "feedback" && mode !== "log") mode = "settings";
    settings.viewMode = mode;
    saveSettings();
    const titles = { settings: "\u5965\u672F\u6478\u9C7C\u5927\u5E08", feedback: "\u53CD\u9988", log: "\u8FD0\u884C\u65E5\u5FD7" };
    for (const [m, id] of Object.entries({ settings: "view-settings", feedback: "view-feedback", log: "view-log" })) {
      const el = state.shadowRoot.getElementById(id);
      if (el) el.style.display = m === mode ? "" : "none";
    }
    const title = state.shadowRoot.getElementById("panel-title");
    if (title) title.textContent = titles[mode] || "\u5965\u672F\u6478\u9C7C\u5927\u5E08";
    state.shadowRoot.querySelectorAll(".tab-bar .tab-btn").forEach((b) => {
      b.dataset.active = String(b.dataset.view === mode);
    });
    if (mode === "log") renderLogView();
    if (mode === "feedback") {
      const fb = state.shadowRoot.getElementById("view-feedback");
      if (fb && !fb.firstElementChild) renderFeedbackUI();
    }
  }
  function switchSettingsCategory(category) {
    if (!state.shadowRoot) return;
    const allowed = /* @__PURE__ */ new Set(["daily", "events", "assets", "other", "about"]);
    if (!allowed.has(category)) category = "daily";
    settings.settingsCategory = category;
    saveSettings();
    state.shadowRoot.querySelectorAll("[data-settings-category]").forEach((section) => {
      section.style.display = section.dataset.settingsCategory === category ? "" : "none";
    });
    state.shadowRoot.querySelectorAll(".settings-category-btn").forEach((btn) => {
      btn.dataset.active = String(btn.dataset.category === category);
    });
  }
  function renderLogView() {
    if (!state.shadowRoot) return;
    if (settings.viewMode !== "log") return;
    const container = state.shadowRoot.getElementById("log-entries");
    const hint = state.shadowRoot.getElementById("log-size-hint");
    if (!container) return;
    rebuildLogTagFilter();
    rebuildLogActionFilter();
    const bytes = state.logBufferBytes;
    const buf = state.logBuffer;
    const filter = state.logTagFilter;
    const actionFilter = state.logActionFilter;
    const filtered = getFilteredLogEntries();
    const slice = filtered.length > 1e3 ? filtered.slice(-1e3) : filtered;
    container.innerHTML = slice.map((e) => {
      const levelColor = e.level === "error" ? "#dc2626" : e.level === "warn" ? "#d97706" : null;
      const c = levelColor || e.color || "var(--as-text)";
      const secondaryHtml = e.hasSecondary && e.action ? `[${escHtml(e.action)}]` : "";
      const tagHtml = e.tag ? `<span class="log-tag" style="color:${e.color || "var(--as-text)"};font-weight:700">[${e.tag}]${secondaryHtml}</span> ` : "";
      return `<div class="log-line" data-level="${e.level}"><span class="log-time" style="color:${c}">${e.time}</span>${tagHtml}<span class="log-msg" style="color:${c}">${escHtml(e.msg)}</span></div>`;
    }).join("");
    if (!state.logPaused) requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    if (hint) hint.textContent = (filter || actionFilter ? filtered.length + "/" + buf.length : buf.length) + "\u6761 \xB7 " + formatBytes(bytes);
  }
  bus.on("log:updated", renderLogView);
  function getFilteredLogEntries() {
    return state.logBuffer.filter((e) => (!state.logTagFilter || e.tag === state.logTagFilter) && (!state.logActionFilter || e.action === state.logActionFilter));
  }
  function formatLogEntries(entries) {
    return entries.map((e) => `[${e.time}] [${e.tag || ""}]${e.hasSecondary && e.action ? "[" + e.action + "]" : ""} ${e.msg}`).join("\n");
  }
  function rebuildLogTagFilter() {
    if (!state.shadowRoot) return;
    const sel = state.shadowRoot.getElementById("log-tag-filter");
    if (!sel) return;
    const tags = /* @__PURE__ */ new Set();
    for (const e of state.logBuffer) if (e.tag) tags.add(e.tag);
    const sorted = [...tags].sort();
    if (state.logTagFilter && !tags.has(state.logTagFilter)) state.logTagFilter = "";
    sel.innerHTML = '<option value="">\u5168\u90E8</option>' + sorted.map((t) => `<option value="${escHtml(t)}"${t === state.logTagFilter ? " selected" : ""}>${escHtml(t)}</option>`).join("");
  }
  function rebuildLogActionFilter() {
    if (!state.shadowRoot) return;
    const sel = state.shadowRoot.getElementById("log-action-filter");
    if (!sel) return;
    const actions = /* @__PURE__ */ new Set();
    for (const e of state.logBuffer) if (state.logTagFilter && e.tag === state.logTagFilter && e.hasSecondary && e.action) actions.add(e.action);
    const sorted = [...actions].sort();
    const hasActions = sorted.length > 0;
    if (!hasActions || state.logActionFilter && !actions.has(state.logActionFilter)) state.logActionFilter = "";
    sel.hidden = !hasActions;
    sel.innerHTML = '<option value="">\u5168\u90E8\u52A8\u4F5C</option>' + sorted.map((t) => `<option value="${escHtml(t)}"${t === state.logActionFilter ? " selected" : ""}>${escHtml(t)}</option>`).join("");
  }
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function formatBytes(b) {
    return b < 1024 ? b + "B" : b < 1048576 ? (b / 1024).toFixed(1) + "KB" : (b / 1048576).toFixed(1) + "MB";
  }
  function updatePanelInfo(snapshot) {
    if (!state.shadowRoot) return;
    const hl = state.shadowRoot.getElementById("headline"), sb = state.shadowRoot.getElementById("snap-biome"), ss = state.shadowRoot.getElementById("snap-score");
    if (!snapshot) {
      if (hl) hl.textContent = "\u7B49\u5F85\u6E38\u620F\u767B\u5F55";
      if (sb) sb.textContent = "--";
      if (ss) ss.textContent = "--";
      return;
    }
    const cur = snapshot.biomes.find((b) => b.isCurrent);
    if (hl) {
      const partyTag = snapshot.party?.isInParty ? " \u{1F6A2}" : "";
      hl.textContent = cur ? `${cur.name}${partyTag}` : "--";
    }
    if (sb) sb.textContent = cur?.name || "--";
    if (ss) {
      const best = [...snapshot.biomes].sort((a, b) => calculateTotalExpBonus(b) - calculateTotalExpBonus(a))[0];
      ss.textContent = best ? formatBasisPoints(calculateTotalExpBonus(best)) : "--";
    }
  }
  function renderPriorities() {
    if (!state.shadowRoot) return;
    const list = state.shadowRoot.getElementById("priority-list");
    if (!list) return;
    list.innerHTML = "";
    const partyMode = settings.autoPartyTravel;
    const order = partyMode ? settings.partyMapPriority || DEFAULTS.partyMapPriority : settings.mapPriority || DEFAULTS.mapPriority;
    const autoG = state.shadowRoot.getElementById("sw-autoGuild"), autoP = state.shadowRoot.getElementById("sw-autoPersonal");
    const compOk = settings.autoCompetition && ((autoG?.checked ?? settings.autoGuild) || (autoP?.checked ?? settings.autoPersonal));
    const disp = order.filter((k) => k !== "competition" || compOk);
    if (!compOk && order.includes("competition")) disp.push("competition");
    disp.forEach((key, i) => {
      const def = PRIORITY_TYPES.find((t) => t.key === key);
      if (!def) return;
      const disabled = key === "competition" && !compOk;
      const item = document.createElement("li");
      item.className = "priority-item";
      item.dataset.key = key;
      if (disabled) item.style.opacity = "0.4";
      if (key === "designated") {
        const sel = document.createElement("select");
        sel.className = "priority-name";
        sel.style.cssText = "border:none;background:transparent;color:var(--as-text);font:inherit;font-size:13px;font-weight:650;padding:0 8px;cursor:pointer;";
        const optNone = document.createElement("option");
        optNone.value = "";
        optNone.textContent = "\u6307\u5B9A\u56FE\uFF1A\u65E0";
        const curDesignated = partyMode ? settings.partyDesignatedBiomeId : settings.designatedBiomeId;
        optNone.selected = !curDesignated;
        sel.appendChild(optNone);
        const game = state.appGame || window.arcaneReelax;
        if (game) {
          const snap = game.getSnapshot();
          (snap?.biomes || []).filter((b) => b.isUnlocked).forEach((b) => {
            const o = document.createElement("option");
            o.value = b.id;
            o.textContent = `\u6307\u5B9A\u56FE\uFF1A${b.name}`;
            if (b.id === curDesignated) o.selected = true;
            sel.appendChild(o);
          });
        }
        sel.addEventListener("change", () => {
          if (partyMode) settings.partyDesignatedBiomeId = sel.value;
          else settings.designatedBiomeId = sel.value;
          saveSettings();
          if (state.appGame) makeDecision(state.appGame);
        });
        item.innerHTML = `<span class="priority-index">${i + 1}</span>`;
        item.appendChild(sel);
      } else {
        item.innerHTML = `<span class="priority-index">${i + 1}</span><span class="priority-name">${def.label}</span>`;
        if (def.desc) item.querySelector(".priority-name").appendChild(makeHint(def.desc));
        if (key === "competition" && !disabled) {
          const sub = document.createElement("span");
          sub.style.cssText = "display:block;font-size:11px;color:var(--as-muted);margin-top:2px;white-space:nowrap";
          const cb1 = document.createElement("input");
          cb1.type = "checkbox";
          cb1.checked = !!settings.skipWitherTidePersonal;
          cb1.style.cssText = "width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)";
          const uncheckOthers = (except) => {
            if (except !== 1) {
              settings.skipWitherTidePersonal = false;
              cb1.checked = false;
            }
            if (except !== 2) {
              settings.witherTideDipPersonal = false;
              cb2.checked = false;
            }
            if (except !== 3) {
              settings.dipPersonal = false;
              cb3.checked = false;
            }
            if (except !== 4) {
              settings.partyDipPersonal = false;
              cb4.checked = false;
            }
          };
          cb1.addEventListener("change", () => {
            settings.skipWitherTidePersonal = cb1.checked;
            if (cb1.checked) uncheckOthers(1);
            saveSettings();
            if (state.appGame) makeDecision(state.appGame);
          });
          const h1 = makeHint("\u4E2A\u4EBA\u8D5B\u5730\u56FE\u662F\u67AF\u6F6E\u65F6\uFF0C\u5F3A\u5236\u8DF3\u8FC7\u672C\u6B21\u6BD4\u8D5B\uFF0C\u6309\u4F18\u5148\u7EA7\u53BB\u5176\u4ED6\u5730\u56FE\u3002\n\u5929\u6C14\u6062\u590D\u540E\u81EA\u52A8\u8FD4\u56DE\u3002\u8239\u961F\u6A21\u5F0F\u4E0B\u4E0D\u6539\u53D8\u822A\u7EBF\uFF0C\u4EC5\u4E2A\u4EBA\u79BB\u8239\u3002");
          sub.appendChild(cb1);
          sub.appendChild(document.createTextNode("\u67AF\u6F6E\u8DF3\u8FC7"));
          sub.appendChild(h1);
          sub.appendChild(document.createElement("br"));
          const cb2 = document.createElement("input");
          cb2.type = "checkbox";
          cb2.checked = !!settings.witherTideDipPersonal;
          cb2.style.cssText = "width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)";
          cb2.addEventListener("change", () => {
            settings.witherTideDipPersonal = cb2.checked;
            if (cb2.checked) uncheckOthers(2);
            saveSettings();
            if (state.appGame) makeDecision(state.appGame);
          });
          const h2 = makeHint("\u4E2A\u4EBA\u8D5B\u67AF\u6F6E\u65F6\uFF0C\u5148\u8FDB\u573A\u6BD4\u8D5B\uFF0C\u83B7\u5F97\u53C2\u4E0E\u79EF\u5206\u540E\u8DF3\u8FC7\u6309\u4F18\u5148\u7EA7\u53BB\u5176\u4ED6\u56FE\u3002\n\u672C\u6B21\u6BD4\u8D5B\u7ED3\u675F\u524D\u4E0D\u518D\u8FD4\u56DE\u3002\u8239\u961F\u6A21\u5F0F\u4E0B\u4EC5\u4E2A\u4EBA\u79BB\u8239\u3002");
          sub.appendChild(cb2);
          sub.appendChild(document.createTextNode("\u67AF\u6F6E\u8E6D\u5956"));
          sub.appendChild(h2);
          sub.appendChild(document.createElement("br"));
          const cb3 = document.createElement("input");
          cb3.type = "checkbox";
          cb3.checked = !!settings.dipPersonal;
          cb3.style.cssText = "width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)";
          cb3.addEventListener("change", () => {
            settings.dipPersonal = cb3.checked;
            if (cb3.checked) uncheckOthers(3);
            saveSettings();
            if (state.appGame) makeDecision(state.appGame);
          });
          const h3 = makeHint("\u4E2A\u4EBA\u8D5B\u8FDB\u573A\u6BD4\u8D5B\uFF0C\u83B7\u5F97\u53C2\u4E0E\u79EF\u5206\u540E\u8DF3\u8FC7\u6309\u4F18\u5148\u7EA7\u53BB\u5176\u4ED6\u56FE\u3002\n\u672C\u6B21\u6BD4\u8D5B\u7ED3\u675F\u524D\u4E0D\u518D\u8FD4\u56DE\u3002\u8239\u961F\u6A21\u5F0F\u4E0B\u4EC5\u4E2A\u4EBA\u79BB\u8239\u3002");
          sub.appendChild(cb3);
          sub.appendChild(document.createTextNode("\u4E2A\u4EBA\u8D5B\u8E6D\u5956"));
          sub.appendChild(h3);
          sub.appendChild(document.createElement("br"));
          const cb4 = document.createElement("input");
          cb4.type = "checkbox";
          cb4.checked = !!settings.partyDipPersonal;
          cb4.style.cssText = "width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)";
          cb4.addEventListener("change", () => {
            settings.partyDipPersonal = cb4.checked;
            if (cb4.checked) uncheckOthers(4);
            else {
              state._partyBlockedSeq = "";
              state._partyDipSeq = "";
              state._partyDipStartAt = 0;
            }
            saveSettings();
            if (state.appGame) makeDecision(state.appGame);
          });
          const h4 = makeHint("\u26A0\uFE0F \u6D4B\u8BD5\u529F\u80FD\u3002\u6574\u8239\u5728\u4E2A\u4EBA\u8D5B\u5730\u56FE\u505C\u7559\u6307\u5B9A\u65F6\u95F4\u53D6\u5F97\u53C2\u4E0E\u5956\u52B1\uFF0C\u968F\u540E\u5FFD\u7565\u672C\u573A\u6BD4\u8D5B\u5E76\u6309\u5730\u56FE\u4F18\u5148\u7EA7\u7EE7\u7EED\u822A\u884C\u3002\u82E5\u5176\u4ED6\u4F18\u5148\u7EA7\u4ECD\u9009\u4E2D\u5F53\u524D\u5730\u56FE\uFF0C\u8239\u961F\u4F1A\u7EE7\u7EED\u505C\u7559\u3002\u5F00\u542F\u6BD4\u8D5B\u5168\u52A0\u5E78\u8FD0\u65F6\uFF0C\u79BB\u573A\u540E\u6062\u590D\u5E38\u9A7B\u5C5E\u6027\u65B9\u6848\u3002");
          h4.style.background = "#ef4444";
          sub.appendChild(cb4);
          sub.appendChild(document.createTextNode("\u8239\u961F\u8E6D\u5956"));
          sub.appendChild(h4);
          const dur = document.createElement("span");
          dur.style.cssText = "display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle";
          const btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.textContent = "\u2212";
          btnMinus.style.cssText = "width:18px;height:18px;line-height:1;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;font-size:12px;padding:0";
          const durInput = document.createElement("input");
          durInput.type = "number";
          durInput.min = "1";
          durInput.max = "20";
          durInput.value = settings.partyDipMinutes;
          durInput.style.cssText = "width:36px;height:18px;margin:0 2px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;padding:0";
          const btnPlus = document.createElement("button");
          btnPlus.type = "button";
          btnPlus.textContent = "+";
          btnPlus.style.cssText = "width:18px;height:18px;line-height:1;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;font-size:12px;padding:0";
          const setDur = (v) => {
            v = Math.max(1, Math.min(20, v | 0));
            settings.partyDipMinutes = v;
            durInput.value = v;
            saveSettings();
          };
          btnMinus.addEventListener("click", () => setDur(settings.partyDipMinutes - 1));
          btnPlus.addEventListener("click", () => setDur(settings.partyDipMinutes + 1));
          durInput.addEventListener("change", () => setDur(parseInt(durInput.value) || 10));
          dur.appendChild(btnMinus);
          dur.appendChild(durInput);
          dur.appendChild(btnPlus);
          dur.appendChild(document.createTextNode(" \u5206"));
          sub.appendChild(dur);
          item.querySelector(".priority-name").appendChild(sub);
        }
      }
      const handle = document.createElement("button");
      handle.className = "drag-handle";
      handle.type = "button";
      handle.textContent = "\u283F";
      if (disabled) handle.disabled = true;
      item.appendChild(handle);
      list.appendChild(item);
    });
    setupDrag();
  }
  function syncPrioritiesFromDom() {
    if (!state.shadowRoot) return;
    const list = state.shadowRoot.getElementById("priority-list");
    if (!list) return;
    const keys = [...list.querySelectorAll(".priority-item")].map((it) => it.dataset.key).filter((k) => PRIORITY_TYPES.some((t) => t.key === k));
    if (keys.length !== PRIORITY_TYPES.length) return;
    const target = settings.autoPartyTravel ? "partyMapPriority" : "mapPriority";
    const prev = settings[target] || DEFAULTS[target];
    const autoG = state.shadowRoot.getElementById("sw-autoGuild"), autoP = state.shadowRoot.getElementById("sw-autoPersonal");
    const compOk = settings.autoCompetition && ((autoG?.checked ?? settings.autoGuild) || (autoP?.checked ?? settings.autoPersonal));
    let next = keys;
    if (!compOk && prev.includes("competition") && prev.indexOf("competition") !== keys.indexOf("competition")) {
      const rest = keys.filter((k) => k !== "competition");
      rest.splice(prev.indexOf("competition"), 0, "competition");
      next = rest;
    }
    settings[target] = next;
    saveSettings();
    renderPriorities();
    if (state.appGame) makeDecision(state.appGame);
  }
  var draggedItem = null;
  var draggedHandle = null;
  var _dragRootBound = false;
  function setupDrag() {
    if (!state.shadowRoot) return;
    const root = state.shadowRoot;
    root.querySelectorAll(".drag-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const item = handle.closest(".priority-item");
        if (!item) return;
        draggedItem = item;
        draggedHandle = handle;
        item.dataset.dragging = "true";
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
    });
    if (_dragRootBound) return;
    _dragRootBound = true;
    root.addEventListener("pointermove", (event) => {
      if (!draggedItem || !draggedHandle) return;
      const target = [...root.elementsFromPoint(event.clientX, event.clientY)].map((el) => el.closest(".priority-item")).find((el) => el && el !== draggedItem);
      if (!target?.parentElement) return;
      const tr = target.getBoundingClientRect();
      target.parentElement.insertBefore(draggedItem, event.clientY < tr.top + tr.height / 2 ? target : target.nextSibling);
    });
    const finishDrag = (event) => {
      if (!draggedItem || !draggedHandle) return;
      draggedItem.dataset.dragging = "false";
      if (draggedHandle.hasPointerCapture(event.pointerId)) draggedHandle.releasePointerCapture(event.pointerId);
      draggedItem = null;
      draggedHandle = null;
      syncPrioritiesFromDom();
    };
    root.addEventListener("pointerup", finishDrag);
    root.addEventListener("pointercancel", finishDrag);
  }
  function renderBuffTab(weatherId) {
    const isComp = weatherId === "competition";
    const name = isComp ? "\u6BD4\u8D5B" : WEATHER_ID_TO_NAME[weatherId] || weatherId;
    const sel = settings.buffSelections[weatherId] || {};
    const hasAny = Object.values(sel).some((v) => v);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `font-size:11px;padding:3px 7px;border:1px solid var(--as-border);border-radius:3px;background:${weatherId === state._buffTab ? "var(--as-tide)" : "var(--as-control)"};color:${weatherId === state._buffTab ? "#fff" : "var(--as-text)"};cursor:pointer;`;
    btn.textContent = name + (hasAny ? " \u25CF" : "");
    btn.addEventListener("click", () => {
      updateState({ _buffTab: weatherId });
      renderBuffUI();
    });
    return btn;
  }
  function renderBuffUI() {
    const tabCtr = state.shadowRoot.getElementById("buff-tabs");
    const buffCtr = state.shadowRoot.getElementById("buff-ctr");
    if (!tabCtr || !buffCtr) return;
    if (state._buffTab === void 0) updateState({ _buffTab: Object.keys(WEATHER_ID_TO_NAME)[0] });
    const curTab = state._buffTab;
    tabCtr.innerHTML = "";
    for (const wid of Object.keys(WEATHER_ID_TO_NAME)) tabCtr.appendChild(renderBuffTab(wid));
    tabCtr.appendChild(renderBuffTab("competition"));
    buffCtr.innerHTML = "";
    const sel = settings.buffSelections[curTab] || {};
    for (const [gid, grp] of Object.entries(BUFF_GROUPS)) {
      const gd = document.createElement("div");
      gd.className = "buff-group";
      gd.innerHTML = `<div class="buff-group-title">${grp.label}</div>`;
      const opt = document.createElement("div");
      opt.className = "buff-options";
      for (const pid of grp.options) {
        const cfg = BUFF_CONFIG[pid];
        if (!cfg) continue;
        const l = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!sel[pid];
        cb.dataset.productId = pid;
        cb.addEventListener("change", function() {
          if (!settings.buffSelections[curTab]) settings.buffSelections[curTab] = {};
          if (this.checked) opt.querySelectorAll("input[data-product-id]").forEach((o) => {
            if (BUFF_CONFIG[o.dataset.productId]?.group === gid && o !== this && o.checked) {
              o.checked = false;
              settings.buffSelections[curTab][o.dataset.productId] = false;
            }
          });
          settings.buffSelections[curTab][pid] = this.checked;
          saveSettings();
        });
        const unit = cfg.currency === "fragments" ? "\u788E\u7247" : "\u9057\u7269";
        l.appendChild(cb);
        l.appendChild(document.createTextNode(`${cfg.name} (${cfg.price}${unit})`));
        opt.appendChild(l);
      }
      gd.appendChild(opt);
      buffCtr.appendChild(gd);
    }
  }
  var HINTS = {
    respec: "\u8FDB\u5165\u6BD4\u8D5B\u5730\u56FE\u540E\u4E34\u65F6\u5168\u52A0\u5E78\u8FD0\uFF0C\u79BB\u5F00\u6216\u6BD4\u8D5B\u7ED3\u675F\u540E\u6062\u590D\u300C\u5C5E\u6027\u52A0\u70B9\u300D\u4E2D\u7684\u5E38\u9A7B\u65B9\u6848\u3002\u6BCF\u6B21\u6D17\u70B9\u6D88\u8017 10,000 \u91D1\u5E01\uFF1B\u9700\u8981\u5148\u5F00\u542F\u300C\u81EA\u52A8\u5206\u914D\u5C5E\u6027\u70B9\u300D\u3002",
    loadout: "\u8FDB\u5165\u6BD4\u8D5B\u5730\u56FE\u65F6\u4F7F\u7528\u300C\u6BD4\u8D5B\u914D\u88C5\u300D\uFF0C\u79BB\u5F00\u540E\u5207\u56DE\u300C\u65E5\u5E38\u914D\u88C5\u300D\u3002",
    baitAutoBuy: "\u9C7C\u9975\u5E93\u5B58\u4E3A0\u65F6\uFF0C\u4E3B\u52A8\u8D2D\u4E70100\u4E2A\u518D\u88C5\u5907\u3002\u4E0D\u662F\u6E38\u620F\u81EA\u5E26\u7684\u81EA\u52A8\u8865\u5145",
    baitFallback: "\u4E70\u4E0D\u8D77\u6216\u8D2D\u4E70\u5931\u8D25\u65F6\uFF0C\u81EA\u52A8\u964D\u7EA7\u5230\u4F4E\u4E00\u7EA7\u9975\u6599\uFF0C\u76F4\u5230\u57FA\u7840\u9975",
    sellFish: "\u5B9A\u65F6\u628A\u7B26\u5408\u89C4\u5219\u7684\u9C7C\u81EA\u52A8\u5356\u7ED9 NPC\uFF1A\u52FE\u9009\u7684\u7A00\u6709\u5EA6\u4F1A\u88AB\u5356\u51FA\uFF0C\u672A\u52FE\u9009\u7684\u4FDD\u7559\uFF1B\u9501\u5B9A\u9C7C\u3001\u4E13\u7CBE\u9C7C\u6C38\u8FDC\u4E0D\u5356\u3002\n\u53EF\u8BBE\u5B9A\u65F6\u95F4\u9694\uFF0C\u6216\u70B9\u300C\u7ACB\u5373\u5356\u9C7C\u300D\u624B\u52A8\u5356\u4E00\u6B21\uFF0C\u6309\u94AE\u4F1A\u663E\u793A\u5356\u51FA\u7ED3\u679C",
    sellGear: "\u5B9A\u65F6\u628A\u7B26\u5408\u89C4\u5219\u7684\u88C5\u5907\u81EA\u52A8\u5356\u7ED9 NPC\uFF1A\u6BCF\u6863\u7A00\u6709\u5EA6\u53EF\u5355\u72EC\u8BBE\u54C1\u8D28\u9608\u503C\uFF08\u54C1\u8D28 \u2264 \u6B64\u503C\u624D\u5356\uFF09\u3002\n\u9501\u5B9A\u3001\u7A7F\u6234\u4E2D\u3001\u5E02\u573A\u4E0A\u67B6\u4E2D\u7684\u88C5\u5907\u4E0D\u4F1A\u88AB\u5356\uFF08\u670D\u52A1\u7AEF\u4FDD\u62A4\uFF09\u3002\u70B9\u300C\u7ACB\u5373\u5356\u88C5\u5907\u300D\u53EF\u624B\u52A8\u5356\u4E00\u6B21"
  };
  var SECTION_HINTS = {
    fishing: "\u81EA\u52A8\u4FDD\u6301\u9493\u7AFF\u5145\u8DB3\uFF1B\u5173\u95ED\u540E\u811A\u672C\u4E0D\u4F1A\u518D\u6267\u884C\u8865\u6746\u64CD\u4F5C",
    priority: "\u6309\u4F18\u5148\u7EA7\u81EA\u52A8\u524D\u5F80\u5730\u56FE\uFF1A\u6BD4\u8D5B \u2192 \u6307\u5B9A\u56FE \u2192 \u91D1\u98CE \u2192 \u7ECF\u9A8C \u2192 \u91D1\u5E01\u3002\u53EF\u62D6\u52A8\u8C03\u6574\u987A\u5E8F\uFF0C\u652F\u6301\u8239\u961F\u6A21\u5F0F",
    buff: "\u5728\u6BD4\u8D5B\u6216\u6307\u5B9A\u5929\u6C14\u4E0B\u81EA\u52A8\u8D2D\u4E70\u7ECF\u9A8C/\u529B\u91CF/\u8FD0\u6C14/\u788E\u7247 Buff\uFF0C\u6BCF\u4E2A\u5929\u6C14\u53EF\u72EC\u7ACB\u914D\u7F6E",
    bait: "\u6309\u573A\u666F\uFF08\u4E2A\u4EBA\u8D5B/\u516C\u4F1A\u8D5B/\u91D1\u98CE/\u5965\u79D8\u6D8C\u6D41/\u5176\u4ED6\u5929\u6C14\uFF09\u81EA\u52A8\u5207\u6362\u5BF9\u5E94\u9C7C\u9975",
    competition: "\u7BA1\u7406\u4E2A\u4EBA\u8D5B\u548C\u516C\u4F1A\u8D5B\u3002\u6BD4\u8D5B\u6D17\u70B9\u4F1A\u4E34\u65F6\u5168\u52A0\u5E78\u8FD0\uFF0C\u7ED3\u675F\u540E\u6062\u590D\u300C\u5C5E\u6027\u52A0\u70B9\u300D\u4E2D\u7684\u5E38\u9A7B\u65B9\u6848",
    stats: "\u8BBE\u7F6E\u65E5\u5E38\u4F7F\u7528\u7684\u5E38\u9A7B\u52A0\u70B9\u65B9\u6848\u3002\u586B\u5199\u7684\u662F\u6700\u7EC8\u9762\u677F\u76EE\u6807\uFF0C\u811A\u672C\u4F1A\u6263\u9664\u9C7C\u7AFF\u3001\u88C5\u5907\u3001\u5956\u676F\u548C\u56FE\u817E\u7B49\u52A0\u6210\u540E\u53CD\u7B97\u6295\u5165\u70B9\u6570\uFF1B\u6BD4\u8D5B\u671F\u95F4\u53EF\u4E34\u65F6\u5168\u52A0\u5E78\u8FD0\uFF0C\u7ED3\u675F\u540E\u6062\u590D\u672C\u65B9\u6848",
    sellfish: "\u5B9A\u65F6\u628A\u7B26\u5408\u7A00\u6709\u5EA6\u89C4\u5219\u7684\u9C7C\u81EA\u52A8\u5356\u7ED9 NPC\uFF0C\u9501\u5B9A\u9C7C\u548C\u4E13\u7CBE\u9C7C\u4E0D\u5356",
    sellgear: "\u5B9A\u65F6\u628A\u7B26\u5408\u7A00\u6709\u5EA6+\u54C1\u8D28\u89C4\u5219\u7684\u88C5\u5907\u81EA\u52A8\u5356\u7ED9 NPC\uFF0C\u9501\u5B9A/\u7A7F\u6234\u4E2D/\u5E02\u573A\u4E2D\u7684\u88C5\u5907\u4E0D\u5356",
    worldboss: "\u81EA\u52A8\u62A5\u540D\u4E16\u754C Boss\uFF0C\u5E76\u53EF\u5728\u6218\u6597\u524D\u4E34\u65F6\u6D17\u6210\u5F31\u70B9\u5C5E\u6027\u3001\u5207\u6362\u914D\u88C5\uFF0C\u7ED3\u675F\u540E\u6062\u590D",
    general: "\u4E0D\u5C5E\u4E8E\u7279\u5B9A\u73A9\u6CD5\u7684\u4FBF\u6377\u529F\u80FD\uFF1A\u6BCF\u65E5\u7B7E\u5230\u548C\u5F39\u7A97\u5904\u7406\uFF1B\u603B\u5F00\u5173\u53EF\u4E00\u6B21\u505C\u7528\u5168\u90E8\u901A\u7528\u8F85\u52A9",
    display: "\u53EA\u589E\u5F3A\u9875\u9762\u663E\u793A\u548C\u8C03\u8BD5\u4FE1\u606F\uFF0C\u4E0D\u6267\u884C\u6E38\u620F\u64CD\u4F5C\uFF1B\u603B\u5F00\u5173\u53EF\u4E00\u6B21\u9690\u85CF\u5168\u90E8\u663E\u793A\u589E\u5F3A"
  };
  var tooltipEl = null;
  function showTooltip(e, text) {
    hideTooltip();
    tooltipEl = document.createElement("div");
    tooltipEl.textContent = text;
    tooltipEl.style.cssText = "position:fixed;z-index:2147483700;max-width:min(240px,calc(100vw - 24px));padding:5px 8px;background:rgba(0,0,0,0.85);color:#fff;border-radius:6px;font-size:11px;line-height:1.5;pointer-events:none;white-space:pre-line;box-sizing:border-box;";
    document.body.appendChild(tooltipEl);
    const r = tooltipEl.getBoundingClientRect();
    let x = e.clientX + 10, y = e.clientY - r.height - 4;
    if (y < 4) y = e.clientY + 14;
    x = Math.min(Math.max(x, 8), window.innerWidth - r.width - 8);
    y = Math.min(Math.max(y, 4), window.innerHeight - r.height - 4);
    tooltipEl.style.left = x + "px";
    tooltipEl.style.top = y + "px";
  }
  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }
  document.addEventListener("click", hideTooltip);
  function makeHint(desc) {
    const h = document.createElement("span");
    h.className = "bait-hint";
    h.textContent = "?";
    h.style.cssText = "cursor:help;margin-left:2px;color:#fff;font-size:8px;font-weight:700";
    h.addEventListener("mouseenter", (e) => showTooltip(e, desc));
    h.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTooltip();
      showTooltip(e, desc);
    });
    h.addEventListener("mouseleave", hideTooltip);
    return h;
  }
  function attachUI() {
    const host = document.createElement("div");
    host.id = "script-panel-host";
    state.shadowRoot = host.attachShadow({ mode: "open" });
    state.shadowRoot.innerHTML = PANEL_HTML;
    document.documentElement.appendChild(host);
    const dock = state.shadowRoot.querySelector(".dock");
    const collapse = state.shadowRoot.getElementById("collapse");
    const applyDockPos = (r, t) => {
      dock.style.right = r + "px";
      dock.style.top = t + "px";
    };
    const clampBallPos = () => {
      const s = 52;
      settings.ballRight = Math.min(Math.max(0, settings.ballRight), window.innerWidth - s);
      settings.ballTop = Math.min(Math.max(0, settings.ballTop), window.innerHeight - s);
    };
    const clampPanelPos = () => {
      const h = 52;
      settings.dockRight = Math.min(Math.max(0, settings.dockRight), window.innerWidth - h);
      settings.dockTop = Math.min(Math.max(0, settings.dockTop), window.innerHeight - h - 8);
    };
    const updateCollapseUI = () => {
      if (!dock || !collapse) return;
      dock.dataset.collapsed = String(settings.isPanelCollapsed);
      collapse.setAttribute("aria-expanded", String(!settings.isPanelCollapsed));
      collapse.title = settings.isPanelCollapsed ? "\u70B9\u51FB\u5C55\u5F00\u8F85\u52A9\u811A\u672C\u8BBE\u7F6E" : "\u62D6\u52A8\u6807\u9898\u680F\u53EF\u79FB\u52A8\u9762\u677F";
      const glyph = collapse.querySelector(".collapse-glyph");
      if (glyph) glyph.textContent = settings.isPanelCollapsed ? "+" : "\u2212";
      const cl = state.shadowRoot.getElementById("collapse-label");
      if (cl) cl.textContent = settings.isPanelCollapsed ? "\u5C55\u5F00" : "\u6536\u8D77";
    };
    if (dock && collapse) {
      collapse.addEventListener("click", () => {
        const r = dock.getBoundingClientRect();
        if (settings.isPanelCollapsed) {
          settings.ballRight = window.innerWidth - r.right;
          settings.ballTop = r.top;
          if (settings.dockRight >= 0) {
            clampPanelPos();
            applyDockPos(settings.dockRight, settings.dockTop);
          }
        } else {
          settings.dockRight = window.innerWidth - r.right;
          settings.dockTop = r.top;
          if (settings.ballRight >= 0) {
            clampBallPos();
            applyDockPos(settings.ballRight, settings.ballTop);
          }
        }
        settings.isPanelCollapsed = !settings.isPanelCollapsed;
        updateCollapseUI();
        saveSettings();
      });
    }
    renderSwitches();
    renderStatsSection();
    renderAttributeSection();
    renderSellUI();
    try {
      renderWorldBossSection();
    } catch (e) {
      console.error("[\u8F85\u52A9\u811A\u672C] \u4E16\u754CBoss UI \u6E32\u67D3\u5931\u8D25:", e);
    }
    state.shadowRoot.querySelectorAll(".switch-item input").forEach((cb) => {
      const key = cb.id.replace("sw-", "");
      cb.addEventListener("change", () => {
        if (DEFAULTS.hasOwnProperty(key)) {
          settings[key] = cb.checked;
          saveSettings();
          applySettings();
        }
        if (cb.id === "sw-autoGuild" || cb.id === "sw-autoPersonal") renderPriorities();
      });
    });
    const swBuff = state.shadowRoot.getElementById("sw-autoBuyBuffs");
    if (swBuff) swBuff.addEventListener("change", () => {
      settings.autoBuyBuffs = swBuff.checked;
      saveSettings();
      applySettings();
    });
    renderPriorities();
    const swAutoSwitchMap = state.shadowRoot.getElementById("sw-autoSwitchMap");
    if (swAutoSwitchMap) swAutoSwitchMap.checked = !!settings.autoSwitchMap;
    const swParty = state.shadowRoot.getElementById("sw-autoPartyTravel");
    if (swParty) {
      swParty.checked = !!settings.autoPartyTravel;
      swParty.addEventListener("change", () => {
        settings.autoPartyTravel = swParty.checked;
        saveSettings();
        renderPriorities();
        if (state.appGame) makeDecision(state.appGame);
      });
    }
    const swLimit = state.shadowRoot.getElementById("sw-partyLimitByCrew");
    if (swLimit) {
      swLimit.checked = !!settings.partyLimitByCrew;
      swLimit.addEventListener("change", () => {
        settings.partyLimitByCrew = swLimit.checked;
        saveSettings();
        if (state.appGame) makeDecision(state.appGame);
      });
      const lbl = swLimit.parentElement.querySelector("span");
      if (lbl) lbl.appendChild(makeHint("\u8239\u957F/\u8235\u624B\u6A21\u5F0F\u4E0B\uFF0C\u5207\u56FE\u53EA\u53BB\u300C\u5168\u8239\u7B49\u7EA7\u6700\u4F4E\u8239\u5458\u300D\u4E5F\u80FD\u8FDB\u7684\u5730\u56FE\uFF0C\u907F\u514D\u4F4E\u7B49\u7EA7\u8239\u5458\u6389\u961F"));
    }
    const swExMastery = state.shadowRoot.getElementById("sw-excludeMasteryBonus");
    if (swExMastery) {
      swExMastery.checked = !!settings.excludeMasteryBonus;
      swExMastery.addEventListener("change", () => {
        settings.excludeMasteryBonus = swExMastery.checked;
        saveSettings();
        if (state.appGame) makeDecision(state.appGame);
      });
    }
    const swExGuild = state.shadowRoot.getElementById("sw-excludeGuildBoost");
    if (swExGuild) {
      swExGuild.checked = !!settings.excludeGuildBoost;
      swExGuild.addEventListener("change", () => {
        settings.excludeGuildBoost = swExGuild.checked;
        saveSettings();
        if (state.appGame) makeDecision(state.appGame);
      });
    }
    const swAutoBait = state.shadowRoot.getElementById("sw-autoBait");
    if (swAutoBait) {
      swAutoBait.checked = !!settings.autoBait;
      swAutoBait.addEventListener("change", () => {
        settings.autoBait = swAutoBait.checked;
        saveSettings();
      });
    }
    const swBaitFallback = state.shadowRoot.getElementById("sw-baitFallback");
    if (swBaitFallback) {
      swBaitFallback.checked = !!settings.baitFallback;
      swBaitFallback.addEventListener("change", () => {
        settings.baitFallback = swBaitFallback.checked;
        saveSettings();
      });
    }
    const swBaitAutoBuy = state.shadowRoot.getElementById("sw-baitAutoBuy");
    if (swBaitAutoBuy) {
      swBaitAutoBuy.checked = !!settings.baitAutoBuy;
      swBaitAutoBuy.addEventListener("change", () => {
        settings.baitAutoBuy = swBaitAutoBuy.checked;
        saveSettings();
      });
    }
    const hintAutoBuy = state.shadowRoot.getElementById("hint-baitAutoBuy");
    if (hintAutoBuy) {
      const h = makeHint(HINTS.baitAutoBuy);
      h.id = "hint-baitAutoBuy";
      hintAutoBuy.replaceWith(h);
    }
    const hintFallback = state.shadowRoot.getElementById("hint-baitFallback");
    if (hintFallback) {
      const h = makeHint(HINTS.baitFallback);
      h.id = "hint-baitFallback";
      hintFallback.replaceWith(h);
    }
    const scriptVersion = state.shadowRoot.getElementById("script-version");
    if (scriptVersion) {
      scriptVersion.addEventListener("click", showUpdatePopup);
      scriptVersion.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showUpdatePopup();
        }
      });
    }
    const hintScriptVersion = state.shadowRoot.getElementById("hint-script-version");
    if (hintScriptVersion) {
      const h = makeHint("\u53D1\u73B0\u65B0\u7248\u672C\u65F6\u811A\u672C\u4F1A\u81EA\u52A8\u63D0\u793A\u3002\u4E5F\u53EF\u4EE5\u524D\u5F80\u7FA4\u6587\u4EF6\u3001\u6CB9\u7334\u6216\u6CB9\u53C9\u4E0B\u8F7D\u6700\u65B0\u7248\uFF1B\u70B9\u51FB\u7248\u672C\u53F7\u53EF\u67E5\u770B\u5F53\u524D\u7248\u672C\u7684\u66F4\u65B0\u5185\u5BB9\u3002");
      h.id = "hint-script-version";
      h.style.top = "0";
      hintScriptVersion.replaceWith(h);
    }
    renderBaitControls(null);
    const swAutoBuy = state.shadowRoot.getElementById("sw-autoBuyBuffs");
    if (swAutoBuy) swAutoBuy.checked = !!settings.autoBuyBuffs;
    renderBuffUI();
    state.shadowRoot.querySelectorAll(".section[data-section]").forEach((sec) => {
      const key = sec.dataset.section;
      if (settings.sectionCollapsed[key] !== void 0) {
        sec.dataset.collapsed = String(settings.sectionCollapsed[key]);
      }
      const heading = sec.querySelector(".section-heading[data-accordion]");
      if (heading) {
        heading.addEventListener("click", () => {
          settings.sectionCollapsed[key] = sec.dataset.collapsed !== "true";
          sec.dataset.collapsed = String(settings.sectionCollapsed[key]);
          saveSettings();
        });
      }
    });
    for (const [key, desc] of Object.entries(SECTION_HINTS)) {
      const heading = state.shadowRoot.querySelector(`.section[data-section="${key}"] .section-heading[data-accordion]`);
      if (heading) heading.appendChild(makeHint(desc));
    }
    if (getSeenVersion() !== SCRIPT_VERSION) {
      settings.isPanelCollapsed = false;
      saveSettings();
    }
    updateCollapseUI();
    if (settings.isPanelCollapsed && settings.ballRight >= 0 && dock) applyDockPos(settings.ballRight, settings.ballTop);
    else if (!settings.isPanelCollapsed && settings.dockRight >= 0 && dock) {
      clampPanelPos();
      applyDockPos(settings.dockRight, settings.dockTop);
    } else if (dock) {
      settings.dockRight = 16;
      settings.dockTop = 16;
      settings.ballRight = 16;
      settings.ballTop = window.innerHeight - 64;
      applyDockPos(16, 16);
    }
    state.shadowRoot.querySelectorAll(".tab-bar .tab-btn").forEach((b) => {
      b.addEventListener("click", () => switchView(b.dataset.view));
    });
    renderFeedbackUI();
    switchView(settings.viewMode || "settings");
    switchSettingsCategory(settings.settingsCategory || "daily");
    state.shadowRoot.querySelectorAll(".settings-category-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchSettingsCategory(btn.dataset.category));
    });
    const btnCloseUpdate = state.shadowRoot.getElementById("update-popup-close");
    if (btnCloseUpdate) btnCloseUpdate.addEventListener("click", closeUpdatePopup);
    const btnPause = state.shadowRoot.getElementById("btn-pause");
    if (btnPause) {
      const pIcon = btnPause.querySelector("span");
      const pLabel = pIcon ? pIcon.nextElementSibling : null;
      const setPauseUI = (paused) => {
        if (pIcon) pIcon.textContent = paused ? "\u25B6" : "\u23EF";
        if (pLabel) pLabel.textContent = paused ? "\u6062\u590D" : "\u6682\u505C";
        btnPause.title = paused ? "\u6062\u590D\u6240\u6709\u81EA\u52A8\u5316\u529F\u80FD" : "\u6682\u505C\u6240\u6709\u81EA\u52A8\u5316\u529F\u80FD";
      };
      if (state.paused) setPauseUI(true);
      btnPause.addEventListener("click", () => {
        const willPause = !state.paused;
        OpLog.info("\u4E3B\u7A0B\u5E8F", willPause ? "\u23F8 \u5DF2\u6682\u505C\u6240\u6709\u81EA\u52A8\u5316" : "\u25B6 \u5DF2\u6062\u590D\u6240\u6709\u81EA\u52A8\u5316");
        state.paused = willPause;
        setPauseUI(state.paused);
        if (!state.paused) applySettings();
      });
    }
    const btnExport = state.shadowRoot.getElementById("btn-export-log");
    if (btnExport) btnExport.addEventListener("click", () => {
      const EXPORT_MAX = 100 * 1024 * 1024;
      let text = "";
      let bytes = 0;
      for (let i = state.logBuffer.length - 1; i >= 0; i--) {
        const e = state.logBuffer[i];
        const line = `[${e.time}] [${e.tag}]${e.action ? "[" + e.action + "]" : ""} ${e.msg}
`;
        if (bytes + strBytes(line) > EXPORT_MAX) break;
        text = line + text;
        bytes += strBytes(line);
      }
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const d = /* @__PURE__ */ new Date();
      a.download = `\u5965\u672F\u6478\u9C7C\u5927\u5E08\u8F85\u52A9\u811A\u672C\u65E5\u5FD7_v${SCRIPT_VERSION}_${d.toISOString().slice(0, 10)}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const btnCopy = state.shadowRoot.getElementById("btn-copy-log");
    if (btnCopy) btnCopy.addEventListener("click", async () => {
      const text = formatLogEntries(getFilteredLogEntries());
      const original = btnCopy.textContent;
      let ok = false;
      const fallbackCopy = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand("copy");
        ta.remove();
        return copied;
      };
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else ok = fallbackCopy();
      } catch (_) {
        try {
          ok = fallbackCopy();
        } catch (_2) {
        }
      }
      btnCopy.textContent = ok ? "\u2713 \u5DF2\u590D\u5236" : "\u590D\u5236\u5931\u8D25";
      btnCopy.dataset.result = ok ? "ok" : "error";
      setTimeout(() => {
        btnCopy.textContent = original;
        delete btnCopy.dataset.result;
      }, 1800);
    });
    const btnClear = state.shadowRoot.getElementById("btn-clear-log");
    if (btnClear) btnClear.addEventListener("click", () => {
      state.logBuffer = [];
      state.logBufferBytes = 0;
      renderLogView();
    });
    const btnPauseScroll = state.shadowRoot.getElementById("btn-pause-log");
    if (btnPauseScroll) btnPauseScroll.addEventListener("click", () => {
      state.logPaused = !state.logPaused;
      btnPauseScroll.textContent = state.logPaused ? "\u25B6 \u6EDA\u52A8" : "\u23F8 \u6682\u505C";
      btnPauseScroll.title = state.logPaused ? "\u6062\u590D\u81EA\u52A8\u6EDA\u52A8\u5230\u5E95\u90E8" : "\u6682\u505C\u81EA\u52A8\u6EDA\u52A8\u5230\u5E95\u90E8";
      if (!state.logPaused) {
        const container = state.shadowRoot.getElementById("log-entries");
        if (container) container.scrollTop = container.scrollHeight;
      }
    });
    const selTagFilter = state.shadowRoot.getElementById("log-tag-filter");
    if (selTagFilter) selTagFilter.addEventListener("change", () => {
      state.logTagFilter = selTagFilter.value;
      state.logActionFilter = "";
      renderLogView();
    });
    const selActionFilter = state.shadowRoot.getElementById("log-action-filter");
    if (selActionFilter) selActionFilter.addEventListener("change", () => {
      state.logActionFilter = selActionFilter.value;
      renderLogView();
    });
    const header = state.shadowRoot.querySelector(".panel-header");
    if (header && dock) {
      let dragDSX, dragDSY, dragDSR, dragDST, dragMoved, dragPtrId, dragStartOnCollapse;
      header.addEventListener("pointerdown", (e) => {
        if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest("button")) return;
        dragMoved = false;
        dragPtrId = e.pointerId;
        dragStartOnCollapse = !!e.composedPath()[0]?.closest("#collapse");
        dragDSX = e.clientX;
        dragDSY = e.clientY;
        const r = dock.getBoundingClientRect();
        dragDSR = window.innerWidth - r.right;
        dragDST = r.top;
        dock.style.transition = "none";
        header.setPointerCapture(e.pointerId);
      });
      header.addEventListener("pointermove", (e) => {
        if (dragPtrId !== e.pointerId) return;
        const dx = e.clientX - dragDSX, dy = e.clientY - dragDSY;
        if (!dragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        dragMoved = true;
        dock.style.right = Math.min(Math.max(0, dragDSR - dx), window.innerWidth - 52) + "px";
        const maxTop = settings.isPanelCollapsed ? window.innerHeight - 52 : window.innerHeight - 60;
        dock.style.top = Math.min(maxTop, Math.max(0, dragDST + dy)) + "px";
      });
      header.addEventListener("pointerup", (e) => {
        if (dragPtrId !== e.pointerId) return;
        if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
        dragPtrId = null;
        dock.style.transition = "";
        if (dragMoved) {
          const r = dock.getBoundingClientRect();
          const rr = window.innerWidth - r.right, tt = r.top;
          if (settings.isPanelCollapsed) {
            settings.ballRight = rr;
            settings.ballTop = tt;
          } else {
            settings.dockRight = rr;
            settings.dockTop = tt;
          }
          saveSettings();
        } else if (dragStartOnCollapse) {
          collapse.click();
        }
      });
      header.addEventListener("pointercancel", (e) => {
        if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
        dragPtrId = null;
        dock.style.transition = "";
      });
    }
    document.addEventListener("click", (e) => {
      if (!dock || dock.dataset.collapsed === "true" || !host) return;
      if (!e.composedPath().includes(host)) {
        const r2 = dock.getBoundingClientRect();
        settings.dockRight = window.innerWidth - r2.right;
        settings.dockTop = r2.top;
        if (settings.ballRight >= 0) {
          clampBallPos();
          applyDockPos(settings.ballRight, settings.ballTop);
        }
        settings.isPanelCollapsed = true;
        updateCollapseUI();
        saveSettings();
      }
    });
  }
  function getBaitScene(snapshot) {
    if (!snapshot) return null;
    const cur = snapshot.biomes?.find((b) => b.isCurrent);
    if (!cur) return null;
    if (shouldActForComp("personal")) return "personalCompetition";
    if (shouldActForComp("guild")) return "guildCompetition";
    if (cur.weather?.id === "gilded_current") return "golden";
    if (cur.weather?.id === "arcane_surge") return "arcaneSurge";
    return "normal";
  }
  async function refreshBaitData() {
    try {
      const r = await apiFetch("/api/baits");
      if (r.baits) updateState({ baitCache: r.baits });
    } catch (e) {
      L.bait(`\u83B7\u53D6\u9975\u6599\u6570\u636E\u5931\u8D25: ${e.message}`);
    }
  }
  var PANEL_HTML = `
<style>
  :host { --as-surface:var(--surface,#fffefa); --as-raised:var(--raised,#fff); --as-soft:var(--surface-soft,#f7fafc); --as-control:var(--control,#f2f6f9); --as-control-hover:var(--control-hover,#eaf7f8); --as-text:var(--text,#20354d); --as-muted:var(--muted,#71869b); --as-border:var(--border,#d1dee7); --as-divider:var(--divider,#e4edf2); --as-tide:var(--tide,#52bac4); --as-tide-deep:var(--tide-deep,#2a8790); --as-reed:var(--reed,#45a76f); --as-coral:var(--coral,#e66b58); --as-shadow:color-mix(in srgb,var(--as-text) 18%,transparent); all:initial; color:var(--as-text); font-family:var(--body,"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif); font-size:13px; }
  *,*::before,*::after{box-sizing:border-box;}
  button,input,select{font:inherit;}
  .dock{position:fixed;right:max(16px,env(safe-area-inset-right));top:auto;z-index:2147483600;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:hidden;border:1px solid var(--as-border);border-radius:6px;background:var(--as-surface);box-shadow:0 12px 32px var(--as-shadow);}
  .dock[data-collapsed="true"]{width:52px;height:52px;border-radius:50%;border:2px solid var(--as-tide);box-shadow:0 4px 16px var(--as-shadow);}
  .dock[data-collapsed="true"] .panel-body,.dock[data-collapsed="true"] .identity{display:none !important;}
  .dock[data-collapsed="true"] #btn-pause{display:none !important;}
  .dock[data-collapsed="true"] #collapse{width:48px !important;height:48px !important;min-width:0 !important;padding:0 !important;border-radius:50% !important;background-image:url(https://static.reelax.cn/icons/currency/gold-coin.webp) !important;background-size:cover !important;background-position:center !important;border:0 !important;}
  .dock[data-collapsed="true"] #collapse span{display:none !important;}
  .dock[data-collapsed="true"] .panel-header{width:100%;height:100%;min-height:0;justify-content:center;padding:0;border-bottom:0;background:transparent;cursor:pointer;touch-action:none;}
  .dock[data-collapsed="true"] .collapse-glyph{display:none;}
  .panel-header{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 12px;border-bottom:1px solid var(--as-divider);background:var(--as-raised);cursor:move;user-select:none;touch-action:none;}
  .identity{display:flex;min-width:0;align-items:center;gap:10px;}
  .float-mark{position:relative;width:16px;height:28px;flex:0 0 auto;}
  .float-mark::before{position:absolute;left:7px;top:0;width:2px;height:28px;background:var(--as-tide-deep);content:"";}
  .float-mark::after{position:absolute;left:2px;top:9px;width:12px;height:12px;border:3px solid var(--as-surface);border-radius:50%;background:#e4a52e;box-shadow:0 0 0 1px var(--as-tide-deep);content:"";}
  .identity-copy{display:grid;min-width:0;gap:1px;}
  .identity-copy strong{font-size:14px;font-weight:700;}
  .identity-copy small{overflow:hidden;color:var(--as-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap;}
  .icon-button{display:grid;width:36px;height:36px;flex:0 0 auto;place-items:center;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--as-text);cursor:pointer;}
  .icon-button:hover{border-color:var(--as-border);background:var(--as-control-hover);}
  .collapse-glyph{font-size:19px;line-height:1;}
  .panel-body{max-height:calc(100vh - 76px);overflow-y:auto;overscroll-behavior:contain;}
  #view-settings,#view-log{min-height:0}
  .switches{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--as-divider);}
  .switch-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;min-height:44px;cursor:pointer;}
  .switch-item+.switch-item{border-top:1px solid var(--as-divider);}
  .switch-item span{font-size:12px;font-weight:650;line-height:17px;}
  .switch-item input{appearance:none;position:relative;width:34px;height:20px;flex:0 0 auto;margin:0;border:1px solid var(--as-border);border-radius:10px;background:var(--as-control);cursor:pointer;}
  .switch-item input::after{position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:var(--as-muted);content:"";transition:transform 150ms ease,background 150ms ease;}
  .switch-item input:checked{border-color:var(--as-tide-deep);background:var(--as-tide);}
  .switch-item input:checked::after{background:var(--as-raised);transform:translateX(14px);}
  .master-switch{margin:0 -12px;padding:0 12px;background:color-mix(in srgb,var(--as-tide) 10%,var(--as-surface));border-bottom:1px solid var(--as-divider);}
  .master-switch span{font-weight:750;color:var(--as-tide-deep);}
  .snapshot-grid{display:grid;grid-template-columns:1fr 1fr;background:var(--as-soft);border-bottom:1px solid var(--as-divider);}
  .snapshot-cell{display:grid;min-width:0;gap:2px;padding:10px 12px;}
  .snapshot-cell:nth-child(even){border-left:1px solid var(--as-divider);}
  .snapshot-cell:nth-child(n+3){border-top:1px solid var(--as-divider);}
  .snapshot-cell span{color:var(--as-muted);font-size:12px;}
  .snapshot-cell strong{overflow:hidden;font-family:monospace;font-size:13px;text-overflow:ellipsis;white-space:nowrap;}
  .section{padding:11px 12px 12px;border-bottom:1px solid var(--as-divider);}
  .section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px;}
  .section-heading strong{font-size:13px;}
  .section-heading span{color:var(--as-muted);font-size:12px;}
  .priority-list{display:grid;margin:0;padding:0;list-style:none;}
  .priority-item{position:relative;display:grid;grid-template-columns:32px 1fr 32px;min-height:42px;align-items:center;border-top:1px solid var(--as-divider);background:var(--as-surface);}
  .priority-item:last-child{border-bottom:1px solid var(--as-divider);}
  .priority-item::before{position:absolute;left:15px;top:0;bottom:0;width:2px;background:var(--as-tide);content:"";}
  .priority-item[data-dragging="true"]{z-index:1;background:var(--as-control-hover);}
  .priority-index{position:relative;z-index:1;display:grid;width:22px;height:22px;place-items:center;justify-self:center;border:2px solid var(--as-tide);border-radius:50%;background:var(--as-surface);color:var(--as-tide-deep);font-family:monospace;font-size:11px;font-weight:700;}
  .priority-name{padding:0 8px;font-size:13px;font-weight:650;}
  .drag-handle{width:32px;height:32px;border:0;border-radius:3px;background:transparent;color:var(--as-muted);cursor:grab;font-size:18px;line-height:1;touch-action:none;}
  .drag-handle:active{cursor:grabbing;}
  .drag-handle:hover{background:var(--as-control);color:var(--as-text);}
  .weather-ctr{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0;}
  .weather-ctr label{display:inline-flex;align-items:center;gap:2px;cursor:pointer;font-size:11px;color:var(--as-muted);}
  .weather-ctr input{accent-color:var(--as-tide-deep);}
  .buff-group{margin:4px 0 8px;padding:6px 8px;background:var(--as-control);border-radius:4px;}
  .buff-group-title{font-weight:600;font-size:11px;margin-bottom:3px;}
  .buff-options{display:flex;gap:8px;flex-wrap:wrap;}
  .buff-options label{display:inline-flex;align-items:center;gap:2px;cursor:pointer;font-size:11px;color:var(--as-muted);}
  .bait-hint{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;background:var(--as-muted);color:#fff;font-size:8px;font-weight:700;cursor:help;flex-shrink:0;vertical-align:super;position:relative;top:-3px;}
  .buff-options input{accent-color:var(--as-tide-deep);}
  .section[data-collapsed="true"] .section-body{display:none;}
  .section-heading[data-accordion]{position:sticky;top:79px;z-index:1;min-height:34px;align-items:center;margin:-11px -12px 8px;padding:7px 10px 7px 13px;border-bottom:1px solid var(--as-divider);background:color-mix(in srgb,var(--as-tide) 10%,var(--as-surface));box-shadow:inset 3px 0 0 var(--as-tide);cursor:pointer;user-select:none;}
  .section-heading[data-accordion]:hover{background:color-mix(in srgb,var(--as-tide) 16%,var(--as-surface));}
  .section-heading[data-accordion] strong{color:var(--as-tide-deep);font-weight:750;}
  .section-heading[data-accordion]::after{content:"\u25B8";display:grid;width:22px;height:22px;flex:0 0 auto;place-items:center;margin-left:auto;border:1px solid var(--as-border);border-radius:4px;background:var(--as-raised);color:var(--as-tide-deep);font-size:14px;line-height:1;transition:transform 150ms ease,background 150ms ease;}
  .section[data-collapsed="false"] .section-heading[data-accordion]::after{content:"\u25BE";background:var(--as-control-hover);}
  .log-line{display:flex;gap:6px;padding:2px 0;border-bottom:1px solid var(--as-divider);}
  .log-line:last-child{border-bottom:0;}
  .log-time{flex:0 0 auto;color:var(--as-muted);font-size:10px;}
  .log-tag{flex:0 0 auto;font-weight:700;font-size:11px;}
  .log-msg{flex:1;min-width:0;overflow-wrap:break-word;word-break:break-all;font-size:11px;}
  .log-line[data-level="error"] .log-msg,.log-line[data-level="error"] .log-time{color:var(--as-coral);}
  .log-line[data-level="warn"] .log-msg,.log-line[data-level="warn"] .log-time{color:#d97706;}
  .log-toolbar{display:grid;gap:6px;padding:7px 8px 8px;border-top:1px solid var(--as-divider);background:var(--as-soft);flex-shrink:0;}
  .log-filter-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:center;gap:6px;}
  .log-filter-row select{min-width:0;width:100%;height:28px;padding:2px 6px;border:1px solid var(--as-border);border-radius:4px;background:var(--as-raised);color:var(--as-text);cursor:pointer;font-size:11px;}
  .log-filter-row select[hidden]{display:none;}
  #log-size-hint{font-size:10px;color:var(--as-muted);white-space:nowrap;text-align:right;}
  .log-button-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}
  .log-button-row button{min-width:0;height:29px;padding:3px 4px;border:1px solid var(--as-border);border-radius:4px;background:var(--as-control);color:var(--as-text);cursor:pointer;font-size:11px;font-weight:650;}
  .log-button-row button:hover{border-color:var(--as-tide);background:var(--as-control-hover);}
  .log-button-row button[data-result="ok"]{border-color:var(--as-reed);color:var(--as-reed);}
  .log-button-row button[data-result="error"]{border-color:var(--as-coral);color:var(--as-coral);}
  .tab-btn{display:flex !important;align-items:center;justify-content:center;}
  .tab-btn:hover{border-color:var(--as-tide) !important;background:var(--as-control-hover) !important;}
  .tab-bar{position:sticky;top:0;z-index:1;display:flex;border-bottom:1px solid var(--as-divider);background:var(--as-soft);}
  .tab-bar .tab-btn{flex:1;padding:9px 4px;border:0;border-right:1px solid var(--as-divider);background:transparent;color:var(--as-muted);cursor:pointer;font-size:12px;font-weight:650;}
  .tab-bar .tab-btn:last-child{border-right:0;}
  .tab-bar .tab-btn[data-active="true"]{background:var(--as-raised);color:var(--as-tide-deep);box-shadow:inset 0 -2px 0 var(--as-tide);}
  .settings-category-tabs{position:sticky;top:36px;z-index:2;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:7px 8px;background:var(--as-surface);border-bottom:1px solid var(--as-divider);}
  .settings-category-btn{min-width:0;padding:6px 2px;border:1px solid var(--as-border);border-radius:4px;background:var(--as-control);color:var(--as-muted);cursor:pointer;font-size:11px;font-weight:650;}
  .settings-category-btn[data-active="true"]{border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 16%,var(--as-surface));color:var(--as-tide-deep);}
  .tab-badge{display:inline-block;width:7px;height:7px;margin-left:4px;border-radius:50%;background:#ef4444;vertical-align:middle;}
</style>
<aside class="dock" data-collapsed="false" aria-label="\u5965\u672F\u6478\u9C7C\u5927\u5E08">
  <header class="panel-header">
    <div class="identity"><span class="float-mark" aria-hidden="true"></span><span class="identity-copy"><strong id="panel-title">\u5965\u672F\u6478\u9C7C\u5927\u5E08</strong><small id="headline">\u7B49\u5F85\u6E38\u620F\u5FEB\u7167</small></span></div>
    <button class="icon-button tab-btn" id="btn-pause" type="button" title="\u6682\u505C\u6240\u6709\u81EA\u52A8\u5316\u529F\u80FD" aria-label="\u6682\u505C\u81EA\u52A8\u5316" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span style="font-size:12px">\u23EF</span><span style="margin-left:1px">\u6682\u505C</span></button>
    <button class="icon-button tab-btn" id="collapse" type="button" title="\u62D6\u52A8\u6807\u9898\u680F\u53EF\u79FB\u52A8\u9762\u677F" aria-label="\u6536\u8D77\u9762\u677F" aria-expanded="true" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span class="collapse-glyph" style="font-size:16px;line-height:1">\u2212</span><span style="margin-left:1px" id="collapse-label">\u6536\u8D77</span></button>
  </header>
  <div id="update-banner" style="display:none;padding:7px 12px;font-size:12px;color:#8a5a00;background:#fff4d6;border-bottom:1px solid #f0c36d;">\u53D1\u73B0\u65B0\u7248\u672C <strong id="update-version"></strong>\uFF08\u5F53\u524D <span id="current-version"></span>\uFF09\uFF0C\u8BF7\u66F4\u65B0\u811A\u672C</div>
  <div class="panel-body">
    <div class="tab-bar" id="tab-bar">
      <button class="tab-btn" type="button" data-view="settings">\u8BBE\u7F6E</button>
      <button class="tab-btn" type="button" data-view="log">\u65E5\u5FD7</button>
      <button class="tab-btn" type="button" data-view="feedback">\u53CD\u9988<span class="tab-badge" id="feedback-badge"></span></button>
    </div>
    <div id="view-settings">
    <div class="snapshot-grid">
      <div class="snapshot-cell"><span>\u5F53\u524D\u5730\u56FE</span><strong id="snap-biome">--</strong></div>
      <div class="snapshot-cell"><span>\u5730\u56FE\u7ECF\u9A8C</span><strong id="snap-score">--</strong></div>
      <div class="snapshot-cell" style="grid-column:1/-1"><span>\u5207\u56FE\u6A21\u5F0F</span><strong id="snap-mode">\u4E2A\u4EBA\u5730\u56FE\u6A21\u5F0F</strong><span class="bait-hint" id="hint-mode" style="margin-left:4px;">?</span><small id="snap-mode-notice" style="display:none;grid-column:1/-1;margin-top:4px;color:#d97706;font-weight:600;line-height:1.4;"></small></div>
    </div>
    <nav class="settings-category-tabs" aria-label="\u8BBE\u7F6E\u5206\u7C7B">
      <button type="button" class="settings-category-btn" data-category="daily">\u65E5\u5E38</button>
      <button type="button" class="settings-category-btn" data-category="events">\u8D5B\u4E8B</button>
      <button type="button" class="settings-category-btn" data-category="assets">\u8D44\u4EA7</button>
      <button type="button" class="settings-category-btn" data-category="other">\u5176\u4ED6</button>
      <button type="button" class="settings-category-btn" data-category="about">\u5173\u4E8E</button>
    </nav>
    <div class="section" data-section="priority" data-settings-category="daily" data-collapsed="false">
      <div class="section-heading" data-accordion><strong>\u5730\u56FE\u5BFC\u822A</strong></div>
      <div class="section-body">
        <div class="switch-item master-switch"><span>\u542F\u7528\u5730\u56FE\u5BFC\u822A</span><input type="checkbox" id="sw-autoSwitchMap"></div>
        <div class="switch-item"><span>\u8239\u961F\u6A21\u5F0F\uFF08\u8239\u957F/\u8235\u624B\u81EA\u52A8\u5F00\u8239\uFF09</span><input type="checkbox" id="sw-autoPartyTravel"></div>
        <div class="switch-item"><span>\u6309\u6700\u4F4E\u8239\u5458\u7B49\u7EA7\u9650\u56FE</span><input type="checkbox" id="sw-partyLimitByCrew"></div>
        <div class="switch-item"><span>\u6392\u9664\u5730\u56FE\u4E13\u7CBE\u52A0\u6210</span><input type="checkbox" id="sw-excludeMasteryBonus"></div>
        <div class="switch-item"><span>\u6392\u9664\u516C\u4F1A\u589E\u76CA</span><input type="checkbox" id="sw-excludeGuildBoost"></div>
        <ol class="priority-list" id="priority-list"></ol>
      </div>
    </div>
    <div class="section" data-section="buff" data-settings-category="daily" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>Buff \u8D2D\u4E70</strong></div>
      <div class="section-body">
        <div class="switch-item master-switch"><span>\u542F\u7528 Buff \u8D2D\u4E70</span><input type="checkbox" id="sw-autoBuyBuffs"></div>
        <div id="buff-tabs" style="display:flex;flex-wrap:wrap;gap:2px;padding:4px 12px;border-top:1px solid var(--as-divider);"></div>
        <div id="buff-ctr" style="padding:4px 12px 8px;"></div>
      </div>
    </div>
    <div class="section" data-section="bait" data-settings-category="daily" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u9C7C\u9975\u5207\u6362</strong></div>
      <div class="section-body">
        <div class="switch-item master-switch"><span>\u542F\u7528\u9C7C\u9975\u5207\u6362</span><input type="checkbox" id="sw-autoBait"></div>
        <div class="switch-item"><span>\u6CA1\u5E93\u5B58\u65F6\u4E3B\u52A8\u8D2D\u4E70100\u4E2A <span class="bait-hint" id="hint-baitAutoBuy">?</span></span><input type="checkbox" id="sw-baitAutoBuy"></div>
        <div class="switch-item"><span>\u4E70\u4E0D\u8D77\u65F6\u81EA\u52A8\u964D\u7EA7 <span class="bait-hint" id="hint-baitFallback">?</span></span><input type="checkbox" id="sw-baitFallback"></div>
        <div id="bait-scene-ctr" style="padding:0 12px 8px"></div>
      </div>
    </div>
    <div class="section" data-section="competition" data-settings-category="events" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u6BD4\u8D5B\u8F85\u52A9</strong></div>
      <div class="section-body" id="competition-body"></div>
    </div>
    <div class="section" data-section="stats" data-settings-category="assets" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u5C5E\u6027\u52A0\u70B9</strong></div>
      <div class="section-body" id="stats-section-body"></div>
    </div>
    <div class="section" data-section="worldboss" data-settings-category="events" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u4E16\u754C Boss</strong></div>
      <div class="section-body" id="worldboss-body"></div>
    </div>
    <div class="section" data-section="sellfish" data-settings-category="assets" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u51FA\u552E\u9C7C\u7C7B</strong></div>
      <div class="section-body" id="sellfish-body"></div>
    </div>
    <div class="section" data-section="sellgear" data-settings-category="assets" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u51FA\u552E\u88C5\u5907</strong></div>
      <div class="section-body" id="sellgear-body"></div>
    </div>
    <div class="section" data-section="general" data-settings-category="other" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u901A\u7528\u8F85\u52A9</strong></div>
      <div class="section-body" id="general-body"></div>
    </div>
    <div class="section" data-section="display" data-settings-category="other" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>\u663E\u793A\u4E0E\u7EDF\u8BA1</strong></div>
      <div class="section-body" id="display-body"></div>
    </div>
    <div class="section" data-section="about-version" data-settings-category="about">
      <div class="section-heading"><strong>\u7248\u672C\u4FE1\u606F</strong></div>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:7px;">
        <span id="script-version" role="button" tabindex="0" title="\u67E5\u770B\u7248\u672C\u66F4\u65B0\u5185\u5BB9" style="font-family:monospace;font-size:13px;font-weight:700;color:var(--as-tide-deep);cursor:pointer;text-decoration:underline;">\u5F53\u524D\u7248\u672C v${SCRIPT_VERSION}</span>
        <span class="bait-hint" id="hint-script-version">?</span>
      </div>
    </div>
    <div class="section" data-section="about-author" data-settings-category="about">
      <div class="section-heading"><strong>\u4F5C\u8005\u60F3\u8BF4\u7684\u8BDD</strong></div>
      <div style="font-size:12px;line-height:1.9;color:var(--as-text);">\u611F\u8C22\u63D0\u4F9B\u610F\u89C1\u5EFA\u8BAE\u3001\u63D0\u4F9B\u529F\u80FD\u7075\u611F\u3001\u5E2E\u5FD9\u6D4B\u8BD5\u811A\u672C\u7684\u5404\u4F4D\u8D5B\u535A\u9493\u53CB\uFF0C\u611F\u8C22\u63D0\u4F9B\u811A\u672C\u63A5\u53E3\u7684\u6E38\u620F\u4F5C\u8005\uFF0C\u611F\u8C22\u81EA\u7136\u8BED\u8A00\u7FFB\u8BD1\u5B98deepseek\u548Ccodex\u3002</div>
    </div>
    </div><!-- /view-settings -->
    <div id="view-feedback" style="display:none"></div>
    <div id="view-log" style="display:none">
      <div id="log-entries" style="overflow-y:auto;padding:4px 8px;font-family:monospace;font-size:11px;line-height:1.65;height:calc(100vh - 170px)"></div>
      <div class="log-toolbar">
        <div class="log-filter-row">
          <select id="log-tag-filter" title="\u4E00\u7EA7\u7B5B\u9009\uFF1A\u529F\u80FD\u533A"></select>
          <select id="log-action-filter" title="\u4E8C\u7EA7\u7B5B\u9009\uFF1A\u52A8\u4F5C"></select>
          <span id="log-size-hint"></span>
        </div>
        <div class="log-button-row">
          <button id="btn-copy-log" type="button" title="\u590D\u5236\u5F53\u524D\u7B5B\u9009\u540E\u663E\u793A\u7684\u5168\u90E8\u65E5\u5FD7">\u590D\u5236</button>
          <button id="btn-export-log" type="button" title="\u5BFC\u51FA\u5168\u90E8\u65E5\u5FD7\u4E3A .txt \u6587\u4EF6\uFF0C\u4E0A\u9650 100MB">\u5BFC\u51FA</button>
          <button id="btn-clear-log" type="button" title="\u6E05\u7A7A\u9762\u677F\u65E5\u5FD7\u7F13\u5B58">\u6E05\u7A7A</button>
          <button id="btn-pause-log" type="button" title="\u6682\u505C\u81EA\u52A8\u6EDA\u52A8\u5230\u5E95\u90E8">\u23F8 \u6682\u505C</button>
        </div>
      </div>
    </div>
  </div>
</aside>
<div id="update-popup" style="display:none;position:fixed;inset:0;z-index:2147483601;background:rgba(15,23,42,0.45);align-items:center;justify-content:center;">
  <div style="box-sizing:border-box;width:min(360px,calc(100vw - 48px));max-height:70vh;overflow:auto;background:var(--as-surface,#fffefa);border:1px solid var(--as-border,#d1dee7);border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,0.25);">
    <div id="update-popup-title" style="padding:12px 16px;font-size:14px;font-weight:700;border-bottom:1px solid var(--as-divider,#e4edf2);">\u66F4\u65B0\u8BF4\u660E</div>
    <div id="update-popup-body" style="padding:14px 16px;font-size:12px;line-height:1.8;white-space:pre-line;color:var(--as-text,#20354d);"></div>
    <div style="padding:10px 16px 14px;text-align:right;border-top:1px solid var(--as-divider,#e4edf2);">
      <button id="update-popup-close" type="button" style="padding:6px 18px;font-size:12px;font-weight:650;border:0;border-radius:3px;background:var(--as-tide,#52bac4);color:#fff;cursor:pointer;">\u77E5\u9053\u4E86</button>
    </div>
  </div>
</div>`;
  function renderSwitches() {
    if (!state.shadowRoot) return;
    const general = state.shadowRoot.getElementById("general-body");
    const display = state.shadowRoot.getElementById("display-body");
    if (!general || !display) return;
    general.innerHTML = "";
    display.innerHTML = "";
    const definitions = [
      { key: "autoGeneral", label: "\u542F\u7528\u901A\u7528\u8F85\u52A9", group: "general", hint: "\u603B\u5F00\u5173\u3002\u5173\u95ED\u540E\u505C\u6B62\u81EA\u52A8\u8865\u6746\u3001\u7B7E\u5230\u548C\u6240\u6709\u81EA\u52A8\u5F39\u7A97\u5904\u7406\uFF0C\u4F46\u4FDD\u7559\u4E0B\u9762\u5404\u9879\u914D\u7F6E\u3002" },
      { key: "autoRefill", label: "\u81EA\u52A8\u8865\u6746", group: "general", hint: "\u6746\u6570\u4F4E\u4E8E\u4E00\u534A\u6216\u672C\u8F6E\u7ED3\u675F\u65F6\u81EA\u52A8\u8865\u6EE1\u3002\u53D7\u901A\u7528\u8F85\u52A9\u603B\u5F00\u5173\u548C\u9876\u90E8\u6682\u505C\u63A7\u5236\u3002" },
      { key: "autoCheckIn", label: "\u6BCF\u65E5\u81EA\u52A8\u7B7E\u5230", group: "general", hint: "\u68C0\u6D4B\u5230\u5F53\u65E5\u5956\u52B1\u53EF\u9886\u53D6\u65F6\u81EA\u52A8\u7B7E\u5230\u3002" },
      { key: "autoDismissCompetition", label: "\u6BD4\u8D5B\u5F39\u7A97\u7A0D\u540E\u5904\u7406", group: "general", hint: "\u6BD4\u8D5B\u63D0\u9192\u51FA\u73B0\u65F6\u81EA\u52A8\u9009\u62E9\u7A0D\u540E\u5904\u7406\uFF0C\u907F\u514D\u906E\u6321\u9875\u9762\u3002" },
      { key: "autoDismissOffline", label: "\u81EA\u52A8\u5173\u95ED\u79BB\u7EBF\u7ED3\u7B97", group: "general", hint: "\u79BB\u7EBF\u7ED3\u7B97\u5F39\u7A97\u51FA\u73B0\u65F6\u81EA\u52A8\u786E\u8BA4\u6216\u5173\u95ED\u3002" },
      { key: "showEnhancements", label: "\u542F\u7528\u663E\u793A\u589E\u5F3A", group: "display", hint: "\u603B\u5F00\u5173\u3002\u5173\u95ED\u540E\u9690\u85CF\u4FDD\u5E95\u3001\u7406\u8BBA\u7AFF\u6570\u548C\u4ECA\u65E5\u76C8\u4E8F\uFF0C\u4E0D\u5F71\u54CD\u4EFB\u4F55\u6E38\u620F\u81EA\u52A8\u64CD\u4F5C\u3002" },
      { key: "showPity", label: "\u663E\u793A\u4FDD\u5E95\u8FDB\u5EA6", group: "display", hint: "\u5728\u81EA\u52A8\u9493\u9C7C\u533A\u57DF\u663E\u793A\u5947\u5F02/\u5965\u79D8\u4FDD\u5E95\u8FDB\u5EA6\u53CA\u5386\u53F2\u8BB0\u5F55\u3002" },
      { key: "showTheoreticalCasts", label: "\u663E\u793A\u7406\u8BBA\u7AFF\u6570/\u6389\u7AFF", group: "display", hint: "\u5728\u4ECA\u65E5\u6746\u6570\u65C1\u663E\u793A\u7406\u8BBA\u5728\u7EBF\u6746\u6570\u548C\u4F30\u7B97\u6389\u7AFF\u3002" },
      { key: "showBalance", label: "\u663E\u793A\u4ECA\u65E5\u51C0\u8D5A/\u76C8\u4E8F", group: "display", hint: "\u663E\u793A\u91D1\u5E01\u3001\u9057\u7269\u548C\u788E\u7247\u76F8\u5BF9\u4ECA\u65E5\u96F6\u70B9\u7684\u4F59\u989D\u53D8\u5316\u3002" },
      { key: "showGearPercent", label: "\u663E\u793A\u88C5\u5907\u5C5E\u6027\u5360\u6BD4", group: "display", hint: "\u5728\u88C5\u5907\u8BE6\u60C5\u7684\u529B\u91CF\u3001\u667A\u529B\u3001\u8FD0\u6C14\u3001\u8010\u529B\u6570\u503C\u65C1\u663E\u793A\u8BE5\u5C5E\u6027\u5360\u8FD9\u4EF6\u88C5\u5907\u56DB\u7EF4\u5C5E\u6027\u603B\u548C\u7684\u6BD4\u4F8B\u3002\u4EC5\u5904\u7406\u5B9E\u9645\u51FA\u73B0\u7684\u88C5\u5907\u8BE6\u60C5\uFF0C\u4E0D\u6301\u7EED\u626B\u63CF\u6574\u4E2A\u9875\u9762\u3002" },
      { key: "debugLog", label: "\u663E\u793A\u8C03\u8BD5\u65E5\u5FD7", group: "display", hint: "\u663E\u793A\u51B3\u7B56\u8FC7\u7A0B\u3001\u7F13\u5B58\u548C\u6570\u636E\u62E6\u622A\u7B49\u8BE6\u7EC6\u65E5\u5FD7\uFF1B\u5173\u95ED\u540E\u4ECD\u4FDD\u7559\u5B9E\u9645\u64CD\u4F5C\u65E5\u5FD7\u3002" }
    ];
    for (const item of definitions) {
      const ctr = item.group === "general" ? general : display;
      const row = document.createElement("label");
      row.className = "switch-item";
      if (item.key === "autoGeneral" || item.key === "showEnhancements") row.classList.add("master-switch");
      const span = document.createElement("span");
      span.textContent = item.label;
      span.appendChild(makeHint(item.hint));
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "sw-" + item.key;
      cb.checked = !!settings[item.key];
      cb.addEventListener("change", () => {
        settings[item.key] = cb.checked;
        saveSettings();
        applySettings();
      });
      row.appendChild(span);
      row.appendChild(cb);
      ctr.appendChild(row);
    }
  }
  function renderStatsSection() {
    if (!state.shadowRoot) return;
    const ctr = state.shadowRoot.getElementById("competition-body");
    if (!ctr) return;
    ctr.innerHTML = "";
    const addCompetitionSwitch = (key, label) => {
      const row = document.createElement("label");
      row.className = "switch-item";
      if (key === "autoCompetition") row.classList.add("master-switch");
      const span = document.createElement("span");
      span.textContent = label;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "sw-" + key;
      cb.checked = !!settings[key];
      cb.addEventListener("change", () => {
        settings[key] = cb.checked;
        saveSettings();
        applySettings();
        if (key === "autoCompetition" || key === "autoGuild" || key === "autoPersonal") renderPriorities();
      });
      row.appendChild(span);
      row.appendChild(cb);
      ctr.appendChild(row);
    };
    addCompetitionSwitch("autoCompetition", "\u542F\u7528\u6BD4\u8D5B\u8F85\u52A9");
    addCompetitionSwitch("autoPersonal", "\u81EA\u52A8\u8FDB\u5165\u4E2A\u4EBA\u8D5B");
    addCompetitionSwitch("autoGuild", "\u81EA\u52A8\u8FDB\u5165\u516C\u4F1A\u8D5B");
    addCompetitionSwitch("autoRegisterPersonal", "\u81EA\u52A8\u62A5\u540D\u4E2A\u4EBA\u8D5B");
    addCompetitionSwitch("autoRegisterGuild", "\u81EA\u52A8\u62A5\u540D\u516C\u4F1A\u8D5B\uFF08\u5B98\u5458\u53CA\u4EE5\u4E0A\uFF09");
    (() => {
      const row = document.createElement("label");
      row.className = "switch-item";
      const span = document.createElement("span");
      span.style.whiteSpace = "nowrap";
      const hint = makeHint(HINTS.respec);
      hint.style.margin = "0 4px";
      span.append(document.createTextNode("\u4E2A\u4EBA\u8D5B\u5168\u52A0\u5E78\u8FD0"), hint);
      row.appendChild(span);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "sw-autoRespecPersonal";
      cb.checked = !!settings.autoRespecPersonal;
      cb.addEventListener("change", () => {
        settings.autoRespecPersonal = cb.checked;
        saveSettings();
        applySettings();
      });
      row.appendChild(cb);
      ctr.appendChild(row);
    })();
    (() => {
      const row = document.createElement("label");
      row.className = "switch-item";
      const span = document.createElement("span");
      span.style.whiteSpace = "nowrap";
      const hint = makeHint(HINTS.respec);
      hint.style.margin = "0 4px";
      span.append(document.createTextNode("\u516C\u4F1A\u8D5B\u5168\u52A0\u5E78\u8FD0"), hint);
      row.appendChild(span);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "sw-autoRespecGuild";
      cb.checked = !!settings.autoRespecGuild;
      cb.addEventListener("change", () => {
        settings.autoRespecGuild = cb.checked;
        saveSettings();
        applySettings();
      });
      row.appendChild(cb);
      ctr.appendChild(row);
    })();
    (() => {
      const row1 = document.createElement("label");
      row1.className = "switch-item";
      const span1 = document.createElement("span");
      span1.style.whiteSpace = "nowrap";
      const hint = makeHint(HINTS.loadout);
      hint.style.background = "#ef4444";
      span1.append(document.createTextNode("\u6BD4\u8D5B\u81EA\u52A8\u5207\u914D\u88C5"), hint);
      row1.appendChild(span1);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "sw-autoLoadout";
      cb.checked = !!settings.autoLoadout;
      cb.addEventListener("change", () => {
        settings.autoLoadout = cb.checked;
        saveSettings();
        applySettings();
      });
      row1.appendChild(cb);
      ctr.appendChild(row1);
      const mkSel = (value, exclude, onPick) => {
        const sel = document.createElement("select");
        sel.style.cssText = "width:52px;height:22px;margin-left:8px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;";
        for (let i = 1; i <= 4; i++) {
          if (i === exclude) continue;
          const o = document.createElement("option");
          o.value = String(i);
          o.textContent = "#" + i;
          if (value === i) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener("change", () => onPick(Number(sel.value)));
        return sel;
      };
      const row2 = document.createElement("label");
      row2.className = "switch-item";
      const span2 = document.createElement("span");
      span2.textContent = "\u6BD4\u8D5B\u914D\u88C5";
      span2.appendChild(makeHint("\u8FDB\u5165\u6BD4\u8D5B\u5730\u56FE\u540E\u4F7F\u7528\u7684\u914D\u88C5\u3002"));
      row2.appendChild(span2);
      row2.appendChild(mkSel(settings.loadoutSlot, settings.loadoutAfter, (v) => {
        settings.loadoutSlot = v;
        saveSettings();
        if (settings.autoLoadout && onAnyCompMap()) switchLoadout(settings.loadoutSlot);
        renderStatsSection();
      }));
      ctr.appendChild(row2);
      const row3 = document.createElement("label");
      row3.className = "switch-item";
      const span3 = document.createElement("span");
      span3.textContent = "\u65E5\u5E38\u914D\u88C5";
      span3.appendChild(makeHint("\u79BB\u5F00\u6BD4\u8D5B\u5730\u56FE\u540E\u5207\u56DE\u7684\u914D\u88C5\u3002"));
      row3.appendChild(span3);
      row3.appendChild(mkSel(settings.loadoutAfter, settings.loadoutSlot, (v) => {
        settings.loadoutAfter = v;
        saveSettings();
        renderStatsSection();
      }));
      ctr.appendChild(row3);
    })();
  }
  function renderAttributeSection() {
    if (!state.shadowRoot) return;
    const ctr = state.shadowRoot.getElementById("stats-section-body");
    if (!ctr) return;
    ctr.innerHTML = "";
    const row = document.createElement("label");
    row.className = "switch-item master-switch";
    const left = document.createElement("span");
    left.textContent = "\u542F\u7528\u81EA\u52A8\u5206\u914D\u5C5E\u6027\u70B9";
    left.appendChild(makeHint("\u5347\u7EA7\u65F6\u6309\u4E0B\u9762\u7684\u987A\u5E8F\u8865\u9F50\u7F51\u9875\u6700\u7EC8\u663E\u793A\u5C5E\u6027\u3002\u76EE\u6807\u4F1A\u6263\u9664\u9C7C\u7AFF\u3001\u88C5\u5907\u3001\u4E2A\u4EBA\u5956\u676F\u3001\u516C\u4F1A\u5956\u676F\u3001\u56FE\u817E\u548C\u5F53\u524D\u9C7C\u9975\u7B49\u975E\u5C5E\u6027\u70B9\u52A0\u6210\u540E\uFF0C\u53CD\u7B97\u9700\u8981\u6295\u5165\u7684\u5C5E\u6027\u70B9\u3002\u53D7\u56FE\u817E\u6BD4\u4F8B\u53D6\u6574\u5F71\u54CD\uFF0C\u5B9E\u9645\u503C\u5141\u8BB8\u6BD4\u76EE\u6807\u9AD8\u6700\u591A 3 \u70B9\u3002\u5F00\u542F\u6BD4\u8D5B\u5168\u52A0\u5E78\u8FD0\u540E\uFF0C\u6BD4\u8D5B\u671F\u95F4\u4E34\u65F6\u8986\u76D6\u672C\u65B9\u6848\uFF0C\u7ED3\u675F\u540E\u81EA\u52A8\u6062\u590D\u3002"));
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "sw-autoAllocateStats";
    cb.checked = !!settings.autoAllocateStats;
    cb.addEventListener("change", () => {
      settings.autoAllocateStats = cb.checked;
      saveSettings();
      applySettings();
      if (cb.checked) refreshPlayerStatsAndAllocate("\u542F\u7528\u81EA\u52A8\u5206\u914D");
    });
    row.appendChild(left);
    row.appendChild(cb);
    ctr.appendChild(row);
    const order = settings.statAllocationOrder || ["strength", "intelligence", "endurance", "luck"];
    const move = (index, delta) => {
      const next = [...order];
      const to = index + delta;
      if (to < 0 || to >= next.length) return;
      [next[index], next[to]] = [next[to], next[index]];
      settings.statAllocationOrder = next;
      settings.postRespecRemainderStat = next[next.length - 1];
      saveSettings();
      renderAttributeSection();
      if (settings.autoAllocateStats) refreshPlayerStatsAndAllocate("\u8C03\u6574\u5206\u914D\u987A\u5E8F");
    };
    order.forEach((stat, index) => {
      const item = document.createElement("div");
      item.className = "switch-item";
      const name = document.createElement("span");
      name.textContent = `${index + 1}. ${STAT_LABELS[stat]}`;
      name.appendChild(makeHint("\u586B\u5199\u5E0C\u671B\u7F51\u9875\u6700\u7EC8\u663E\u793A\u7684\u5C5E\u6027\u503C\uFF1B\u8FD0\u6C14\u4F1A\u8BA1\u7B97\u5F53\u524D\u9C7C\u9975\u52A0\u6210\u3002\u7CFB\u7EDF\u4F1A\u6263\u9664\u6240\u6709\u53EF\u8BC6\u522B\u7684\u975E\u5C5E\u6027\u70B9\u52A0\u6210\u5E76\u53CD\u7B97\u6240\u9700\u5C5E\u6027\u70B9\uFF1B\u8FD9\u4E9B\u52A0\u6210\u5DF2\u7ECF\u8FBE\u5230\u6216\u8D85\u8FC7\u76EE\u6807\u65F6\uFF0C\u672C\u9879\u6295\u5165\u4E3A 0\u3002\u53D7\u56FE\u817E\u6BD4\u4F8B\u53D6\u6574\u5F71\u54CD\uFF0C\u5B9E\u9645\u503C\u53EF\u80FD\u6BD4\u76EE\u6807\u9AD8\u6700\u591A 3 \u70B9\u3002"));
      const controls = document.createElement("span");
      controls.style.cssText = "display:flex;align-items:center;gap:4px;";
      if (index === order.length - 1) {
        const rest = document.createElement("strong");
        rest.textContent = "\u5269\u4F59\u5168\u90E8";
        rest.style.cssText = "font-size:11px;color:var(--as-tide-deep);";
        controls.appendChild(rest);
      } else {
        const minimum = getStatPanelMinimum(stat);
        const configured = Math.max(minimum, Math.floor(Number(settings.postRespecFixed?.[stat]) || 0));
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(minimum);
        input.step = "100";
        input.value = configured;
        input.title = `\u5F53\u524D\u975E\u5347\u7EA7\u5C5E\u6027\u70B9\u63D0\u4F9B ${minimum.toLocaleString("zh-CN")}\uFF0C\u76EE\u6807\u4E0D\u80FD\u4F4E\u4E8E\u6B64\u503C`;
        input.style.cssText = "appearance:auto;width:68px;height:22px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;";
        input.addEventListener("change", () => {
          const v = Math.max(minimum, Math.floor(Number(input.value) || 0));
          input.value = v;
          settings.postRespecFixed = { ...settings.postRespecFixed || {}, [stat]: v };
          saveSettings();
          if (settings.autoAllocateStats) refreshPlayerStatsAndAllocate("\u4FEE\u6539\u5C5E\u6027\u76EE\u6807");
        });
        controls.appendChild(input);
      }
      for (const [glyph, delta, title] of [["\u2191", -1, "\u63D0\u9AD8\u4F18\u5148\u7EA7"], ["\u2193", 1, "\u964D\u4F4E\u4F18\u5148\u7EA7"]]) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = glyph;
        btn.title = title;
        btn.disabled = index + delta < 0 || index + delta >= order.length;
        btn.style.cssText = "width:22px;height:22px;padding:0;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;";
        btn.addEventListener("click", () => move(index, delta));
        controls.appendChild(btn);
      }
      item.append(name, controls);
      ctr.appendChild(item);
    });
  }
  bus.on("stats:updated", () => {
    if (state.shadowRoot) renderAttributeSection();
  });
  bus.on("stats:targets-normalized", () => {
    if (state.shadowRoot) renderAttributeSection();
  });

  // src/features/dip.js
  function witherDipActive() {
    if (!settings.autoCompetition || !settings.autoPersonal) return false;
    if (settings.skipWitherTidePersonal) {
      const cur = getActiveComp("personal");
      const compBiomeId = cur ? getCompetitionBiomeId(cur) : null;
      if (!compBiomeId) return false;
      const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
      const biome = snap?.biomes?.find((b) => b.id === compBiomeId);
      if (biome?.weather?.id === "wither_tide") return true;
    }
    const seq = getPersonalCompContext()?.sequence || "";
    if (seq && settings.witherTideDipPersonal && state._witherDipSeq === seq) return true;
    if (seq && settings.dipPersonal && state._dipSeq === seq) return true;
    return false;
  }
  function shouldSkipComp(ct) {
    if (!settings.autoCompetition || !settings.autoPersonal || !ct) return "";
    if (isPersonalBlocked()) return "\u8239\u961F\u8E6D\u5956\u5DF2\u5C4F\u853D";
    const seq = getPersonalCompContext()?.sequence || "";
    if (ct.weather?.id === "wither_tide") {
      if (settings.skipWitherTidePersonal) return "\u67AF\u6F6E\u8DF3\u8FC7";
      if (seq && settings.witherTideDipPersonal && state._witherDipSeq === seq) return "\u5DF2\u8E6D\u5956";
    }
    if (seq && settings.dipPersonal && state._dipSeq === seq) return "\u5DF2\u8E6D\u5956";
    return "";
  }
  function resetDipIfEnded(oldScene) {
    if (oldScene !== "personalCompetition") return false;
    let changed = false;
    if (state._witherDipSeq) {
      state._witherDipSeq = "";
      L.map("\u67AF\u6F6E\u8E6D\u5956: \u6BD4\u8D5B\u7ED3\u675F\uFF0C\u91CD\u7F6E");
      changed = true;
    }
    if (state._dipSeq) {
      state._dipSeq = "";
      L.map("\u4E2A\u4EBA\u8D5B\u8E6D\u5956: \u6BD4\u8D5B\u7ED3\u675F\uFF0C\u91CD\u7F6E");
      changed = true;
    }
    return changed;
  }
  function updatePartyDip(snap) {
    if (!settings.autoCompetition || !settings.partyDipPersonal || !settings.autoPersonal) return;
    if (!snap?.party?.isInParty || !isBoatLeader(snap.party)) return;
    const ctx = getPersonalCompContext();
    if (!ctx) {
      if (state._partyDipSeq) {
        state._partyDipSeq = "";
        state._partyDipStartAt = 0;
      }
      if (state._partyBlockedSeq) state._partyBlockedSeq = "";
      return;
    }
    const onCompMap = snap.party.boatBiomeId === ctx.biomeId;
    if (!onCompMap) {
      if (state._partyDipSeq === ctx.sequence) {
        state._partyDipSeq = "";
        state._partyDipStartAt = 0;
      }
      return;
    }
    if (state._partyBlockedSeq === ctx.sequence) return;
    if (state._partyDipSeq !== ctx.sequence) {
      state._partyDipSeq = ctx.sequence;
      state._partyDipStartAt = Date.now();
      L.map(`\u8239\u961F\u8E6D\u5956: \u5F00\u59CB\u8BA1\u65F6 ${settings.partyDipMinutes} \u5206\u949F`);
      return;
    }
    if (Date.now() - state._partyDipStartAt >= settings.partyDipMinutes * 60 * 1e3) {
      state._partyBlockedSeq = ctx.sequence;
      OpLog.info("\u5207\u56FE", `\u8239\u961F\u8E6D\u5956: \u5DF2\u5F85 ${settings.partyDipMinutes} \u5206\u949F\uFF0C\u5C4F\u853D\u672C\u6B21\u4E2A\u4EBA\u8D5B`);
      checkRespecStart();
    }
  }
  function makeDecision(game) {
    if (!settings.autoSwitchMap) return;
    if (state.paused) {
      L.map("\u5DF2\u6682\u505C\uFF0C\u8DF3\u8FC7\u81EA\u52A8\u5207\u56FE");
      return;
    }
    const snap = game.getSnapshot();
    if (!snap?.biomes) {
      L.map("\u5FEB\u7167\u65E0\u6570\u636E");
      return;
    }
    updatePartyDip(snap);
    if (snap.party?.isInParty && snap.currentBiomeId !== snap.party.boatBiomeId) {
      const boatBiome = snap.biomes.find((b) => b.id === snap.party.boatBiomeId);
      if (witherDipActive()) {
        L.map("\u8DF3\u8FC7/\u8E6D\u5956\u4E2D\uFF0C\u4E0D\u5F52\u961F");
        return;
      }
      OpLog.info("\u5207\u56FE", "\u79BB\u8239\u5F52\u961F (" + snap.currentBiomeId + "\u2192" + snap.party.boatBiomeId + ")");
      game.biomes.travelTo(snap.party.boatBiomeId).then(() => {
        updateState({ lastSwitchTime: Date.now() });
        evaluateBait();
      }).catch((err) => error("\u5F52\u961F\u5931\u8D25:", err.message));
      return;
    }
    if (snap.party?.isInParty && !isBoatLeader(snap.party)) {
      L.map("\u8239\u5458\u6A21\u5F0F\uFF0C\u8DDF\u968F\u8239\u961F\u4E0D\u4E3B\u52A8\u5207\u56FE");
      return;
    }
    if (settings.autoPartyTravel && !isBoatLeader(snap.party)) {
      settings.autoPartyTravel = false;
      saveSettings();
      const swp = state.shadowRoot?.getElementById("sw-autoPartyTravel");
      if (swp) swp.checked = false;
      renderPriorities();
      updateModeStatus(snap);
      L.map("\u5DF2\u9000\u51FA\u8239\u961F\uFF0C\u81EA\u52A8\u5207\u56DE\u4E2A\u4EBA\u6A21\u5F0F");
    }
    let unlocked = snap.biomes.filter((b) => b.isUnlocked);
    if (!unlocked.length) {
      L.map("\u65E0\u5DF2\u89E3\u9501\u5730\u56FE");
      return;
    }
    const now = Date.now();
    let target = null, tt = "";
    const compOk = settings.autoCompetition && (settings.autoGuild || settings.autoPersonal);
    const hasCompData = !!((!settings.autoPersonal || state.competitionCache.personal) && (!settings.autoGuild || state.competitionCache.guild));
    const partyMode = settings.autoPartyTravel && isBoatLeader(snap.party);
    if (partyMode) {
      const unavailable = getPartyUnavailableReason(snap.party);
      if (unavailable) {
        if (state.partyTravelUnavailableReason !== unavailable) OpLog.warn("\u5207\u56FE", unavailable + "\uFF0C\u5DF2\u6682\u505C\u8239\u961F\u81EA\u52A8\u5207\u56FE");
        updateState({ partyTravelUnavailableReason: unavailable });
        updateModeStatus(snap);
        return;
      }
      if (state.partyTravelUnavailableReason) {
        OpLog.info("\u5207\u56FE", "\u8239\u961F\u72B6\u6001\u5DF2\u6062\u590D\uFF0C\u7EE7\u7EED\u81EA\u52A8\u5207\u56FE");
        updateState({ partyTravelUnavailableReason: "" });
        updateModeStatus(snap);
      }
    } else if (state.partyTravelUnavailableReason) {
      updateState({ partyTravelUnavailableReason: "" });
      updateModeStatus(snap);
    }
    const priority = partyMode ? settings.partyMapPriority || DEFAULTS.partyMapPriority : settings.mapPriority || DEFAULTS.mapPriority;
    const currentId = partyMode ? snap.party.boatBiomeId : snap.currentBiomeId;
    if (settings.partyLimitByCrew && partyMode) {
      if (Date.now() - state._partyLevelAt > 18e4) {
        state._partyLevelAt = Date.now();
        apiFetch("/api/party-boats/overview").then((d) => {
          const members = d?.crew?.members;
          if (Array.isArray(members) && members.length) {
            let lowest = null;
            for (const m of members) {
              const lv = m?.identity?.level;
              if (typeof lv === "number" && (lowest === null || lv < lowest)) lowest = lv;
            }
            updateState({ partyLowestLevel: lowest, _partyLevelAt: Date.now() });
          } else {
            updateState({ partyLowestLevel: null, _partyLevelAt: Date.now() });
          }
          if (state.appGame && settings.autoSwitchMap && !state.paused) makeDecision(state.appGame);
        }).catch(() => {
        });
      }
      if (state.partyLowestLevel != null) {
        unlocked = unlocked.filter((b) => typeof b.requiredLevel !== "number" || b.requiredLevel <= state.partyLowestLevel);
        if (!unlocked.length) {
          L.map(`\u9650\u56FE\uFF1A\u6700\u4F4E\u8239\u5458 Lv.${state.partyLowestLevel} \u65E0\u53EF\u53BB\u5730\u56FE\uFF0C\u4FDD\u6301\u5F53\u524D`);
          return;
        }
        L.map(`\u9650\u56FE\uFF1A\u6700\u4F4E\u8239\u5458 Lv.${state.partyLowestLevel}\uFF0C\u53EF\u9009 ${unlocked.length} \u5F20`);
      } else {
        L.map("\u9650\u56FE\uFF1A\u8239\u5458\u7B49\u7EA7\u672A\u77E5\uFF0C\u7B49\u5F85\u4E0B\u6B21\u51B3\u7B56");
        return;
      }
    }
    L.map(`\u5F00\u59CB\u51B3\u7B56: \u6A21\u5F0F=${partyMode ? "\u8239\u961F" : "\u4E2A\u4EBA"} current=${currentId} priority=[${priority.join("\u2192")}]`);
    let dataPending = false, skipWither = false;
    for (const pt of priority) {
      if (target) break;
      switch (pt) {
        case "competition": {
          if (!compOk) break;
          if (!hasCompData) {
            L.map(`\u2192 competition: \u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u5F85\u5B9A`);
            dataPending = true;
            break;
          }
          const ct = getCompetitionTarget(unlocked, currentId);
          const skipReason = ct && ct.kind === "personal" ? shouldSkipComp(ct.biome) : "";
          if (skipReason) {
            L.map(`\u2192 competition: ${skipReason}\uFF0C\u8DF3\u8FC7 (${ct.biome.name || ct.biome.id})`);
            skipWither = true;
            break;
          }
          if (ct && ct.kind === "personal") {
            const seq = getPersonalCompContext()?.sequence || "";
            if (settings.witherTideDipPersonal && state._witherDipSeq !== seq && ct.biome.weather?.id === "wither_tide")
              L.map(`\u2192 competition: \u67AF\u6F6E\u8E6D\u5956\u7B49\u5F85\u9996\u7AFF (${ct.biome.name || ct.biome.id})`);
            else if (settings.dipPersonal && state._dipSeq !== seq)
              L.map(`\u2192 competition: \u8E6D\u5956\u7B49\u5F85\u9996\u7AFF (${ct.biome.name || ct.biome.id})`);
          }
          if (ct) {
            target = ct.biome;
            tt = "\u{1F3C1} \u6BD4\u8D5B";
            L.map(`\u2192 competition: \u2705 ${ct.biome.name || ct.biome.id}`);
          } else L.map(`\u2192 competition: \u65E0\u62A5\u540D\u6BD4\u8D5B`);
          break;
        }
        case "designated": {
          const bid = partyMode ? settings.partyDesignatedBiomeId : settings.designatedBiomeId;
          if (bid) {
            const b = unlocked.find((u) => u.id === bid);
            if (b) {
              target = b;
              tt = "\u{1F3AF} \u6307\u5B9A\u56FE";
              L.map(`\u2192 designated: \u2705 ${b.name}`);
            } else L.map(`\u2192 designated: ${bid} \u6709\u8239\u5458\u672A\u89E3\u9501`);
          } else L.map(`\u2192 designated: \u672A\u6307\u5B9A`);
          break;
        }
        case "goldwind": {
          const g = unlocked.filter((b) => b.weather?.id === "gilded_current");
          if (g.length) {
            target = g.reduce((a, b) => a.id > b.id ? a : b);
            tt = "\u{1F4B0} \u91D1\u98CE";
            L.map(`\u2192 goldwind: \u2705 ${g.length}\u5F20`);
          } else L.map(`\u2192 goldwind: \u65E0`);
          break;
        }
        case "experience": {
          const nid = (x) => parseInt(x.id.replace(/\D/g, ""), 10) || 0;
          unlocked.sort((a, b) => calculateTotalExpBonus(b) - calculateTotalExpBonus(a) || nid(b) - nid(a));
          target = unlocked[0];
          tt = "\u{1F4C8} \u7ECF\u9A8C";
          const excl = [];
          if (settings.excludeMasteryBonus) excl.push("\u4E13\u7CBE");
          if (settings.excludeGuildBoost) excl.push("\u516C\u4F1A");
          L.map(`\u2192 experience: \u2705 ${target.name} (${formatBasisPoints(calculateTotalExpBonus(target))})${excl.length ? " [\u6392\u9664:" + excl.join("+") + "]" : ""}`);
          break;
        }
        case "gold": {
          target = unlocked.reduce((a, b) => a.id > b.id ? a : b);
          tt = "\u{1FA99} \u91D1\u5E01";
          L.map(`\u2192 gold: \u515C\u5E95 ${target.name}`);
          break;
        }
        case "strengthluck": {
          const nid = (x) => parseInt(x.id.replace(/\D/g, ""), 10) || 0;
          const arcaneMaps = unlocked.filter((b) => b.weather?.id === "arcane_surge");
          if (arcaneMaps.length) {
            target = arcaneMaps.reduce((a, b) => nid(a) > nid(b) ? a : b);
            tt = "\u{1F4AA} \u529B\u8FD0";
            L.map(`\u2192 strengthluck: \u5965\u79D8\u6D8C\u6D41 \u2192 \u6700\u9AD8\u7B49\u7EA7 ${target.name}`);
            break;
          }
          let best = null, bestScore = -1;
          for (const b of unlocked) {
            const vm = BIOME_VALUE_MULTIPLIER[b.id] || 1;
            const wf = STRENGTHLUCK_WEATHER_FACTOR[b.weather?.id] || 1;
            const score = vm * wf;
            if (score > bestScore) {
              bestScore = score;
              best = b;
            }
          }
          target = best;
          tt = "\u{1F4AA} \u529B\u8FD0";
          L.map(`\u2192 strengthluck: \u2705 ${target.name} (${WEATHER_ID_TO_NAME[target.weather?.id] || "?"} \u4EF7\u503C\xD7${BIOME_VALUE_MULTIPLIER[target.id] || 1})`);
          break;
        }
      }
    }
    if (!target) {
      L.map("\u65E0\u76EE\u6807");
      return;
    }
    if (dataPending) {
      L.map(`\u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u653E\u5F03 (\u76EE\u6807=${target.name})`);
      return;
    }
    if (target.id === currentId) {
      L.map(`\u5DF2\u5728\u76EE\u6807 ${target.name}`);
      return;
    }
    const usePartyTravel = partyMode && !skipWither;
    if (usePartyTravel && state.partyTravelInProgress) {
      L.map(`\u8239\u961F\u5207\u56FE\u8FDB\u884C\u4E2D (${state.partyTravelTarget || "\u672A\u77E5\u76EE\u6807"})\uFF0C\u8DF3\u8FC7\u91CD\u590D\u8BF7\u6C42`);
      return;
    }
    OpLog.info("\u5207\u56FE", "\u{1F504} \u5207\u6362" + (usePartyTravel ? "(\u8239\u961F)" : "") + " " + tt + ": " + currentId + " \u2192 " + target.id);
    if (usePartyTravel) updateState({ partyTravelInProgress: true, partyTravelTarget: target.id });
    const travel = usePartyTravel ? game.party.travelTo(target.id) : game.biomes.travelTo(target.id);
    travel.then((result) => {
      updateState({ lastSwitchTime: Date.now() });
      if (usePartyTravel && result?.changed === false) L.map(`\u8239\u961F\u4F4D\u7F6E\u672A\u53D8\u5316\uFF0C\u4ECD\u5728 ${result.currentBoatBiomeId || currentId}`);
      evaluateBait();
    }).catch((err) => {
      const code = err?.code || "";
      const msg = err?.message || String(err);
      const unavailable = code === "PARTY_BOAT_RENTAL_EXPIRED" || /租赁.*到期/.test(msg) ? "\u8239\u961F\u79DF\u8D41\u5DF2\u5230\u671F\uFF0C\u8BF7\u7EED\u79DF\u540E\u518D\u5207\u56FE" : code === "PARTY_BOAT_MAINTENANCE_DUE" || /停航|保养/.test(msg) ? "\u8239\u53EA\u5DF2\u505C\u822A\u5F85\u4FDD\u517B\uFF0C\u8BF7\u5B8C\u6210\u4FDD\u517B\u540E\u518D\u5207\u56FE" : code === "PARTY_BOAT_NOT_ACTIVE" || /未运营|不可用/.test(msg) ? "\u8239\u961F\u5F53\u524D\u4E0D\u53EF\u7528\uFF0C\u8BF7\u6062\u590D\u8FD0\u8425\u540E\u518D\u5207\u56FE" : "";
      if (usePartyTravel && unavailable) {
        if (state.partyTravelUnavailableReason !== unavailable) OpLog.warn("\u5207\u56FE", unavailable + "\uFF0C\u5DF2\u6682\u505C\u8239\u961F\u81EA\u52A8\u5207\u56FE");
        updateState({ partyTravelUnavailableReason: unavailable });
        updateModeStatus(game.getSnapshot());
      } else error("\u5207\u6362\u5931\u8D25:", msg);
    }).finally(() => {
      if (usePartyTravel) updateState({ partyTravelInProgress: false, partyTravelTarget: "" });
    });
  }

  // src/features/fishing.js
  var _refillTimer = null;
  onTeardown(() => stopRefill());
  function stopRefill() {
    if (_refillTimer) {
      clearTimeout(_refillTimer);
      _refillTimer = null;
    }
  }
  function scheduleRefill() {
    stopRefill();
    if (!settings.autoGeneral || !settings.autoRefill || state.paused) return;
    const g = state.appGame || window.arcaneReelax;
    if (!g?.fishing?.refill) return;
    const snap = g.getSnapshot();
    const f = snap?.fishing;
    if (!f || f.status === "stopped") return;
    L.refill(`\u8865\u6746\u68C0\u67E5: ${f.remainingCasts}/${f.totalCasts} status=${f.status}`);
    if (f.status === "completed" || f.remainingCasts < f.totalCasts / 2) {
      g.fishing.refill().then((ok) => {
        if (ok) OpLog.info("\u8865\u6746", "\u2705 \u5DF2\u8865\u6EE1");
      }).catch((e) => {
        OpLog.error("\u8865\u6746", "\u8865\u6746\u5931\u8D25: " + (e?.message || e));
      });
      _refillTimer = setTimeout(scheduleRefill, 5e3);
      return;
    }
    if (f.nextCastAt && f.cycleDurationMs > 0) {
      const nextCast = Date.parse(f.nextCastAt);
      if (Number.isFinite(nextCast)) {
        const until = Math.floor(f.remainingCasts - f.totalCasts / 2) + 1;
        const dueAt = nextCast + Math.max(0, until - 1) * f.cycleDurationMs + 2e3;
        _refillTimer = setTimeout(scheduleRefill, Math.min(Math.max(5e3, dueAt - Date.now()), 2147e6));
        return;
      }
    }
    _refillTimer = setTimeout(scheduleRefill, 3e4);
  }
  function fishingSig(snap) {
    const f = snap?.fishing;
    if (!f) return "";
    return [f.status, f.mode, f.totalCasts, f.remainingCasts, f.cycleDurationMs, f.nextCastAt].join(":");
  }
  function activeBuffGroup(b) {
    if (b.source === "player_shop") return null;
    if (b.displayDescription && b.displayDescription.includes("\u788E\u7247")) return "fragment";
    return b.buffType;
  }
  async function checkAndBuyBuffs() {
    if (!settings.autoBuyBuffs) return;
    const compSel = Object.keys(settings.buffSelections?.competition || {}).filter((k) => settings.buffSelections.competition[k]);
    const key = onAnyCompMap() && compSel.length ? "competition" : state.currentWeatherId;
    const sel = key === "competition" ? compSel : Object.keys(settings.buffSelections?.[key] || {}).filter((k) => settings.buffSelections[key]?.[k]);
    if (!sel.length) return;
    if (state.buffCheckInProgress) return;
    const now = Date.now();
    const cooled = sel.filter((k) => {
      const group = BUFF_CONFIG[k]?.group;
      if (!group) return false;
      if (buffTypeCooldown.isCooling(group, now)) {
        L.buff(`${BUFF_CONFIG[k]?.name || k} \u51B7\u5374\u4E2D\u2192\u8DF3\u8FC7`);
        return false;
      }
      return true;
    });
    if (!cooled.length) return;
    const activeGroups = /* @__PURE__ */ new Map();
    const activeBuffs = state._activeBuffs || [];
    let malformed = false;
    for (const b of activeBuffs) {
      if (!b.buffType || !b.endsAt) {
        malformed = true;
        continue;
      }
      if (new Date(b.endsAt).getTime() > now) {
        const g = activeBuffGroup(b);
        if (!g) continue;
        state.buffExpiryCache.set(g, b.endsAt);
        activeGroups.set(g, b.endsAt);
      }
    }
    if (malformed && activeBuffs.length > 0) {
      warn("[Buff] activeBuffs \u7ED3\u6784\u5F02\u5E38\uFF08\u7F3A\u5C11 buffType/endsAt\uFF09\uFF0C\u672C\u6B21\u8DF3\u8FC7\u8D2D\u4E70\u4EE5\u514D\u8BEF\u5224");
      return;
    }
    for (const [g] of state.buffExpiryCache) {
      if (!activeGroups.has(g)) state.buffExpiryCache.delete(g);
    }
    let needBuy = cooled.filter((k) => {
      const group = BUFF_CONFIG[k]?.group;
      if (!group) return false;
      if (activeGroups.has(group)) {
        L.buff(`${BUFF_CONFIG[k]?.name || k} \u9A8C\u7B97\u6D3B\u8DC3\u2192\u8DF3\u8FC7`);
        return false;
      }
      const cachedExpiry = state.buffExpiryCache.get(group);
      if (cachedExpiry && new Date(cachedExpiry).getTime() > now) {
        L.buff(`${BUFF_CONFIG[k]?.name || k} \u7F13\u5B58\u6709\u6548\u2192\u8DF3\u8FC7`);
        return false;
      }
      return true;
    });
    if (!needBuy.length) return;
    const relicBuffs = needBuy.filter((k) => !BUFF_CONFIG[k]?.currency);
    const fragmentBuffs = needBuy.filter((k) => BUFF_CONFIG[k]?.currency === "fragments");
    const minRelic = relicBuffs.length ? Math.min(...relicBuffs.map((k) => BUFF_CONFIG[k]?.price ?? Infinity)) : Infinity;
    const minFrag = fragmentBuffs.length ? Math.min(...fragmentBuffs.map((k) => BUFF_CONFIG[k]?.price ?? Infinity)) : Infinity;
    if (relicBuffs.length && state.playerRelics < minRelic) {
      L.buff(`\u9057\u7269\u4E0D\u8DB3`);
      needBuy = needBuy.filter((k) => !relicBuffs.includes(k));
    }
    if (fragmentBuffs.length && state.playerFragments < minFrag) {
      L.buff(`\u788E\u7247\u4E0D\u8DB3`);
      needBuy = needBuy.filter((k) => !fragmentBuffs.includes(k));
    }
    if (!needBuy.length) return;
    state.buffCheckInProgress = true;
    try {
      OpLog.info("Buff", "\u9A8C\u7B97\u901A\u8FC7\uFF0C\u8D2D\u4E70 " + needBuy.length + " \u4E2ABuff");
      for (const k of needBuy) {
        const cfg = BUFF_CONFIG[k];
        if (!cfg) continue;
        const balance = cfg.currency === "fragments" ? state.playerFragments : state.playerRelics;
        if (balance < cfg.price) {
          OpLog.warn("Buff", "\u4F59\u989D\u4E0D\u8DB3\uFF0C\u8DF3\u8FC7 " + cfg.name);
          continue;
        }
        try {
          const r = await apiFetch("/api/shop/purchases", { method: "POST", idempotencyKey: generateIdempotencyKey(`buy-${k}`), body: { productId: k } });
          if (r.balances?.relics !== void 0) updateState({ playerRelics: r.balances.relics });
          if (r.balances?.fragments !== void 0) updateState({ playerFragments: r.balances.fragments });
          if (cfg.group) {
            buffTypeCooldown.set(cfg.group, now + BUFF_COOLDOWN_MS);
          }
          OpLog.info("Buff", "\u2705 \u8D2D\u4E70\u6210\u529F: " + cfg.name);
        } catch (e) {
          OpLog.error("Buff", "\u8D2D\u4E70\u5931\u8D25: " + cfg.name + " \u2014 " + e.message);
        }
      }
    } finally {
      updateState({ buffCheckInProgress: false });
    }
  }

  // src/features/dialogs.js
  async function attemptDailyCheckIn() {
    if (!settings.autoGeneral || !settings.autoCheckIn || state.paused) return;
    const api = state.appGame || window.arcaneReelax;
    if (!api) return;
    const snap = api.getSnapshot();
    if (!snap?.dailyCheckIn?.canClaim) {
      L.dlg(`\u7B7E\u5230\u68C0\u67E5: canClaim=${snap?.dailyCheckIn?.canClaim ?? "null"} checkedIn=${snap?.dailyCheckIn?.checkedInToday ?? "null"}`);
      return;
    }
    if (typeof api.dailyCheckIn?.claim !== "function") return;
    try {
      const ok = await api.dailyCheckIn.claim();
      if (ok) {
        api.ui?.dismissReminder?.("daily-check-in");
        OpLog.info("\u7B7E\u5230", "\u2705 \u6BCF\u65E5\u7B7E\u5230\u5DF2\u9886\u53D6");
      }
    } catch (e) {
      OpLog.error("\u7B7E\u5230", "\u9886\u53D6\u5931\u8D25: " + e.message);
    }
  }
  function dismissCompetitionReminder() {
    if (!settings.autoGeneral || !settings.autoDismissCompetition || state.paused) return;
    const api = state.appGame || window.arcaneReelax;
    api?.ui?.dismissReminder?.("competition");
  }
  function handleCompetitionPopup() {
    if (!settings.autoGeneral || !settings.autoDismissCompetition || state.paused) return;
    const d = document.querySelector(".competition-reminder-dialog");
    if (!d) return;
    const b = d.querySelector("button.secondary-button");
    if (b && !b.disabled) b.click();
  }
  function handleOfflineSummary() {
    if (!settings.autoGeneral || !settings.autoDismissOffline || state.paused) return;
    const d = document.querySelector("dialog.offline-summary-dialog");
    if (!d) return;
    const p = d.querySelector("footer button.primary-button");
    if (p && !p.disabled) {
      p.click();
      return;
    }
    const s = d.querySelector("footer button.secondary-button");
    if (s && !s.disabled) {
      s.click();
      return;
    }
    const c = d.querySelector('header button[aria-label*="\u5173\u95ED"]');
    if (c && !c.disabled) {
      c.click();
      return;
    }
    try {
      d.close();
    } catch (_) {
    }
  }
  function checkAllDialogs() {
    handleCompetitionPopup();
    handleOfflineSummary();
  }
  function startDomObserver() {
    stopDomObserver();
    checkAllDialogs();
    state.domObserver = new MutationObserver(() => {
      const n = Date.now();
      if (n - state.domObserverThrottle < 1e3) return;
      updateState({ domObserverThrottle: n });
      checkAllDialogs();
    });
    state.domObserver.observe(document.body, { childList: true, subtree: true });
    onTeardown(() => stopDomObserver());
  }
  function stopDomObserver() {
    if (state.domObserver) {
      state.domObserver.disconnect();
      state.domObserver = null;
    }
  }

  // src/features/actions.js
  bus.on("stats:unspent-changed", () => {
    autoAllocateStats();
  });
  bus.on("stats:first-loaded", () => {
    checkRespecStart();
    autoAllocateStats();
  });
  bus.on("respec:tripped", (r) => {
    tripRespecCircuit(r);
  });
  var _autoStatCheckTimer = setInterval(() => {
    if (settings.autoAllocateStats && !state.paused) refreshPlayerStatsAndAllocate("\u5B9A\u65F6\u6821\u51C6", false);
  }, 2 * 60 * 1e3);
  onTeardown(() => {
    if (_autoStatCheckTimer) clearInterval(_autoStatCheckTimer);
    _autoStatCheckTimer = null;
  });
  var WORLD_BOSS_HUNT_HOURS = [12, 20];
  var _bjNowMin = () => {
    const d = new Date(Date.now() + 8 * 3600 * 1e3);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  var _bjKey = (h) => {
    const d = new Date(Date.now() + 8 * 3600 * 1e3);
    return d.getUTCFullYear() + "-" + d.getUTCMonth() + "-" + d.getUTCDate() + "-" + h;
  };
  var _worldBossTimer = null;
  var _worldBossFetchKey = "";
  var _worldBossRegKey = "";
  var _worldBossRegMin = -1;
  async function worldBossTick() {
    if (!settings.autoWorldBossRegister || state.paused) return;
    const nowMin = _bjNowMin();
    let hour = -1;
    for (const h of WORLD_BOSS_HUNT_HOURS) {
      if (nowMin >= (h - 1) * 60 && nowMin < h * 60 + 30) {
        hour = h;
        break;
      }
    }
    if (hour < 0) return;
    const key = _bjKey(hour);
    const inReg = nowMin < hour * 60;
    const inBefore = inReg && nowMin >= hour * 60 - settings.worldBossRespecBeforeMin;
    if (inBefore && (settings.autoWorldBossRespec || settings.autoWorldBossLoadout) && state._worldBossPreparedBattleAt !== key) {
      let weakness = state.worldBoss?.session?.boss?.weaknessStat;
      if (!weakness) {
        try {
          const d2 = await apiFetch("/api/events/world-boss");
          if (d2) {
            updateState({ worldBoss: d2 });
            weakness = d2?.session?.boss?.weaknessStat;
          }
        } catch (_) {
        }
      }
      if (weakness) {
        const base = state.playerStats?.base;
        if (!base) {
          OpLog.warn("\u4E16\u754CBoss", "[\u6D17\u70B9] \u65E0\u73A9\u5BB6\u52A0\u70B9\u8BB0\u5F55\u70B9\uFF0C\u8DF3\u8FC7\u672C\u6B21\u51C6\u5907");
          return;
        }
        state._worldBossStats = { strength: base.strength, intelligence: base.intelligence, luck: base.luck, endurance: base.endurance };
        state.worldBossRestorePending = false;
        state._worldBossPreparedBattleAt = key;
        if (settings.autoWorldBossLoadout) switchLoadout(settings.worldBossLoadoutDuring, "\u4E16\u754CBoss");
        if (settings.autoWorldBossRespec) doWorldBossRespec(weakness);
      }
      return;
    }
    if (inReg) {
      if (_worldBossRegKey !== key) {
        _worldBossRegKey = key;
        _worldBossRegMin = (hour - 1) * 60 + Math.floor(Math.random() * 10);
      }
      if (nowMin < _worldBossRegMin) return;
      if (_worldBossFetchKey !== key) {
        let d2;
        try {
          d2 = await apiFetch("/api/events/world-boss");
          if (d2) updateState({ worldBoss: d2 });
        } catch (_) {
          return;
        }
        _worldBossFetchKey = key;
      }
      const session = state.worldBoss?.session;
      if (!session) return;
      const weakness = session.boss?.weaknessStat;
      if (settings.autoWorldBossRegister && session.player?.selectedStat == null && weakness) {
        try {
          const r = await apiFetch("/api/events/world-boss/selection", { method: "POST", body: { stat: weakness }, idempotencyKey: crypto.randomUUID() });
          if (r?.overview) updateState({ worldBoss: r.overview });
          OpLog.info("\u4E16\u754CBoss", "\u2705 \u62A5\u540D " + (STAT_LABELS[weakness] || weakness) + "\uFF08\u5F31\u70B9\u5C5E\u6027\uFF09");
        } catch (e) {
          OpLog.warn("\u4E16\u754CBoss", "\u62A5\u540D\u5931\u8D25: " + e.message);
        }
      }
      return;
    }
    let d;
    try {
      d = await apiFetch("/api/events/world-boss");
      if (d) updateState({ worldBoss: d });
    } catch (_) {
      return;
    }
    const status = d?.session?.status;
    if ((status === "settling" || status === "defeated" || status === "escaped" || status === "canceled") && state._worldBossPreparedBattleAt) {
      state._worldBossPreparedBattleAt = "";
      const snapshot = state._worldBossStats;
      if ((settings.autoWorldBossRespec || settings.autoWorldBossLoadout) && !state._worldBossRestoreTimer) {
        const afterMs = Math.min(Math.max(settings.worldBossRespecAfterMin, 1), 5) * 6e4;
        state._worldBossRestoreTimer = setTimeout(async () => {
          state._worldBossRestoreTimer = null;
          if (!settings.autoWorldBoss || state.paused) return;
          let restored = true;
          if (settings.autoWorldBossRespec && snapshot) {
            state.worldBossRestorePending = true;
            restored = await doRestoreStats(snapshot);
          }
          if (settings.autoWorldBossLoadout) await switchLoadout(settings.worldBossLoadoutAfter, "\u4E16\u754CBoss");
          if (restored) {
            state._worldBossStats = null;
            state.worldBossRestorePending = false;
            if (settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
          } else {
            OpLog.warn("\u4E16\u754CBoss", "[\u6D17\u70B9] \u539F\u59CB\u52A0\u70B9\u8BB0\u5F55\u5DF2\u4FDD\u7559\uFF0C\u5E76\u5DF2\u963B\u6B62\u901A\u7528\u81EA\u52A8\u52A0\u70B9\u63A5\u7BA1");
          }
        }, afterMs);
      }
    }
  }
  _worldBossTimer = setInterval(worldBossTick, 60 * 1e3);
  worldBossTick();
  onTeardown(() => {
    if (_worldBossTimer) {
      clearInterval(_worldBossTimer);
      _worldBossTimer = null;
    }
    if (state._worldBossRestoreTimer) {
      clearTimeout(state._worldBossRestoreTimer);
      state._worldBossRestoreTimer = null;
    }
  });
  async function fetchFishInventory() {
    const r = await apiFetch("/api/inventory/fish", { method: "GET" });
    return r && Array.isArray(r.fish) ? r.fish : [];
  }
  function fishShouldSell(f) {
    if (f?.isLocked || f?.isMasteryLocked) return false;
    const rarity = String(f?.rarity || "").toLowerCase();
    return settings.sellFishRarities.includes(rarity);
  }
  function buildFishSellItems(fishList) {
    const map = /* @__PURE__ */ new Map();
    for (const f of fishList) {
      if (!fishShouldSell(f)) continue;
      const id = f?.fishId;
      if (!id) continue;
      const qty = Number(f?.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(id, (map.get(id) || 0) + qty);
    }
    return [...map.entries()].map(([fishId, quantity]) => ({ fishId, quantity }));
  }
  async function checkAndSellFish(manual = false) {
    if (state.sellFishRunning) return "\u6B63\u5728\u5356\u51FA\u4E2D\u2026";
    state.sellFishRunning = true;
    try {
      const fishList = await fetchFishInventory();
      const items = buildFishSellItems(fishList);
      const totalCount = items.reduce((s, i) => s + i.quantity, 0);
      if (items.length === 0) {
        if (manual) OpLog.info("\u5356\u9C7C", "\u6CA1\u6709\u9700\u8981\u5356\u7684\u9C7C\uFF08\u5F53\u524D\u89C4\u5219\u4E0B\uFF09");
        return "\u6CA1\u6709\u53EF\u5356\u7684\u9C7C";
      }
      const beforeGold = state.playerGold;
      const r = await apiFetch("/api/inventory/fish/sell", { method: "POST", body: { items }, idempotencyKey: crypto.randomUUID() });
      let earned = 0;
      if (r?.goldEarned !== void 0) earned = Number(r.goldEarned);
      else if (r?.player?.gold !== void 0) {
        earned = Math.max(0, Number(r.player.gold) - beforeGold);
        updateState({ playerGold: r.player.gold });
      }
      OpLog.info("\u5356\u9C7C", "\u5DF2\u5356\u51FA " + totalCount + " \u6761\uFF0C\u83B7\u5F97 " + earned.toLocaleString("zh-CN") + " \u91D1\u5E01");
      return "\u2705 \u5DF2\u5356\u51FA " + totalCount + " \u6761";
    } catch (e) {
      OpLog.error("\u5356\u9C7C", "\u5356\u9C7C\u5931\u8D25: " + (e?.message || e));
      return "\u5356\u9C7C\u5931\u8D25";
    } finally {
      state.sellFishRunning = false;
    }
  }
  function buildGearRules() {
    const rules = [];
    for (const rarity of GEAR_SELL_RARITIES) {
      if (!settings.sellGearRarities.includes(rarity)) continue;
      const q = Number(settings.sellGearQualities?.[rarity] ?? 60);
      if (!Number.isFinite(q) || q < 0 || q > 100) continue;
      rules.push({ rarity, maxQuality: q });
    }
    return rules;
  }
  async function checkAndSellGear(manual = false) {
    if (state.sellGearRunning) return "\u6B63\u5728\u5356\u51FA\u4E2D\u2026";
    state.sellGearRunning = true;
    try {
      const rules = buildGearRules();
      if (rules.length === 0) {
        if (manual) OpLog.info("\u5356\u88C5\u5907", "\u6CA1\u6709\u52FE\u9009\u8981\u5356\u7684\u7A00\u6709\u5EA6");
        return "\u6CA1\u6709\u52FE\u9009\u7A00\u6709\u5EA6";
      }
      const prev = await apiFetch("/api/inventory/gear/sale-preview", { method: "POST", body: { rules } });
      const gearIds = prev?.gearIds || [];
      if (gearIds.length === 0) {
        if (manual) OpLog.info("\u5356\u88C5\u5907", "\u6CA1\u6709\u9700\u8981\u5356\u7684\u88C5\u5907\uFF08\u5F53\u524D\u89C4\u5219\u4E0B\uFF09");
        return "\u6CA1\u6709\u53EF\u5356\u7684\u88C5\u5907";
      }
      const beforeGold = state.playerGold;
      const r = await apiFetch("/api/inventory/gear/sell", { method: "POST", body: { gearIds }, idempotencyKey: crypto.randomUUID() });
      let earned = 0;
      if (r?.goldEarned !== void 0) earned = Number(r.goldEarned);
      else if (r?.player?.gold !== void 0) {
        earned = Math.max(0, Number(r.player.gold) - beforeGold);
        updateState({ playerGold: r.player.gold });
      }
      const truncated = prev?.isTruncated ? "\uFF08\u672C\u6B21\u8FBE100\u4EF6\u4E0A\u9650\uFF09" : "";
      OpLog.info("\u5356\u88C5\u5907", "\u5DF2\u5356\u51FA " + gearIds.length + " \u4EF6\u88C5\u5907\uFF0C\u83B7\u5F97 " + earned.toLocaleString("zh-CN") + " \u91D1\u5E01" + truncated);
      return "\u2705 \u5DF2\u5356\u51FA " + gearIds.length + " \u4EF6";
    } catch (e) {
      OpLog.error("\u5356\u88C5\u5907", "\u5356\u88C5\u5907\u5931\u8D25: " + (e?.message || e));
      return "\u5356\u88C5\u5907\u5931\u8D25";
    } finally {
      state.sellGearRunning = false;
    }
  }
  var _sellFishTimer = null;
  var _sellGearTimer = null;
  function stopSellFish() {
    if (_sellFishTimer) {
      clearTimeout(_sellFishTimer);
      _sellFishTimer = null;
    }
  }
  function stopSellGear() {
    if (_sellGearTimer) {
      clearTimeout(_sellGearTimer);
      _sellGearTimer = null;
    }
  }
  onTeardown(stopSellFish);
  onTeardown(stopSellGear);
  function startSellFish() {
    stopSellFish();
    if (!settings.sellFishEnabled) return;
    _sellFishTimer = setTimeout(sellFishTick, 5e3);
  }
  async function sellFishTick() {
    _sellFishTimer = null;
    if (!settings.sellFishEnabled || state.paused) return;
    try {
      await checkAndSellFish(false);
    } catch (_) {
    }
    const ms = Math.min(Math.max(settings.sellFishIntervalMin, 3), 1440) * 6e4;
    _sellFishTimer = setTimeout(sellFishTick, ms);
  }
  function startSellGear() {
    stopSellGear();
    if (!settings.sellGearEnabled) return;
    _sellGearTimer = setTimeout(sellGearTick, 5e3);
  }
  async function sellGearTick() {
    _sellGearTimer = null;
    if (!settings.sellGearEnabled || state.paused) return;
    try {
      await checkAndSellGear(false);
    } catch (_) {
    }
    const ms = Math.min(Math.max(settings.sellGearIntervalMin, 3), 1440) * 6e4;
    _sellGearTimer = setTimeout(sellGearTick, ms);
  }
  function getBaitQuantity(baitId, snapshot) {
    const c = state.baitCache?.find((b) => b.id === baitId);
    if (c?.quantity !== void 0 && c.quantity !== null) return c.quantity;
    const s = snapshot?.baits?.find((b) => b.id === baitId);
    return s?.quantity ?? null;
  }
  function renderBaitControls(snapshot) {
    if (!state.shadowRoot) return;
    const ctr = state.shadowRoot.getElementById("bait-scene-ctr");
    if (!ctr) return;
    ctr.innerHTML = "";
    const baits = (snapshot?.baits || []).map((b) => {
      const qty = getBaitQuantity(b.id, snapshot);
      return { ...b, quantity: qty };
    });
    for (const scene of BAIT_SCENES) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;";
      const label = document.createElement("span");
      label.textContent = scene.label;
      label.style.cssText = "font-size:12px;color:var(--as-muted);white-space:nowrap;";
      const sel = document.createElement("select");
      sel.style.cssText = "width:130px;height:28px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;";
      const optNone = document.createElement("option");
      optNone.value = "";
      optNone.textContent = "\u4E0D\u5207\u6362";
      sel.appendChild(optNone);
      for (const bait of baits) {
        const opt = document.createElement("option");
        opt.value = bait.id;
        opt.textContent = `${bait.name}${bait.isUnlimited ? "" : ` \xB7 ${bait.quantity ?? "?"}`}`;
        sel.appendChild(opt);
      }
      sel.value = settings.baitByScene?.[scene.key] || "";
      sel.addEventListener("change", () => {
        const chosenId = sel.value;
        if (chosenId && !settings.baitAutoBuy) {
          const chosen = baits.find((b) => b.id === chosenId);
          if (chosen && !chosen.isUnlimited && !chosen.quantity) {
            sel.value = "";
            warn(`[\u9C7C\u9975] ${chosen.name} \u5E93\u5B58\u4E3A0\u4E14\u672A\u5F00\u542F\u81EA\u52A8\u8D2D\u4E70\uFF0C\u65E0\u6CD5\u9009\u62E9`);
            return;
          }
        }
        if (!settings.baitByScene) settings.baitByScene = {};
        settings.baitByScene[scene.key] = sel.value;
        saveSettings();
        if (settings.autoBait && !state.paused) evaluateBait();
      });
      row.appendChild(label);
      row.appendChild(sel);
      ctr.appendChild(row);
    }
  }
  async function trySwitchBait(targetId, scene) {
    const game = state.appGame || window.arcaneReelax;
    if (!game) return;
    const snap = game.getSnapshot();
    if (!snap) return;
    const sceneLabel = BAIT_SCENES.find((s) => s.key === scene)?.label || "?";
    const startIdx = BAIT_TIER_ORDER.indexOf(targetId);
    if (startIdx === -1) {
      L.bait(`\u672A\u77E5\u9975\u6599: ${targetId}`);
      return;
    }
    for (let i = startIdx; i >= 0; i--) {
      const tryId = BAIT_TIER_ORDER[i];
      const tryBait = snap.baits?.find((b) => b.id === tryId);
      if (!tryBait) continue;
      if (tryBait.isSelected) {
        L.bait(`\u5DF2\u5728 ${tryBait.name}`);
        return;
      }
      if (tryId === "bait_basic") {
        try {
          await game.fishing.selectBait("bait_basic");
          OpLog.info("\u9C7C\u9975", "\u2705 \u57FA\u7840\u9975 (" + sceneLabel + ")");
        } catch (e) {
          OpLog.error("\u9C7C\u9975", "\u57FA\u7840\u9975\u5931\u8D25: " + e.message);
          return;
        }
        if (targetId !== "bait_basic") {
          settings.baitByScene[scene] = "bait_basic";
          saveSettings();
        }
        renderBaitControls(game.getSnapshot());
        return;
      }
      const hasStock = tryBait.isUnlimited || tryBait.quantity > 0;
      if (hasStock) {
        try {
          await game.fishing.selectBait(tryId);
          OpLog.info("\u9C7C\u9975", "\u2705 " + tryBait.name + " (" + sceneLabel + ")");
          if (tryId !== targetId) {
            settings.baitByScene[scene] = tryId;
            saveSettings();
          }
          renderBaitControls(game.getSnapshot());
          return;
        } catch (e) {
          OpLog.warn("\u9C7C\u9975", "\u88C5\u5907\u5931\u8D25: " + tryBait.name + " \u2014 " + e.message + "\uFF0C\u7EE7\u7EED\u964D\u7EA7");
        }
      }
      if (settings.baitAutoBuy) {
        L.bait(`${tryBait.name} \u65E0\u5E93\u5B58\uFF0C\u8D2D\u4E70 x100`);
        try {
          await apiFetch(`/api/baits/${tryId}/purchase`, { method: "POST", body: { quantity: 100 }, idempotencyKey: crypto.randomUUID() });
          await game.fishing.selectBait(tryId);
          refreshBaitData();
          OpLog.info("\u9C7C\u9975", "\u2705 \u8D2D\u4E70+\u5207\u6362 " + tryBait.name + " (" + sceneLabel + ")");
          if (tryId !== targetId) {
            settings.baitByScene[scene] = tryId;
            saveSettings();
          }
          renderBaitControls(game.getSnapshot());
          return;
        } catch (e) {
          OpLog.warn("\u9C7C\u9975", "\u4E70\u4E0D\u8D77 " + tryBait.name + "\uFF0C\u7EE7\u7EED\u964D\u7EA7");
        }
      } else {
        L.bait(`${tryBait.name} \u65E0\u5E93\u5B58\u4E14\u672A\u5F00\u542F\u81EA\u52A8\u8D2D\u4E70\uFF0C\u7EE7\u7EED\u964D\u7EA7`);
      }
    }
    OpLog.warn("\u9C7C\u9975", "\u6240\u6709\u7B49\u7EA7\u5747\u4E0D\u53EF\u7528");
  }
  async function evaluateBait() {
    if (!settings.autoBait) return;
    const game = state.appGame || window.arcaneReelax;
    if (!game) return;
    const snap = game.getSnapshot();
    if (!snap) return;
    const scene = getBaitScene(snap);
    if (!scene) return;
    const baitId = settings.baitByScene?.[scene];
    if (!baitId) return;
    await trySwitchBait(baitId, scene);
  }
  function checkBaitScene() {
    const game = state.appGame || window.arcaneReelax;
    if (!game) return;
    const snap = game.getSnapshot();
    if (!snap) return;
    const scene = getBaitScene(snap);
    if (!scene) return;
    if (state.lastBaitScene && state.lastBaitScene !== scene) {
      const oldScene = state.lastBaitScene;
      updateState({ lastBaitScene: scene });
      if ((oldScene === "personalCompetition" || oldScene === "guildCompetition") && !isCompetitionActive(oldScene === "personalCompetition" ? "personal" : "guild")) {
        const compKind = oldScene === "personalCompetition" ? "personal" : "guild";
        if (respecEnabled(compKind)) applyPostRespec();
        else if (settings.autoLoadout) switchLoadout(settings.loadoutAfter);
        if (resetDipIfEnded(oldScene) && state.appGame) makeDecision(state.appGame);
      }
      if (settings.autoBait) {
        L.bait(`\u573A\u666F\u53D8\u5316: ${oldScene} \u2192 ${scene}`);
        evaluateBait();
      }
    }
    updateState({ lastBaitScene: scene });
  }
  var _lastBaitFallbackAt = 0;
  function checkBaitFallback() {
    if (!settings.autoBait || !settings.baitFallback) return;
    const game = state.appGame || window.arcaneReelax;
    if (!game) return;
    const snap = game.getSnapshot();
    if (!snap) return;
    const scene = getBaitScene(snap);
    if (!scene) return;
    const configuredId = settings.baitByScene?.[scene];
    if (!configuredId) return;
    const currentBait = snap.baits?.find((b) => b.isSelected);
    if (currentBait?.id === "bait_basic" && configuredId !== "bait_basic") {
      const now = Date.now();
      if (now - _lastBaitFallbackAt < 5 * 60 * 1e3) return;
      _lastBaitFallbackAt = now;
      OpLog.info("\u9C7C\u9975", "\u68C0\u6D4B\u5230\u57FA\u7840\u9975\uFF0C\u5C1D\u8BD5\u5207\u56DE");
      trySwitchBait(configuredId, scene);
    }
  }
  var STAT_LABELS = { strength: "\u529B\u91CF", intelligence: "\u667A\u529B", luck: "\u8FD0\u6C14", endurance: "\u8010\u529B" };
  function currentStatInvestment(stat, stats) {
    const base = stats?.base || {};
    return stat === "endurance" ? Math.max(0, (base.endurance || 0) - 100) : Math.max(0, base[stat] || 0);
  }
  function currentBaitStatBonus(stat) {
    if (stat !== "luck") return 0;
    const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
    const baitId = snap?.baits?.find((b) => b.isSelected)?.id || "";
    return Math.max(0, Number(BAIT_LUCK[baitId]) || 0);
  }
  function statPanelAtInvestment(stat, invested, stats) {
    const systemBase = stat === "endurance" ? 100 : 0;
    const flat = ["rod", "gear", "medals", "guildTrophies"].reduce((sum, source) => sum + Math.max(0, Number(stats?.[source]?.[stat]) || 0), 0);
    let totemRate = 0;
    if (state.guildTotemLevels?.[stat] != null) {
      totemRate = Math.max(0, Number(state.guildTotemLevels[stat]) || 0) / 100;
    } else {
      const guildBonus = Math.max(0, Number(stats?.guild?.[stat]) || 0);
      const preGuild2 = Math.max(0, (Number(stats?.total?.[stat]) || 0) - guildBonus);
      if (preGuild2 > 0) totemRate = guildBonus / preGuild2;
    }
    const preGuild = systemBase + Math.max(0, Math.floor(invested || 0)) + flat;
    return preGuild + Math.floor(preGuild * totemRate) + currentBaitStatBonus(stat);
  }
  function getStatPanelMinimum(stat, stats = state.playerStats || {}) {
    return statPanelAtInvestment(stat, 0, stats);
  }
  function requiredStatInvestment(stat, panelTarget, stats) {
    const target = Math.max(0, Math.floor(Number(panelTarget) || 0));
    if (statPanelAtInvestment(stat, 0, stats) >= target) return 0;
    let low = 0, high = Math.max(1, target);
    while (statPanelAtInvestment(stat, high, stats) < target && high < 1e9) high *= 2;
    while (low + 1 < high) {
      const mid = Math.floor((low + high) / 2);
      if (statPanelAtInvestment(stat, mid, stats) >= target) high = mid;
      else low = mid;
    }
    return high;
  }
  function buildPlannedAllocation(points, stats = {}) {
    const order = settings.statAllocationOrder || ["strength", "intelligence", "endurance", "luck"];
    const fixed = settings.postRespecFixed || {};
    const body = { strength: 0, intelligence: 0, luck: 0, endurance: 0 };
    let remain = Math.max(0, Math.floor(points || 0));
    for (let i = 0; i < order.length; i++) {
      const stat = order[i];
      if (i === order.length - 1) {
        body[stat] += remain;
        break;
      }
      const invested = currentStatInvestment(stat, stats);
      const targetInvestment = requiredStatInvestment(stat, fixed[stat], stats);
      const need = Math.max(0, targetInvestment - invested);
      const add = Math.min(remain, need);
      body[stat] += add;
      remain -= add;
      if (!remain) break;
    }
    return body;
  }
  function competitionOwnsStats() {
    if (state._needsPostRespec) return true;
    if (!settings.autoCompetition || !settings.autoAllocateStats) return false;
    return settings.autoRespecPersonal && shouldActForComp("personal") || settings.autoRespecGuild && shouldActForComp("guild");
  }
  function normalizePersistentTargets(stats) {
    const order = settings.statAllocationOrder || ["strength", "intelligence", "endurance", "luck"];
    const fixed = { ...settings.postRespecFixed || {} };
    let changed = false;
    for (const stat of order.slice(0, -1)) {
      const minimum = getStatPanelMinimum(stat, stats);
      const current = Math.max(0, Math.floor(Number(fixed[stat]) || 0));
      if (current < minimum) {
        fixed[stat] = minimum;
        changed = true;
      }
    }
    if (changed) {
      settings.postRespecFixed = fixed;
      saveSettings();
      bus.emit("stats:targets-normalized");
    }
    return fixed;
  }
  function analyzePersistentStats(stats) {
    const order = settings.statAllocationOrder || ["strength", "intelligence", "endurance", "luck"];
    const fixedStats = order.slice(0, -1);
    const fixed = normalizePersistentTargets(stats);
    const actualInvested = Object.fromEntries(order.map((stat) => [stat, currentStatInvestment(stat, stats)]));
    const unspentPoints = Math.max(0, Math.floor(Number(state.unspentStatPoints) || 0));
    const allocatedPoints = order.reduce((sum, stat) => sum + actualInvested[stat], 0);
    const totalPoints = allocatedPoints + unspentPoints;
    let requiredTotal = 0;
    let missingTotal = 0;
    let over = false;
    let under = false;
    const details = [];
    for (const stat of fixedStats) {
      const target = fixed[stat];
      const required = requiredStatInvestment(stat, target, stats);
      const minimumAchievable = statPanelAtInvestment(stat, required, stats);
      const actualPanel = statPanelAtInvestment(stat, actualInvested[stat], stats);
      requiredTotal += required;
      missingTotal += Math.max(0, required - actualInvested[stat]);
      if (minimumAchievable > target + 3) {
        return { unreachable: true, stat, target, minimumAchievable };
      }
      if (actualPanel < target) under = true;
      if (actualPanel > target + 3) over = true;
      details.push({ stat, target, actualPanel, required });
    }
    return {
      unreachable: false,
      order,
      details,
      totalPoints,
      allocatedPoints,
      unspentPoints,
      requiredTotal,
      missingTotal,
      over,
      under,
      // 只有未分配点无法补齐缺口、且已有点实际投在别处时，才需要洗点搬运。
      // 玩家刚手动洗完、所有点都处于未分配状态时，应直接分配，不能再次 reset。
      trapped: under && allocatedPoints > 0 && unspentPoints < missingTotal && totalPoints >= requiredTotal
    };
  }
  async function allocateStatBody(body, logTag = "\u52A0\u70B9") {
    const points = Object.values(body).reduce((sum, n) => sum + (Number(n) || 0), 0);
    if (points <= 0) return false;
    state.statAllocateInProgress = true;
    try {
      const r = await apiFetch("/api/player/stats/allocate", {
        method: "POST",
        body,
        idempotencyKey: crypto.randomUUID()
      });
      syncPlayerStats(r);
      const detail = Object.entries(body).filter(([, n]) => n > 0).map(([s, n]) => `${STAT_LABELS[s]}${n}`).join("\u3001");
      OpLog.info(logTag, `\u2705 \u81EA\u52A8\u5206\u914D ${points} \u70B9 \u2192 ${detail}`);
      return true;
    } catch (e) {
      OpLog.error(logTag, "\u5206\u914D\u5931\u8D25: " + e.message);
      return false;
    } finally {
      updateState({ statAllocateInProgress: false });
    }
  }
  async function autoAllocateStats() {
    if (!settings.autoAllocateStats) return;
    if (state.paused) return;
    if (state.statAllocateInProgress || state.respecInProgress || state.worldBossRestorePending) return;
    const inPersonal = shouldActForComp("personal"), inGuild = shouldActForComp("guild");
    const worldBossActive = !!(settings.autoWorldBoss && settings.autoWorldBossRespec && state._worldBossPreparedBattleAt);
    const bossStat = state.worldBoss?.session?.boss?.weaknessStat;
    const target = worldBossActive && bossStat ? bossStat : inPersonal && settings.autoRespecPersonal || inGuild && settings.autoRespecGuild ? "luck" : "";
    const pts = Math.max(0, Math.floor(Number(state.unspentStatPoints) || 0));
    if (target) {
      if (!pts) return;
      const body = { strength: 0, intelligence: 0, luck: 0, endurance: 0 };
      body[target] = pts;
      await allocateStatBody(body, worldBossActive ? "\u4E16\u754CBoss" : "\u52A0\u70B9");
      return;
    }
    if (competitionOwnsStats()) {
      L.spc("\u5E38\u9A7B\u52A0\u70B9\u6821\u9A8C\u6682\u505C\uFF1A\u8D5B\u7A0B\u5168\u52A0\u5E78\u8FD0\u6B63\u5728\u63A5\u7BA1");
      return;
    }
    if (!state.playerStats) return;
    const analysis = analyzePersistentStats(state.playerStats);
    if (analysis.unreachable) {
      OpLog.warn("\u52A0\u70B9", `[\u65B9\u6848\u68C0\u67E5] ${STAT_LABELS[analysis.stat]}\u76EE\u6807 ${analysis.target} \u65E0\u6CD5\u5728 \xB13 \u5BB9\u5DEE\u5185\u8FBE\u5230\uFF08\u6700\u5C0F\u53EF\u8FBE ${analysis.minimumAchievable}\uFF09\uFF0C\u5DF2\u505C\u6B62\u6D17\u70B9`);
      return;
    }
    if (analysis.over || analysis.trapped) {
      const reason = analysis.over ? "\u56FA\u5B9A\u5C5E\u6027\u8D85\u8FC7\u76EE\u6807\u5BB9\u5DEE" : "\u5C5E\u6027\u70B9\u5206\u914D\u4F4D\u7F6E\u4E0D\u7B26";
      await doRespecAllocate((totalPts) => buildPlannedAllocation(totalPts, state.playerStats || {}), `[\u7EA0\u6B63\u65B9\u6848] ${reason}\uFF0C\u91CD\u65B0\u5206\u914D`, "\u52A0\u70B9");
      return;
    }
    if (pts > 0) await allocateStatBody(buildPlannedAllocation(pts, state.playerStats || {}));
    else if (analysis.under) L.spc(`\u5E38\u9A7B\u65B9\u6848\u5C1A\u7F3A\u5C5E\u6027\u70B9\uFF1A\u5F53\u524D\u603B\u70B9 ${analysis.totalPoints}\uFF0C\u56FA\u5B9A\u76EE\u6807\u81F3\u5C11\u9700\u8981 ${analysis.requiredTotal}`);
  }
  var _statRefreshInProgress = false;
  async function refreshPlayerStatsAndAllocate(reason = "\u624B\u52A8\u68C0\u67E5", visible = true) {
    if (!settings.autoAllocateStats || state.paused || _statRefreshInProgress) return;
    _statRefreshInProgress = true;
    try {
      const r = await apiFetch("/api/me");
      syncPlayerStats(r);
      const points = Number(state.unspentStatPoints) || 0;
      if (visible) {
        OpLog.info("\u52A0\u70B9", `[\u68C0\u67E5] ${reason}\uFF1A\u5F53\u524D\u672A\u5206\u914D ${points} \u70B9` + (points <= 0 ? "\uFF1B\u4FEE\u6539\u76EE\u6807\u4E0D\u4F1A\u91CD\u7F6E\u5DF2\u5206\u914D\u5C5E\u6027" : ""));
      } else {
        L.spc(`\u52A0\u70B9\u6821\u51C6: ${reason} \u672A\u5206\u914D=${points}`);
      }
    } catch (e) {
      if (visible) OpLog.warn("\u52A0\u70B9", `[\u68C0\u67E5] ${reason}\u5931\u8D25: ${e.message}`);
      else L.spc(`\u52A0\u70B9\u6821\u51C6\u5931\u8D25: ${e.message}`);
      return;
    } finally {
      _statRefreshInProgress = false;
    }
    await autoAllocateStats();
  }
  function syncPlayerStats(r) {
    if (!r.player) return;
    const patch = {};
    if (r.player.gold !== void 0) patch.playerGold = r.player.gold;
    if (r.player.unspentStatPoints !== void 0) patch.unspentStatPoints = r.player.unspentStatPoints;
    if (r.player.stats !== void 0) patch.playerStats = r.player.stats;
    updateState(patch);
    if (r.player.stats !== void 0) bus.emit("stats:updated");
  }
  function respecEnabled(kind) {
    if (!settings.autoCompetition || !settings.autoAllocateStats) return false;
    return kind === "personal" ? settings.autoRespecPersonal : settings.autoRespecGuild;
  }
  function tripRespecCircuit(reason) {
    settings.autoRespecPersonal = false;
    settings.autoRespecGuild = false;
    saveSettings();
    warn(`\u{1F6A8} \u6D17\u70B9\u7194\u65AD\uFF01${reason} \u2014 \u5DF2\u81EA\u52A8\u5173\u95ED autoRespecPersonal \u548C autoRespecGuild\uFF0C\u8BF7\u68C0\u67E5\u540E\u624B\u52A8\u91CD\u65B0\u6253\u5F00`);
    const cbP = state.shadowRoot?.getElementById("sw-autoRespecPersonal");
    const cbG = state.shadowRoot?.getElementById("sw-autoRespecGuild");
    if (cbP) cbP.checked = false;
    if (cbG) cbG.checked = false;
  }
  var _currentLoadout = 1;
  var _loadoutSwitchPromise = null;
  var _loadoutSwitchTarget = 0;
  async function switchLoadout(slot, logTag = "\u914D\u88C5") {
    if (_loadoutSwitchPromise) {
      if (_loadoutSwitchTarget === slot) return _loadoutSwitchPromise;
      await _loadoutSwitchPromise;
      return switchLoadout(slot, logTag);
    }
    const prefix = logTag === "\u914D\u88C5" ? "" : "[\u914D\u88C5] ";
    if (logTag === "\u914D\u88C5") L.spc(`\u914D\u88C5\u68C0\u67E5: \u5F53\u524D=#${_currentLoadout} \u76EE\u6807=#${slot}`);
    else OpLog.info(logTag, `${prefix}\u5F53\u524D=#${_currentLoadout}\uFF0C\u76EE\u6807=#${slot}`);
    if (slot === _currentLoadout) {
      if (logTag === "\u914D\u88C5") L.spc(`\u914D\u88C5\u5DF2\u5728 #${slot}\uFF0C\u65E0\u9700\u5207\u6362`);
      return true;
    }
    const task = (async () => {
      try {
        await apiFetch(`/api/gear/loadouts/${slot}/load`, { method: "POST", idempotencyKey: crypto.randomUUID() });
        _currentLoadout = slot;
        OpLog.info(logTag, prefix + "\u2705 \u52A0\u8F7D\u914D\u88C5 #" + slot);
        return true;
      } catch (e) {
        OpLog.error(logTag, prefix + "\u52A0\u8F7D\u914D\u88C5 #" + slot + " \u5931\u8D25: " + e.message);
        return false;
      }
    })();
    _loadoutSwitchTarget = slot;
    _loadoutSwitchPromise = task;
    try {
      return await task;
    } finally {
      if (_loadoutSwitchPromise === task) {
        _loadoutSwitchPromise = null;
        _loadoutSwitchTarget = 0;
      }
    }
  }
  async function doRespecAllocate(bodyBuilder, label, logTag = "\u6D17\u70B9") {
    const prefix = logTag === "\u6D17\u70B9" ? "" : "[\u6D17\u70B9] ";
    if (state.respecInProgress) return false;
    const _rg = respecLock.check(RESPEC_COST);
    if (_rg.blocked) {
      OpLog.warn(logTag, prefix + "\u5B89\u5168\u9501\u62E6\u622A: " + _rg.reason);
      return false;
    }
    if (state.playerGold <= 0) {
      L.spc("\u91D1\u5E01\u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u7B49\u5F85");
      return false;
    }
    if (state.playerGold < RESPEC_COST) {
      OpLog.warn(logTag, prefix + label + "\u91D1\u5E01\u4E0D\u8DB3");
      return false;
    }
    if (!state.playerStats) {
      L.spc("\u7B49\u5F85\u5C5E\u6027\u6570\u636E");
      return false;
    }
    state.respecInProgress = true;
    try {
      OpLog.info(logTag, prefix + label);
      const resetR = await apiFetch("/api/player/stats/reset", { method: "POST", idempotencyKey: crypto.randomUUID() });
      syncPlayerStats(resetR);
      respecLock.record(RESPEC_COST);
      const totalPts = resetR.player?.unspentStatPoints ?? 0;
      const body = bodyBuilder(totalPts);
      const requested = Object.values(body).reduce((sum, n) => sum + (Number(n) || 0), 0);
      if (requested > totalPts) throw new Error(`\u8BB0\u5F55\u70B9\u9700\u8981 ${requested} \u70B9\uFF0C\u5F53\u524D\u53EF\u5206\u914D ${totalPts} \u70B9`);
      const allocR = await apiFetch("/api/player/stats/allocate", { method: "POST", body, idempotencyKey: crypto.randomUUID() });
      syncPlayerStats(allocR);
      OpLog.info(logTag, prefix + "\u2705 " + label + "\u5B8C\u6210");
      return true;
    } catch (e) {
      OpLog.error(logTag, prefix + label + "\u5931\u8D25: " + e.message);
      return false;
    } finally {
      updateState({ respecInProgress: false });
    }
  }
  function doRespecToStat(stat, label, logTag = "\u6D17\u70B9") {
    const statName = STAT_LABELS[stat] || stat;
    return doRespecAllocate((totalPts) => {
      const body = { strength: 0, intelligence: 0, luck: 0, endurance: INIT_ENDURANCE };
      body[stat] = Math.max(0, totalPts - INIT_ENDURANCE);
      return body;
    }, label + " \u2192 \u5168\u52A0" + statName, logTag);
  }
  function doRestoreStats(stats) {
    return doRespecAllocate(() => ({
      strength: Math.max(0, stats.strength || 0),
      intelligence: Math.max(0, stats.intelligence || 0),
      luck: Math.max(0, stats.luck || 0),
      // base.endurance 含游戏固定的 100 基准；allocate 接口只接受玩家投入点数。
      endurance: Math.max(0, (stats.endurance || 0) - 100)
    }), "\u6062\u590D\u539F\u59CB\u52A0\u70B9", "\u4E16\u754CBoss");
  }
  async function doRespec(kind) {
    if (!respecEnabled(kind)) return;
    const ok = await doRespecToStat("luck", kind === "personal" ? "\u4E2A\u4EBA\u8D5B" : "\u516C\u4F1A\u8D5B");
    if (ok) updateState({ _needsPostRespec: true });
  }
  async function doWorldBossRespec(stat) {
    await doRespecToStat(stat, "\u5F00\u6218\u51C6\u5907", "\u4E16\u754CBoss");
  }
  async function applyPostRespec() {
    if (state.respecInProgress || !state.playerStats) return;
    const _rg = respecLock.check(RESPEC_COST);
    if (_rg.blocked) {
      OpLog.warn("\u6D17\u70B9", "\u5B89\u5168\u9501\u62E6\u622A: " + _rg.reason);
      return;
    }
    if (state.playerGold <= 0) {
      L.spc("\u91D1\u5E01\u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u7B49\u5F85");
      return;
    }
    if (state.playerGold < RESPEC_COST) {
      OpLog.warn("\u6D17\u70B9", "\u91D1\u5E01\u4E0D\u8DB3\uFF0C\u65E0\u6CD5\u6062\u590D\u5E38\u9A7B\u5C5E\u6027\u65B9\u6848");
      return;
    }
    state.respecInProgress = true;
    try {
      const order = settings.statAllocationOrder || ["strength", "intelligence", "endurance", "luck"];
      OpLog.info("\u6D17\u70B9", "[\u6062\u590D\u65B9\u6848] \u5F00\u59CB\uFF0C\u6309\u5E38\u9A7B\u987A\u5E8F\u5206\u914D\u5C5E\u6027");
      if (settings.autoLoadout) await switchLoadout(settings.loadoutAfter);
      const resetR = await apiFetch("/api/player/stats/reset", { method: "POST", idempotencyKey: crypto.randomUUID() });
      syncPlayerStats(resetR);
      respecLock.record(RESPEC_COST);
      const totalPts = resetR.player?.unspentStatPoints ?? 0;
      const body = buildPlannedAllocation(totalPts, resetR.player?.stats || state.playerStats || {});
      const allocR = await apiFetch("/api/player/stats/allocate", { method: "POST", body, idempotencyKey: crypto.randomUUID() });
      syncPlayerStats(allocR);
      updateState({ _needsPostRespec: false });
      OpLog.info("\u6D17\u70B9", "[\u6062\u590D\u65B9\u6848] \u2705 \u5B8C\u6210\uFF1A" + order.map((s) => `${STAT_LABELS[s]}${body[s]}`).join("\u3001"));
    } catch (e) {
      OpLog.error("\u6D17\u70B9", "\u6062\u590D\u5E38\u9A7B\u5C5E\u6027\u65B9\u6848\u5931\u8D25: " + e.message);
    } finally {
      updateState({ respecInProgress: false });
    }
  }
  function isCompetitionActive(kind) {
    return !!getActiveComp(kind);
  }
  function getCurrentBiomeId() {
    const g = state.appGame || window.arcaneReelax;
    return g?.getSnapshot()?.currentBiomeId || "";
  }
  function isOnCompetitionMap(kind) {
    const cur = getCurrentBiomeId();
    if (!cur) return false;
    const comp = getActiveComp(kind);
    if (!comp) return false;
    return cur === getCompetitionBiomeId(comp);
  }
  function shouldActForComp(kind) {
    if (kind === "personal" && isPersonalBlocked()) return false;
    return isCompetitionActive(kind) && isOnCompetitionMap(kind);
  }
  function onAnyCompMap() {
    return shouldActForComp("personal") || shouldActForComp("guild");
  }
  function statsMatchPostRespec() {
    if (!state.playerStats?.base) return true;
    const result = analyzePersistentStats(state.playerStats);
    return !result.unreachable && !result.over && !result.under && !result.trapped;
  }
  function checkRespecStart() {
    if (state.paused) return;
    if (!settings.autoCompetition) return;
    if (!settings.autoAllocateStats) {
      if (state._needsPostRespec) applyPostRespec();
      return;
    }
    const anyEnabled = respecEnabled("personal") || respecEnabled("guild");
    if (!anyEnabled) return;
    const personalPending = respecEnabled("personal") && !state.competitionCache.personal;
    const guildPending = respecEnabled("guild") && !state.competitionCache.guild;
    if (personalPending) L.spc("\u6D17\u70B9\u68C0\u67E5: \u4E2A\u4EBA\u8D5B\u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u7B49\u5F85");
    if (guildPending) L.spc("\u6D17\u70B9\u68C0\u67E5: \u516C\u4F1A\u8D5B\u6570\u636E\u672A\u5C31\u7EEA\uFF0C\u7B49\u5F85");
    if (personalPending && guildPending) return;
    const personalActive = !personalPending && isCompetitionActive("personal") && !isPersonalBlocked();
    const guildActive = !guildPending && isCompetitionActive("guild");
    L.spc(`\u6D17\u70B9\u68C0\u67E5: \u4E2A\u4EBA\u8D5B=${personalActive} \u516C\u4F1A\u8D5B=${guildActive} \u5728\u8D5B\u56FE=${onAnyCompMap()}`);
    if (personalActive || guildActive) {
      if (!getCurrentBiomeId()) {
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u5F53\u524D\u5730\u56FE\u5FEB\u7167\u672A\u5C31\u7EEA\uFF0C\u6682\u4E0D\u6062\u590D\u6216\u6D17\u70B9");
        return;
      }
      const b = state.playerStats?.base;
      const inLuck = b && b.strength === 0 && b.intelligence === 0 && b.luck > 0 && b.endurance <= 100;
      if (!onAnyCompMap()) {
        if (state._needsPostRespec || inLuck) {
          L.spc("\u6D17\u70B9\u68C0\u67E5: \u5DF2\u79BB\u5F00\u6BD4\u8D5B\u5730\u56FE\uFF0C\u6062\u590D\u5E38\u9A7B\u5C5E\u6027\u65B9\u6848");
          applyPostRespec();
          if (settings.autoLoadout) switchLoadout(settings.loadoutAfter);
        } else {
          autoAllocateStats();
        }
        return;
      }
      if (inLuck && (shouldActForComp("personal") && !respecEnabled("personal") || shouldActForComp("guild") && !respecEnabled("guild"))) {
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u5F00\u5173\u5DF2\u5173\u4F46\u4ECD\u5728\u5168\u8FD0\uFF0C\u6062\u590D\u8D5B\u540E\u65B9\u6848");
        applyPostRespec();
        if (settings.autoLoadout) switchLoadout(settings.loadoutAfter);
        return;
      }
      if (inLuck) {
        updateState({ _needsPostRespec: true });
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u5DF2\u5728\u5168\u8FD0\u72B6\u6001\uFF0C\u8DF3\u8FC7");
        return;
      }
      const doPersonal = shouldActForComp("personal") && respecEnabled("personal");
      const doGuild = shouldActForComp("guild") && respecEnabled("guild");
      if (doPersonal && settings.dipPersonal && personalDipScoreMet(false)) {
        state._dipSeq = getPersonalCompContext()?.sequence || "";
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u4E2A\u4EBA\u8D5B\u8E6D\u5956\u5DF2\u6EE1\u8DB3\uFF0C\u4E0D\u6D17\u5168\u8FD0");
      } else if (doPersonal && settings.witherTideDipPersonal && personalDipScoreMet(true)) {
        state._witherDipSeq = getPersonalCompContext()?.sequence || "";
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u67AF\u6F6E\u8E6D\u5956\u5DF2\u6EE1\u8DB3\uFF0C\u4E0D\u6D17\u5168\u8FD0");
      } else if (doPersonal) {
        doRespec("personal");
      }
      if (doGuild) doRespec("guild");
      if (!doPersonal && !doGuild && state.playerStats && !statsMatchPostRespec()) {
        L.spc("\u6D17\u70B9\u68C0\u67E5: \u5C5E\u6027\u4E0D\u5339\u914D\u8D5B\u540E\u65B9\u6848\uFF0C\u6062\u590D");
        applyPostRespec();
        if (settings.autoLoadout) switchLoadout(settings.loadoutAfter);
      }
      if (settings.autoLoadout && (doPersonal || doGuild)) switchLoadout(settings.loadoutSlot);
      return;
    }
    if (personalPending || guildPending) {
      L.spc("\u6D17\u70B9\u68C0\u67E5: \u4ECD\u6709\u8D5B\u5236\u6570\u636E\u5F85\u5C31\u7EEA\uFF0C\u6682\u4E0D\u6062\u590D\u8D5B\u540E\u65B9\u6848");
      return;
    }
    let dipReset = false;
    if (state._witherDipSeq) {
      state._witherDipSeq = "";
      dipReset = true;
      L.map("\u67AF\u6F6E\u8E6D\u5956: \u6BD4\u8D5B\u7ED3\u675F\uFF0C\u91CD\u7F6E");
    }
    if (state._dipSeq) {
      state._dipSeq = "";
      dipReset = true;
      L.map("\u4E2A\u4EBA\u8D5B\u8E6D\u5956: \u6BD4\u8D5B\u7ED3\u675F\uFF0C\u91CD\u7F6E");
    }
    if (state.playerStats) {
      const b = state.playerStats.base;
      const looksLikeCompetitionStats = b && b.strength === 0 && b.intelligence === 0 && b.luck > 0 && b.endurance <= 100;
      if (state._needsPostRespec || looksLikeCompetitionStats) applyPostRespec();
      else L.spc("\u5F53\u524D\u6CA1\u6709\u5F85\u6062\u590D\u7684\u6BD4\u8D5B\u52A0\u70B9\uFF0C\u4E0D\u64CD\u4F5C");
    }
    if (dipReset && state.appGame) makeDecision(state.appGame);
  }
  function updateModeStatus(snapshot) {
    const el = state.shadowRoot?.getElementById("snap-mode");
    const hint = state.shadowRoot?.getElementById("hint-mode");
    const notice = state.shadowRoot?.getElementById("snap-mode-notice");
    if (!el) return;
    const party = snapshot?.party;
    let modeText = "\u4E2A\u4EBA\u5730\u56FE\u6A21\u5F0F", tipText = "\u672A\u52A0\u5165\u8239\u961F\uFF0C\u6309\u4E2A\u4EBA\u4F18\u5148\u7EA7\u81EA\u52A8\u5207\u56FE";
    if (isBoatLeader(party)) {
      modeText = settings.autoPartyTravel ? "\u8239\u957F/\u8235\u624B\u6A21\u5F0F" : "\u4E2A\u4EBA\u5730\u56FE\u6A21\u5F0F";
      tipText = settings.autoPartyTravel ? "\u6309\u8239\u961F\u4F18\u5148\u7EA7\u5F00\u8239\uFF0C\u6574\u8239\u4E00\u8D77\u5207\u56FE" : "\u5DF2\u5173\u95ED\u8239\u961F\u6A21\u5F0F\uFF0C\u6309\u4E2A\u4EBA\u4F18\u5148\u7EA7\u53EA\u5207\u81EA\u5DF1";
    } else if (party?.isInParty) {
      modeText = "\u8239\u5458\u6A21\u5F0F\uFF08\u8DDF\u968F\u8239\u961F\uFF09";
      tipText = "\u4F60\u5F53\u524D\u662F\u8239\u5458\u65E0\u6CD5\u5F00\u8239\uFF0C\u811A\u672C\u4E0D\u5207\u56FE\uFF0C\u9000\u51FA\u8239\u961F\u540E\u4E2A\u4EBA\u4F18\u5148\u7EA7\u624D\u4F1A\u751F\u6548";
    }
    el.textContent = modeText;
    if (notice) {
      const reason = settings.autoPartyTravel && isBoatLeader(party) ? getPartyUnavailableReason(party) || state.partyTravelUnavailableReason : "";
      notice.textContent = reason ? `\u26A0 ${reason}` : "";
      notice.style.display = reason ? "block" : "none";
    }
    if (hint) {
      hint.onmouseenter = (e) => showTooltip(e, tipText);
      hint.onclick = (e) => {
        e.stopPropagation();
        hideTooltip();
        showTooltip(e, tipText);
      };
      hint.onmouseleave = hideTooltip;
    }
  }

  // src/features/apply.js
  window.fetch = async function(...args) {
    const url = typeof args[0] === "string" ? args[0] : "";
    const resp = await originalFetch.apply(this, args);
    if (!url) return resp;
    try {
      const proof = resp.headers.get("x-arcane-request-proof");
      if (proof && proof !== state.playerProof) {
        state.playerProof = proof;
        state.playerKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(proof), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      }
      updateServerTimeOffset(resp.headers);
    } catch (_) {
    }
    try {
      if (url.includes("/api/")) {
        try {
          const _led = await resp.clone().json();
          recordLedger(url, _led);
        } catch (_) {
        }
      }
      if (url.includes("/api/me")) {
        const d = await resp.clone().json();
        if (d.player?.fragments !== void 0) updateState({ playerFragments: d.player.fragments });
        if (d.player?.relics !== void 0) updateState({ playerRelics: d.player.relics });
        if (d.player?.unspentStatPoints !== void 0) {
          const prev = state.unspentStatPoints;
          updateState({ unspentStatPoints: d.player.unspentStatPoints });
          if (d.player.unspentStatPoints > 0 && d.player.unspentStatPoints !== prev) autoAllocateStats();
        }
        if (d.player?.gold !== void 0) updateState({ playerGold: d.player.gold });
        if (d.player?.stats) {
          const hadStats = !!state.playerStats;
          updateState({ playerStats: d.player.stats });
          if (!hadStats) checkRespecStart();
        }
        if (d.publicIdentity?.publicId !== void 0) updateState({ playerUid: String(d.publicIdentity.publicId) });
        if (d.player?.nickname !== void 0) updateState({ playerName: d.player.nickname });
      }
      if (url.includes("/api/content/bootstrap")) {
        try {
          const d = await resp.clone().json();
          if (Array.isArray(d.fish)) {
            for (const f of d.fish) {
              if (f.rarity === "exotic" || f.rarity === "arcane") state._fishNameMap[f.id] = f.name;
            }
          }
          if (Array.isArray(d.biomes)) {
            for (const b of d.biomes) state._biomeNameMap[b.id] = b.name;
          }
        } catch (_) {
        }
      }
      if (url.includes("/api/tournaments/overview")) {
        const d = await resp.clone().json();
        updateState({ competitionCache: { ...state.competitionCache, personal: d } });
        L.fetch(`\u4E2A\u4EBA\u8D5B(cur=${!!d.current}, up=${d.upcoming?.length || 0})`);
        bus.emit("competition:updated");
      }
      if (url.includes("/api/guild-tournaments/overview")) {
        const d = await resp.clone().json();
        updateState({ competitionCache: { ...state.competitionCache, guild: d } });
        L.fetch(`\u516C\u4F1A\u8D5B(cur=${!!d.current}, up=${d.upcoming?.length || 0})`);
        bus.emit("competition:updated");
      }
      if (url.includes("/api/fishing/state") || url.includes("/api/fishing/sync")) {
        const d = await resp.clone().json();
        if (d.playerPatch?.relics !== void 0) updateState({ playerRelics: d.playerPatch.relics });
        if (d.playerPatch?.fragments !== void 0) updateState({ playerFragments: d.playerPatch.fragments });
        if (d.playerPatch?.gold !== void 0) updateState({ playerGold: d.playerPatch.gold });
        if (d.playerPatch?.unspentStatPoints !== void 0) {
          const prev2 = state.unspentStatPoints;
          updateState({ unspentStatPoints: d.playerPatch.unspentStatPoints });
          if (d.playerPatch.unspentStatPoints > 0 && d.playerPatch.unspentStatPoints !== prev2) autoAllocateStats();
        }
        if (d.run?.snapshot?.effects?.guild?.totemLevels) updateState({ guildTotemLevels: d.run.snapshot.effects.guild.totemLevels });
        if (d.nextDailyHarvestResetAt) updateState({ nextHarvestResetAt: Date.parse(d.nextDailyHarvestResetAt) });
        if (d.activeBuffs) {
          updateState({ _activeBuffs: d.activeBuffs });
          const now2 = Date.now();
          for (const b of d.activeBuffs) {
            if (b.buffType && b.endsAt) {
              const g = activeBuffGroup(b);
              if (g && new Date(b.endsAt).getTime() > now2) state.buffExpiryCache.set(g, b.endsAt);
            }
          }
        }
        if (url.includes("/api/fishing/sync") && settings.showEnhancements && settings.showPity && state._pityLoaded && d?.lastResult) {
          trackPityCast(d.lastResult.rarity);
          recordRareCatch(d.lastResult);
          injectPityPanel();
        }
        bus.emit("fishing:updated", d);
      }
      if (url.includes("/api/events/world-boss") && !url.includes("/api/events/world-boss/")) {
        try {
          const d = await resp.clone().json();
          updateState({ worldBoss: d });
        } catch (_) {
        }
      }
      if (url.includes("/api/party-boats/overview")) {
        try {
          const d = await resp.clone().json();
          const members = d?.crew?.members;
          if (Array.isArray(members) && members.length) {
            let lowest = null;
            for (const m of members) {
              const lv = m?.identity?.level;
              if (typeof lv === "number" && (lowest === null || lv < lowest)) lowest = lv;
            }
            updateState({ partyLowestLevel: lowest, _partyLevelAt: Date.now() });
          } else {
            updateState({ partyLowestLevel: null, _partyLevelAt: Date.now() });
          }
        } catch (_) {
        }
      }
    } catch (e) {
      warn("\u62E6\u622A\u5668\u5F02\u5E38:", e.message);
    }
    return resp;
  };
  onTeardown(() => {
    window.fetch = originalFetch;
  });
  bus.on("competition:updated", async () => {
    L.event("competition:updated \u2192 \u62A5\u540D+\u5207\u56FE");
    dismissCompetitionReminder();
    if (!state.paused) {
      await autoRegisterPersonal();
      await autoRegisterGuild();
      checkRespecStart();
      if (state.appGame) {
        makeDecision(state.appGame);
        evaluateBait();
      }
    }
  });
  bus.on("fishing:updated", (d) => {
    attemptDailyCheckIn();
    const g = state.appGame || window.arcaneReelax;
    if (!g) return;
    const snap = g.getSnapshot();
    const sig = fishingSig(snap);
    const isNewCast = sig !== state._lastFishingSig;
    if (isNewCast) {
      state._lastFishingSig = sig;
      if (!state.paused) scheduleRefill();
    }
    if (settings.showEnhancements && settings.showPity) {
      const tier = getLuckTier();
      if (state._lastLuckTier >= 0 && tier !== state._lastLuckTier) {
        L.pity(`\u8FD0\u6C14\u6863\u4F4D\u53D8\u5316 ${state._lastLuckTier}\u2192${tier}`);
        state._lastLuckTier = tier;
        fetchPity();
      }
      const baitId = snap?.baits?.find((b) => b.isSelected)?.id || "";
      if (state._lastBaitId && baitId !== state._lastBaitId) {
        L.pity(`\u9C7C\u9975\u53D8\u5316 ${state._lastBaitId}\u2192${baitId}`);
        state._lastBaitId = baitId;
        fetchPity();
      }
      if (!state._lastBaitId) state._lastBaitId = baitId;
    }
    try {
      const s = snap;
      if (s?.biomes) {
        const c = s.biomes.find((b) => b.isCurrent);
        if (c?.weather) updateState({ currentWeatherId: c.weather.id });
      }
    } catch (_) {
    }
    if (state.paused) return;
    if (settings.autoBuyBuffs) checkAndBuyBuffs();
    checkBaitScene();
    if (settings.autoBait) checkBaitFallback();
    if (settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
    const dipCheck = (settingOn, dipSeq, dipKey, label, needWither) => {
      if (!settingOn) return;
      const seq = getPersonalCompContext()?.sequence || "";
      if (!seq || dipSeq === seq) return;
      if (!personalDipScoreMet(needWither)) return;
      if (dipKey === "_witherDipSeq") state._witherDipSeq = seq;
      else state._dipSeq = seq;
      L.map(`${label}: \u79EF\u5206\u5DF2\u6EE1\u8DB3\uFF0C\u6807\u8BB0\u5B8C\u6210`);
      OpLog.info("\u5207\u56FE", `${label}: \u5DF2\u83B7\u53C2\u4E0E\u79EF\u5206\uFF0C\u8DF3\u8FC7\u672C\u6B21\u4E2A\u4EBA\u8D5B`);
      if (settings.autoRespecPersonal) applyPostRespec();
      else if (settings.autoLoadout) switchLoadout(settings.loadoutAfter);
      if (state.appGame) makeDecision(state.appGame);
    };
    dipCheck(settings.witherTideDipPersonal, state._witherDipSeq, "_witherDipSeq", "\u67AF\u6F6E\u8E6D\u5956", true);
    dipCheck(settings.dipPersonal, state._dipSeq, "_dipSeq", "\u4E2A\u4EBA\u8D5B\u8E6D\u5956", false);
    if (isNewCast && state.baitCache) {
      const selBait = (g.getSnapshot()?.baits || []).find((b) => b.isSelected);
      if (selBait && !selBait.isUnlimited) {
        const entry = state.baitCache.find((b) => b.id === selBait.id);
        if (entry && entry.quantity > 0) {
          entry.quantity--;
          if (entry.quantity <= 0) refreshBaitData();
        }
      }
    }
  });
  async function ensureContentMap() {
    if (Object.keys(state._fishNameMap).length > 0) return;
    try {
      const d = await apiFetch("/api/content/bootstrap");
      if (Array.isArray(d.fish)) {
        for (const f of d.fish) {
          if (f.rarity === "exotic" || f.rarity === "arcane") state._fishNameMap[f.id] = f.name;
        }
      }
      if (Array.isArray(d.biomes)) {
        for (const b of d.biomes) state._biomeNameMap[b.id] = b.name;
      }
      L.fetch("\u5185\u5BB9\u914D\u7F6E(\u9C7C\u540D/\u56FE\u540D)\u515C\u5E95\u62C9\u53D6\u5B8C\u6210");
    } catch (_) {
    }
  }
  function applySettings() {
    settings.showEnhancements && settings.showPity ? startPity() : stopPity();
    settings.showEnhancements && settings.showGearPercent ? startGearPercent() : stopGearPercent();
    if (state.paused) return;
    L.cfg(`\u5E94\u7528: refill=${settings.autoRefill} map=${settings.autoSwitchMap} checkIn=${settings.autoCheckIn} comp=${settings.autoDismissCompetition} offline=${settings.autoDismissOffline} buff=${settings.autoBuyBuffs} reg=${settings.autoRegisterPersonal} alloc=${settings.autoAllocateStats} bait=${settings.autoBait} respecP=${settings.autoRespecPersonal} respecG=${settings.autoRespecGuild} loadout=${settings.autoLoadout} party=${settings.autoPartyTravel} exMastery=${settings.excludeMasteryBonus} exGuild=${settings.excludeGuildBoost}`);
    settings.autoGeneral && settings.autoRefill ? scheduleRefill() : stopRefill();
    if (settings.autoSwitchMap && state.appGame) makeDecision(state.appGame);
    if (settings.autoGeneral && (settings.autoDismissOffline || settings.autoDismissCompetition)) startDomObserver();
    else stopDomObserver();
    if (settings.autoGeneral && settings.autoCheckIn) attemptDailyCheckIn();
    if (settings.autoGeneral && settings.autoDismissCompetition) dismissCompetitionReminder();
    if (settings.autoBuyBuffs && state.playerRelics > 0) checkAndBuyBuffs();
    if (settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
    if (settings.autoCompetition && (settings.autoRespecPersonal || settings.autoRespecGuild)) checkRespecStart();
    else if ((isCompetitionActive("personal") || isCompetitionActive("guild")) && state._prevAnyRespec && !statsMatchPostRespec()) applyPostRespec();
    updateState({ _prevAnyRespec: settings.autoCompetition && (settings.autoRespecPersonal || settings.autoRespecGuild) });
    const effectiveAutoLoadout = settings.autoCompetition && settings.autoLoadout;
    if (!effectiveAutoLoadout && state._prevAutoLoadout) switchLoadout(settings.loadoutAfter);
    else if (effectiveAutoLoadout && !state._prevAutoLoadout) {
      if (onAnyCompMap()) switchLoadout(settings.loadoutSlot);
    }
    updateState({ _prevAutoLoadout: effectiveAutoLoadout });
    settings.sellFishEnabled ? startSellFish() : stopSellFish();
    settings.sellGearEnabled ? startSellGear() : stopSellGear();
  }

  // src/main.js
  async function main() {
    try {
      const game = await waitForGameAPI();
      if (!game) {
        error("\u672A\u83B7\u53D6\u5230 game \u5BF9\u8C61");
        return;
      }
      updateState({ appGame: game });
      L.init("API\u5C31\u7EEA");
      await game.ready;
      L.init("\u6570\u636E\u5C31\u7EEA");
      const snap = game.getSnapshot();
      if (settings.debugLog && snap) {
        L.init(`\u5FEB\u7167: \u5F53\u524D=${snap.currentBiomeId}, \u89E3\u9501=${(snap.biomes?.filter((b) => b.isUnlocked) || []).length}\u5F20`);
        (snap.biomes?.filter((b) => b.isUnlocked) || []).forEach((b) => L.init(`${b.id} ${b.name}${b.isCurrent ? " [\u5F53\u524D]" : ""} ${b.weather?.name || "?"}`));
      }
      if (snap?.biomes) {
        const c = snap.biomes.find((b) => b.isCurrent);
        if (c?.weather) updateState({ currentWeatherId: c.weather.id });
      }
      loadCatchLog();
      ensureContentMap();
      loadBalance();
      loadLedger();
      attachUI();
      updatePanelInfo(snap);
      renderBaitControls(snap);
      evaluateBait();
      updateModeStatus(snap);
      applySettings();
      renderPriorities();
      refreshBaitData();
      checkRespecStart();
      attemptDailyCheckIn();
      dismissCompetitionReminder();
      reportUsage();
      checkVersion();
      const versionTimer = setInterval(() => checkVersion(), 60 * 60 * 1e3);
      onTeardown(() => clearInterval(versionTimer));
      maybeShowUpdateLog();
      let _weatherDebounce = null;
      game.on("weather:changed", ({ biomeId, previous, current }) => {
        const snap2 = game.getSnapshot();
        const curBiomeId = snap2?.biomes?.find((b) => b.isCurrent)?.id;
        if (biomeId === curBiomeId) updateState({ currentWeatherId: current.id });
        updatePanelInfo(snap2);
        if (_weatherDebounce) clearTimeout(_weatherDebounce);
        _weatherDebounce = setTimeout(() => {
          _weatherDebounce = null;
          if (settings.showEnhancements && settings.showPity) {
            L.pity(`\u5929\u6C14\u53D8\u5316\u2192${current.id}\uFF0C\u91CD\u65B0\u6821\u51C6`);
            fetchPity();
          }
          if (state.paused) return;
          if (settings.autoBuyBuffs) checkAndBuyBuffs();
          if (settings.autoSwitchMap) makeDecision(game);
          evaluateBait();
        }, 1200);
      });
      game.on("competition:started", ({ competition }) => {
        dismissCompetitionReminder();
        if (state.paused) return;
        if (settings.autoSwitchMap) makeDecision(game);
        evaluateBait();
        if (settings.autoCompetition && shouldActForComp(competition.kind)) {
          if (respecEnabled(competition.kind)) doRespec(competition.kind);
          if (settings.autoLoadout) switchLoadout(settings.loadoutSlot);
        }
      });
      game.on("guild-boost:started", () => {
        updatePanelInfo(game.getSnapshot());
        if (state.paused) return;
        if (settings.autoSwitchMap) makeDecision(game);
      });
      game.on("guild-boost:ended", () => {
        updatePanelInfo(game.getSnapshot());
      });
      const panelTimer = setInterval(() => {
        if (state.appGame) {
          const s = state.appGame.getSnapshot();
          updatePanelInfo(s);
          updateModeStatus(s);
          renderBaitControls(s);
          injectCastStats();
          injectBalanceDisplay();
          if (!state.paused) checkBaitScene();
        }
      }, 5e3);
      onTeardown(() => clearInterval(panelTimer));
      checkDailyReset();
      const balanceTimer = setInterval(() => {
        checkDailyReset();
        injectBalanceDisplay();
      }, 6e4);
      document.addEventListener("click", onDocClickBalanceToggle);
      document.addEventListener("click", onDocClickLedgerToggle);
      onTeardown(() => {
        clearInterval(balanceTimer);
        document.removeEventListener("click", onDocClickBalanceToggle);
        document.removeEventListener("click", onDocClickLedgerToggle);
        closeBalanceLog();
      });
      window.switchToBiome = async (biomeId) => {
        if (!biomeId) return warn("\u7F3A\u5C11biomeId");
        try {
          await game.biomes.travelTo(biomeId);
          updateState({ lastSwitchTime: Date.now() });
        } catch (err) {
          error("\u5207\u6362\u5931\u8D25:", err);
        }
      };
      window.checkBuffs = checkAndBuyBuffs;
      window.applyPostRespec = applyPostRespec;
      window.destroyArcaneAssistant = () => {
        stopDomObserver();
        stopRefill();
        for (const fn of teardowns.reverse()) {
          try {
            fn();
          } catch (_) {
          }
        }
        teardowns.length = 0;
        const host = document.getElementById("script-panel-host");
        if (host) host.remove();
        state.shadowRoot = null;
        console.log(`${ts()} [\u8F85\u52A9\u811A\u672C] \u5DF2\u5378\u8F7D`);
      };
      L.init("\u2705 \u521D\u59CB\u5316\u5B8C\u6210");
    } catch (err) {
      error("\u521D\u59CB\u5316\u5931\u8D25:", err);
    }
  }
  main();
})();


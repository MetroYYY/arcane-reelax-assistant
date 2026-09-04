    // ============================================================
    // 1. 常量与配置
    // ============================================================

export const SCRIPT_VERSION = '2.1.3';
export const STORAGE_KEY = 'arcane_auto_settings';

export const DEFAULTS = {
        autoCompetition: true, autoGeneral: true, showEnhancements: true,
        autoRefill: true, autoSwitchMap: true, autoGuild: true, autoPersonal: true,
        autoRegisterPersonal: true, autoRegisterGuild: false, autoBuyBuffs: false, autoGuildBiomeBoost: false,
        guildBiomeBoostAfterTravel: true, guildBiomeBoostByMemberCount: false, guildBiomeBoostMemberThreshold: 10, debugLog: false,
        buffSelections: {},
        autoCheckIn: true, autoDismissCompetition: true, autoDismissOffline: true, autoReconnect: true,
        mapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold', 'strengthluck'],
        designatedBiomeId: '', partyDesignatedBiomeId: '',
        autoBait: false, baitByScene: {}, baitFallback: true, baitAutoBuy: true,
        autoPartyTravel: false, partyLimitByCrew: false, partyMapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold', 'strengthluck'],
        autoPartyDailyDeposit: false, partyDailyDepositGold: 1500000,
        autoPartyRenewal: false, partyRenewalBillingUnit: 'day',
        autoAllocateStats: false, statAllocationTarget: 'intelligence',
        autoEquipmentProfiles: true, profileEngineMode: 'full', profileMigrationVersion: 0,
        equipmentProfiles: {}, sceneProfileBindings: {},
        statAllocationOrder: ['strength', 'intelligence', 'endurance', 'luck'],
        statLoadoutTab: 1,
        statCorrectionTolerance: 3,
        statLoadoutProfiles: {
            1: { enabled: true, order: ['strength', 'intelligence', 'endurance', 'luck'], fixed: { strength: 1700, intelligence: 2000, luck: 0, endurance: 100 } },
            2: { enabled: false, order: ['strength', 'intelligence', 'endurance', 'luck'], fixed: { strength: 1700, intelligence: 2000, luck: 0, endurance: 100 } },
            3: { enabled: false, order: ['strength', 'intelligence', 'endurance', 'luck'], fixed: { strength: 1700, intelligence: 2000, luck: 0, endurance: 100 } },
            4: { enabled: false, order: ['strength', 'intelligence', 'endurance', 'luck'], fixed: { strength: 1700, intelligence: 2000, luck: 0, endurance: 100 } },
        },
        excludeMasteryBonus: false, excludeGuildBoost: false,
        strengthLuckGildedFactor: 1.17,
        autoRespecPersonal: false, autoRespecGuild: false,
        respecStrengthTarget: 1700,
        postRespecRemainderStat: 'luck',
        postRespecFixed: { strength: 1700, intelligence: 2000, luck: 0, endurance: 100 },
        autoLoadout: false, loadoutSlot: 2, loadoutAfter: 1,
        competitionRodId: '', postCompetitionRodId: '',
        skipWitherTidePersonal: false, witherTideDipPersonal: false, witherDipReturnOnArcane: false, dipPersonal: false,
        partyDipPersonal: false, partyDipMinutes: 10,
        autoWorldBoss: false, autoWorldBossRegister: false, autoWorldBossRespec: false, autoWorldBossLoadout: false,
        autoDismissAbyssTideWarning: true,
        worldBossNoRespecMaxDamage: false,
        worldBossRespecBeforeMin: 3, worldBossRespecAfterMin: 3,
        worldBossLoadoutDuring: 2, worldBossLoadoutAfter: 1,
        worldBossLoadoutByWeaknessEnabled: false,
        worldBossLoadoutByWeakness: { strength: 2, intelligence: 2, luck: 2, endurance: 2 },
        worldBossRodDuring: '', worldBossRodAfter: '',
        worldBossRodByWeakness: { strength: '', intelligence: '', luck: '', endurance: '' },
        autoArcaneSacrifice: false,
        arcaneSacrificeTargetBasisPoints: 100,
        arcaneSacrificeFallbackHalf: false,
        arcaneSacrificeByResource: {
            gold: { targetBasisPoints: 100, fallbackHalf: false },
            relic: { targetBasisPoints: 100, fallbackHalf: false },
            fish: { targetBasisPoints: 100, fallbackHalf: false },
        },
        arcaneSacrificeFishRarities: ['common', 'uncommon', 'fine', 'rare'],
        pauseFishSellingForSacrifice: false,
        autoMasterySacrifice: false,
        masterySacrificeByBiome: {},
        viewMode: 'dashboard', paused: false, showPity: true, showTheoreticalCasts: true, showBalance: true, showGearPercent: true, gearPercentDecimals: 1,
        surveySubmittedAt: 0, lastReportAt: 0, lastSuggestionAt: 0, surveySubmittedId: '',
        // 卖鱼
        sellFishEnabled: false,
        sellFishRarities: ['common', 'uncommon', 'fine', 'rare', 'epic'],  // 默认卖到史诗
        sellFishIntervalMin: 30,                                            // 定时分钟 3~1440
        // 卖装备
        sellGearEnabled: false,
        sellGearRarities: ['common', 'uncommon', 'fine', 'rare', 'epic'],
        sellGearQualities: { common: 60, uncommon: 60, fine: 60, rare: 60, epic: 60 },  // 每档品质阈值 0~100
        sellGearIntervalMin: 30,
    };

export const BUFF_CONFIG = {
        'relic-xp-i': { productId: 'relic-xp-i', name: '经验 +30%', price: 75, group: 'experience' },
        'relic-xp-ii': { productId: 'relic-xp-ii', name: '经验 +75%', price: 150, group: 'experience' },
        'relic-strength-i': { productId: 'relic-strength-i', name: '力量 +10%', price: 75, group: 'strength' },
        'relic-strength-ii': { productId: 'relic-strength-ii', name: '力量 +25%', price: 150, group: 'strength' },
        'relic-luck-i': { productId: 'relic-luck-i', name: '运气 +10%', price: 75, group: 'luck' },
        'relic-luck-ii': { productId: 'relic-luck-ii', name: '运气 +25%', price: 150, group: 'luck' },
        'fragment-personal-xp': { productId: 'fragment-personal-xp', name: '碎光顿悟 +25%经验', price: 20, group: 'fragment', currency: 'fragments', buffType: 'experience' },
    };

export const BUFF_GROUPS = {
        experience: { label: '经验加成（遗物）', options: ['relic-xp-i', 'relic-xp-ii'] },
        strength: { label: '力量加成（遗物）', options: ['relic-strength-i', 'relic-strength-ii'] },
        luck: { label: '运气加成（遗物）', options: ['relic-luck-i', 'relic-luck-ii'] },
        fragment: { label: '经验加成（奥秘碎片）', options: ['fragment-personal-xp'] },
    };

export const WEATHER_ID_TO_NAME = {
        'clear':'晴朗','rain':'雨幕','gale':'强风','mist':'浓雾',
        'heatwave':'热浪','tempest':'雷暴','wither_tide':'枯潮',
        'gilded_current':'金风','arcane_surge':'奥秘涌流',
    };
export const WEATHER_NAME_TO_ID = Object.fromEntries(Object.entries(WEATHER_ID_TO_NAME).map(([k,v]) => [v,k]));

    // 图价值倍率（biome 静态定义：渔获价值随等级递增，b_001=1.0 → b_015=1.7）
export const BIOME_VALUE_MULTIPLIER = {
        b_001: 1.00, b_002: 1.05, b_003: 1.10, b_004: 1.15, b_005: 1.20,
        b_006: 1.25, b_007: 1.30, b_008: 1.35, b_009: 1.40, b_010: 1.45,
        b_011: 1.50, b_012: 1.55, b_013: 1.60, b_014: 1.65, b_015: 1.70,
    };
    // 力运天气价值系数：稀有度加成量化（晴1.0 → 雷暴1.25），金风=直接金币经验值，枯潮负向
export const STRENGTHLUCK_WEATHER_FACTOR = {
        clear: 1.00, rain: 1.02, gale: 1.03, mist: 1.08, heatwave: 1.13,
        tempest: 1.25, wither_tide: 0.75, gilded_current: 1.17,
    };

export const BAIT_SCENES = [
        { key:'personalCompetition', label:'个人赛' },
        { key:'guildCompetition', label:'公会赛' },
        { key:'golden', label:'金风' },
        { key:'arcaneSurge', label:'奥秘涌流' },
        { key:'normal', label:'其他天气' },
    ];
export const BAIT_TIER_ORDER = ['bait_supreme', 'bait_high', 'bait_medium', 'bait_low', 'bait_basic'];

export const BUFF_COOLDOWN_MS = 25 * 60 * 1000; // 同类型购买后 25 分钟内不再买（Buff 最短30分钟，冷却本身就足以防重复）

export const RESPEC_COST = 10000;
export const INIT_ENDURANCE = 0;
export const RESPEC_COOLDOWN_MS = 30 * 1000;         // 两次洗点之间至少间隔 30 秒（打断死循环即可）
export const RESPEC_BURST_WINDOW_MS = 2 * 60 * 1000; // 爆发检测窗口：2 分钟内
export const RESPEC_BURST_MAX = 3;                   // 窗口内最多 3 次（正常切换方案不可能这么快）
export const DAILY_RESPEC_MAX = 20;                  // 每日最多洗点 20 次（4场比赛×2次洗点=8次，留足余量）
export const DAILY_RESPEC_GOLD_LIMIT = 200000;       // 每日洗点消费熔断（过午夜重置）

export const PRIORITY_TYPES = [
        { key:'competition', label:'比赛', short:'赛', desc:'有已报名且进行中的比赛时，优先前往比赛地图' },
        { key:'designated', label:'指定图', short:'定', desc:'前往你手动选择的地图，适合刷专精' },
        { key:'goldwind', label:'金风', short:'金', desc:'出现金风天气时前往，每条鱼额外获得 300~500 金币' },
        { key:'experience', label:'经验', short:'XP', desc:'总经验加成最高的地图' },
        { key:'gold', label:'金币', short:'G', desc:'去已解锁最高等级地图' },
        { key:'strengthluck', label:'力运', short:'力', desc:'按地图价值和当前天气综合评分，选择力运收益更高的地图。' },
    ];

export const SETTING_SCHEMA = [
        { key:'autoRefill', label:'自动补杆' },
        { key:'autoGuild', label:'自动进公会赛' },
        { key:'autoPersonal', label:'自动进个人赛' },
        { key:'autoRegisterPersonal', label:'自动报名个人赛' },
        { key:'autoRegisterGuild', label:'自动报名公会赛' },
        { key:'autoCheckIn', label:'每日签到' },
        { key:'autoDismissCompetition', label:'赛事弹窗稍后处理' },
        { key:'autoDismissOffline', label:'离线结算弹窗处理' },
        { key:'showPity', label:'保底显示' },
        { key:'showTheoreticalCasts', label:'理论竿数计算' },
        { key:'showBalance', label:'今日净赚/盈亏' },
        { key:'debugLog', label:'调试日志' },
    ];

    // 卖鱼/卖装备：可卖稀有度（普通~传说；神话/奇异/奥秘固定保留）
export const RARITY_META = {
        common:    { label: '普通', color: '#9ca3af' },
        uncommon:  { label: '罕见', color: '#22c55e' },
        fine:      { label: '精良', color: '#14b8a6' },
        rare:      { label: '稀有', color: '#3b82f6' },
        epic:      { label: '史诗', color: '#a855f7' },
        legendary: { label: '传说', color: '#f59e0b' },
    };
export const FISH_SELL_RARITIES = ['common', 'uncommon', 'fine', 'rare', 'epic', 'legendary'];  // 鱼可卖到传说
export const GEAR_SELL_RARITIES = ['common', 'uncommon', 'fine', 'rare', 'epic'];               // 装备游戏只支持到史诗

    // 采集服务地址（问卷 / 使用统计 / 错误报告）
export const COLLECT_BASE = 'https://reelax.hsiyue.com';
export const DOWNLOAD_URL = 'https://reelax.hsiyue.com/arcane-assistant.user.js'; // 脚本下载/更新地址
export const REPORT_COOLDOWN_MS = 10 * 60 * 1000; // 客户端报告冷却（与服务端一致）

    // 本次版本更新说明（发新版时改这里，玩家第一次载入新版本会弹窗展示一次）
export const UPDATE_NOTES = '【新增】\n\n- 【脚本面板】设置界面从悬浮窗改为游戏内嵌 UI。可从游戏左侧导航栏点击“辅助设置”打开；当前第一版沿用原设置内容，后续会全面重写。\n\n- 【其他－通用辅助】增加自动重连。仅用于服务器无法连接、被踢到登录页但原登录信息仍有效的情况，脚本会尝试直接刷新页面恢复；目前仅在测试服验证，正式服请自行观察效果。\n\n- 【资产－属性加点】增加属性加点误差自定义，可设置自动加点纠偏时允许的目标浮动点数。\n\n- 【日常－地图导航】力运优先级增加金风权重设置，默认 1.17；设为 0 时不把金风地图纳入力运计算。\n\n- 【文档站】增加各版本脚本下载链接。怎么这么多人用旧版本，不怕 bug 吗（怕新版本 bug？）。\n\n- 【日常－公会管理】增加按地图公会人数自动开启增益，可设置 1～50 人阈值；达到人数后自动尝试开启对应地图增益（公会钱能不能都给我啊？）。\n\n- 【反馈－工单】增加工单系统，可与作者对话并查看历史工单（快来和我高延迟聊天吧？）。\n\n【修复】\n\n- 【赛事－奥秘献祭】修复下一轮鱼类献祭触发暂停卖鱼后，因轮次判断错误导致献祭结束仍未恢复自动卖鱼的问题。\n\n- 【日常－地图导航】增加 60～90 秒随机低频复核，整点天气变化事件偶尔漏发时会重新检查并补切地图。\n\n- 【赛事－比赛辅助】增加 2～3 分钟随机低频复核，主动刷新比赛状态并补做个人赛、公会赛报名与比赛切图检查。\n\n- 【日常－购买 Buff】修复碎片经验 Buff 与遗物经验 Buff 都被识别为同一经验分组，导致其中一种生效时另一种被误报为“已在生效”的问题；手动检查现在会重新读取服务端 Buff 状态。\n\n【优化】\n\n- 【反馈】恢复上一版本误删的问卷调查结果入口（填问卷，社区上门送温暖！）。\n\n- 【反馈－工单】关闭调试日志时也会在后台保留诊断记录；提交 Bug 工单会自动附带运行状态与详细日志。\n\n- 【后续计划】本次更新属于小型迭代，后续将更新一个方案库一次性解决玩家定制化需求，功能都会逐步端上来，不要着急。“我知道，我知道！做完你的做你的，做完你的做他的！”（bushi\n\n【移除】\n\n- 【赛事－奥秘献祭】删除测试警告（都测过了测过了，没问题没问题）。\n\n**支持开发**\n\n赞助完全自愿，不会影响任何脚本功能、更新、工单回复或问题反馈。收到的赞助将用于辅助开发工具额度、文档站与下载服务、统计及反馈服务、域名和其他直接维护费用；不会提供赞助者专属功能，也不会改变功能优先级。\n\n[**查看赞助方式、功德碑和资金流向 ↗**](https://reelax.hsiyue.com/faq/%E5%85%B3%E4%BA%8E/%E6%94%AF%E6%8C%81%E5%BC%80%E5%8F%91/)';

    // 问卷 ID：换问卷内容时才改；同 ID 只填一次，跨版本保持已填记录
export const SURVEY_ID = 'sponsorship-survey-v1';
    // 问卷题目（围绕「自愿赞助」接受度调研）
export const SURVEY_QUESTIONS = [
        { id:'acceptSponsor', type:'choice', label:'你能接受脚本提供完全自愿的赞助入口吗？', options:['接受','不接受','无所谓'] },
        { id:'sponsorChannel', type:'multi', label:'如果开放赞助，你能接受哪些方式？（可多选）', options:['微信赞赏码','支付宝收款码','爱发电等赞助平台','只接受入口，暂不考虑赞助'] },
        { id:'publicLedger', type:'choice', label:'你希望公开赞助收入和使用情况吗？', options:['希望定期公开','不必公开','无所谓'] },
        { id:'suggest', type:'text', label:'关于赞助或脚本开发的其他建议', placeholder:'选填' },
    ];

    // 保底显示：稀有度渐变色（与游戏前端一致）、鱼饵运气、保底校准间隔
export const RELEASE_NOTES = '本次更新属于小型迭代，后续将更新一个方案库一次性解决玩家定制化需求，功能都会逐步端上来，不要着急。“我知道，我知道！做完你的做你的，做完你的做他的！”（bushi\n\n**【新增】**\n\n- 【脚本面板】设置界面从悬浮窗改为游戏内嵌 UI。可从游戏左侧导航栏点击“辅助设置”打开；当前第一版沿用原设置内容，后续会全面重写。\n\n- 【其他－通用辅助】增加自动重连。仅用于服务器无法连接、被踢到登录页但原登录信息仍有效的情况，脚本会尝试直接刷新页面恢复；目前仅在测试服验证，正式服请自行观察效果。\n\n- 【资产－属性加点】增加属性加点误差自定义，可设置自动加点纠偏时允许的目标浮动点数。\n\n- 【日常－地图导航】力运优先级增加金风权重设置，默认 1.17；设为 0 时不把金风地图纳入力运计算。\n\n- 【文档站】增加各版本脚本下载链接（怎么这么多人用旧版本，不怕 bug 吗？怕新版本 bug？）。\n\n- 【日常－公会管理】增加按地图公会人数自动开启增益，可设置 1～50 人阈值；达到人数后自动尝试开启对应地图增益（公会钱能不能都给我啊？）。\n\n- 【反馈－工单】增加工单系统，可与作者对话并查看历史工单（快来和我高延迟聊天吧？）。\n\n**【修复】**\n\n- 【赛事－奥秘献祭】修复下一轮鱼类献祭触发暂停卖鱼后，因轮次判断错误导致献祭结束仍未恢复自动卖鱼的问题。\n\n- 【日常－地图导航】增加 60～90 秒随机低频复核，整点天气变化事件偶尔漏发时会重新检查并补切地图。\n\n- 【赛事－比赛辅助】增加 2～3 分钟随机低频复核，主动刷新比赛状态并补做个人赛、公会赛报名与比赛切图检查。\n\n- 【资产－购买 Buff】修复碎片经验 Buff 与遗物经验 Buff 都被识别为同一经验分组，导致其中一种生效时另一种被误报为“已在生效”的问题；手动检查现在会重新读取服务端 Buff 状态。\n\n**【优化】**\n\n- 【反馈】恢复上一版本误删的问卷调查结果入口（填问卷，社区上门送温暖！）。\n\n- 【资产－购买 Buff】将购买 Buff 从“日常”移动到“资产”。\n\n- 【反馈－工单】关闭调试日志时也会在后台保留诊断记录；提交 Bug 工单会自动附带运行状态与详细日志。\n\n**【移除】**\n\n- 【赛事－奥秘献祭】删除测试警告（都测过了测过了，没问题没问题）。\n\n**支持开发**\n\n赞助完全自愿，不会影响任何脚本功能、更新、工单回复或问题反馈。收到的赞助将用于辅助开发工具额度、文档站与下载服务、统计及反馈服务、域名和其他直接维护费用；不会提供赞助者专属功能，也不会改变功能优先级。\n\n[**查看赞助方式、功德碑和资金流向 ↗**](https://reelax.hsiyue.com/faq/%E5%85%B3%E4%BA%8E/%E6%94%AF%E6%8C%81%E5%BC%80%E5%8F%91/)';

export const RARITY_GRADIENTS = {
        exotic: 'linear-gradient(135deg, #06B6D4, #8B5CF6)',
        arcane: 'linear-gradient(135deg, #A855F7, #EC4899, #F59E0B)'
    };
export const BAIT_LUCK = { bait_basic: 0, bait_low: 0, bait_medium: 250, bait_high: 500, bait_supreme: 1000 };
export const PITY_CALIBRATION_MS = 10 * 60 * 1000; // 周期兜底校准：10 分钟
export const PITY_CYCLE_MS = 6000; // 单杆周期 6 秒
export const CATCH_LOG_KEY = 'arcane_rare_catch_log'; // 奇异/奥秘钓获记录本地存储 key
export const BALANCE_HISTORY_KEY = 'arcane_daily_balance_history'; // 每日盈亏历史存储 key
export const BALANCE_SNAPSHOT_KEY = 'arcane_daily_balance_snapshot'; // 每日盈亏基准快照存储 key
export const LEDGER_KEY = 'arcane_daily_ledger'; // 每日收支明细账本存储 key
export const CURRENCY_COLORS = { gold: '#f0bd61', relic: '#a78bfa', fragment: '#ec4899' }; // 金币/遗物/碎片游戏风格色

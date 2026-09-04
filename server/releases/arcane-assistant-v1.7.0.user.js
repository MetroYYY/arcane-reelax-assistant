// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.7.0
// @description  自动切图、补杆、自动报名、买Buff、签到、加点/比赛洗点、场景切饵、卖鱼卖装备、每日盈亏、奇异奥秘记录
// @author       deepseek & yy
// @match        https://reelax.abang666.com/*
// @match        https://reelax.cn/*
// @grant        none
// @run-at       document-end
// @noframes
// @icon         https://reelax.abang666.com/branding/arcane-reelax-favicon-64.png
// @updateURL    https://reelax.hsiyue.com/arcane-assistant.user.js
// @downloadURL  https://reelax.hsiyue.com/arcane-assistant.user.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 1. 常量与配置
    // ============================================================

    const SCRIPT_VERSION = '1.7.0';
    const STORAGE_KEY = 'arcane_auto_settings';

    const DEFAULTS = {
        autoRefill: true, autoSwitchMap: true, autoGuild: true, autoPersonal: true,
        autoRegisterPersonal: true, autoBuyBuffs: false, debugLog: false,
        buffSelections: {},
        autoCheckIn: true, autoDismissCompetition: true, autoDismissOffline: true,
        mapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold'],
        designatedBiomeId: '', partyDesignatedBiomeId: '', isPanelCollapsed: false, dockRight: -1, dockTop: -1, ballRight: -1, ballTop: -1,
        autoBait: false, baitByScene: {}, baitFallback: true, baitAutoBuy: true,
        autoPartyTravel: false, partyMapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold'],
        autoAllocateStats: false, statAllocationTarget: 'intelligence',
        excludeMasteryBonus: false, excludeGuildBoost: false,
        autoRespecPersonal: false, autoRespecGuild: false,
        respecStrengthTarget: 1700,
        autoLoadout: false, loadoutSlot: 2,
        skipWitherTidePersonal: false, witherTideDipPersonal: false, dipPersonal: false,
        partyDipPersonal: false, partyDipMinutes: 10,
        sectionCollapsed: {},
        viewMode: 'settings', paused: false, showPity: true, showTheoreticalCasts: true, showBalance: true,
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

    const BUFF_CONFIG = {
        'relic-xp-i': { productId: 'relic-xp-i', name: '经验 +30%', price: 75, group: 'experience' },
        'relic-xp-ii': { productId: 'relic-xp-ii', name: '经验 +75%', price: 150, group: 'experience' },
        'relic-strength-i': { productId: 'relic-strength-i', name: '力量 +10%', price: 75, group: 'strength' },
        'relic-strength-ii': { productId: 'relic-strength-ii', name: '力量 +25%', price: 150, group: 'strength' },
        'relic-luck-i': { productId: 'relic-luck-i', name: '运气 +10%', price: 75, group: 'luck' },
        'relic-luck-ii': { productId: 'relic-luck-ii', name: '运气 +25%', price: 150, group: 'luck' },
        'fragment-personal-xp': { productId: 'fragment-personal-xp', name: '碎光顿悟 +25%经验', price: 20, group: 'fragment', currency: 'fragments', buffType: 'experience' },
    };

    const BUFF_GROUPS = {
        experience: { label: '经验加成（遗物）', options: ['relic-xp-i', 'relic-xp-ii'] },
        strength: { label: '力量加成（遗物）', options: ['relic-strength-i', 'relic-strength-ii'] },
        luck: { label: '运气加成（遗物）', options: ['relic-luck-i', 'relic-luck-ii'] },
        fragment: { label: '碎片Buff', options: ['fragment-personal-xp'] },
    };

    const WEATHER_ID_TO_NAME = {
        'clear':'晴朗','rain':'雨幕','gale':'强风','mist':'浓雾',
        'heatwave':'热浪','tempest':'雷暴','wither_tide':'枯潮',
        'gilded_current':'金风','arcane_surge':'奥秘涌流',
    };
    const WEATHER_NAME_TO_ID = Object.fromEntries(Object.entries(WEATHER_ID_TO_NAME).map(([k,v]) => [v,k]));

    const BAIT_SCENES = [
        { key:'personalCompetition', label:'个人赛' },
        { key:'guildCompetition', label:'公会赛' },
        { key:'golden', label:'金风' },
        { key:'arcaneSurge', label:'奥秘涌流' },
        { key:'normal', label:'其他天气' },
    ];
    const BAIT_TIER_ORDER = ['bait_supreme', 'bait_high', 'bait_medium', 'bait_low', 'bait_basic'];

    const BUFF_COOLDOWN_MS = 25 * 60 * 1000; // 同类型购买后 25 分钟内不再买（Buff 最短30分钟，冷却本身就足以防重复）

    const RESPEC_COST = 10000;
    const INIT_ENDURANCE = 0;
    const RESPEC_COOLDOWN_MS = 30 * 1000;         // 两次洗点之间至少间隔 30 秒（打断死循环即可）
    const RESPEC_BURST_WINDOW_MS = 2 * 60 * 1000; // 爆发检测窗口：2 分钟内
    const RESPEC_BURST_MAX = 3;                   // 窗口内最多 3 次（正常切换方案不可能这么快）
    const DAILY_RESPEC_MAX = 20;                  // 每日最多洗点 20 次（4场比赛×2次洗点=8次，留足余量）
    const DAILY_RESPEC_GOLD_LIMIT = 200000;       // 每日洗点消费熔断（过午夜重置）

    const PRIORITY_TYPES = [
        { key:'competition', label:'比赛', short:'赛', desc:'有已报名且进行中的比赛时，优先前往比赛地图' },
        { key:'designated', label:'指定图', short:'定', desc:'前往你手动选择的地图，适合刷专精' },
        { key:'goldwind', label:'金风', short:'金', desc:'出现金风天气时前往，每条鱼额外获得 300~500 金币' },
        { key:'experience', label:'经验', short:'XP', desc:'总经验加成最高的地图' },
        { key:'gold', label:'金币', short:'G', desc:'去已解锁最高等级地图' },
    ];

    const SETTING_SCHEMA = [
        { key:'autoRefill', label:'自动补杆' },
        { key:'autoGuild', label:'自动进公会赛' },
        { key:'autoPersonal', label:'自动进个人赛' },
        { key:'autoRegisterPersonal', label:'自动报名个人赛' },
        { key:'autoCheckIn', label:'每日签到' },
        { key:'autoDismissCompetition', label:'赛事弹窗稍后处理' },
        { key:'autoDismissOffline', label:'离线结算弹窗处理' },
        { key:'showPity', label:'保底显示' },
        { key:'showTheoreticalCasts', label:'理论竿数计算' },
        { key:'showBalance', label:'今日净赚/盈亏' },
        { key:'debugLog', label:'调试日志' },
    ];

    // 卖鱼/卖装备：可卖稀有度（普通~传说；神话/奇异/奥秘固定保留）
    const RARITY_META = {
        common:    { label: '普通', color: '#9ca3af' },
        uncommon:  { label: '罕见', color: '#22c55e' },
        fine:      { label: '精良', color: '#14b8a6' },
        rare:      { label: '稀有', color: '#3b82f6' },
        epic:      { label: '史诗', color: '#a855f7' },
        legendary: { label: '传说', color: '#f59e0b' },
    };
    const FISH_SELL_RARITIES = ['common', 'uncommon', 'fine', 'rare', 'epic', 'legendary'];  // 鱼可卖到传说
    const GEAR_SELL_RARITIES = ['common', 'uncommon', 'fine', 'rare', 'epic'];               // 装备游戏只支持到史诗

    // 采集服务地址（问卷 / 使用统计 / 错误报告）
    const COLLECT_BASE = 'https://reelax.hsiyue.com';
    const DOWNLOAD_URL = 'https://reelax.hsiyue.com/arcane-assistant.user.js'; // 脚本下载/更新地址
    const REPORT_COOLDOWN_MS = 10 * 60 * 1000; // 客户端报告冷却（与服务端一致）

    // 本次版本更新说明（发新版时改这里，玩家第一次载入新版本会弹窗展示一次）
    const UPDATE_NOTES = '【新增】\n- 自动卖鱼/卖装备给 NPC：按稀有度（装备还可设品质阈值）定时或手动卖出，锁定鱼、专精鱼、穿戴中/市场上架的装备永不卖\n- 奇异/奥秘钓获记录：本地永久存储，历史弹窗带筛选（全部/奇异/奥秘）、翻页、时间倒序和统计\n- 每日盈亏：今日金币/遗物/碎片赚亏实时显示，历史弹窗按全部/周/月汇总、翻页、总计\n- 理论竿数/掉竿统计：今日统计旁显示「理论 N 竿 / 掉竿 N」\n- 日志按标签筛选：仅影响面板显示，导出/反馈仍是全量\n\n【修复】\n- 修复保底「请求签名已失效」（版本号改从免签接口读取，不再依赖页面渲染时序）\n- 修复赛后自动洗点力量值偶尔不准（图腾加成直读图腾等级，精确到 ±1）\n- 修复天气变化日志重复刷屏\n- 修复面板/悬浮球拖动困难\n\n【优化】\n- 每次刷新不再强制打开设置页（仅新版本/首次自动展开）\n- 自动切图开关移入「自动切图」区块\n- 手风琴标题统一加「?」说明\n- 鱼饵设置切换后立即生效\n- 版本检查改为刷新即查、每小时轮询，不再有 24 小时盲区';

    // 问卷 ID：换问卷内容时才改；同 ID 只填一次，跨版本保持已填记录
    const SURVEY_ID = 'push-survey-v1';
    // 问卷题目（围绕「信息推送」需求调研）
    const SURVEY_QUESTIONS = [
        { id:'needPush', type:'choice', label:'你需要信息推送功能吗？', options:['需要','不需要','无所谓'] },
        { id:'channel', type:'multi', label:'最希望推送到哪里？（可多选）', options:['个人微信','个人QQ','企业微信','钉钉','飞书','独立App（Bark等）'] },
        { id:'appOk', type:'choice', label:'能接受装一个 App 来收推送吗？', options:['能','不能，只想用微信/QQ'] },
        { id:'content', type:'multi', label:'想接收哪些推送内容？（可多选）', options:['保底进度（逼近硬保底）','上奇异/奥秘的鱼/装备','每小时鱼获汇总','奥术涌动天气','金风天气','比赛开赛预告/结果','船队航线变动','公会增益变化'] },
        { id:'freq', type:'multi', label:'你能接受的推送频率？（可多选）', options:['只推重要事件（保底/上稀有）','每小时汇总也行','越详细越好'] },
        { id:'suggest', type:'text', label:'其他想推的内容或建议', placeholder:'选填' },
    ];

    // 保底显示：稀有度渐变色（与游戏前端一致）、鱼饵运气、保底校准间隔
    const RARITY_GRADIENTS = {
        exotic: 'linear-gradient(135deg, #06B6D4, #8B5CF6)',
        arcane: 'linear-gradient(135deg, #A855F7, #EC4899, #F59E0B)'
    };
    const BAIT_LUCK = { bait_basic: 0, bait_low: 0, bait_medium: 250, bait_high: 500, bait_supreme: 1000 };
    const PITY_CALIBRATION_MS = 10 * 60 * 1000; // 周期兜底校准：10 分钟
    const PITY_CYCLE_MS = 6000; // 单杆周期 6 秒
    const CATCH_LOG_KEY = 'arcane_rare_catch_log'; // 奇异/奥秘钓获记录本地存储 key
    const BALANCE_HISTORY_KEY = 'arcane_daily_balance_history'; // 每日盈亏历史存储 key
    const BALANCE_SNAPSHOT_KEY = 'arcane_daily_balance_snapshot'; // 每日盈亏基准快照存储 key
    const LEDGER_KEY = 'arcane_daily_ledger'; // 每日收支明细账本存储 key
    const CURRENCY_COLORS = { gold: '#f0bd61', relic: '#a78bfa', fragment: '#ec4899' }; // 金币/遗物/碎片游戏风格色

    // ============================================================
    // 2-5. 状态 / 事件总线 / 工具（保持不变）
    // ============================================================

    const state = {
        appGame: null, competitionCache: { personal: null, guild: null },
        registeredPersonalIds: new Set(), lastSwitchTime: 0,
        _lastFishingSig: '',
        playerRelics: 0, playerFragments: 0, currentWeatherId: '', buffExpiryCache: new Map(),
        buffCheckInProgress: false,
        domObserver: null, domObserverThrottle: 0,
        unspentStatPoints: 0, statAllocateInProgress: false,
        baitCache: null, lastBaitScene: null,
        playerGold: 0, playerStats: null, respecInProgress: false, guildTotemLevels: null, dailyHarvestCasts: 0, nextHarvestResetAt: 0, dailyHarvestAt: 0,
        playerUid: '', playerName: '',
        sellFishRunning: false, sellGearRunning: false,
        logBuffer: [], logBufferBytes: 0, logPaused: false, logTagFilter: '', paused: false,
        _witherDipSeq: '', _dipSeq: '',
        _partyDipSeq: '', _partyDipStartAt: 0, _partyBlockedSeq: '',
        pity: null, _pityDryCasts: { arcane: 0, exotic: 0 }, _pityFishCaught: { arcane: 0, exotic: 0 }, _lastLuckTier: -1, _lastBaitId: '', _pityLoaded: false,
        _rareCatchLog: [], _fishNameMap: {}, _biomeNameMap: {}, _pityCatchLogOpen: false, _catchFilter: 'all', _catchPage: 0,
        _balanceSnapshot: null, _balanceHistory: [], _balanceLogOpen: false, _balanceFilter: 'all', _balancePage: 0,
        _ledger: {}, _ledgerSeen: { gold: false, relic: false, fragment: false },
    };
    function updateState(p) { Object.assign(state, p); }

    const bus = (() => {
        const h = {};
        return { on(e, fn) { (h[e]||(h[e]=[])).push(fn); }, emit(e, d) { (h[e]||[]).forEach(f=>{try{f(d)}catch(x){error('[bus]',e,x)}}); } };
    })();

    const teardowns = []; function onTeardown(fn) { teardowns.push(fn); }

    let settings = loadSettings();

    function loadSettings() {
        try {
            const r = localStorage.getItem(STORAGE_KEY);
            if (r) {
                const s = JSON.parse(r);
                // 迁旧值：respecPostMode('str1700'等) → respecStrengthTarget(数字)
                if (typeof s.respecPostMode === 'string' && s.respecPostMode.startsWith('str')) {
                    s.respecStrengthTarget = parseInt(s.respecPostMode.slice(3), 10) || 1700;
                    delete s.respecPostMode;
                }
                // 迁旧版 buffSelections：flat 转嵌套
                if (s.triggerWeathers?.length && s.buffSelections && !s.buffSelections[s.triggerWeathers[0]]) {
                    const old = s.buffSelections;
                    s.buffSelections = {};
                    for (const w of s.triggerWeathers) s.buffSelections[w] = { ...old };
                    delete s.triggerWeathers;
                }
                // 补齐 sellGearQualities 新增键
                if (s.sellGearQualities && typeof s.sellGearQualities === 'object') s.sellGearQualities = { ...DEFAULTS.sellGearQualities, ...s.sellGearQualities };
                return { ...DEFAULTS, ...s };
            }
        } catch(e) {}
        return { ...DEFAULTS };
    }
    function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(e) {} }
    function ts() { return new Date().toLocaleTimeString(); }
    function log(...a) { if (settings.debugLog) console.log(`${ts()}`, ...a); }
    const _utf8 = new TextEncoder();
    function strBytes(s) { try { return _utf8.encode(String(s)).length; } catch(_) { return String(s).length; } }
    function warn(...a) { OpLog.warn('辅助脚本', a.join(' ')); }
    function error(...a) { OpLog.error('辅助脚本', a.join(' ')); }
    function logger(tag, color) { const s=`color:${color};font-weight:bold`; return (...a)=>{ if(settings.debugLog) console.log(`${ts()} %c[${tag}] ${a.join(' ')}`,s); }; }
    const L = { map:logger('切图','#4a9eff'), reg:logger('报名','#4ade80'), buff:logger('Buff','#f59e0b'), bait:logger('鱼饵','#fbbf24'), fetch:logger('拦截','#9ca3af'), event:logger('事件','#c084fc'), cfg:logger('设置','#2dd4bf'), dlg:logger('弹窗','#f472b6'), refill:logger('补杆','#a78bfa'), spc:logger('洗点','#f97316'), pity:logger('保底','#c084fc'), init:logger('主程序','#64748b') };

    const TAG_COLORS = { '报名':'#4ade80','切图':'#4a9eff','Buff':'#f59e0b','鱼饵':'#fbbf24','加点':'#f59e0b','配装':'#22c55e','洗点':'#f97316','辅助脚本':'#ef4444','卖鱼':'#eab308','卖装备':'#a855f7','签到':'#2dd4bf','保底':'#c084fc','反馈':'#4a9eff','主程序':'#64748b' };

    // === 控制台拦截 → 面板日志 ===
    function pushLog(time, level, tag, color, msg) {
        state.logBuffer.push({ time, level, tag, color, msg });
        state.logBufferBytes += strBytes(msg) + 10;
        while (state.logBufferBytes > 10 * 1024 * 1024 && state.logBuffer.length > 100) { state.logBufferBytes -= strBytes((state.logBuffer.shift()||{msg:''}).msg) + 10; }
        renderLogView();
    }
    (function() {
        const _log = console.log.bind(console), _warn = console.warn.bind(console), _error = console.error.bind(console);
        function intercept(level, orig, args) {
            orig(...args);
            const fmt = String(args[0] || '');
            const tagM = fmt.match(/%c\[([^\]]+)\]/);
            const tag = tagM ? tagM[1] : '';
            const color = tag ? (TAG_COLORS[tag] || null) : null;
            let msg = fmt.replace(/%c/g, '').replace(/^\[?\d{2}:\d{2}:\d{2}\]?\s*/, '').trim();
            // 去掉残留的 [tag] 前缀（标签列已单独渲染）
            if (tag) { const p = `[${tag}]`; if (msg.startsWith(p)) msg = msg.slice(p.length).trim(); }
            if (tag && msg && !/^\d{2}:\d{2}:\d{2}$/.test(msg)) pushLog(ts(), level, tag, color, msg);
        }
        console.log = function() { intercept('info', _log, arguments); };
        console.warn = function() { intercept('warn', _warn, arguments); };
        console.error = function() { intercept('error', _error, arguments); };
    })();
    // OpLog：走 console（被拦截器自动镜像到面板）
    const OpLog = {
        _out(level, t, m) {
            const c = TAG_COLORS[t] || '#64748b';
            (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(`[${ts()}] %c[${t}]%c ${m}`, `color:${c};font-weight:bold`, '');
        },
        info(t, m) { this._out('info', t, m); },
        warn(t, m) { this._out('warn', t, m); },
        error(t, m) { this._out('error', t, m); },
    };

    function calculateTotalExpBonus(b) {
        // 专精、天气、公会是独立乘区，乘起来才是真实倍率
        const mastery = (!settings.excludeMasteryBonus && typeof b.masteryExperienceBonusBasisPoints === 'number') ? 1 + b.masteryExperienceBonusBasisPoints / 10000 : 1;
        const weather = (b.weather && typeof b.weather.experienceBonusBasisPoints === 'number') ? 1 + b.weather.experienceBonusBasisPoints / 10000 : 1;
        const guild = (!settings.excludeGuildBoost && b.guildBoost?.isActive && typeof b.guildBoost.experienceBonusBasisPoints === 'number') ? 1 + b.guildBoost.experienceBonusBasisPoints / 10000 : 1;
        return mastery * weather * guild;
    }
    function formatBasisPoints(multiplier) { const p = ((multiplier - 1) * 100).toFixed(1); return `${multiplier>=1?'+':''}${p}%`; }
    function generateIdempotencyKey(pre, det) { return det ? `${pre}-${det}` : `${pre}-${Date.now()}-${Math.random().toString(36).substr(2,6)}`; }
    let _frontendVersion = '';
    // 从免签接口 /api/meta/frontend-release 读取最新前端版本号（比 DOM 读更可靠，初始化时 DOM 可能还没渲染）
    async function refreshFrontendVersion() {
        if (_frontendVersion) return;
        try {
            const r = await originalFetch('/api/meta/frontend-release', { headers: { 'Accept': 'application/json' }, credentials: 'include' });
            const j = await r.json().catch(() => ({}));
            if (j?.latestVersion) _frontendVersion = j.latestVersion;
        } catch (_) {}
    }
    function getFrontendVersion() {
        if (_frontendVersion) return _frontendVersion;
        const el = document.querySelector('[aria-label*="当前版本"]');
        if (el) { const m = el.getAttribute('aria-label').match(/v([\d.]+)/); if (m) return m[1]; }
        return '0.18.0';
    }
    let playerProof = null, playerKey = null;
    let serverTimeOffset = 0; // 服务器时间 - 本地时间偏移（签名时间戳要用服务器时间）
    function updateServerTimeOffset(headers) {
        try {
            const st = Number(headers.get('x-arcane-server-time'));
            if (Number.isSafeInteger(st) && st > 0) serverTimeOffset = st - Date.now();
        } catch (_) {}
    }
    function base64Url(bytes) { let b=''; for(const x of new Uint8Array(bytes))b+=String.fromCharCode(x); return btoa(b).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
    async function apiFetch(path, opts = {}) {
        // 首次调用或 proof 过期：bootstrap（调 /api/me 拿 proof）
        if (!playerProof) {
            try {
                await refreshFrontendVersion();  // 先拿最新前端版本号，避免用过期版本导致签名失效
                const meResp = await originalFetch('/api/me', { headers:{'Accept':'application/json','x-frontend-version':getFrontendVersion()}, credentials:'include' });
                const proof = meResp.headers.get('x-arcane-request-proof');
                if (proof) { playerProof = proof; playerKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(proof), { name:'HMAC', hash:'SHA-256' }, false, ['sign']); }
                updateServerTimeOffset(meResp.headers);
                const meData = await meResp.json();
                if (meData.player?.fragments !== undefined) updateState({ playerFragments: meData.player.fragments });
                if (meData.player?.relics !== undefined) updateState({ playerRelics: meData.player.relics });
                if (meData.player?.gold !== undefined) updateState({ playerGold: meData.player.gold });
                if (meData.player?.unspentStatPoints !== undefined) { const prev = state.unspentStatPoints; updateState({ unspentStatPoints: meData.player.unspentStatPoints }); if (meData.player.unspentStatPoints > 0 && meData.player.unspentStatPoints !== prev) autoAllocateStats(); }
                if (meData.player?.stats) { const hadStats = !!state.playerStats; updateState({ playerStats: meData.player.stats }); if (!hadStats) checkRespecStart(); }
                if (meData.publicIdentity?.publicId !== undefined) updateState({ playerUid: String(meData.publicIdentity.publicId) });
                if (meData.player?.nickname !== undefined) updateState({ playerName: meData.player.nickname });
            } catch(_) {}
        }
        const h = { 'Accept':'application/json', 'x-frontend-version': getFrontendVersion() };
        if (opts.body !== undefined) h['Content-Type'] = 'application/json';
        if (opts.idempotencyKey) h['Idempotency-Key'] = opts.idempotencyKey;
        // HMAC 签名
        if (playerProof && playerKey) {
            const body = opts.body !== undefined ? JSON.stringify(opts.body) : '';
            const ts = String(Date.now() + serverTimeOffset);
            const url = new URL(path, 'https://arcane-reelax.invalid');
            const payload = `v1\n${(opts.method||'GET').toUpperCase()}\n${url.pathname}${url.search}\n${ts}\n${body}`;
            h['x-arcane-request-proof'] = playerProof;
            h['x-arcane-request-timestamp'] = ts;
            h['x-arcane-request-signature'] = base64Url(await crypto.subtle.sign('HMAC', playerKey, new TextEncoder().encode(payload)));
        }
        const r = await fetch(path, { method: opts.method||'GET', headers:h, credentials:'include', ...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)}) });
        if (!r.ok) {
            let msg = `${r.status}`, raw = '';
            try { const e = await r.clone().json(); raw = JSON.stringify(e); if (e.error?.message) msg = e.error.message; else if (e.message) msg = e.message; else if (e.code) msg = e.code; } catch(_) {}
            // 签名过期/失效 → 清缓存重试一次（游戏返回 REQUEST_SIGNATURE_INVALID 英文码，也兼容中文文案）
            if ((msg.includes('签名') || /SIGNATURE/i.test(raw) || /SIGNATURE/i.test(msg)) && !opts._retried) {
                playerProof = null; playerKey = null;
                return apiFetch(path, { ...opts, _retried: true });
            }
            throw new Error(msg);
        }
        return r.json();
    }

    // ============================================================
    // 5.x 通用安全锁（所有涉及资源消费的功能共用，不单独造轮子）
    // ============================================================

    // CooldownMap — 按 key 独立冷却（Buff 按 buffType 冷却用）
    function createCooldownMap(defaultMs) {
        const map = new Map();
        return {
            isCooling(key, now) { const u = map.get(key); return u != null && now < u; },
            set(key, until) { map.set(key, until); },
            clearExpired(now) { for (const [k, v] of map) if (now >= v) map.delete(k); },
        };
    }

    // SafetyLock — 通用消费安全锁
    // config: { cooldownMs?, burstWindowMs?, burstMax?, maxCount?, spendLimit?, daily?, onTrip }
    // daily:true → maxCount/spendLimit 按自然日重置（过午夜自动归零），适合挂机党
    function createSafetyLock(config) {
        const { cooldownMs, burstWindowMs, burstMax, maxCount, spendLimit, daily, onTrip } = config;
        const timestamps = [];
        let cooldownUntil = 0, count = 0, spent = 0, currentDate = '';
        function rollDaily() {
            if (!daily) return;
            const d = new Date();
            const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            if (today !== currentDate) { currentDate = today; count = 0; spent = 0; }
        }
        return {
            check(amount = 0) {
                rollDaily();
                const now = Date.now();
                if (cooldownMs && now < cooldownUntil) return { blocked: true, reason: `冷却中 (${((cooldownUntil - now) / 1000).toFixed(0)}s)` };
                if (burstWindowMs && burstMax) {
                    const recent = timestamps.filter(t => t > now - burstWindowMs);
                    if (recent.length >= burstMax) {
                        const msg = `${(burstWindowMs / 60000).toFixed(0)}min内${recent.length}次`;
                        if (onTrip) onTrip(msg);
                        return { blocked: true, reason: `爆发检测: ${msg}` };
                    }
                }
                if (maxCount && count >= maxCount) {
                    const msg = `今日已达${count}次`;
                    if (onTrip) onTrip(msg);
                    return { blocked: true, reason: msg };
                }
                if (spendLimit != null && spent >= spendLimit) {
                    const msg = `今日消费已达${spent}`;
                    if (onTrip) onTrip(msg);
                    return { blocked: true, reason: msg };
                }
                if (spendLimit != null && spent + amount > spendLimit) {
                    const msg = `今日消费将超限${spent}+${amount}`;
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
                const cutoff = now - (burstWindowMs || 60000) * 2;
                while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
                count++;
                spent += amount;
            },
            getSpent() { rollDaily(); return spent; },
            getCount() { rollDaily(); return count; },
        };
    }

    // Buff 安全锁实例（冷却就够，不需要每日消费限额）
    const buffTypeCooldown = createCooldownMap(BUFF_COOLDOWN_MS);

    // 洗点安全锁实例
    const respecLock = createSafetyLock({
        cooldownMs: RESPEC_COOLDOWN_MS,
        burstWindowMs: RESPEC_BURST_WINDOW_MS,
        burstMax: RESPEC_BURST_MAX,
        maxCount: DAILY_RESPEC_MAX,
        spendLimit: DAILY_RESPEC_GOLD_LIMIT,
        daily: true,
        onTrip: (r) => { tripRespecCircuit(r); },
    });

    function waitForGameAPI() {
        return new Promise(resolve => {
            if (window.arcaneReelax) { resolve(window.arcaneReelax); return; }
            // 官方事件：游戏加载完成时触发，比轮询更快
            document.addEventListener('arcane-reelax:ready', () => { if (window.arcaneReelax) resolve(window.arcaneReelax); }, { once: true });
            // 轮询兜底，30s 超时放弃
            const start = Date.now();
            (function poll() { if (window.arcaneReelax) resolve(window.arcaneReelax); else if (Date.now() - start < 30000) setTimeout(poll, 250); else resolve(null); })();
        });
    }

    // ============================================================
    // 6. 业务逻辑（6.1-6.10 保持不变）
    // ============================================================

    async function autoRegisterPersonal() {
        if (!settings.autoRegisterPersonal) return;
        const p = state.competitionCache.personal; if (!p) { L.reg('等待个人赛数据'); return; }
        const cand = [];
        if (p.current?.canRegister && !p.current.isRegistered) cand.push(p.current);
        if (p.upcoming) for (const c of p.upcoming) if (c.canRegister && !c.isRegistered && c.status==='scheduled') cand.push(c);
        if (!cand.length) { L.reg('没有可报名的个人赛'); return; }
        cand.sort((a,b) => new Date(a.startAt) - new Date(b.startAt));
        for (const c of cand) {
            if (state.registeredPersonalIds.has(c.id)) continue;
            try {
                await apiFetch(`/api/tournaments/${c.id}/register`, { method:'POST', idempotencyKey: generateIdempotencyKey('register', c.id), body:{} });
                state.registeredPersonalIds.add(c.id); c.isRegistered = true; OpLog.info('报名', '✅ #' + c.sequence + ' 报名成功');
            } catch(err) { OpLog.error('报名', '报名失败: ' + err.message); }
        }
    }

    function getCompetitionBiomeId(c) {
        // v0.15+ 分组赛制：玩家所在组的地图可能和比赛顶层 biomeId 不同
        if (c.groups?.length) {
            const gid = c.myGroupId || c.defaultGroupId;
            const g = c.groups.find(g => g.id === gid);
            if (g) return g.biomeId;
        }
        return c.biomeId;
    }
    // 当前个人赛上下文（sequence + 比赛地图）
    function getPersonalCompContext() {
        const p = state.competitionCache.personal?.current;
        if (!p?.isRegistered) return null;
        return { sequence: p.sequence, biomeId: getCompetitionBiomeId(p) };
    }
    // 当前个人赛是否被船队蹭奖屏蔽
    function isPersonalBlocked() {
        if (!settings.partyDipPersonal) return false;  // 关闭船队蹭奖后立即解除屏蔽
        const ctx = getPersonalCompContext();
        if (!ctx) return false;
        return state._partyBlockedSeq === ctx.sequence;
    }
    // 当前个人赛蹭奖积分是否已满足（>=10；needWither 时还需比赛图是枯潮）
    function personalDipScoreMet(needWither) {
        const ctx = getPersonalCompContext();
        if (!ctx) return false;
        const score = state.competitionCache.personal?.current?.score || 0;
        if (score < 10) return false;
        if (needWither) {
            const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
            const biome = snap?.biomes?.find(b => b.id === ctx.biomeId);
            if (biome?.weather?.id !== 'wither_tide') return false;
        }
        return true;
    }
    function getCompetitionTarget(unlocked, now) {
        if (!settings.autoSwitchMap) return null;
        const cand = [];
        const add = (c, kind) => { const s = new Date(c.startAt).getTime(); if (now >= s-300000 && now <= new Date(c.endAt).getTime()) cand.push({biomeId:getCompetitionBiomeId(c),startAt:s,kind}); };
        if (settings.autoPersonal && state.competitionCache.personal) {
            const p = state.competitionCache.personal;
            if (p.current?.isRegistered) add(p.current, 'personal');
            if (p.upcoming) for (const c of p.upcoming) if (c.isRegistered) { add(c, 'personal'); break; }
        }
        if (settings.autoGuild && state.competitionCache.guild) {
            const g = state.competitionCache.guild;
            if (g.current?.entryStatus==='registered') add(g.current, 'guild');
            if (g.upcoming) for (const c of g.upcoming) if (c.entryStatus==='registered') { add(c, 'guild'); break; }
        }
        if (!cand.length) return null;
        cand.sort((a,b) => a.startAt - b.startAt);
        const best = cand[0];
        const biome = unlocked.find(b => b.id === best.biomeId && b.isUnlocked);
        return biome ? { biome, kind: best.kind } : null;
    }

    // === 个人赛跳过/蹭奖 通用工具 ===
    function witherDipActive() {
        if (!settings.autoPersonal) return false;
        // 枯潮跳过：仅当比赛地图确实是枯潮时才生效
        if (settings.skipWitherTidePersonal) {
            const cur = state.competitionCache.personal?.current;
            const compBiomeId = cur ? getCompetitionBiomeId(cur) : null;
            if (!compBiomeId) return false;
            const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
            const biome = snap?.biomes?.find(b => b.id === compBiomeId);
            if (biome?.weather?.id === 'wither_tide') return true;
        }
        const seq = getPersonalCompContext()?.sequence || '';
        if (seq && settings.witherTideDipPersonal && state._witherDipSeq === seq) return true;
        if (seq && settings.dipPersonal && state._dipSeq === seq) return true;
        return false;
    }
    function shouldSkipComp(ct) {
        if (!settings.autoPersonal || !ct) return '';
        if (isPersonalBlocked()) return '船队蹭奖已屏蔽';
        const seq = getPersonalCompContext()?.sequence || '';
        if (ct.weather?.id === 'wither_tide') {
            if (settings.skipWitherTidePersonal) return '枯潮跳过';
            if (seq && settings.witherTideDipPersonal && state._witherDipSeq === seq) return '已蹭奖';
        }
        if (seq && settings.dipPersonal && state._dipSeq === seq) return '已蹭奖';
        return '';
    }
    function resetDipIfEnded(oldScene) {
        if (oldScene !== 'personalCompetition') return false;
        let changed = false;
        if (state._witherDipSeq) { state._witherDipSeq = ''; L.map('枯潮蹭奖: 比赛结束，重置'); changed = true; }
        if (state._dipSeq) { state._dipSeq = ''; L.map('个人赛蹭奖: 比赛结束，重置'); changed = true; }
        return changed;
    }
    // === 保底显示：本地追踪 currentDryCasts + 低频校准 hardPityCasts ===
    function computeEffectiveLuck() {
        const totalLuck = state.playerStats?.total?.luck || 0;
        const buffBp = (state._activeBuffs || []).filter(b => b.buffType === 'luck').reduce((s, b) => s + (b.bonusBasisPoints || 0), 0);
        const baitId = (state.appGame || window.arcaneReelax)?.getSnapshot()?.baits?.find(b => b.isSelected)?.id || '';
        const baitLuck = BAIT_LUCK[baitId] ?? 0;
        return Math.round(totalLuck * (1 + buffBp / 10000)) + baitLuck;
    }
    function getLuckTier() { return Math.floor(computeEffectiveLuck() / 1000); }
    async function fetchPity() {
        try {
            const r = await apiFetch('/api/statistics');
            if (r?.pity) {
                state.pity = r.pity;
                // 服务器数据权威，直接覆盖本地追踪值
                state._pityDryCasts.arcane = r.pity.arcane?.currentDryCasts ?? 0;
                state._pityDryCasts.exotic = r.pity.exotic?.currentDryCasts ?? 0;
                // 解析历史钓获数量，判断"从来没钓到过"
                if (Array.isArray(r.rarities)) {
                    for (const rr of r.rarities) {
                        if (rr.rarity === 'arcane' || rr.rarity === 'exotic') state._pityFishCaught[rr.rarity] = rr.fishCaught ?? 0;
                    }
                }
                if (!state._pityLoaded) { state._pityLoaded = true; OpLog.info('保底', '保底数据已加载'); }
                // 运气档位和鱼饵统一用本地计算值，避免和服务器字段格式不一致导致反复校准
                state._lastLuckTier = getLuckTier();
                state._lastBaitId = (state.appGame || window.arcaneReelax)?.getSnapshot()?.baits?.find(b => b.isSelected)?.id || '';
                L.pity(`保底校准: 奥秘${r.pity.arcane?.currentDryCasts}/${r.pity.arcane?.hardPityCasts} 奇异${r.pity.exotic?.currentDryCasts}/${r.pity.exotic?.hardPityCasts} 档位${state._lastLuckTier}`);
                injectPityPanel();
            }
        } catch(e) { L.pity('保底校准失败: ' + e.message); }
    }
    // 本地追踪：每杆出货归零/空杆+1
    function trackPityCast(rarity) {
        if (rarity === 'arcane') { state._pityDryCasts.arcane = 0; state._pityDryCasts.exotic++; }
        else if (rarity === 'exotic') { state._pityDryCasts.arcane++; state._pityDryCasts.exotic = 0; }
        else { state._pityDryCasts.arcane++; state._pityDryCasts.exotic++; }
    }
    // === 奇异/奥秘钓获记录：本地永久存储 + 弹窗展示 ===
    function loadCatchLog() {
        try {
            const s = localStorage.getItem(CATCH_LOG_KEY);
            if (s) { const a = JSON.parse(s); if (Array.isArray(a)) state._rareCatchLog = a; }
        } catch (_) {}
    }
    function saveCatchLog() {
        try { localStorage.setItem(CATCH_LOG_KEY, JSON.stringify(state._rareCatchLog)); } catch (_) {}
    }
    // 记录一次奇异/奥秘钓获（不设上限，本地永久存储）
    function recordRareCatch(r) {
        if (!r || (r.rarity !== 'exotic' && r.rarity !== 'arcane')) return;
        state._rareCatchLog.push({ t: Date.now(), fishId: r.fishId || '', rarity: r.rarity });
        saveCatchLog();
        L.pity(`钓获记录: ${r.rarity === 'arcane' ? '奥秘' : '奇异'} ${state._fishNameMap[r.fishId] || r.fishId}`);
    }
    function formatDateTime(ts) {
        const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    function closeCatchLog() {
        state._pityCatchLogOpen = false;
        document.querySelector('.arc-catch-log-layer')?.remove();
    }
    // 渲染「珍稀钓获记录」弹窗（注入 document.body，参考游戏内置弹窗样式，只显示玩家自己；每 50 条一页，时间倒序）
    function renderCatchLog() {
        document.querySelector('.arc-catch-log-layer')?.remove();
        if (!state._pityCatchLogOpen) return;
        const log = state._rareCatchLog;
        const exoticCount = log.filter(x => x.rarity === 'exotic').length;
        const arcaneCount = log.filter(x => x.rarity === 'arcane').length;
        const filter = state._catchFilter;
        // 时间倒序：最新钓到的在最前
        const sorted = [...(filter === 'all' ? log : log.filter(x => x.rarity === filter))].sort((a, b) => b.t - a.t);
        const PAGE_SIZE = 50;
        const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
        const page = Math.min(Math.max(0, state._catchPage), totalPages - 1);
        state._catchPage = page; // 越界时回正
        const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        const grad = (g, t) => `<span style="background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-weight:700;">${t}</span>`;
        const meta = { exotic: { name: '奇异', g: RARITY_GRADIENTS.exotic }, arcane: { name: '奥秘', g: RARITY_GRADIENTS.arcane } };
        const items = pageItems.length ? pageItems.map(x => {
            const m = meta[x.rarity] || meta.exotic;
            const fishName = state._fishNameMap[x.fishId] || x.fishId;
            const biomeId = x.fishId ? x.fishId.split('_').slice(0, 2).join('_') : '';
            const biomeName = biomeId ? (state._biomeNameMap[biomeId] || '') : '';
            const biomeCode = biomeId ? 'B' + parseInt(biomeId.split('_')[1], 10) : '';
            return `<article style="display:flex;flex-direction:column;gap:3px;padding:9px 0;border-bottom:1px dashed var(--divider,#e4edf2);">
                <time style="font-size:11px;color:var(--muted,#71869b);">${formatDateTime(x.t)}</time>
                <div style="display:flex;align-items:center;gap:6px;font-size:13px;">${grad(m.g, m.name)}<span style="color:var(--text,#20354d);">${fishName}</span></div>
                ${biomeName ? `<span style="font-size:11px;color:var(--muted,#71869b);">${biomeCode ? `[${biomeCode}] ` : ''}${biomeName}</span>` : ''}
            </article>`;
        }).join('') : '<div style="padding:24px 0;text-align:center;font-size:12px;color:var(--muted,#71869b);">暂无记录</div>';
        const filterBtn = (val, label) => `<button data-filter="${val}" style="padding:4px 12px;border:1px solid ${filter === val ? 'var(--tide,#52bac4)' : 'var(--border,#d1dee7)'};border-radius:999px;background:${filter === val ? 'color-mix(in srgb,var(--tide,#52bac4) 16%,transparent)' : 'transparent'};color:${filter === val ? 'var(--tide-deep,#2a8790)' : 'var(--muted,#71869b)'};font-size:12px;font-weight:600;cursor:pointer;">${label}</button>`;
        const pagerBtn = (dir, label, disabled) => `<button data-page="${dir}" ${disabled ? 'disabled' : ''} style="padding:3px 10px;border:1px solid var(--border,#d1dee7);border-radius:6px;background:transparent;color:${disabled ? 'var(--muted,#71869b)' : 'var(--text,#20354d)'};font-size:12px;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? '0.4' : '1'};">${label}</button>`;
        const footer = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 18px;border-top:1px solid var(--divider,#e4edf2);flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted,#71869b);">总计 ${grad(RARITY_GRADIENTS.exotic, exoticCount + ' 奇异')} · ${grad(RARITY_GRADIENTS.arcane, arcaneCount + ' 奥秘')}</span>
            ${sorted.length > PAGE_SIZE ? `<span style="display:inline-flex;align-items:center;gap:8px;">${pagerBtn('prev', '‹ 上一页', page === 0)}<span style="font-size:12px;color:var(--muted,#71869b);">${page + 1} / ${totalPages}</span>${pagerBtn('next', '下一页 ›', page >= totalPages - 1)}</span>` : ''}
        </div>`;
        const layer = document.createElement('div');
        layer.className = 'arc-catch-log-layer';
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);padding:16px;';
        layer.innerHTML = `<section style="width:min(440px,100%);max-height:70vh;display:flex;flex-direction:column;background:var(--surface,#fffefa);border:1px solid var(--border,#d1dee7);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,0.25);overflow:hidden;">
            <header style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                <div style="min-width:0;">
                    <div style="font-size:11px;letter-spacing:1px;">${grad(RARITY_GRADIENTS.exotic, '奇异')} <span style="color:var(--muted,#71869b);">·</span> ${grad(RARITY_GRADIENTS.arcane, '奥秘')}</div>
                    <h2 style="margin:2px 0 0;font-size:16px;font-weight:700;color:var(--text,#20354d);">珍稀钓获记录</h2>
                </div>
                <button class="arc-catch-log-close" style="margin-left:auto;width:30px;height:30px;display:grid;place-items:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted,#71869b);font-size:16px;cursor:pointer;" title="关闭">✕</button>
            </header>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                ${filterBtn('all', '全部')}${filterBtn('exotic', '奇异')}${filterBtn('arcane', '奥秘')}
            </div>
            <div style="overflow-y:auto;padding:4px 18px 12px;font-family:inherit;">${items}</div>
            ${footer}
        </section>`;
        layer.addEventListener('click', (e) => {
            if (e.target === layer || e.target.closest('.arc-catch-log-close')) { closeCatchLog(); return; }
            const fb = e.target.closest('[data-filter]');
            if (fb) { state._catchFilter = fb.dataset.filter; state._catchPage = 0; renderCatchLog(); return; }
            const pb = e.target.closest('[data-page]');
            if (pb && !pb.disabled) { state._catchPage = pb.dataset.page === 'prev' ? page - 1 : page + 1; renderCatchLog(); }
        });
        document.body.appendChild(layer);
    }
    // 事件委托：保底面板「历史记录」入口点击 → 打开弹窗（入口每 2s 重建，故用委托）
    function onDocClickCatchToggle(e) {
        if (e.target.closest('.pity-catch-toggle')) {
            state._pityCatchLogOpen = true;
            renderCatchLog();
        }
    }
    // === 每日金币/遗物/碎片盈亏：实时显示 + 历史弹窗 ===
    function todayStr() {
        const d = new Date(), p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    function loadBalance() {
        try {
            const s = localStorage.getItem(BALANCE_SNAPSHOT_KEY);
            if (s) { const o = JSON.parse(s); if (o && typeof o === 'object') state._balanceSnapshot = o; }
        } catch (_) {}
        try {
            const h = localStorage.getItem(BALANCE_HISTORY_KEY);
            if (h) { const a = JSON.parse(h); if (Array.isArray(a)) state._balanceHistory = a; }
        } catch (_) {}
    }
    function saveBalance() {
        try { localStorage.setItem(BALANCE_SNAPSHOT_KEY, JSON.stringify(state._balanceSnapshot)); } catch (_) {}
        try { localStorage.setItem(BALANCE_HISTORY_KEY, JSON.stringify(state._balanceHistory)); } catch (_) {}
    }
    // 跨天结算：昨天最终赚亏写入历史 + 记录今天新基准（凌晨 0 点重置）
    function checkDailyReset() {
        if (state.playerGold <= 0) return; // 金币未就绪，等采集到
        const today = todayStr();
        const snap = state._balanceSnapshot;
        if (!snap || snap.date !== today) {
            if (snap && snap.date) {
                const rec = {
                    date: snap.date,
                    gold: state.playerGold - (snap.gold || 0),
                    relic: state.playerRelics - (snap.relic || 0),
                    fragment: state.playerFragments - (snap.fragment || 0),
                };
                const idx = state._balanceHistory.findIndex(x => x.date === rec.date);
                if (idx >= 0) state._balanceHistory[idx] = rec; else state._balanceHistory.push(rec);
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
    function fmtSigned(v) { const n = Math.round(v); return (n > 0 ? '+' : '') + n.toLocaleString('zh-CN'); }
    function signColor(v) { return v > 0 ? '#45a76f' : v < 0 ? '#e66b58' : 'var(--muted,#71869b)'; }
    // 注入「今日赚亏」到今日统计「金币收支」分组下方（复用游戏 harvest-group 样式）
    function injectBalanceDisplay() {
        if (!settings.showBalance) { document.querySelector('.arc-balance-group')?.remove(); return; }
        const goldGroup = [...document.querySelectorAll('.harvest-group')].find(g => g.querySelector('.harvest-group-label')?.textContent.trim() === '金币收支');
        if (!goldGroup) return;
        let el = document.querySelector('.arc-balance-group');
        if (!el) {
            el = document.createElement('div');
            el.className = 'harvest-group arc-balance-group';
            goldGroup.insertAdjacentElement('afterend', el);
        }
        const delta = computeBalanceDelta();
        const chip = (label, color, v) => `<span class="harvest-chip"><span style="color:${color};font-weight:600;">${label}</span><strong style="color:${signColor(v)};">${fmtSigned(v)}</strong></span>`;
        // 收支明细入口默认隐藏，测试时控制台 window.__ledgerDebug = true 打开
        const ledgerLink = window.__ledgerDebug ? '<span class="harvest-chip arc-ledger-toggle" style="cursor:pointer;text-decoration:underline;"><span>收支明细</span></span>' : '';
        el.innerHTML = `<span class="harvest-group-label">今日净赚/盈亏</span><div class="harvest-tags">${delta ? `${chip('金币', CURRENCY_COLORS.gold, delta.gold)}${chip('遗物', CURRENCY_COLORS.relic, delta.relic)}${chip('碎片', CURRENCY_COLORS.fragment, delta.fragment)}` : ''}<span class="harvest-chip arc-balance-toggle" style="cursor:pointer;text-decoration:underline;"><span>历史记录</span></span>${ledgerLink}</div>`;
    }
    // === 每日收支明细：拦截币种变化按来源归类 + 未识别对账 ===
    function loadLedger() {
        try { const s = localStorage.getItem(LEDGER_KEY); if (s) { const o = JSON.parse(s); if (o && typeof o === 'object') state._ledger = o; } } catch (_) {}
    }
    function saveLedger() {
        try {
            // 只保留最近 30 天账本，超期的从最早的日期删掉，避免无上限累积占用存储
            const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
            for (const date of Object.keys(state._ledger)) {
                if (Date.parse(date) < cutoff) delete state._ledger[date];
            }
            localStorage.setItem(LEDGER_KEY, JSON.stringify(state._ledger));
        } catch (_) {}
    }
    // URL + settlement.mode → 分类（币种无关）；返回 '' 表示未识别
    function classifyLedger(url, mode) {
        if (url.includes('/api/fishing/sync') || url.includes('/api/fishing/state')) return mode === 'offline' ? '离线结算' : '在线钓鱼';
        if (url.includes('/api/inventory/fish/sell')) return '卖鱼';
        if (url.includes('/api/inventory/gear/sell')) return '卖装备';
        if (url.includes('/api/baits/')) return '买饵';
        if (url.includes('/api/shop/purchases')) return '买Buff';
        if (url.includes('/api/player/stats/reset')) return '洗点';
        if (url.includes('/api/chests/')) return '开宝箱';
        if (url.includes('/api/market/')) return '市场';
        if (url.includes('/api/daily-check-in')) return '签到';
        if (url.includes('/api/quests')) return '任务';
        if (url.includes('/api/tournaments/') || url.includes('/api/weekly-tournaments/')) return '比赛';
        if (url.includes('/api/events/arcane-sacrifice')) return '奥秘献祭';
        if (url.includes('/api/sponsorship/')) return 'CDK';
        if (url.includes('/api/rods/')) return '升级鱼竿';
        if (url.includes('/api/guilds/me/donations') || url.includes('/api/party-boats/treasury/deposit')) return '公会捐献';
        if (url.includes('/api/party-boats/')) return '船';
        if (url.includes('/api/convenience/')) return '便利服务';
        if (url.includes('/api/player/gold-penalty')) return '金币惩罚';
        return '';
    }
    // 拦截器里每见一个带币种字段的响应就调一次：算差值、按来源累加到当天账本
    function recordLedger(url, d) {
        const gold = d.player?.gold ?? d.playerPatch?.gold ?? d.balances?.gold;
        const relic = d.player?.relics ?? d.playerPatch?.relics ?? d.balances?.relics;
        const frag = d.player?.fragments ?? d.playerPatch?.fragments ?? d.balances?.fragments;
        if (gold === undefined && relic === undefined && frag === undefined) return;
        const cat = classifyLedger(url, d.settlement?.mode) || '未识别';
        const patch = {};
        const entries = [['gold', 'playerGold', gold], ['relic', 'playerRelics', relic], ['fragment', 'playerFragments', frag]];
        for (const [cur, field, val] of entries) {
            if (val === undefined) continue;
            if (!state._ledgerSeen[cur]) { state._ledgerSeen[cur] = true; patch[field] = val; continue; }  // 首次见只赋值不记账
            const delta = val - state[field];
            if (delta === 0) continue;
            const day = state._ledger[todayStr()] || (state._ledger[todayStr()] = { gold: {}, relic: {}, fragment: {} });
            const bucket = day[cur];
            bucket[cat] = (bucket[cat] || 0) + delta;
            patch[field] = val;
        }
        if (Object.keys(patch).length) { updateState(patch); saveLedger(); }
    }
    // 打开「收支明细」新标签页：挂一个 __ledgerData 取数函数到 opener，标签页每 3 秒轮询自动刷新（无需手动刷新）
    function renderLedgerTab() {
        window.__ledgerData = () => {
            const today = todayStr();
            const day = state._ledger[today] || { gold: {}, relic: {}, fragment: {} };
            const snap = state._balanceSnapshot;
            const net = (snap && snap.date === today)
                ? { gold: state.playerGold - snap.gold, relic: state.playerRelics - snap.relic, fragment: state.playerFragments - snap.fragment }
                : null;
            return { today, day, net };
        };
        const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>今日收支明细</title></head>
        <body style="margin:0;padding:20px;font-family:'Microsoft YaHei','PingFang SC',sans-serif;background:#fffefa;color:#20354d;">
            <h2 style="margin:0 0 4px;font-size:18px;">今日收支明细</h2>
            <div id="date" style="font-size:12px;color:#71869b;margin-bottom:14px;">—</div>
            <div id="content"></div>
            <div style="font-size:11px;color:#9aa7b5;margin-top:10px;line-height:1.7;">正数=收入、负数=支出。每 3 秒自动刷新。<br>「未识别」= 净变化 − 已识别之和，含脚本未运行期间、以及暂未归类的变化。</div>
        </body>
        <script>
        (function(){
            var CURS=[{key:'gold',label:'金币',color:'#f0bd61'},{key:'relic',label:'遗物',color:'#a78bfa'},{key:'fragment',label:'碎片',color:'#ec4899'}];
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
                    var uhtml=(unid!==null&&Math.abs(unid)>=1)?'<div style="margin:3px 0 3px 14px;font-size:13px;line-height:1.9;"><span style="color:#e6a23c;font-weight:600;margin-right:4px;">未识别</span><span style="font-weight:600;color:#e6a23c;">'+fmt(unid)+'</span></div>':'';
                    var nhtml=d.net?'<span style="font-weight:700;color:'+signColor(d.net[c.key])+';">'+fmt(d.net[c.key])+'</span>':'<span style="color:#9aa7b5;">—</span>';
                    html+='<section style="margin-bottom:16px;padding:12px 14px;border:1px solid #e4edf2;border-radius:8px;"><div style="font-size:15px;font-weight:700;color:'+c.color+';margin-bottom:2px;">'+c.label+'　<span style="font-size:12px;color:#71869b;font-weight:400;">净变化</span>　'+nhtml+'</div>'+grp('收入',inc)+grp('支出',exp)+uhtml+'</section>';
                });
                document.getElementById('content').innerHTML=html;
            }
            function poll(){
                try{ var d=window.opener&&window.opener.__ledgerData?window.opener.__ledgerData():null; if(d)render(d); }catch(e){}
            }
            poll();
            setInterval(poll,3000);
        })();
        </script>
        </html>`;
        try { const u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(u, '_blank'); } catch (_) {}
    }
    function onDocClickLedgerToggle(e) {
        if (window.__ledgerDebug && e.target.closest('.arc-ledger-toggle')) renderLedgerTab();
    }
    // 时间范围筛选：全部=全历史；周=本周（周一起）；月=本月。返回逐日明细（label=日期）。
    function weekKey(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    function aggregateBalance(records, granularity) {
        const day = r => ({ label: r.date, gold: r.gold, relic: r.relic, fragment: r.fragment });
        if (granularity === 'all' || granularity === 'day') return records.map(day);
        const today = todayStr();
        if (granularity === 'week') {
            const wk = weekKey(today);
            return records.filter(r => weekKey(r.date) === wk).map(day);
        }
        const m = today.slice(0, 7); // 本月 YYYY-MM
        return records.filter(r => r.date.slice(0, 7) === m).map(day);
    }
    function closeBalanceLog() {
        state._balanceLogOpen = false;
        document.querySelector('.arc-balance-log-layer')?.remove();
    }
    function renderBalanceLog() {
        document.querySelector('.arc-balance-log-layer')?.remove();
        if (!state._balanceLogOpen) return;
        const sorted = aggregateBalance(state._balanceHistory, state._balanceFilter).sort((a, b) => (a.label < b.label ? 1 : -1));
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
        const items = pageItems.length ? pageItems.map(r => `<article style="padding:9px 0;border-bottom:1px dashed var(--divider,#e4edf2);">
            <div style="font-size:12px;font-weight:600;color:var(--text,#20354d);margin-bottom:4px;">${headLabel(r)}</div>
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;"><span style="color:${signColor(r.gold)};">${fmtSigned(r.gold)} ${cur('金币', CURRENCY_COLORS.gold)}</span><span style="color:${signColor(r.relic)};">${fmtSigned(r.relic)} ${cur('遗物', CURRENCY_COLORS.relic)}</span><span style="color:${signColor(r.fragment)};">${fmtSigned(r.fragment)} ${cur('碎片', CURRENCY_COLORS.fragment)}</span></div>
        </article>`).join('') : '<div style="padding:24px 0;text-align:center;font-size:12px;color:var(--muted,#71869b);">暂无记录</div>';
        const filterBtn = (val, label) => `<button data-bfilter="${val}" style="padding:4px 12px;border:1px solid ${state._balanceFilter === val ? 'var(--tide,#52bac4)' : 'var(--border,#d1dee7)'};border-radius:999px;background:${state._balanceFilter === val ? 'color-mix(in srgb,var(--tide,#52bac4) 16%,transparent)' : 'transparent'};color:${state._balanceFilter === val ? 'var(--tide-deep,#2a8790)' : 'var(--muted,#71869b)'};font-size:12px;font-weight:600;cursor:pointer;">${label}</button>`;
        const pagerBtn = (dir, label, disabled) => `<button data-bpage="${dir}" ${disabled ? 'disabled' : ''} style="padding:3px 10px;border:1px solid var(--border,#d1dee7);border-radius:6px;background:transparent;color:${disabled ? 'var(--muted,#71869b)' : 'var(--text,#20354d)'};font-size:12px;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? '0.4' : '1'};">${label}</button>`;
        const layer = document.createElement('div');
        layer.className = 'arc-balance-log-layer';
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483602;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.45);padding:16px;';
        layer.innerHTML = `<section style="width:min(460px,100%);max-height:70vh;display:flex;flex-direction:column;background:var(--surface,#fffefa);border:1px solid var(--border,#d1dee7);border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,0.25);overflow:hidden;">
            <header style="display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid var(--divider,#e4edf2);">
                <div><h2 style="margin:0;font-size:16px;font-weight:700;color:var(--text,#20354d);">每日盈亏</h2><div style="font-size:11px;color:var(--muted,#71869b);margin-top:2px;">${cur('金币', CURRENCY_COLORS.gold)} · ${cur('遗物', CURRENCY_COLORS.relic)} · ${cur('碎片', CURRENCY_COLORS.fragment)}</div></div>
                <button class="arc-balance-close" style="margin-left:auto;width:30px;height:30px;display:grid;place-items:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted,#71869b);font-size:16px;cursor:pointer;" title="关闭">✕</button>
            </header>
            <div style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--divider,#e4edf2);">${filterBtn('all', '全部')}${filterBtn('week', '周')}${filterBtn('month', '月')}</div>
            <div style="overflow-y:auto;padding:4px 18px 12px;font-family:inherit;">${items}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 18px;border-top:1px solid var(--divider,#e4edf2);flex-wrap:wrap;">
                <span style="font-size:12px;color:var(--muted,#71869b);">总计 <span style="color:${signColor(totalGold)};">${fmtSigned(totalGold)} ${cur('金币', CURRENCY_COLORS.gold)}</span> · <span style="color:${signColor(totalRelic)};">${fmtSigned(totalRelic)} ${cur('遗物', CURRENCY_COLORS.relic)}</span> · <span style="color:${signColor(totalFragment)};">${fmtSigned(totalFragment)} ${cur('碎片', CURRENCY_COLORS.fragment)}</span></span>
                ${sorted.length > PAGE_SIZE ? `<span style="display:inline-flex;align-items:center;gap:8px;">${pagerBtn('prev', '‹ 上一页', page === 0)}<span style="font-size:12px;color:var(--muted,#71869b);">${page + 1} / ${totalPages}</span>${pagerBtn('next', '下一页 ›', page >= totalPages - 1)}</span>` : ''}
            </div>
        </section>`;
        layer.addEventListener('click', (e) => {
            if (e.target === layer || e.target.closest('.arc-balance-close')) { closeBalanceLog(); return; }
            const fb = e.target.closest('[data-bfilter]');
            if (fb) { state._balanceFilter = fb.dataset.bfilter; state._balancePage = 0; renderBalanceLog(); return; }
            const pb = e.target.closest('[data-bpage]');
            if (pb && !pb.disabled) { state._balancePage = pb.dataset.bpage === 'prev' ? page - 1 : page + 1; renderBalanceLog(); }
        });
        document.body.appendChild(layer);
    }
    function onDocClickBalanceToggle(e) {
        if (e.target.closest('.arc-balance-toggle')) {
            state._balanceLogOpen = true;
            state._balancePage = 0;
            renderBalanceLog();
        }
    }
    function formatDuration(sec) {
        if (!sec || sec <= 0) return '已到期';
        if (sec < 60) return '不足1分';
        const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
        if (d > 0) return `${d}天${h}时${m}分`;
        if (h > 0) return `${h}时${m}分`;
        return `${m}分`;
    }
    function computePityDisplay() {
        const p = state.pity;
        if (!p?.arcane || !p?.exotic) return null;
        const build = (key) => {
            const d = p[key];
            const cur = state._pityDryCasts[key];
            const hard = d.hardPityCasts ?? 0;
            const max = d.maxDryCasts ?? 0;
            const neverCaught = state._pityFishCaught[key] === 0;  // 从来没钓到过该稀有度
            const pct = hard > 0 ? Math.min(100, (cur / hard) * 100).toFixed(1) : '--';
            const remainCasts = hard > 0 ? Math.max(0, hard - cur) : 0;
            const remainTime = hard > 0 ? formatDuration(remainCasts * (PITY_CYCLE_MS / 1000)) : '--';
            const worstTime = neverCaught ? '从来没见过长啥样（空军佬的痛）' : (max > 0 ? formatDuration(max * (PITY_CYCLE_MS / 1000)) : '--');
            return { pct, remainCasts, remainTime, worstCasts: max, worstTime, neverCaught };
        };
        return { arcane: build('arcane'), exotic: build('exotic') };
    }
    // 注入保底区块到自动钓鱼面板标题下方（桌面三列横向；窄屏自动堆叠为单列并允许换行，超宽时横向滚动兜底）
    let _pityCssInjected = false;
    function injectPityPanel() {
        if (!settings.showPity) { document.querySelector('.pity-panel')?.remove(); return; }
        const h2 = document.getElementById('batch-title');
        if (!h2 || !/自动钓鱼/.test(h2.textContent || '')) return;
        const heading = h2.closest('.panel-heading');
        if (!heading) return;
        const disp = computePityDisplay();
        let el = heading.parentElement.querySelector('.pity-panel');
        if (!el) {
            if (!_pityCssInjected) {
                _pityCssInjected = true;
                const st = document.createElement('style');
                st.id = 'pity-panel-style';
                st.textContent = [
                    '.pity-panel{display:grid;grid-template-columns:auto auto auto;gap:2px 14px;padding:8px 12px;border-bottom:1px solid var(--divider,#e4edf2);font-family:inherit;max-width:100%;overflow-x:auto;}',
                    '.pity-panel .pity-t{font-size:11px;line-height:18px;color:var(--muted,#71869b);white-space:nowrap;}',
                    '.pity-panel .pity-d{font-size:12px;line-height:18px;font-weight:600;white-space:nowrap;}',
                    '@media (max-width:480px){.pity-panel{grid-template-columns:1fr;gap:1px 4px;}.pity-panel .pity-t{display:block;margin-top:4px;}.pity-panel .pity-d{white-space:normal;}}'
                ].join('');
                (document.head || document.documentElement).appendChild(st);
            }
            el = document.createElement('div');
            el.className = 'pity-panel';
            heading.insertAdjacentElement('afterend', el);
        }
        const title = (t) => `<span class="pity-t">${t} ：</span>`;
        const data = (key, name, mode) => {
            const d = disp ? disp[key] : null;
            let text;
            if (!d) text = '--';
            else if (mode === 'countdown') text = `${d.pct}%/${d.remainTime}/${d.remainCasts}竿`;
            else text = d.neverCaught ? d.worstTime : `${d.worstTime}/${d.worstCasts}竿`;
            const g = RARITY_GRADIENTS[key];
            return `<span class="pity-d" style="background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent">${name}：${text}</span>`;
        };
        el.innerHTML = title('保底(%/倒计时/竿)') + data('exotic', '奇异', 'countdown') + data('arcane', '奥秘', 'countdown')
            + title('历史最倒霉记录') + data('exotic', '奇异', 'worst') + data('arcane', '奥秘', 'worst')
            + '<span class="pity-catch-toggle" style="grid-column:1/-1;cursor:pointer;text-decoration:underline;font-size:12px;font-weight:600;color:var(--text,#20354d);">历史记录</span>';
    }
    // 保底轮播：3 秒切换两种模式
    let _pityCalibrationTimer = null, _pityRenderTimer = null;
    function startPity() {
        stopPity();
        if (!settings.showPity) return;
        fetchPity();
        _pityCalibrationTimer = setInterval(fetchPity, PITY_CALIBRATION_MS);
        _pityRenderTimer = setInterval(injectPityPanel, 2000);  // SPA 重绘后重新插入
        document.addEventListener('click', onDocClickCatchToggle);
    }
    function stopPity() {
        if (_pityCalibrationTimer) { clearInterval(_pityCalibrationTimer); _pityCalibrationTimer = null; }
        if (_pityRenderTimer) { clearInterval(_pityRenderTimer); _pityRenderTimer = null; }
        document.querySelector('.pity-panel')?.remove();
        document.getElementById('pity-panel-style')?.remove();
        _pityCssInjected = false;
        closeCatchLog();
        document.removeEventListener('click', onDocClickCatchToggle);
    }
    onTeardown(stopPity);
    // === 今日统计：理论在线竿数 / 掉了多少竿（注入游戏「今日 N 杆」旁） ===
    function injectCastStats() {
        if (!settings.showTheoreticalCasts) { document.querySelector('.arc-cast-stats')?.remove(); return; }
        const heading = document.querySelector('.harvest-panel-heading');
        if (!heading) return;
        const span = [...heading.children].find(c => c.tagName === 'SPAN');
        if (!span) return;
        // 实际竿数直接读游戏「今日 N 杆」文本（和游戏显示同一来源，避免内部采集不同步导致理论/掉竿失真）
        const m = span.textContent.match(/今日\s*([\d,]+)\s*杆/);
        if (!m) return;
        const actualCasts = parseInt(m[1].replace(/[^\d]/g, ''), 10);
        if (actualCasts <= 0 || !state.nextHarvestResetAt) return;  // 数据未就绪
        // 「今日 N 杆」变化时才更新理论的时间基准，和它同节奏冻结；
        // 否则理论用 Date.now() 会随时间单边上涨，今日没变掉竿却一直 +1。
        if (actualCasts !== state.dailyHarvestCasts) {
            updateState({ dailyHarvestCasts: actualCasts, dailyHarvestAt: Date.now() });
        }
        const cycleMs = (state.appGame?.getSnapshot()?.fishing?.cycleDurationMs) || 6000;
        const todayStart = state.nextHarvestResetAt - 24 * 3600 * 1000;  // 今日北京时间 0 点
        const theoretical = Math.floor(Math.max(0, (state.dailyHarvestAt || Date.now()) - todayStart) / cycleMs);
        const lost = Math.max(0, theoretical - actualCasts);
        let el = heading.querySelector('.arc-cast-stats');
        if (!el) {
            el = document.createElement('span');
            el.className = 'arc-cast-stats';
            span.insertAdjacentElement('afterend', el);
        }
        // 分色展示、可换行：理论(青) / 掉竿(橙=有掉竿，绿=没掉竿)
        el.style.cssText = 'display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-left:8px;font-size:12px;';
        el.innerHTML = [
            `<span style="color:#52bac4;font-weight:600;white-space:nowrap;">理论 ${theoretical.toLocaleString('zh-CN')} 竿</span>`,
            `<span style="color:var(--muted,#8b9ab0);">/</span>`,
            `<span style="color:${lost > 0 ? '#e6a23c' : '#45a76f'};font-weight:600;white-space:nowrap;">掉竿 ${lost.toLocaleString('zh-CN')}</span>`
        ].join('');
    }
    // === 船队个人赛蹭奖：整船在比赛地图待 N 分钟，到点屏蔽本场按优先级航行 ===
    function updatePartyDip(snap) {
        if (!settings.partyDipPersonal || !settings.autoPersonal) return;
        if (!snap?.party?.isInParty || !snap.party.canChangeBoatBiome) return;
        const ctx = getPersonalCompContext();
        if (!ctx) {
            // 无个人赛 → 清空状态
            if (state._partyDipSeq) { state._partyDipSeq = ''; state._partyDipStartAt = 0; }
            if (state._partyBlockedSeq) state._partyBlockedSeq = '';
            return;
        }
        const onCompMap = snap.party.boatBiomeId === ctx.biomeId;
        if (!onCompMap) {
            // 船不在比赛地图，未在蹭奖
            if (state._partyDipSeq === ctx.sequence) { state._partyDipSeq = ''; state._partyDipStartAt = 0; }
            return;
        }
        if (state._partyBlockedSeq === ctx.sequence) return; // 已屏蔽
        if (state._partyDipSeq !== ctx.sequence) {
            state._partyDipSeq = ctx.sequence;
            state._partyDipStartAt = Date.now();
            L.map(`船队蹭奖: 开始计时 ${settings.partyDipMinutes} 分钟`);
            return;
        }
        if (Date.now() - state._partyDipStartAt >= settings.partyDipMinutes * 60 * 1000) {
            state._partyBlockedSeq = ctx.sequence;
            OpLog.info('切图', `船队蹭奖: 已待 ${settings.partyDipMinutes} 分钟，屏蔽本次个人赛`);
            checkRespecStart();  // 洗点联动：屏蔽后 shouldActForComp 变 false → 走无比赛恢复
        }
    }

    function makeDecision(game) {
        if (!settings.autoSwitchMap) { L.map('autoSwitchMap 已关闭'); return; }
        if (state.paused) { L.map('已暂停，跳过自动切图'); return; }
        const snap = game.getSnapshot(); if (!snap?.biomes) { L.map('快照无数据'); return; }
        updatePartyDip(snap);
        // 人在船队但离船了 → 归队。但枯潮跳过时例外：船在枯潮个人赛图则不归队
        if (snap.party?.isInParty && snap.currentBiomeId !== snap.party.boatBiomeId) {
            const boatBiome = snap.biomes.find(b => b.id === snap.party.boatBiomeId);
            if (witherDipActive()) { L.map('跳过/蹭奖中，不归队'); return; }
            OpLog.info('切图', '离船归队 (' + snap.currentBiomeId + '→' + snap.party.boatBiomeId + ')');
            game.biomes.travelTo(snap.party.boatBiomeId).then(()=>{ updateState({lastSwitchTime:Date.now()}); evaluateBait(); }).catch(err=>error('归队失败:',err.message));
            return;
        }
        // 船员在船上时只跟船走，不做任何切图决策
        if (snap.party?.isInParty && !snap.party.canChangeBoatBiome) { L.map('船员模式，跟随船队不主动切图'); return; }
        // 已不在船队但开关还开着 → 自动关掉
        if (settings.autoPartyTravel && !snap.party?.canChangeBoatBiome) { settings.autoPartyTravel = false; saveSettings(); const swp = shadowRoot?.getElementById('sw-autoPartyTravel'); if (swp) swp.checked = false; renderPriorities(); updateModeStatus(snap); L.map('已退出船队，自动切回个人模式'); }
        const unlocked = snap.biomes.filter(b => b.isUnlocked); if (!unlocked.length) { L.map('无已解锁地图'); return; }
        const now = Date.now(); let target = null, tt = '';
        const compOk = settings.autoGuild || settings.autoPersonal;
        const hasCompData = !!((!settings.autoPersonal || state.competitionCache.personal) && (!settings.autoGuild || state.competitionCache.guild));
        const partyMode = settings.autoPartyTravel && snap.party?.canChangeBoatBiome;
        const priority = partyMode ? (settings.partyMapPriority || DEFAULTS.partyMapPriority) : (settings.mapPriority || DEFAULTS.mapPriority);
        const currentId = partyMode ? snap.party.boatBiomeId : snap.currentBiomeId;
        L.map(`开始决策: 模式=${partyMode?'船队':'个人'} current=${currentId} priority=[${priority.join('→')}]`);
        let dataPending = false, skipWither = false;
        for (const pt of priority) {
            if (target) break;
            switch(pt) {
            case 'competition': {
                if (!compOk) { L.map(`→ competition: 开关未启用`); break; }
                if (!hasCompData) { L.map(`→ competition: 数据未就绪，待定`); dataPending = true; break; }
                const ct = getCompetitionTarget(unlocked, now);
                const skipReason = (ct && ct.kind === 'personal') ? shouldSkipComp(ct.biome) : '';
                if (skipReason) { L.map(`→ competition: ${skipReason}，跳过 (${ct.biome.name||ct.biome.id})`); skipWither = true; break; }
                if (ct && ct.kind === 'personal') {
                    const seq = getPersonalCompContext()?.sequence || '';
                    if (settings.witherTideDipPersonal && state._witherDipSeq !== seq && ct.biome.weather?.id === 'wither_tide')
                        L.map(`→ competition: 枯潮蹭奖等待首竿 (${ct.biome.name||ct.biome.id})`);
                    else if (settings.dipPersonal && state._dipSeq !== seq)
                        L.map(`→ competition: 蹭奖等待首竿 (${ct.biome.name||ct.biome.id})`);
                }
                if (ct) { target=ct.biome; tt='🏁 比赛'; L.map(`→ competition: ✅ ${ct.biome.name||ct.biome.id}`); }
                else L.map(`→ competition: 无报名比赛`);
                break;
            }
            case 'designated': { const bid = partyMode ? settings.partyDesignatedBiomeId : settings.designatedBiomeId; if (bid) { const b = unlocked.find(u => u.id===bid); if (b) { target=b; tt='🎯 指定图'; L.map(`→ designated: ✅ ${b.name}`); } else L.map(`→ designated: ${bid} 未解锁`); } else L.map(`→ designated: 未指定`); break; }
            case 'goldwind': { const g = unlocked.filter(b => b.weather?.id==='gilded_current'); if (g.length) { target=g.reduce((a,b)=>a.id>b.id?a:b); tt='💰 金风'; L.map(`→ goldwind: ✅ ${g.length}张`); } else L.map(`→ goldwind: 无`); break; }
            case 'experience': { const nid=(x)=>parseInt(x.id.replace(/\D/g,''),10)||0; unlocked.sort((a,b)=>calculateTotalExpBonus(b)-calculateTotalExpBonus(a)||nid(b)-nid(a)); target=unlocked[0]; tt='📈 经验'; const excl=[]; if(settings.excludeMasteryBonus)excl.push('专精'); if(settings.excludeGuildBoost)excl.push('公会'); L.map(`→ experience: ✅ ${target.name} (${formatBasisPoints(calculateTotalExpBonus(target))})${excl.length?' [排除:'+excl.join('+')+']':''}`); break; }
            case 'gold': { target=unlocked.reduce((a,b)=>a.id>b.id?a:b); tt='🪙 金币'; L.map(`→ gold: 兜底 ${target.name}`); break; }
            }
        }
        if (!target) { L.map('无目标'); return; }
        if (dataPending) { L.map(`数据未就绪，放弃 (目标=${target.name})`); return; }
        if (target.id === currentId) { L.map(`已在目标 ${target.name}`); return; }
        const usePartyTravel = partyMode && !skipWither; // 跳过比赛时仅个人离船
        OpLog.info('切图', '🔄 切换' + (usePartyTravel?'(船队)':'') + ' ' + tt + ': ' + currentId + ' → ' + target.id);
        const travel = usePartyTravel ? game.party.travelTo(target.id) : game.biomes.travelTo(target.id);
        travel.then(()=>{ updateState({lastSwitchTime:Date.now()}); evaluateBait(); }).catch(err=>error('切换失败:',err.message));
    }

    // === 智能补杆：根据快照精确调度，替代盲轮询 ===
    let _refillTimer = null;
    onTeardown(() => stopRefill());
    function stopRefill() { if (_refillTimer) { clearTimeout(_refillTimer); _refillTimer = null; } }
    function scheduleRefill() {
        stopRefill();
        if (!settings.autoRefill || state.paused) return;
        const g = state.appGame || window.arcaneReelax;
        if (!g?.fishing?.refill) return;
        const snap = g.getSnapshot();
        const f = snap?.fishing;
        if (!f || f.status === 'stopped') return;
        L.refill(`补杆检查: ${f.remainingCasts}/${f.totalCasts} status=${f.status}`);
        if (f.status === 'completed' || f.remainingCasts < f.totalCasts / 2) {
            g.fishing.refill().then((ok) => { if (ok) OpLog.info('补杆', '✅ 已补满'); }).catch((e) => { OpLog.error('补杆', '补杆失败: ' + (e?.message || e)); });
            _refillTimer = setTimeout(scheduleRefill, 5000);
            return;
        }
        if (f.nextCastAt && f.cycleDurationMs > 0) {
            const nextCast = Date.parse(f.nextCastAt);
            if (Number.isFinite(nextCast)) {
                const until = Math.floor(f.remainingCasts - f.totalCasts / 2) + 1;
                const dueAt = nextCast + Math.max(0, until - 1) * f.cycleDurationMs + 2000;
                _refillTimer = setTimeout(scheduleRefill, Math.min(Math.max(5000, dueAt - Date.now()), 2147000000));
                return;
            }
        }
        _refillTimer = setTimeout(scheduleRefill, 30000);
    }

    // === 签名去重：快照数据未变则跳过处理 ===
    function fishingSig(snap) {
        const f = snap?.fishing; if (!f) return '';
        return [f.status, f.mode, f.totalCasts, f.remainingCasts, f.cycleDurationMs, f.nextCastAt].join(':');
    }
    // activeBuffs 条目映射到 BUFF_CONFIG.group
    // 全服增益(player_shop)不阻塞个人购买；个人增益(personal_shop)按描述区分碎片/遗物
    function activeBuffGroup(b) {
        if (b.source === 'player_shop') return null;  // 全服增益（万流共鸣等）→ 不参与去重
        // personal_shop: 根据描述区分碎片商店 vs 遗物商店
        if (b.displayDescription && b.displayDescription.includes('碎片')) return 'fragment';
        return b.buffType;  // 遗物个人增益 → buffType 即 group (experience/strength/luck)
    }
    async function checkAndBuyBuffs() {
        if (!settings.autoBuyBuffs) return;
        const compSel = Object.keys(settings.buffSelections?.competition||{}).filter(k=>settings.buffSelections.competition[k]);
        const key = (onAnyCompMap() && compSel.length) ? 'competition' : state.currentWeatherId;
        const sel = key === 'competition' ? compSel : Object.keys(settings.buffSelections?.[key]||{}).filter(k=>settings.buffSelections[key]?.[k]);
        if (!sel.length) return;
        if (state.buffCheckInProgress) return;
        const now = Date.now();

        // 硬防线: 按分组冷却（CooldownMap）— 同组 25min 内不重复买，不同组（碎片≠遗物）互不干扰
        const cooled = sel.filter(k => {
            const group = BUFF_CONFIG[k]?.group; if (!group) return false;
            if (buffTypeCooldown.isCooling(group, now)) {
                L.buff(`${BUFF_CONFIG[k]?.name||k} 冷却中→跳过`);
                return false;
            }
            return true;
        });
        if (!cooled.length) return;

        // 先用服务端 activeBuffs 权威数据更新 + 清理缓存（必须在缓存检查之前）
        // 去重粒度：按分组（碎片商店→fragment，遗物商店→experience/strength/luck）
        const activeGroups = new Map();  // group → endsAt
        const activeBuffs = state._activeBuffs || [];
        let malformed = false;
        for (const b of activeBuffs) {
            if (!b.buffType || !b.endsAt) { malformed = true; continue; }
            if (new Date(b.endsAt).getTime() > now) {
                const g = activeBuffGroup(b);
                if (!g) continue;  // 全服增益不参与去重
                state.buffExpiryCache.set(g, b.endsAt);
                activeGroups.set(g, b.endsAt);
            }
        }
        if (malformed && activeBuffs.length > 0) {
            warn('[Buff] activeBuffs 结构异常（缺少 buffType/endsAt），本次跳过购买以免误判');
            return;
        }
        // 清理缓存：服务端不再报告的分组 → 删除
        for (const [g] of state.buffExpiryCache) {
            if (!activeGroups.has(g)) state.buffExpiryCache.delete(g);
        }

        // 然后是缓存检查（此时缓存已是清理后的权威数据）
        let needBuy = cooled.filter(k => {
            const group = BUFF_CONFIG[k]?.group; if (!group) return false;
            if (activeGroups.has(group)) { L.buff(`${BUFF_CONFIG[k]?.name||k} 验算活跃→跳过`); return false; }
            const cachedExpiry = state.buffExpiryCache.get(group);
            if (cachedExpiry && new Date(cachedExpiry).getTime() > now) {
                L.buff(`${BUFF_CONFIG[k]?.name||k} 缓存有效→跳过`);
                return false;
            }
            return true;
        });
        if (!needBuy.length) return;

        // 余额检查
        const relicBuffs = needBuy.filter(k => !BUFF_CONFIG[k]?.currency);
        const fragmentBuffs = needBuy.filter(k => BUFF_CONFIG[k]?.currency === 'fragments');
        const minRelic = relicBuffs.length ? Math.min(...relicBuffs.map(k=>BUFF_CONFIG[k]?.price??Infinity)) : Infinity;
        const minFrag = fragmentBuffs.length ? Math.min(...fragmentBuffs.map(k=>BUFF_CONFIG[k]?.price??Infinity)) : Infinity;
        if (relicBuffs.length && state.playerRelics < minRelic) { L.buff(`遗物不足`); needBuy = needBuy.filter(k => !relicBuffs.includes(k)); }
        if (fragmentBuffs.length && state.playerFragments < minFrag) { L.buff(`碎片不足`); needBuy = needBuy.filter(k => !fragmentBuffs.includes(k)); }
        if (!needBuy.length) return;

        state.buffCheckInProgress = true;
        try {
            OpLog.info('Buff', '验算通过，购买 ' + needBuy.length + ' 个Buff');
            for (const k of needBuy) {
                const cfg = BUFF_CONFIG[k]; if (!cfg) continue;
                const balance = cfg.currency === 'fragments' ? state.playerFragments : state.playerRelics;
                if (balance < cfg.price) { OpLog.warn('Buff', '余额不足，跳过 ' + cfg.name); continue; }
                try {
                    const r = await apiFetch('/api/shop/purchases', { method:'POST', idempotencyKey:generateIdempotencyKey(`buy-${k}`), body:{productId:k} });
                    if (r.balances?.relics!==undefined) updateState({playerRelics:r.balances.relics});
                    if (r.balances?.fragments!==undefined) updateState({playerFragments:r.balances.fragments});
                    if (cfg.group) {
                        buffTypeCooldown.set(cfg.group, now + BUFF_COOLDOWN_MS);
                    }
                    OpLog.info('Buff', '✅ 购买成功: ' + cfg.name);
                } catch(e) { OpLog.error('Buff', '购买失败: ' + cfg.name + ' — ' + e.message); }
            }
        } finally { updateState({buffCheckInProgress:false}); }
    }

    // === 每日签到（官方 API） ===
    async function attemptDailyCheckIn() {
        if (!settings.autoCheckIn) return;
        const api = state.appGame || window.arcaneReelax; if (!api) return;
        const snap = api.getSnapshot();
        if (!snap?.dailyCheckIn?.canClaim) { L.dlg(`签到检查: canClaim=${snap?.dailyCheckIn?.canClaim??'null'} checkedIn=${snap?.dailyCheckIn?.checkedInToday??'null'}`); return; }
        if (typeof api.dailyCheckIn?.claim !== 'function') return;
        try {
            const ok = await api.dailyCheckIn.claim();
            if (ok) { api.ui?.dismissReminder?.('daily-check-in'); OpLog.info('签到', '✅ 每日签到已领取'); }
        } catch(e) { OpLog.error('签到', '领取失败: ' + e.message); }
    }
    // === 比赛提醒弹窗（官方 API 处理 active 比赛 + DOM 兜底处理提前提醒） ===
    function dismissCompetitionReminder() {
        if (!settings.autoDismissCompetition) return;
        const api = state.appGame || window.arcaneReelax;
        api?.ui?.dismissReminder?.('competition');
    }
    // === 比赛弹窗 DOM 兜底：官方 dismissReminder 只处理"已开始"的比赛，提前提醒的弹窗点"稍后处理" ===
    function handleCompetitionPopup() {
        if (!settings.autoDismissCompetition) return;
        const d = document.querySelector('.competition-reminder-dialog'); if (!d) return;
        const b = d.querySelector('button.secondary-button'); if (b && !b.disabled) b.click();
    }
    // === 离线结算弹窗（DOM，官方无对应 API） ===
    function handleOfflineSummary() {
        if (!settings.autoDismissOffline) return;
        const d = document.querySelector('dialog.offline-summary-dialog'); if (!d) return;
        const p = d.querySelector('footer button.primary-button'); if (p&&!p.disabled) { p.click(); return; }
        const s = d.querySelector('footer button.secondary-button'); if (s&&!s.disabled) { s.click(); return; }
        const c = d.querySelector('header button[aria-label*="关闭"]'); if (c&&!c.disabled) { c.click(); return; }
        try{d.close()}catch(_){}
    }
    function checkAllDialogs() { handleCompetitionPopup(); handleOfflineSummary(); }
    function startDomObserver() { stopDomObserver(); checkAllDialogs(); state.domObserver = new MutationObserver(()=>{ const n=Date.now(); if(n-state.domObserverThrottle<1000)return; updateState({domObserverThrottle:n}); checkAllDialogs(); }); state.domObserver.observe(document.body,{childList:true,subtree:true}); onTeardown(()=>stopDomObserver()); }
    function stopDomObserver() { if (state.domObserver) { state.domObserver.disconnect(); state.domObserver = null; } }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0]==='string'?args[0]:''; const resp = await originalFetch.apply(this,args); if(!url) return resp;
        // 截获 HMAC proof（服务器通过响应头下发）
        try { const proof = resp.headers.get('x-arcane-request-proof'); if (proof && proof !== playerProof) { playerProof = proof; playerKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(proof), { name:'HMAC', hash:'SHA-256' }, false, ['sign']); } updateServerTimeOffset(resp.headers); } catch(_){}
        try {
            // 收支明细：凡带币种字段的 API 响应都记一笔（按 URL 归类，零额外请求）
            if (url.includes('/api/')) { try { const _led = await resp.clone().json(); recordLedger(url, _led); } catch(_) {} }
            // /api/me：游戏自带请求，从中静默捕获余额/属性/身份（零额外请求）
            if(url.includes('/api/me')){
                const d=await resp.clone().json();
                if(d.player?.fragments!==undefined)updateState({playerFragments:d.player.fragments});
                if(d.player?.relics!==undefined)updateState({playerRelics:d.player.relics});
                if(d.player?.unspentStatPoints!==undefined){ const prev=state.unspentStatPoints; updateState({unspentStatPoints:d.player.unspentStatPoints}); if(d.player.unspentStatPoints>0&&d.player.unspentStatPoints!==prev)autoAllocateStats(); }
                if(d.player?.gold!==undefined)updateState({playerGold:d.player.gold});
                if(d.player?.stats){ const hadStats=!!state.playerStats; updateState({playerStats:d.player.stats}); if(!hadStats)checkRespecStart(); }
                if(d.publicIdentity?.publicId!==undefined)updateState({playerUid:String(d.publicIdentity.publicId)});
                if(d.player?.nickname!==undefined)updateState({playerName:d.player.nickname});
            }
            if(url.includes('/api/content/bootstrap')){
                // 内容配置（游戏自身请求）：被动采集鱼名/地图名映射，用于钓获记录展示（零额外请求）
                try {
                    const d=await resp.clone().json();
                    if(Array.isArray(d.fish)){ for(const f of d.fish){ if(f.rarity==='exotic'||f.rarity==='arcane') state._fishNameMap[f.id]=f.name; } }
                    if(Array.isArray(d.biomes)){ for(const b of d.biomes) state._biomeNameMap[b.id]=b.name; }
                } catch(_){}
            }
            if(url.includes('/api/tournaments/overview')){
                const d=await resp.clone().json();updateState({competitionCache:{...state.competitionCache,personal:d}});
                L.fetch(`个人赛(cur=${!!d.current}, up=${d.upcoming?.length||0})`);bus.emit('competition:updated');
            }
            if(url.includes('/api/guild-tournaments/overview')){
                const d=await resp.clone().json();updateState({competitionCache:{...state.competitionCache,guild:d}});
                L.fetch(`公会赛(cur=${!!d.current}, up=${d.upcoming?.length||0})`);bus.emit('competition:updated');
            }
            if(url.includes('/api/fishing/state')||url.includes('/api/fishing/sync')){
                const d=await resp.clone().json();
                if(d.playerPatch?.relics!==undefined)updateState({playerRelics:d.playerPatch.relics});
                if(d.playerPatch?.fragments!==undefined)updateState({playerFragments:d.playerPatch.fragments});
                if(d.playerPatch?.gold!==undefined)updateState({playerGold:d.playerPatch.gold});
                if(d.playerPatch?.unspentStatPoints!==undefined){ const prev2=state.unspentStatPoints; updateState({unspentStatPoints:d.playerPatch.unspentStatPoints}); if(d.playerPatch.unspentStatPoints>0&&d.playerPatch.unspentStatPoints!==prev2)autoAllocateStats(); }
                if(d.run?.snapshot?.effects?.guild?.totemLevels)updateState({guildTotemLevels:d.run.snapshot.effects.guild.totemLevels});
                // 今日 0 点重置时间（「理论竿数」计算用；state/sync 都带，取一次即可）
                if(d.nextDailyHarvestResetAt)updateState({nextHarvestResetAt:Date.parse(d.nextDailyHarvestResetAt)});
                if(d.activeBuffs){ updateState({_activeBuffs:d.activeBuffs}); const now2=Date.now(); for(const b of d.activeBuffs){ if(b.buffType&&b.endsAt){ const g=activeBuffGroup(b); if(g&&new Date(b.endsAt).getTime()>now2)state.buffExpiryCache.set(g,b.endsAt); } } }
                // 保底：sync 每杆一次，直接本地追踪（state 不追踪，避免重复）
                if(url.includes('/api/fishing/sync') && settings.showPity && state._pityLoaded && d?.lastResult){ trackPityCast(d.lastResult.rarity); recordRareCatch(d.lastResult); injectPityPanel(); }
                bus.emit('fishing:updated',d);
            }
        } catch(e){ warn('拦截器异常:', e.message); }
        return resp;
    };
    onTeardown(()=>{window.fetch=originalFetch;});
    bus.on('competition:updated', async ()=>{
        L.event('competition:updated → 报名+切图');
        dismissCompetitionReminder();
        if (!state.paused) { await autoRegisterPersonal(); checkRespecStart(); if(state.appGame){ makeDecision(state.appGame); evaluateBait(); } }
    });
    bus.on('fishing:updated', (d)=>{
        attemptDailyCheckIn();
        const g=state.appGame||window.arcaneReelax;if(!g)return;
        const snap = g.getSnapshot();
        const sig = fishingSig(snap);
        const isNewCast = sig !== state._lastFishingSig;
        if (isNewCast) { state._lastFishingSig = sig; if (!state.paused) scheduleRefill(); }
        // 保底：三因子变化检测（本地追踪已在拦截器 sync 分支处理）
        if (settings.showPity) {
            const tier = getLuckTier();
            if (state._lastLuckTier >= 0 && tier !== state._lastLuckTier) { L.pity(`运气档位变化 ${state._lastLuckTier}→${tier}`); state._lastLuckTier = tier; fetchPity(); }
            const baitId = snap?.baits?.find(b => b.isSelected)?.id || '';
            if (state._lastBaitId && baitId !== state._lastBaitId) { L.pity(`鱼饵变化 ${state._lastBaitId}→${baitId}`); state._lastBaitId = baitId; fetchPity(); }
            if (!state._lastBaitId) state._lastBaitId = baitId;
        }
        try{const s=snap;if(s?.biomes){const c=s.biomes.find(b=>b.isCurrent);if(c?.weather)updateState({currentWeatherId:c.weather.id});}}catch(_){}
        if (state.paused) return;
        if(settings.autoBuyBuffs) checkAndBuyBuffs();
        checkBaitScene();
        if(settings.autoBait) checkBaitFallback();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
        // 蹭奖检测：比赛积分>=10 → 标记（绑定 sequence，比赛结束自动失效）
        const dipCheck =(settingOn, dipSeq, dipKey, label, needWither) => {
            if (!settingOn) return;
            const seq = getPersonalCompContext()?.sequence || '';
            if (!seq || dipSeq === seq) return;  // 无比赛或本场已标记
            if (!personalDipScoreMet(needWither)) return;
            if (dipKey === '_witherDipSeq') state._witherDipSeq = seq;
            else state._dipSeq = seq;
            L.map(`${label}: 积分已满足，标记完成`);
            OpLog.info('切图', `${label}: 已获参与积分，跳过本次个人赛`);
            if (settings.autoRespecPersonal) applyPostRespec();
            if (settings.autoLoadout) switchLoadout(1);
            if (state.appGame) makeDecision(state.appGame);
        };
        dipCheck(settings.witherTideDipPersonal, state._witherDipSeq, '_witherDipSeq', '枯潮蹭奖', true);
        dipCheck(settings.dipPersonal, state._dipSeq, '_dipSeq', '个人赛蹭奖', false);
        // 鱼饵库存 -1（仅在真正新抛竿时消耗，避免 /api/fishing/state 非抛竿响应误扣）
        if(isNewCast && state.baitCache){
            const selBait = (g.getSnapshot()?.baits||[]).find(b=>b.isSelected);
            if(selBait && !selBait.isUnlimited){
                const entry = state.baitCache.find(b=>b.id===selBait.id);
                if(entry && entry.quantity > 0){
                    entry.quantity--;
                    if(entry.quantity <= 0) refreshBaitData();
                }
            }
        }
    });

    function applySettings() {
        // 保底显示是纯 UI 功能，不受暂停影响，提前处理避免暂停时开关失效
        settings.showPity ? startPity() : stopPity();
        if (state.paused) return;
        L.cfg(`应用: refill=${settings.autoRefill} map=${settings.autoSwitchMap} checkIn=${settings.autoCheckIn} comp=${settings.autoDismissCompetition} offline=${settings.autoDismissOffline} buff=${settings.autoBuyBuffs} reg=${settings.autoRegisterPersonal} alloc=${settings.autoAllocateStats} bait=${settings.autoBait} respecP=${settings.autoRespecPersonal} respecG=${settings.autoRespecGuild} loadout=${settings.autoLoadout} party=${settings.autoPartyTravel} exMastery=${settings.excludeMasteryBonus} exGuild=${settings.excludeGuildBoost}`);
        settings.autoRefill ? scheduleRefill() : stopRefill();
        if(settings.autoSwitchMap&&state.appGame)makeDecision(state.appGame);
        if (settings.autoDismissOffline || settings.autoDismissCompetition) startDomObserver(); else stopDomObserver();
        if (settings.autoCheckIn) attemptDailyCheckIn();
        if (settings.autoDismissCompetition) dismissCompetitionReminder();
        if(settings.autoBuyBuffs && state.playerRelics > 0) checkAndBuyBuffs();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
        // 洗点开关 → 开则检查比赛，关且有比赛则赛后分配
        if (settings.autoRespecPersonal || settings.autoRespecGuild) checkRespecStart();
        else if ((isCompetitionActive('personal') || isCompetitionActive('guild')) && state._prevAnyRespec && !statsMatchPostRespec()) applyPostRespec();
        updateState({ _prevAnyRespec: settings.autoRespecPersonal || settings.autoRespecGuild });
        // 配装开关：关→切回1号，开→有比赛立即切
        if (!settings.autoLoadout && state._prevAutoLoadout) switchLoadout(1);
        else if (settings.autoLoadout && !state._prevAutoLoadout) {
            if (onAnyCompMap()) switchLoadout(settings.loadoutSlot);
        }
        updateState({ _prevAutoLoadout: settings.autoLoadout });
        // 卖鱼/卖装备定时器
        settings.sellFishEnabled ? startSellFish() : stopSellFish();
        settings.sellGearEnabled ? startSellGear() : stopSellGear();
    }
    function resetAllSettings() { settings={...DEFAULTS};saveSettings();if(shadowRoot)syncUIFromSettings();applySettings(); }
    function syncUIFromSettings() {
        if (!shadowRoot) return;
        for (const item of SETTING_SCHEMA) { const cb = shadowRoot.getElementById('sw-'+item.key); if (cb) cb.checked = !!settings[item.key]; }
        const swAB = shadowRoot.getElementById('sw-autoBuyBuffs'); if (swAB) swAB.checked = !!settings.autoBuyBuffs;
        const autoG = shadowRoot.getElementById('sw-autoGuild'), autoP = shadowRoot.getElementById('sw-autoPersonal');
        const compOk = (autoG?.checked??settings.autoGuild) || (autoP?.checked??settings.autoPersonal);
        renderPriorities();
        renderBuffUI();
        const swExMastery2 = shadowRoot.getElementById('sw-excludeMasteryBonus'); if (swExMastery2) swExMastery2.checked = !!settings.excludeMasteryBonus;
        const swExGuild2 = shadowRoot.getElementById('sw-excludeGuildBoost'); if (swExGuild2) swExGuild2.checked = !!settings.excludeGuildBoost;
        renderStatsSection();
        renderFeedbackUI();
        renderSellUI();
    }

    // ============================================================
    // 7. Shadow DOM UI（抄航线助手风格）
    // ============================================================

    let shadowRoot = null;

    const PANEL_HTML = `
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
  .section-heading[data-accordion]{cursor:pointer;user-select:none;}
  .section-heading[data-accordion]::after{content:"▸";margin-left:auto;font-size:16px;color:var(--as-muted);transition:transform 150ms ease;}
  .section[data-collapsed="false"] .section-heading[data-accordion]::after{content:"▾";}
  .log-line{display:flex;gap:6px;padding:2px 0;border-bottom:1px solid var(--as-divider);}
  .log-line:last-child{border-bottom:0;}
  .log-time{flex:0 0 auto;color:var(--as-muted);font-size:10px;}
  .log-tag{flex:0 0 auto;font-weight:700;font-size:11px;}
  .log-msg{flex:1;min-width:0;overflow-wrap:break-word;word-break:break-all;font-size:11px;}
  .log-line[data-level="error"] .log-msg,.log-line[data-level="error"] .log-time{color:var(--as-coral);}
  .log-line[data-level="warn"] .log-msg,.log-line[data-level="warn"] .log-time{color:#d97706;}
  .tab-btn{display:flex !important;align-items:center;justify-content:center;}
  .tab-btn:hover{border-color:var(--as-tide) !important;background:var(--as-control-hover) !important;}
  .tab-bar{position:sticky;top:0;z-index:1;display:flex;border-bottom:1px solid var(--as-divider);background:var(--as-soft);}
  .tab-bar .tab-btn{flex:1;padding:9px 4px;border:0;border-right:1px solid var(--as-divider);background:transparent;color:var(--as-muted);cursor:pointer;font-size:12px;font-weight:650;}
  .tab-bar .tab-btn:last-child{border-right:0;}
  .tab-bar .tab-btn[data-active="true"]{background:var(--as-raised);color:var(--as-tide-deep);box-shadow:inset 0 -2px 0 var(--as-tide);}
  .tab-badge{display:inline-block;width:7px;height:7px;margin-left:4px;border-radius:50%;background:#ef4444;vertical-align:middle;}
</style>
<aside class="dock" data-collapsed="false" aria-label="奥术摸鱼大师">
  <header class="panel-header">
    <div class="identity"><span class="float-mark" aria-hidden="true"></span><span class="identity-copy"><strong id="panel-title">奥术摸鱼大师</strong><small id="headline">等待游戏快照</small></span></div>
    <button class="icon-button tab-btn" id="btn-pause" type="button" title="暂停所有自动化功能" aria-label="暂停自动化" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span style="font-size:12px">⏯</span><span style="margin-left:1px">暂停</span></button>
    <button class="icon-button tab-btn" id="collapse" type="button" title="拖动标题栏可移动面板" aria-label="收起面板" aria-expanded="true" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span class="collapse-glyph" style="font-size:16px;line-height:1">−</span><span style="margin-left:1px" id="collapse-label">收起</span></button>
  </header>
  <div id="update-banner" style="display:none;padding:7px 12px;font-size:12px;color:#8a5a00;background:#fff4d6;border-bottom:1px solid #f0c36d;">发现新版本 <strong id="update-version"></strong>（当前 <span id="current-version"></span>），请更新脚本</div>
  <div class="panel-body">
    <div class="tab-bar" id="tab-bar">
      <button class="tab-btn" type="button" data-view="settings">设置</button>
      <button class="tab-btn" type="button" data-view="log">日志</button>
      <button class="tab-btn" type="button" data-view="feedback">反馈<span class="tab-badge" id="feedback-badge"></span></button>
    </div>
    <div id="view-settings">
    <div class="snapshot-grid">
      <div class="snapshot-cell"><span>当前地图</span><strong id="snap-biome">--</strong></div>
      <div class="snapshot-cell"><span>地图经验</span><strong id="snap-score">--</strong></div>
      <div class="snapshot-cell" style="grid-column:1/-1"><span>切图模式</span><strong id="snap-mode">个人地图模式</strong><span class="bait-hint" id="hint-mode" style="margin-left:4px;">?</span></div>
    </div>
    <div class="switches" id="switches"></div>
    <div class="section" data-section="priority" data-collapsed="false">
      <div class="section-heading" data-accordion><strong>自动切图</strong></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动切图</span><input type="checkbox" id="sw-autoSwitchMap"></div>
        <div class="switch-item"><span>船队模式（船长/舵手自动开船）</span><input type="checkbox" id="sw-autoPartyTravel"></div>
        <div class="switch-item"><span>排除地图专精加成</span><input type="checkbox" id="sw-excludeMasteryBonus"></div>
        <div class="switch-item"><span>排除公会增益</span><input type="checkbox" id="sw-excludeGuildBoost"></div>
        <ol class="priority-list" id="priority-list"></ol>
      </div>
    </div>
    <div class="section" data-section="buff" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动购买 Buff</strong></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动购买 Buff</span><input type="checkbox" id="sw-autoBuyBuffs"></div>
        <div id="buff-tabs" style="display:flex;flex-wrap:wrap;gap:2px;padding:4px 12px;border-top:1px solid var(--as-divider);"></div>
        <div id="buff-ctr" style="padding:4px 12px 8px;"></div>
      </div>
    </div>
    <div class="section" data-section="bait" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动切换鱼饵</strong></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动切换鱼饵</span><input type="checkbox" id="sw-autoBait"></div>
        <div class="switch-item"><span>没库存时主动购买100个 <span class="bait-hint" id="hint-baitAutoBuy">?</span></span><input type="checkbox" id="sw-baitAutoBuy"></div>
        <div class="switch-item"><span>买不起时自动降级 <span class="bait-hint" id="hint-baitFallback">?</span></span><input type="checkbox" id="sw-baitFallback"></div>
        <div id="bait-scene-ctr" style="padding:0 12px 8px"></div>
      </div>
    </div>
    <div class="section" data-section="stats" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动加点/洗点</strong></div>
      <div class="section-body" id="stats-section-body"></div>
    </div>
    <div class="section" data-section="sellfish" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动卖鱼</strong></div>
      <div class="section-body" id="sellfish-body"></div>
    </div>
    <div class="section" data-section="sellgear" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动卖装备</strong></div>
      <div class="section-body" id="sellgear-body"></div>
    </div>
    </div><!-- /view-settings -->
    <div id="view-feedback" style="display:none"></div>
    <div id="view-log" style="display:none">
      <div id="log-entries" style="overflow-y:auto;padding:4px 8px;font-family:monospace;font-size:11px;line-height:1.65;height:calc(100vh - 132px)"></div>
      <div style="display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--as-divider);flex-shrink:0">
        <select id="log-tag-filter" title="按标签筛选日志（仅影响显示，导出/反馈仍是全量）" style="font-size:11px;padding:2px 4px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;max-width:110px;flex:0 0 auto"></select>
        <button id="btn-export-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer" title="导出为 .txt 文件，上限 100MB">导出</button>
        <button id="btn-clear-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-muted);cursor:pointer" title="清空面板日志缓存">清空</button>
        <button id="btn-pause-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer" title="暂停自动滚动到底部">⏸ 暂停</button>
        <span id="log-size-hint" style="font-size:10px;color:var(--as-muted);margin-left:auto;align-self:center"></span>
      </div>
    </div>
  </div>
</aside>
<div id="update-popup" style="display:none;position:fixed;inset:0;z-index:2147483601;background:rgba(15,23,42,0.45);align-items:center;justify-content:center;">
  <div style="box-sizing:border-box;width:min(360px,calc(100vw - 48px));max-height:70vh;overflow:auto;background:var(--as-surface,#fffefa);border:1px solid var(--as-border,#d1dee7);border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,0.25);">
    <div id="update-popup-title" style="padding:12px 16px;font-size:14px;font-weight:700;border-bottom:1px solid var(--as-divider,#e4edf2);">更新说明</div>
    <div id="update-popup-body" style="padding:14px 16px;font-size:12px;line-height:1.8;white-space:pre-line;color:var(--as-text,#20354d);"></div>
    <div style="padding:10px 16px 14px;text-align:right;border-top:1px solid var(--as-divider,#e4edf2);">
      <button id="update-popup-close" type="button" style="padding:6px 18px;font-size:12px;font-weight:650;border:0;border-radius:3px;background:var(--as-tide,#52bac4);color:#fff;cursor:pointer;">知道了</button>
    </div>
  </div>
</div>`;

    function renderSwitches() {
        if (!shadowRoot) return;
        const ctr = shadowRoot.getElementById('switches'); if (!ctr) return;
        ctr.innerHTML = '';
        for (const item of SETTING_SCHEMA) {
            const row = document.createElement('label'); row.className = 'switch-item';
            row.innerHTML = `<span>${item.label}</span>`;
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'sw-' + item.key; cb.checked = !!settings[item.key];
            cb.addEventListener('change', function() {
                if (this.id === 'sw-autoGuild' || this.id === 'sw-autoPersonal') renderPriorities();
            });
            row.appendChild(cb); ctr.appendChild(row);
            if (item.key === 'debugLog') {
                row.querySelector('span').appendChild(makeHint('开启：控制台和日志面板显示所有调试信息（决策过程、缓存命中、数据拦截等）。\n关闭：只显示实际操作（购买、切图、洗点等）。'));
            }
            if (item.key === 'showPity') {
                row.querySelector('span').appendChild(makeHint('在「自动钓鱼」面板标题下方显示渔获保底进度：奥秘/奇异的保底倒计时（进度%、剩余时间、剩余杆数）和历史最倒霉记录。'));
            }
            if (item.key === 'showTheoreticalCasts') {
                row.querySelector('span').appendChild(makeHint('在钓鱼页「今日统计」标题右侧、「今日 N 杆」旁边显示理论竿数和掉竿。\n理论：从今日北京时间 0 点起一直在线能钓的理论最多竿数（按 6 秒一杆算）。\n掉竿：理论竿数 − 今日实际竿数，即因离线/断杆/没补满而损失的竿数。'));
            }
            if (item.key === 'showBalance') {
                row.querySelector('span').appendChild(makeHint('在钓鱼页「金币收支」下方显示「今日净赚/盈亏」：今日金币/遗物/碎片相对凌晨 0 点基准的净变化（余额差值，正=赚、负=亏，三个币种各自显示）。\n注意：这只是净额，不是收支明细。分类收支明细（钓鱼/卖鱼/买Buff 等逐项）还在测试，后续开放。'));
            }
        }
    }

    function renderStatsSection() {
        if (!shadowRoot) return;
        const ctr = shadowRoot.getElementById('stats-section-body'); if (!ctr) return;
        ctr.innerHTML = '';
        // 自动加点行
        const attrRow = document.createElement('label'); attrRow.className = 'switch-item';
        const statSel = document.createElement('select');
        statSel.id = 'sel-statTarget';
        statSel.style.cssText = 'width:56px;height:22px;margin-left:4px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;';
        for (const [val, label] of Object.entries(STAT_LABELS)) {
            const o = document.createElement('option'); o.value = val; o.textContent = label; if (val === settings.statAllocationTarget) o.selected = true;
            statSel.appendChild(o);
        }
        statSel.addEventListener('change', () => { settings.statAllocationTarget = statSel.value; saveSettings(); renderStatsSection(); checkRespecStart(); });
        const spanA = document.createElement('span'); spanA.style.whiteSpace = 'nowrap';
        const hintA = makeHint('1、所选属性会同步到赛后加点方案\n2、赛程期间强制加幸运，赛后才按所选属性加'); hintA.style.margin = '0 4px';
        spanA.append(document.createTextNode('启用自动加点'), hintA, statSel);
        const cbAlloc = document.createElement('input'); cbAlloc.type = 'checkbox'; cbAlloc.id = 'sw-autoAllocateStats'; cbAlloc.checked = !!settings.autoAllocateStats;
        cbAlloc.addEventListener('change', () => { settings.autoAllocateStats = cbAlloc.checked; saveSettings(); applySettings(); });
        attrRow.appendChild(spanA); attrRow.appendChild(cbAlloc); ctr.appendChild(attrRow);
        // 个人赛洗点开关
        (()=>{
            const row = document.createElement('label'); row.className = 'switch-item';
            const span = document.createElement('span');
            span.style.whiteSpace = 'nowrap';
            const hint = makeHint(HINTS.respec); hint.style.margin = '0 4px';
            span.append(document.createTextNode('个人赛全加幸运'), hint);
            row.appendChild(span);
            const cb = document.createElement('input'); cb.type='checkbox'; cb.id='sw-autoRespecPersonal'; cb.checked=!!settings.autoRespecPersonal;
            cb.addEventListener('change', () => { settings.autoRespecPersonal = cb.checked; saveSettings(); applySettings(); });
            row.appendChild(cb); ctr.appendChild(row);
        })();
        // 公会赛洗点开关
        (()=>{
            const row = document.createElement('label'); row.className = 'switch-item';
            const span = document.createElement('span');
            span.style.whiteSpace = 'nowrap';
            const hint = makeHint(HINTS.respec); hint.style.margin = '0 4px';
            span.append(document.createTextNode('公会赛全加幸运'), hint);
            row.appendChild(span);
            const cb = document.createElement('input'); cb.type='checkbox'; cb.id='sw-autoRespecGuild'; cb.checked=!!settings.autoRespecGuild;
            cb.addEventListener('change', () => { settings.autoRespecGuild = cb.checked; saveSettings(); applySettings(); });
            row.appendChild(cb); ctr.appendChild(row);
        })();
        // 赛后分配方案：力量目标值（数字输入框）+ 其余目标属性
        (()=>{
            const row = document.createElement('label'); row.className = 'switch-item';
            const span = document.createElement('span'); span.style.whiteSpace = 'nowrap';
            const statName = STAT_LABELS[settings.statAllocationTarget] || '智力';
            const hintP = makeHint('比赛结束后按此方案分配属性：力量先加到目标值，其余加目标属性。0 表示全加目标属性不加力量。\n注意：此选项仅在「个人赛全加幸运」或「公会赛全加幸运」开启时才生效，两个都关闭则自动失效。'); hintP.style.margin = '0 4px';
            if (settings.statAllocationTarget === 'strength') {
                // 目标就是力量：全加力量，无需力量目标值
                span.append(document.createTextNode('赛后加点方案'), hintP, document.createTextNode('全加' + statName));
            } else {
                const input = document.createElement('input');
                input.type = 'number'; input.min = '0'; input.step = '100'; input.value = settings.respecStrengthTarget;
                input.style.cssText = 'width:60px;height:22px;margin:0 3px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;';
                input.addEventListener('change', () => { settings.respecStrengthTarget = Math.max(0, parseInt(input.value) || 0); saveSettings(); checkRespecStart(); });
                span.append(document.createTextNode('赛后加点方案'), hintP, document.createTextNode('力'), input, document.createTextNode('+其余' + statName));
            }
            row.appendChild(span); ctr.appendChild(row);
        })();
        // 比赛配装切换（比赛开始→切到指定号，结束→切回1号）
        (()=>{
            const row = document.createElement('label'); row.className = 'switch-item';
            const span = document.createElement('span');
            span.style.whiteSpace = 'nowrap';
            const hint = makeHint(HINTS.loadout); hint.style.background = '#ef4444';
            const sel = document.createElement('select');
            sel.style.cssText = 'width:52px;height:22px;margin-left:4px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;';
            for (let i = 2; i <= 4; i++) {
                const o = document.createElement('option'); o.value = String(i); o.textContent = '#' + i;
                if (settings.loadoutSlot === i) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => { settings.loadoutSlot = Number(sel.value); saveSettings(); if (settings.autoLoadout && (onAnyCompMap())) switchLoadout(settings.loadoutSlot); });
            span.append(document.createTextNode('比赛切配装'), hint, sel);
            row.appendChild(span);
            const cb = document.createElement('input'); cb.type='checkbox'; cb.id='sw-autoLoadout'; cb.checked=!!settings.autoLoadout;
            cb.addEventListener('change', () => { settings.autoLoadout = cb.checked; saveSettings(); applySettings(); });
            row.appendChild(cb); ctr.appendChild(row);
        })();
    }

    // ============================================================
    // 采集/反馈：问卷 + 使用统计 + 错误报告（发到 COLLECT_BASE）
    // ============================================================

    let _lastCollectTs = 0; // 全局发送冷却，防连点

    // 发送到采集服务（用 originalFetch，绕过游戏 API 拦截器）
    async function postCollect(path, payload) {
        try {
            const r = await originalFetch(COLLECT_BASE + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const d = await r.json().catch(() => ({}));
            return { ok: r.ok && d.ok === true, dup: d.dup === true, err: d.err || '' };
        } catch (e) {
            return { ok: false, dup: false, err: e.message };
        }
    }

    function collectBase() {
        return { uid: state.playerUid || '', name: state.playerName || '', version: SCRIPT_VERSION };
    }

    // 版本号比较（语义化：1.10.0 > 1.9.0）
    function compareVersion(a, b) {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const x = pa[i] || 0, y = pb[i] || 0;
            if (x !== y) return x - y;
        }
        return 0;
    }

    const VERSION_CACHE_KEY = 'arcane_latest_version';
    // 检查最新版本：每次调用都请求一次 /version（刷新时一次 + 每小时定时器一次）；缓存仅用于请求前即时提示
    async function checkVersion() {
        try {
            // 先用缓存即时展示，不等请求返回
            const cached = localStorage.getItem(VERSION_CACHE_KEY) || '';
            if (cached && compareVersion(cached, SCRIPT_VERSION) > 0) showUpdateBanner(cached);
            const r = await originalFetch(COLLECT_BASE + '/version', { method: 'GET' });
            const d = await r.json().catch(() => ({}));
            if (d.version) {
                localStorage.setItem(VERSION_CACHE_KEY, d.version);
                if (compareVersion(d.version, SCRIPT_VERSION) > 0) showUpdateBanner(d.version);
            }
        } catch (e) { /* 版本检查失败不影响使用 */ }
    }

    function showUpdateBanner(latest) {
        if (!shadowRoot) return;
        const b = shadowRoot.getElementById('update-banner');
        const uv = shadowRoot.getElementById('update-version');
        const cv = shadowRoot.getElementById('current-version');
        if (b) {
            b.style.display = '';
            b.style.cursor = 'pointer';
            b.title = '点击打开下载页';
            // 点击打开下载地址（只绑定一次）
            if (!b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', () => { try { window.open(DOWNLOAD_URL, '_blank'); } catch (e) {} }); }
        }
        if (uv) uv.textContent = 'v' + latest;
        if (cv) cv.textContent = 'v' + SCRIPT_VERSION;
    }

    // 已看版本标记：独立 localStorage，不受 settings 重置影响
    const SEEN_VERSION_KEY = 'arcane_seen_version';
    function getSeenVersion() { try { return localStorage.getItem(SEEN_VERSION_KEY) || ''; } catch (e) { return ''; } }
    function setSeenVersion(v) { try { localStorage.setItem(SEEN_VERSION_KEY, v); } catch (e) {} }

    function showUpdatePopup() {
        if (!shadowRoot) return;
        const p = shadowRoot.getElementById('update-popup');
        const t = shadowRoot.getElementById('update-popup-title');
        const b = shadowRoot.getElementById('update-popup-body');
        if (p) {
            if (t) t.textContent = '奥术摸鱼大师 v' + SCRIPT_VERSION + ' 更新说明';
            if (b) b.textContent = UPDATE_NOTES || '本次更新了若干功能与修复。';
            p.style.display = 'flex';
        }
    }
    function closeUpdatePopup() {
        if (!shadowRoot) return;
        const p = shadowRoot.getElementById('update-popup');
        if (p) p.style.display = 'none';
    }
    // 新版本第一次载入时弹窗展示更新说明；关键：先标记已看再弹窗，弹窗有 bug 也不会重复弹
    function maybeShowUpdateLog() {
        if (getSeenVersion() === SCRIPT_VERSION) return;
        setSeenVersion(SCRIPT_VERSION);
        try { showUpdatePopup(); } catch (e) { /* 弹窗失败无害，已看标记已写入 */ }
    }

    // 全局防连点：两次发送至少间隔 3 秒
    function collectCooldownReady() {
        const now = Date.now();
        if (now - _lastCollectTs < 3000) return false;
        _lastCollectTs = now;
        return true;
    }

    function buildLogText(maxEntries) {
        return state.logBuffer.slice(-maxEntries).map(e => `[${e.time}] [${e.tag || ''}] ${e.msg}`).join('\n');
    }

    const USAGE_REPORT_KEY = 'arcane_last_usage_report';
    // 使用统计：初始化后静默上报（服务端按 uid 去重；客户端每天只上报一次，减少请求）
    function reportUsage(retry) {
        retry = retry || 0;
        if (!state.playerUid) {
            if (retry < 10) setTimeout(() => reportUsage(retry + 1), 3000); // 最多等 30 秒
            return;
        }
        try {
            const now = Date.now();
            const last = parseInt(localStorage.getItem(USAGE_REPORT_KEY) || '0', 10);
            if (now - last < 24 * 60 * 60 * 1000) return; // 每天只上报一次
            localStorage.setItem(USAGE_REPORT_KEY, String(now));
        } catch (e) {}
        postCollect('/usage', collectBase()).catch(() => {});
    }

    // 问卷是否已填：按问卷 ID 判断（旧版 1.6.0 只有时间戳，迁移到当前问卷 ID）
    function isSurveyFilled() {
        if (settings.surveySubmittedId === SURVEY_ID) return true;
        if (!settings.surveySubmittedId && settings.surveySubmittedAt > 0) {
            settings.surveySubmittedId = SURVEY_ID; saveSettings();
            return true;
        }
        return false;
    }

    // 问卷提交（服务端按 uid + surveyId 去重）
    async function submitSurvey(answers) {
        if (!state.playerUid) return { ok: false, err: '未获取到玩家身份，请刷新后重试' };
        if (!collectCooldownReady()) return { ok: false, err: '操作太频繁，稍后再试' };
        const res = await postCollect('/survey', { ...collectBase(), surveyId: SURVEY_ID, answers });
        if (res.ok || res.dup) { settings.surveySubmittedAt = Date.now(); settings.surveySubmittedId = SURVEY_ID; saveSettings(); }
        return res;
    }

    // 错误报告（服务端 + 客户端双重冷却）
    async function submitReport(desc) {
        if (!state.playerUid) return { ok: false, err: '未获取到玩家身份，请刷新后重试' };
        if (!collectCooldownReady()) return { ok: false, err: '操作太频繁，稍后再试' };
        if (Date.now() - settings.lastReportAt < REPORT_COOLDOWN_MS) return { ok: false, err: '报告冷却中，10 分钟后再试' };
        const res = await postCollect('/report', {
            ...collectBase(),
            desc,
            settings: JSON.stringify(settings),
            logs: [{ name: 'log.txt', content: buildLogText(2000) }],
        });
        if (res.ok) { settings.lastReportAt = Date.now(); saveSettings(); }
        return res;
    }

    // 意见建议（发到独立 /feedback 接口，带设置，不带日志）
    async function submitSuggestion(desc) {
        if (!state.playerUid) return { ok: false, err: '未获取到玩家身份，请刷新后重试' };
        if (!collectCooldownReady()) return { ok: false, err: '操作太频繁，稍后再试' };
        if (Date.now() - settings.lastSuggestionAt < REPORT_COOLDOWN_MS) return { ok: false, err: '10 分钟内已提交过建议' };
        const res = await postCollect('/feedback', {
            ...collectBase(),
            desc,
        });
        if (res.ok) { settings.lastSuggestionAt = Date.now(); saveSettings(); }
        return res;
    }

    // 反馈 tab 红点：未填问卷时显示
    function updateFeedbackBadge() {
        if (!shadowRoot) return;
        const b = shadowRoot.getElementById('feedback-badge');
        if (b) b.style.display = isSurveyFilled() ? 'none' : 'inline-block';
    }

    // 反馈 UI：问卷 + 错误报告
    function renderFeedbackUI() {
        if (!shadowRoot) return;
        const ctr = shadowRoot.getElementById('view-feedback'); if (!ctr) return;
        ctr.innerHTML = '';
        const btnStyle = 'width:100%;margin:6px 0;padding:7px 10px;border:1px solid var(--as-tide);border-radius:3px;background:var(--as-control);color:var(--as-tide-deep);cursor:pointer;font-size:12px;font-weight:650;';

        // ---- 问卷区 ----
        const surveySec = document.createElement('div');
        surveySec.className = 'section';
        surveySec.innerHTML = '<div class="section-heading"><strong>问卷调查</strong><span style="font-size:11px;color:var(--as-muted)">每人仅一次</span></div>';
        if (isSurveyFilled()) {
            const done = document.createElement('div');
            done.style.cssText = 'font-size:12px;color:var(--as-reed,#45a76f);line-height:1.7;padding:4px 0;';
            done.textContent = '已提交，感谢反馈！';
            surveySec.appendChild(done);
            ctr.appendChild(surveySec);
        } else {
            const inputs = {};
            const custom = {}; // multi 题的自定义输入值
            const restWrap = document.createElement('div'); // 选「需要/无所谓」后才展示的后续题
            restWrap.style.display = 'none';
            const addQuestion = (q, parent) => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'margin:8px 0;';
                const lbl = document.createElement('div');
                lbl.style.cssText = 'font-size:12px;font-weight:650;margin-bottom:4px;';
                lbl.textContent = q.label;
                wrap.appendChild(lbl);
                if (q.type === 'choice' || q.type === 'multi') {
                    const optWrap = document.createElement('div');
                    optWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
                    q.options.forEach(opt => {
                        const o = document.createElement('label');
                        o.style.cssText = 'display:inline-flex;align-items:center;gap:3px;font-size:12px;cursor:pointer;';
                        const inp = document.createElement('input');
                        inp.type = q.type === 'multi' ? 'checkbox' : 'radio';
                        inp.name = 'q-' + q.id;
                        inp.value = opt;
                        inp.addEventListener('change', () => {
                            if (q.type === 'multi') {
                                const arr = (inputs[q.id] = (inputs[q.id] || []).filter(v => v !== opt));
                                if (inp.checked) arr.push(opt);
                            } else {
                                inputs[q.id] = opt;
                                if (q.id === 'needPush') {
                                    restWrap.style.display = opt === '不需要' ? 'none' : '';
                                    if (opt === '不需要') for (const qq of SURVEY_QUESTIONS) if (qq.id !== 'needPush') { delete inputs[qq.id]; delete custom[qq.id]; }
                                }
                            }
                        });
                        o.appendChild(inp);
                        o.appendChild(document.createTextNode(opt));
                        optWrap.appendChild(o);
                    });
                    wrap.appendChild(optWrap);
                    if (q.type === 'multi') {
                        const otherWrap = document.createElement('div');
                        otherWrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:4px;';
                        const otherLabel = document.createElement('span');
                        otherLabel.textContent = '其他：';
                        otherLabel.style.cssText = 'font-size:12px;color:var(--as-muted);';
                        const otherInput = document.createElement('input');
                        otherInput.type = 'text';
                        otherInput.placeholder = '自定义内容（选填）';
                        otherInput.style.cssText = 'flex:1;min-width:0;height:22px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:0 4px;';
                        otherInput.addEventListener('input', () => { custom[q.id] = otherInput.value.trim(); });
                        otherWrap.appendChild(otherLabel);
                        otherWrap.appendChild(otherInput);
                        wrap.appendChild(otherWrap);
                    }
                } else {
                    const ta = document.createElement('textarea');
                    ta.rows = 2;
                    ta.placeholder = q.placeholder || '';
                    ta.style.cssText = 'width:100%;resize:vertical;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:4px 6px;';
                    ta.addEventListener('input', () => { inputs[q.id] = ta.value.trim(); });
                    wrap.appendChild(ta);
                }
                parent.appendChild(wrap);
            };
            for (const q of SURVEY_QUESTIONS) {
                addQuestion(q, q.id === 'needPush' ? surveySec : restWrap);
            }
            surveySec.appendChild(restWrap);
            const surveyStatus = document.createElement('div');
            surveyStatus.style.cssText = 'font-size:12px;line-height:1.6;margin-top:6px;min-height:16px;';
            const showSurveyStatus = (text, isError) => { surveyStatus.textContent = text; surveyStatus.style.color = isError ? 'var(--as-coral,#e66b58)' : 'var(--as-reed,#45a76f)'; };
            const submitBtn = document.createElement('button');
            submitBtn.type = 'button';
            submitBtn.textContent = '提交问卷';
            submitBtn.style.cssText = btnStyle;
            let armed = false, armTimer = null;
            const disarm = () => { armed = false; submitBtn.textContent = '提交问卷'; submitBtn.style.background = ''; submitBtn.style.color = ''; if (armTimer) { clearTimeout(armTimer); armTimer = null; } };
            submitBtn.addEventListener('click', async () => {
                const merged = { ...inputs };
                for (const q of SURVEY_QUESTIONS) {
                    if (q.type === 'multi' && custom[q.id]) merged[q.id] = (merged[q.id] || []).concat(custom[q.id]);
                }
                if (!armed) {
                    if (!merged.needPush) { showSurveyStatus('请先选择是否需要推送', true); return; }
                    if (merged.needPush !== '不需要') {
                        for (const q of SURVEY_QUESTIONS) {
                            if (q.id === 'needPush') continue;
                            if ((q.type === 'choice' || q.type === 'multi') && !(merged[q.id] && merged[q.id].length)) { showSurveyStatus('请先完成所有选项', true); return; }
                        }
                    }
                    armed = true;
                    submitBtn.textContent = '确认提交？';
                    submitBtn.style.background = 'var(--as-tide)';
                    submitBtn.style.color = '#fff';
                    armTimer = setTimeout(disarm, 5000);
                    return;
                }
                disarm();
                submitBtn.disabled = true;
                submitBtn.textContent = '提交中…';
                const res = await submitSurvey(merged);
                if (res.ok || res.dup) {
                    renderFeedbackUI();
                    OpLog.info('反馈', '问卷已提交，感谢反馈');
                } else {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '提交问卷';
                    showSurveyStatus('提交失败：' + (res.err || '未知错误'), true);
                    OpLog.warn('反馈', '问卷提交失败：' + (res.err || '未知错误'));
                }
            });
            surveySec.appendChild(submitBtn);
            surveySec.appendChild(surveyStatus);
            ctr.appendChild(surveySec);
        }

        // ---- bug反馈 + 意见建议（共用构建函数，视觉上分区清晰）----
        const addFeedbackModule = (title, subtitle, placeholder, onSubmit) => {
            const sec = document.createElement('div');
            sec.className = 'section';
            sec.innerHTML = `<div class="section-heading"><strong>${title}</strong><span style="font-size:11px;color:var(--as-muted)">${subtitle}</span></div>`;
            const ta = document.createElement('textarea');
            ta.rows = 4;
            ta.placeholder = placeholder;
            ta.style.cssText = 'width:100%;resize:vertical;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:12px;padding:4px 6px;margin-top:6px;';
            sec.appendChild(ta);
            const status = document.createElement('div');
            status.style.cssText = 'font-size:12px;line-height:1.6;margin-top:6px;min-height:16px;';
            const show = (t, err) => { status.textContent = t; status.style.color = err ? 'var(--as-coral,#e66b58)' : 'var(--as-reed,#45a76f)'; };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '发送';
            btn.style.cssText = btnStyle;
            let armed = false, timer = null;
            const disarm = () => { armed = false; btn.textContent = '发送'; btn.style.background = ''; btn.style.color = ''; if (timer) { clearTimeout(timer); timer = null; } };
            btn.addEventListener('click', async () => {
                const text = ta.value.trim();
                if (!text) { show('请先填写内容', true); return; }
                if (!armed) { armed = true; btn.textContent = '确认发送？'; btn.style.background = 'var(--as-tide)'; btn.style.color = '#fff'; timer = setTimeout(disarm, 5000); return; }
                disarm();
                btn.disabled = true; btn.textContent = '发送中…';
                const res = await onSubmit(text);
                if (res.ok) { ta.value = ''; show('已发送，感谢反馈', false); }
                else { show('发送失败：' + (res.err || '未知错误'), true); }
                btn.disabled = false; btn.textContent = '发送';
            });
            sec.appendChild(btn);
            sec.appendChild(status);
            return sec;
        };
        ctr.appendChild(addFeedbackModule('bug反馈', '自动附带日志和面板设置', '描述你遇到的问题（必填）…', submitReport));
        ctr.appendChild(addFeedbackModule('意见建议', '说说你的想法', '你的建议或需求（必填）…', submitSuggestion));
        updateFeedbackBadge();
    }

    // ---- 卖鱼/卖装备 UI ----
    function _sellSwitchRow(label, checked, onChange, hint) {
        const row = document.createElement('label');
        row.className = 'switch-item';
        const span = document.createElement('span');
        span.textContent = label;
        if (hint) span.appendChild(makeHint(hint));
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', () => onChange(cb.checked));
        row.appendChild(span);
        row.appendChild(cb);
        return row;
    }
    function _sellNumRow(label, min, max, value, onChange) {
        const row = document.createElement('label');
        row.className = 'switch-item';
        const span = document.createElement('span');
        span.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = min; input.max = max; input.value = value;
        input.style.cssText = 'width:60px;height:22px;margin-left:8px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;';
        input.addEventListener('change', () => { let v = parseInt(input.value, 10); if (isNaN(v)) v = min; v = Math.min(Math.max(v, min), max); input.value = v; onChange(v); });
        row.appendChild(span);
        row.appendChild(input);
        return row;
    }
    function _sellBtn(text, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.cssText = 'width:calc(100% - 24px);margin:6px 12px;padding:6px 10px;border:1px solid var(--as-tide);border-radius:3px;background:var(--as-control);color:var(--as-tide-deep);cursor:pointer;font-size:12px;font-weight:650;';
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            btn.textContent = '处理中…';
            let result;
            try { result = await onClick(); } catch (e) { result = '失败: ' + (e?.message || e); }
            const isError = /失败|出错|异常/.test(result || '');
            const isDone = /^✅/.test(result || '');
            btn.style.color = isError ? '#e66b58' : isDone ? '#45a76f' : 'var(--as-tide-deep)';
            btn.textContent = result || '完成';
            btn.disabled = false;
            setTimeout(() => { btn.textContent = text; btn.style.color = 'var(--as-tide-deep)'; }, 2500);
        });
        return btn;
    }
    function renderSellFishSection() {
        const ctr = shadowRoot.getElementById('sellfish-body'); if (!ctr) return;
        ctr.innerHTML = '';
        ctr.appendChild(_sellSwitchRow('启用自动卖鱼', settings.sellFishEnabled, (v) => { settings.sellFishEnabled = v; saveSettings(); v ? startSellFish() : stopSellFish(); }, HINTS.sellFish));
        for (const rarity of FISH_SELL_RARITIES) {
            const meta = RARITY_META[rarity] || { label: rarity, color: '#888' };
            const row = document.createElement('label');
            row.className = 'switch-item';
            const left = document.createElement('span');
            left.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
            const dot = document.createElement('span');
            dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${meta.color};`;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = settings.sellFishRarities.includes(rarity);
            cb.addEventListener('change', () => {
                if (cb.checked) { if (!settings.sellFishRarities.includes(rarity)) settings.sellFishRarities.push(rarity); }
                else settings.sellFishRarities = settings.sellFishRarities.filter(r => r !== rarity);
                saveSettings();
            });
            left.appendChild(dot);
            left.appendChild(document.createTextNode(meta.label));
            left.appendChild(cb);
            row.appendChild(left);
            ctr.appendChild(row);
        }
        ctr.appendChild(_sellNumRow('定时(分钟)', 3, 1440, settings.sellFishIntervalMin, (v) => { settings.sellFishIntervalMin = v; saveSettings(); if (settings.sellFishEnabled) startSellFish(); }));
        ctr.appendChild(_sellBtn('立即卖鱼', () => checkAndSellFish(true)));
    }
    function renderSellGearSection() {
        const ctr = shadowRoot.getElementById('sellgear-body'); if (!ctr) return;
        ctr.innerHTML = '';
        ctr.appendChild(_sellSwitchRow('启用自动卖装备', settings.sellGearEnabled, (v) => { settings.sellGearEnabled = v; saveSettings(); v ? startSellGear() : stopSellGear(); }, HINTS.sellGear));
        for (const rarity of GEAR_SELL_RARITIES) {
            const meta = RARITY_META[rarity] || { label: rarity, color: '#888' };
            const row = document.createElement('label');
            row.className = 'switch-item';
            const left = document.createElement('span');
            left.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
            const dot = document.createElement('span');
            dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${meta.color};`;
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = settings.sellGearRarities.includes(rarity);
            cb.addEventListener('change', () => {
                if (cb.checked) { if (!settings.sellGearRarities.includes(rarity)) settings.sellGearRarities.push(rarity); }
                else settings.sellGearRarities = settings.sellGearRarities.filter(r => r !== rarity);
                saveSettings();
            });
            left.appendChild(dot);
            left.appendChild(document.createTextNode(meta.label));
            left.appendChild(cb);
            const qInput = document.createElement('input');
            qInput.type = 'number';
            qInput.min = 0; qInput.max = 100;
            qInput.value = settings.sellGearQualities?.[rarity] ?? 60;
            qInput.title = '品质≤此值才卖（0~100）';
            qInput.style.cssText = 'width:48px;height:20px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;';
            qInput.addEventListener('change', () => { let v = parseInt(qInput.value, 10); if (isNaN(v)) v = 60; v = Math.min(Math.max(v, 0), 100); qInput.value = v; if (!settings.sellGearQualities) settings.sellGearQualities = {}; settings.sellGearQualities[rarity] = v; saveSettings(); });
            row.appendChild(left);
            row.appendChild(qInput);
            ctr.appendChild(row);
        }
        ctr.appendChild(_sellNumRow('定时(分钟)', 3, 1440, settings.sellGearIntervalMin, (v) => { settings.sellGearIntervalMin = v; saveSettings(); if (settings.sellGearEnabled) startSellGear(); }));
        ctr.appendChild(_sellBtn('立即卖装备', () => checkAndSellGear(true)));
    }
    function renderSellUI() {
        if (!shadowRoot) return;
        renderSellFishSection();
        renderSellGearSection();
    }

    function switchView(mode) {
        if (!shadowRoot) return;
        if (mode !== 'settings' && mode !== 'feedback' && mode !== 'log') mode = 'settings';
        settings.viewMode = mode; saveSettings();
        const titles = { settings:'奥术摸鱼大师', feedback:'反馈', log:'运行日志' };
        for (const [m, id] of Object.entries({ settings:'view-settings', feedback:'view-feedback', log:'view-log' })) {
            const el = shadowRoot.getElementById(id);
            if (el) el.style.display = m === mode ? '' : 'none';
        }
        const title = shadowRoot.getElementById('panel-title');
        if (title) title.textContent = titles[mode] || '奥术摸鱼大师';
        shadowRoot.querySelectorAll('.tab-bar .tab-btn').forEach(b => {
            b.dataset.active = String(b.dataset.view === mode);
        });
        if (mode === 'log') renderLogView();
        if (mode === 'feedback') { const fb = shadowRoot.getElementById('view-feedback'); if (fb && !fb.firstElementChild) renderFeedbackUI(); }
    }
    function renderLogView() {
        if (!shadowRoot) return;
        if (settings.viewMode !== 'log') return;  // 非日志视图不浪费渲染
        const container = shadowRoot.getElementById('log-entries');
        const hint = shadowRoot.getElementById('log-size-hint');
        if (!container) return;
        rebuildLogTagFilter();
        const bytes = state.logBufferBytes;
        const buf = state.logBuffer;
        const filter = state.logTagFilter;
        // 按标签筛选（仅影响显示；导出/反馈仍走全量 logBuffer）
        const filtered = filter ? buf.filter(e => e.tag === filter) : buf;
        // 只渲染尾部 500 条，保持 DOM 轻量
        const slice = filtered.length > 500 ? filtered.slice(-500) : filtered;
        container.innerHTML = slice.map(e => {
            // error/warn 优先用级别色（避免被 tag 色覆盖成绿/青色），tag 保留自身色
            const levelColor = e.level === 'error' ? '#dc2626' : e.level === 'warn' ? '#d97706' : null;
            const c = levelColor || e.color || 'var(--as-text)';
            const tagHtml = e.tag ? `<span class="log-tag" style="color:${e.color || 'var(--as-text)'};font-weight:700">[${e.tag}]</span> ` : '';
            return `<div class="log-line" data-level="${e.level}"><span class="log-time" style="color:${c}">${e.time}</span>${tagHtml}<span class="log-msg" style="color:${c}">${escHtml(e.msg)}</span></div>`;
        }).join('');
        if (!state.logPaused) requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
        if (hint) hint.textContent = (filter ? (filtered.length + '/' + buf.length) : buf.length) + '条 · ' + formatBytes(bytes);
    }
    // 重建标签筛选下拉（动态收集日志里实际出现过的标签，选中项失效时回退到「全部」）
    function rebuildLogTagFilter() {
        if (!shadowRoot) return;
        const sel = shadowRoot.getElementById('log-tag-filter');
        if (!sel) return;
        const tags = new Set();
        for (const e of state.logBuffer) if (e.tag) tags.add(e.tag);
        const sorted = [...tags].sort();
        if (state.logTagFilter && !tags.has(state.logTagFilter)) state.logTagFilter = '';
        sel.innerHTML = '<option value="">全部</option>' + sorted.map(t => `<option value="${escHtml(t)}"${t === state.logTagFilter ? ' selected' : ''}>${escHtml(t)}</option>`).join('');
    }
    function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function formatBytes(b) { return b < 1024 ? b + 'B' : b < 1048576 ? (b/1024).toFixed(1) + 'KB' : (b/1048576).toFixed(1) + 'MB'; }

    function updatePanelInfo(snapshot) {
        if (!shadowRoot) return;
        const hl = shadowRoot.getElementById('headline'), sb = shadowRoot.getElementById('snap-biome'),
              ss = shadowRoot.getElementById('snap-score');
        if (!snapshot) {
            if (hl) hl.textContent = '等待游戏登录';
            if (sb) sb.textContent = '--'; if (ss) ss.textContent = '--';
            return;
        }
        const cur = snapshot.biomes.find(b => b.isCurrent);
        if (hl) { const partyTag = snapshot.party?.isInParty ? ' 🚢' : ''; hl.textContent = cur ? `${cur.name}${partyTag}` : '--'; }
        if (sb) sb.textContent = cur?.name || '--';
        if (ss) { const best = [...snapshot.biomes].sort((a,b)=>calculateTotalExpBonus(b)-calculateTotalExpBonus(a))[0]; ss.textContent = best ? formatBasisPoints(calculateTotalExpBonus(best)) : '--'; }
    }

    function renderPriorities() {
        if (!shadowRoot) return;
        const list = shadowRoot.getElementById('priority-list'); if (!list) return;
        list.innerHTML = '';
        const partyMode = settings.autoPartyTravel;
        const order = partyMode ? (settings.partyMapPriority || DEFAULTS.partyMapPriority) : (settings.mapPriority || DEFAULTS.mapPriority);
        const autoG = shadowRoot.getElementById('sw-autoGuild'), autoP = shadowRoot.getElementById('sw-autoPersonal');
        const compOk = (autoG?.checked??settings.autoGuild) || (autoP?.checked??settings.autoPersonal);
        const disp = order.filter(k => k!=='competition'||compOk);
        if (!compOk && order.includes('competition')) disp.push('competition');
        disp.forEach((key, i) => {
            const def = PRIORITY_TYPES.find(t => t.key===key); if (!def) return;
            const disabled = key === 'competition' && !compOk;
            const item = document.createElement('li'); item.className = 'priority-item'; item.dataset.key = key;
            if (disabled) item.style.opacity = '0.4';
            if (key === 'designated') {
                const sel = document.createElement('select');
                sel.className = 'priority-name';
                sel.style.cssText = 'border:none;background:transparent;color:var(--as-text);font:inherit;font-size:13px;font-weight:650;padding:0 8px;cursor:pointer;';
                const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '指定图：无';
                const curDesignated = partyMode ? settings.partyDesignatedBiomeId : settings.designatedBiomeId;
                optNone.selected = !curDesignated; sel.appendChild(optNone);
                const game = state.appGame || window.arcaneReelax;
                if (game) { const snap = game.getSnapshot(); (snap?.biomes||[]).filter(b=>b.isUnlocked).forEach(b=>{ const o = document.createElement('option'); o.value=b.id; o.textContent=`指定图：${b.name}`; if(b.id===curDesignated)o.selected=true; sel.appendChild(o); }); }
                sel.addEventListener('change', () => { if(partyMode)settings.partyDesignatedBiomeId=sel.value; else settings.designatedBiomeId=sel.value; saveSettings(); if (state.appGame) makeDecision(state.appGame); });
                item.innerHTML = `<span class="priority-index">${i+1}</span>`;
                item.appendChild(sel);
            } else {
                item.innerHTML = `<span class="priority-index">${i+1}</span><span class="priority-name">${def.label}</span>`;
                if (key === 'competition' && !disabled) {
                    const sub = document.createElement('span'); sub.style.cssText = 'display:block;font-size:11px;color:var(--as-muted);margin-top:2px;white-space:nowrap';
                    // 枯潮跳过
                    const cb1 = document.createElement('input'); cb1.type = 'checkbox'; cb1.checked = !!settings.skipWitherTidePersonal;
                    cb1.style.cssText = 'width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)';
                    const uncheckOthers = (except) => { if (except !== 1) { settings.skipWitherTidePersonal = false; cb1.checked = false; } if (except !== 2) { settings.witherTideDipPersonal = false; cb2.checked = false; } if (except !== 3) { settings.dipPersonal = false; cb3.checked = false; } if (except !== 4) { settings.partyDipPersonal = false; cb4.checked = false; } };
                    cb1.addEventListener('change', () => { settings.skipWitherTidePersonal = cb1.checked; if (cb1.checked) uncheckOthers(1); saveSettings(); if (state.appGame) makeDecision(state.appGame); });
                    const h1 = makeHint('个人赛地图是枯潮时，强制跳过本次比赛，按优先级去其他地图。\n天气恢复后自动返回。船队模式下不改变航线，仅个人离船。');
                    sub.appendChild(cb1); sub.appendChild(document.createTextNode('枯潮跳过')); sub.appendChild(h1);
                    sub.appendChild(document.createElement('br'));
                    // 枯潮蹭奖
                    const cb2 = document.createElement('input'); cb2.type = 'checkbox'; cb2.checked = !!settings.witherTideDipPersonal;
                    cb2.style.cssText = 'width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)';
                    cb2.addEventListener('change', () => { settings.witherTideDipPersonal = cb2.checked; if (cb2.checked) uncheckOthers(2); saveSettings(); if (state.appGame) makeDecision(state.appGame); });
                    const h2 = makeHint('个人赛枯潮时，先进场比赛，获得参与积分后跳过按优先级去其他图。\n本次比赛结束前不再返回。船队模式下仅个人离船。');
                    sub.appendChild(cb2); sub.appendChild(document.createTextNode('枯潮蹭奖')); sub.appendChild(h2);
                    sub.appendChild(document.createElement('br'));
                    // 个人赛蹭奖
                    const cb3 = document.createElement('input'); cb3.type = 'checkbox'; cb3.checked = !!settings.dipPersonal;
                    cb3.style.cssText = 'width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)';
                    cb3.addEventListener('change', () => { settings.dipPersonal = cb3.checked; if (cb3.checked) uncheckOthers(3); saveSettings(); if (state.appGame) makeDecision(state.appGame); });
                    const h3 = makeHint('个人赛进场比赛，获得参与积分后跳过按优先级去其他图。\n本次比赛结束前不再返回。船队模式下仅个人离船。');
                    sub.appendChild(cb3); sub.appendChild(document.createTextNode('个人赛蹭奖')); sub.appendChild(h3);
                    sub.appendChild(document.createElement('br'));
                    // 船队个人赛蹭奖
                    const cb4 = document.createElement('input'); cb4.type = 'checkbox'; cb4.checked = !!settings.partyDipPersonal;
                    cb4.style.cssText = 'width:13px;height:13px;margin:0 2px 0 0;vertical-align:middle;cursor:pointer;accent-color:var(--as-tide-deep)';
                    cb4.addEventListener('change', () => { settings.partyDipPersonal = cb4.checked; if (cb4.checked) uncheckOthers(4); else { state._partyBlockedSeq = ''; state._partyDipSeq = ''; state._partyDipStartAt = 0; } saveSettings(); if (state.appGame) makeDecision(state.appGame); });
                    const h4 = makeHint('⚠️ 测试功能，配合调试日志食用，期间最好盯着看功能有无异常，发现问题联系作者反馈。\n\n功能：整船在个人赛地图待指定分钟数蹭参与奖，到点屏蔽本场个人赛，按地图优先级顺位航行。\n若比赛图恰是最高金风，屏蔽后金风优先级又选中它，则继续待着。\n开启个人赛自动洗点时，屏蔽后自动恢复赛后方案。');
                    h4.style.background = '#ef4444';
                    sub.appendChild(cb4); sub.appendChild(document.createTextNode('船队蹭奖')); sub.appendChild(h4);
                    // 时长加减控件
                    const dur = document.createElement('span'); dur.style.cssText = 'display:inline-flex;align-items:center;margin-left:6px;vertical-align:middle';
                    const btnMinus = document.createElement('button'); btnMinus.type = 'button'; btnMinus.textContent = '−';
                    btnMinus.style.cssText = 'width:18px;height:18px;line-height:1;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;font-size:12px;padding:0';
                    const durInput = document.createElement('input'); durInput.type = 'number'; durInput.min = '1'; durInput.max = '20'; durInput.value = settings.partyDipMinutes;
                    durInput.style.cssText = 'width:36px;height:18px;margin:0 2px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;text-align:center;padding:0';
                    const btnPlus = document.createElement('button'); btnPlus.type = 'button'; btnPlus.textContent = '+';
                    btnPlus.style.cssText = 'width:18px;height:18px;line-height:1;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer;font-size:12px;padding:0';
                    const setDur = (v) => { v = Math.max(1, Math.min(20, v|0)); settings.partyDipMinutes = v; durInput.value = v; saveSettings(); };
                    btnMinus.addEventListener('click', () => setDur(settings.partyDipMinutes - 1));
                    btnPlus.addEventListener('click', () => setDur(settings.partyDipMinutes + 1));
                    durInput.addEventListener('change', () => setDur(parseInt(durInput.value) || 10));
                    dur.appendChild(btnMinus); dur.appendChild(durInput); dur.appendChild(btnPlus);
                    dur.appendChild(document.createTextNode(' 分'));
                    sub.appendChild(dur);
                    item.querySelector('.priority-name').appendChild(sub);
                }
            }
            const handle = document.createElement('button'); handle.className = 'drag-handle'; handle.type = 'button'; handle.textContent = '⠿';
            if (disabled) handle.disabled = true;
            item.appendChild(handle); list.appendChild(item);
        });
        setupDrag();
    }

    function syncPrioritiesFromDom() {
        if (!shadowRoot) return;
        const list = shadowRoot.getElementById('priority-list'); if (!list) return;
        const keys = [...list.querySelectorAll('.priority-item')].map(it => it.dataset.key).filter(k => PRIORITY_TYPES.some(t=>t.key===k));
        if (keys.length !== PRIORITY_TYPES.length) return;
        const target = settings.autoPartyTravel ? 'partyMapPriority' : 'mapPriority';
        const prev = settings[target] || DEFAULTS[target];
        const autoG = shadowRoot.getElementById('sw-autoGuild'), autoP = shadowRoot.getElementById('sw-autoPersonal');
        const compOk = (autoG?.checked ?? settings.autoGuild) || (autoP?.checked ?? settings.autoPersonal);
        let next = keys;
        // 比赛开关关闭时 competition 被视觉上排到末尾（disabled），拖拽回写时恢复到它在 settings 中的原位置，避免被永久挪位
        if (!compOk && prev.includes('competition') && prev.indexOf('competition') !== keys.indexOf('competition')) {
            const rest = keys.filter(k => k !== 'competition');
            rest.splice(prev.indexOf('competition'), 0, 'competition');
            next = rest;
        }
        settings[target] = next;
        saveSettings(); renderPriorities(); if (state.appGame) makeDecision(state.appGame);
    }

    let draggedItem = null, draggedHandle = null;
    let _dragRootBound = false;
    function setupDrag() {
        if (!shadowRoot) return;
        const root = shadowRoot;
        root.querySelectorAll('.drag-handle').forEach(handle => {
            handle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                const item = handle.closest('.priority-item'); if (!item) return;
                draggedItem = item; draggedHandle = handle;
                item.dataset.dragging = 'true';
                handle.setPointerCapture(event.pointerId); event.preventDefault();
            });
        });
        // root 级监听只绑一次，避免每次 renderPriorities 都累加（监听器泄漏）
        if (_dragRootBound) return;
        _dragRootBound = true;
        root.addEventListener('pointermove', (event) => {
            if (!draggedItem || !draggedHandle) return;
            const target = [...root.elementsFromPoint(event.clientX, event.clientY)].map(el => el.closest('.priority-item')).find(el => el && el !== draggedItem);
            if (!target?.parentElement) return;
            const tr = target.getBoundingClientRect();
            target.parentElement.insertBefore(draggedItem, event.clientY < tr.top + tr.height/2 ? target : target.nextSibling);
        });
        const finishDrag = (event) => {
            if (!draggedItem || !draggedHandle) return;
            draggedItem.dataset.dragging = 'false';
            if (draggedHandle.hasPointerCapture(event.pointerId)) draggedHandle.releasePointerCapture(event.pointerId);
            draggedItem = null; draggedHandle = null;
            syncPrioritiesFromDom();
        };
        root.addEventListener('pointerup', finishDrag);
        root.addEventListener('pointercancel', finishDrag);
    }

    function renderBuffTab(weatherId) {
        const isComp = weatherId === 'competition';
        const name = isComp ? '比赛' : (WEATHER_ID_TO_NAME[weatherId] || weatherId);
        const sel = settings.buffSelections[weatherId] || {};
        const hasAny = Object.values(sel).some(v => v);
        const btn = document.createElement('button'); btn.type = 'button';
        btn.style.cssText = `font-size:11px;padding:3px 7px;border:1px solid var(--as-border);border-radius:3px;background:${weatherId===state._buffTab?'var(--as-tide)':'var(--as-control)'};color:${weatherId===state._buffTab?'#fff':'var(--as-text)'};cursor:pointer;`;
        btn.textContent = name + (hasAny ? ' ●' : '');
        btn.addEventListener('click', () => { updateState({ _buffTab: weatherId }); renderBuffUI(); });
        return btn;
    }
    function renderBuffUI() {
        const tabCtr = shadowRoot.getElementById('buff-tabs');
        const buffCtr = shadowRoot.getElementById('buff-ctr');
        if (!tabCtr || !buffCtr) return;
        if (state._buffTab === undefined) updateState({ _buffTab: Object.keys(WEATHER_ID_TO_NAME)[0] });
        const curTab = state._buffTab;
        // tabs
        tabCtr.innerHTML = '';
        for (const wid of Object.keys(WEATHER_ID_TO_NAME)) tabCtr.appendChild(renderBuffTab(wid));
        tabCtr.appendChild(renderBuffTab('competition'));
        // buff content
        buffCtr.innerHTML = '';
        const sel = settings.buffSelections[curTab] || {};
        for (const [gid, grp] of Object.entries(BUFF_GROUPS)) {
            const gd = document.createElement('div'); gd.className = 'buff-group';
            gd.innerHTML = `<div class="buff-group-title">${grp.label}</div>`;
            const opt = document.createElement('div'); opt.className = 'buff-options';
            for (const pid of grp.options) {
                const cfg = BUFF_CONFIG[pid]; if (!cfg) continue;
                const l = document.createElement('label');
                const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=!!sel[pid]; cb.dataset.productId=pid;
                cb.addEventListener('change', function() {
                    if(!settings.buffSelections[curTab]) settings.buffSelections[curTab] = {};
                    if(this.checked) opt.querySelectorAll('input[data-product-id]').forEach(o=>{
                        if(BUFF_CONFIG[o.dataset.productId]?.group===gid && o!==this && o.checked){ o.checked=false; settings.buffSelections[curTab][o.dataset.productId] = false; }
                    });
                    settings.buffSelections[curTab][pid] = this.checked;
                    saveSettings();
                });
                const unit = cfg.currency === 'fragments' ? '碎片' : '遗物';
                l.appendChild(cb); l.appendChild(document.createTextNode(`${cfg.name} (${cfg.price}${unit})`)); opt.appendChild(l);
            }
            gd.appendChild(opt); buffCtr.appendChild(gd);
        }
    }

    const HINTS = {
        respec: '比赛开始自动洗成全幸运（消耗10,000金币），结束后按赛后加点方案分配。属性已生效，页面显示需刷新才能看到最新数值',
        loadout: '1号放平时装备，2-4号放比赛用幸运装，下拉栏选择比赛用幸运装。比赛开始时切换到下拉栏指定装备，比赛结束后自动切回1号装备',
        baitAutoBuy: '鱼饵库存为0时，主动购买100个再装备。不是游戏自带的自动补充',
        baitFallback: '买不起或购买失败时，自动降级到低一级饵料，直到基础饵',
        sellFish: '定时把符合规则的鱼自动卖给 NPC：勾选的稀有度会被卖出，未勾选的保留；锁定鱼、专精鱼永远不卖。\n可设定时间隔，或点「立即卖鱼」手动卖一次，按钮会显示卖出结果',
        sellGear: '定时把符合规则的装备自动卖给 NPC：每档稀有度可单独设品质阈值（品质 ≤ 此值才卖）。\n锁定、穿戴中、市场上架中的装备不会被卖（服务端保护）。点「立即卖装备」可手动卖一次',
    };
    const SECTION_HINTS = {
        priority: '按优先级自动前往地图：比赛 → 指定图 → 金风 → 经验 → 金币。可拖动调整顺序，支持船队模式',
        buff: '在比赛或指定天气下自动购买经验/力量/运气/碎片 Buff，每个天气可独立配置',
        bait: '按场景（个人赛/公会赛/金风/奥秘涌流/其他天气）自动切换对应鱼饵',
        stats: '升级自动加点；比赛自动洗成全幸运、赛后按方案分配；比赛切换配装',
        sellfish: '定时把符合稀有度规则的鱼自动卖给 NPC，锁定鱼和专精鱼不卖',
        sellgear: '定时把符合稀有度+品质规则的装备自动卖给 NPC，锁定/穿戴中/市场中的装备不卖',
    };
    let tooltipEl = null;
    function showTooltip(e, text) {
        hideTooltip();
        tooltipEl = document.createElement('div'); tooltipEl.textContent = text;
        tooltipEl.style.cssText = 'position:fixed;z-index:2147483700;max-width:min(240px,calc(100vw - 24px));padding:5px 8px;background:rgba(0,0,0,0.85);color:#fff;border-radius:6px;font-size:11px;line-height:1.5;pointer-events:none;white-space:pre-line;box-sizing:border-box;';
        document.body.appendChild(tooltipEl);
        const r = tooltipEl.getBoundingClientRect();
        let x = e.clientX + 10, y = e.clientY - r.height - 4;
        if (y < 4) y = e.clientY + 14;
        // 左右上下都夹在视口内，避免手机端溢出显示不全
        x = Math.min(Math.max(x, 8), window.innerWidth - r.width - 8);
        y = Math.min(Math.max(y, 4), window.innerHeight - r.height - 4);
        tooltipEl.style.left = x + 'px'; tooltipEl.style.top = y + 'px';
    }
    function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }
    document.addEventListener('click', hideTooltip);
    // 通用问号工厂：传入描述文本，返回带好悬浮/点击事件的 ? 元素
    function makeHint(desc) {
        const h = document.createElement('span'); h.className = 'bait-hint'; h.textContent = '?';
        h.style.cssText = 'cursor:help;margin-left:2px;color:#fff;font-size:8px;font-weight:700';
        h.addEventListener('mouseenter', e => showTooltip(e, desc));
        h.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); hideTooltip(); showTooltip(e, desc); });
        h.addEventListener('mouseleave', hideTooltip);
        return h;
    }

    function attachUI() {
        const host = document.createElement('div'); host.id = 'script-panel-host';
        shadowRoot = host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = PANEL_HTML;
        document.documentElement.appendChild(host);

        const dock = shadowRoot.querySelector('.dock');
        const collapse = shadowRoot.getElementById('collapse');
        const applyDockPos = (r, t) => { dock.style.right = r + 'px'; dock.style.top = t + 'px'; };
        const clampBallPos = () => { const s = 52; settings.ballRight = Math.min(Math.max(0, settings.ballRight), window.innerWidth - s); settings.ballTop = Math.min(Math.max(0, settings.ballTop), window.innerHeight - s); };
        // 面板位置 clamp：保证标题栏始终在屏幕内，能拖动、能看到
        const clampPanelPos = () => { const h = 52; settings.dockRight = Math.min(Math.max(0, settings.dockRight), window.innerWidth - h); settings.dockTop = Math.min(Math.max(0, settings.dockTop), window.innerHeight - h - 8); };
        const updateCollapseUI = () => {
            if (!dock || !collapse) return;
            dock.dataset.collapsed = String(settings.isPanelCollapsed);
            collapse.setAttribute('aria-expanded', String(!settings.isPanelCollapsed));
            collapse.title = settings.isPanelCollapsed ? '点击展开辅助脚本设置' : '拖动标题栏可移动面板';
            const glyph = collapse.querySelector('.collapse-glyph');
            if (glyph) glyph.textContent = settings.isPanelCollapsed ? '+' : '−';
            const cl = shadowRoot.getElementById('collapse-label');
            if (cl) cl.textContent = settings.isPanelCollapsed ? '展开' : '收起';
        };
        // 折叠/展开：面板和悬浮球各自保存位置，切换时互不干扰
        if (dock && collapse) {
            collapse.addEventListener('click', () => {
                const r = dock.getBoundingClientRect();
                if (settings.isPanelCollapsed) {
                    // 球 → 面板：保存球位置，恢复到面板位置（clamp 保证面板在屏幕内）
                    settings.ballRight = window.innerWidth - r.right; settings.ballTop = r.top;
                    if (settings.dockRight >= 0) { clampPanelPos(); applyDockPos(settings.dockRight, settings.dockTop); }
                } else {
                    // 面板 → 球：保存面板位置，恢复到球位置
                    settings.dockRight = window.innerWidth - r.right; settings.dockTop = r.top;
                    if (settings.ballRight >= 0) { clampBallPos(); applyDockPos(settings.ballRight, settings.ballTop); }
                }
                settings.isPanelCollapsed = !settings.isPanelCollapsed;
                updateCollapseUI();
                saveSettings();
            });
        }

        // 开关——即时保存生效
        renderSwitches();
        renderStatsSection();
        renderSellUI();
        shadowRoot.querySelectorAll('.switch-item input').forEach(cb => {
            const key = cb.id.replace('sw-', '');
            cb.addEventListener('change', () => {
                if (DEFAULTS.hasOwnProperty(key)) { settings[key] = cb.checked; saveSettings(); applySettings(); }
                if (cb.id === 'sw-autoGuild' || cb.id === 'sw-autoPersonal') renderPriorities();
            });
        });
        // Buff 开关也即时生效
        const swBuff = shadowRoot.getElementById('sw-autoBuyBuffs');
        if (swBuff) swBuff.addEventListener('change', () => { settings.autoBuyBuffs = swBuff.checked; saveSettings(); applySettings(); });

        // 优先级
        renderPriorities();
        // 自动切图开关（已移入优先级区块，泛型 change 绑定负责变更，这里补初始勾选态）
        const swAutoSwitchMap = shadowRoot.getElementById('sw-autoSwitchMap');
        if (swAutoSwitchMap) swAutoSwitchMap.checked = !!settings.autoSwitchMap;
        // 船队模式开关
        const swParty = shadowRoot.getElementById('sw-autoPartyTravel');
        if (swParty) { swParty.checked = !!settings.autoPartyTravel; swParty.addEventListener('change', () => { settings.autoPartyTravel = swParty.checked; saveSettings(); renderPriorities(); if(state.appGame)makeDecision(state.appGame); }); }
        // 排除专精加成开关
        const swExMastery = shadowRoot.getElementById('sw-excludeMasteryBonus');
        if (swExMastery) { swExMastery.checked = !!settings.excludeMasteryBonus; swExMastery.addEventListener('change', () => { settings.excludeMasteryBonus = swExMastery.checked; saveSettings(); if(state.appGame)makeDecision(state.appGame); }); }
        const swExGuild = shadowRoot.getElementById('sw-excludeGuildBoost');
        if (swExGuild) { swExGuild.checked = !!settings.excludeGuildBoost; swExGuild.addEventListener('change', () => { settings.excludeGuildBoost = swExGuild.checked; saveSettings(); if(state.appGame)makeDecision(state.appGame); }); }

        // 指定图
        // 鱼饵——初始状态
        const swAutoBait = shadowRoot.getElementById('sw-autoBait');
        if (swAutoBait) { swAutoBait.checked = !!settings.autoBait; swAutoBait.addEventListener('change', () => { settings.autoBait = swAutoBait.checked; saveSettings(); }); }
        const swBaitFallback = shadowRoot.getElementById('sw-baitFallback');
        if (swBaitFallback) { swBaitFallback.checked = !!settings.baitFallback; swBaitFallback.addEventListener('change', () => { settings.baitFallback = swBaitFallback.checked; saveSettings(); }); }
        const swBaitAutoBuy = shadowRoot.getElementById('sw-baitAutoBuy');
        if (swBaitAutoBuy) { swBaitAutoBuy.checked = !!settings.baitAutoBuy; swBaitAutoBuy.addEventListener('change', () => { settings.baitAutoBuy = swBaitAutoBuy.checked; saveSettings(); }); }
        // 问号提示
        const hintAutoBuy = shadowRoot.getElementById('hint-baitAutoBuy');
        if (hintAutoBuy) { const h = makeHint(HINTS.baitAutoBuy); h.id = 'hint-baitAutoBuy'; hintAutoBuy.replaceWith(h); }
        const hintFallback = shadowRoot.getElementById('hint-baitFallback');
        if (hintFallback) { const h = makeHint(HINTS.baitFallback); h.id = 'hint-baitFallback'; hintFallback.replaceWith(h); }
        renderBaitControls(null);

        // Buff——同步初始状态
        const swAutoBuy = shadowRoot.getElementById('sw-autoBuyBuffs');
        if (swAutoBuy) swAutoBuy.checked = !!settings.autoBuyBuffs;
        renderBuffUI();

        // 手风琴——初始化折叠状态并绑定点击
        shadowRoot.querySelectorAll('.section[data-section]').forEach(sec => {
            const key = sec.dataset.section;
            if (settings.sectionCollapsed[key] !== undefined) {
                sec.dataset.collapsed = String(settings.sectionCollapsed[key]);
            }
            const heading = sec.querySelector('.section-heading[data-accordion]');
            if (heading) {
                heading.addEventListener('click', () => {
                    settings.sectionCollapsed[key] = sec.dataset.collapsed !== 'true';
                    sec.dataset.collapsed = String(settings.sectionCollapsed[key]);
                    saveSettings();
                });
            }
        });

        // 手风琴标题统一加「?」提示（描述用问号展示，标题不带副标题）
        for (const [key, desc] of Object.entries(SECTION_HINTS)) {
            const heading = shadowRoot.querySelector(`.section[data-section="${key}"] .section-heading[data-accordion]`);
            if (heading) heading.appendChild(makeHint(desc));
        }

        // 仅新版本或首次使用才自动展开设置页；之后尊重保存的折叠状态（默认悬浮球）
        if (getSeenVersion() !== SCRIPT_VERSION) { settings.isPanelCollapsed = false; saveSettings(); }
        updateCollapseUI();  // 同步 data-collapsed 与 isPanelCollapsed（否则折叠状态/位置不生效）

        // 恢复保存的位置
        // 恢复上次位置：面板和球各自独立
        if (settings.isPanelCollapsed && settings.ballRight >= 0 && dock) applyDockPos(settings.ballRight, settings.ballTop);
        else if (!settings.isPanelCollapsed && settings.dockRight >= 0 && dock) { clampPanelPos(); applyDockPos(settings.dockRight, settings.dockTop); }
        else if (dock) { settings.dockRight = 16; settings.dockTop = 16; settings.ballRight = 16; settings.ballTop = window.innerHeight - 64; applyDockPos(16, 16); }

        // Tab 栏切换
        shadowRoot.querySelectorAll('.tab-bar .tab-btn').forEach(b => {
            b.addEventListener('click', () => switchView(b.dataset.view));
        });
        renderFeedbackUI();
        switchView(settings.viewMode || 'settings');

        // 更新弹窗关闭按钮
        const btnCloseUpdate = shadowRoot.getElementById('update-popup-close');
        if (btnCloseUpdate) btnCloseUpdate.addEventListener('click', closeUpdatePopup);

        // 暂停/恢复所有自动化
        const btnPause = shadowRoot.getElementById('btn-pause');
        if (btnPause) {
            const pIcon = btnPause.querySelector('span');
            const pLabel = pIcon ? pIcon.nextElementSibling : null;
            const setPauseUI = (paused) => {
                if (pIcon) pIcon.textContent = paused ? '▶' : '⏯';
                if (pLabel) pLabel.textContent = paused ? '恢复' : '暂停';
                btnPause.title = paused ? '恢复所有自动化功能' : '暂停所有自动化功能';
            };
            if (state.paused) setPauseUI(true);
            btnPause.addEventListener('click', () => {
                const willPause = !state.paused;
                OpLog.info('主程序', willPause ? '⏸ 已暂停所有自动化' : '▶ 已恢复所有自动化');
                state.paused = willPause;
                setPauseUI(state.paused);
                if (!state.paused) applySettings();
            });
        }

        // 导出日志
        const btnExport = shadowRoot.getElementById('btn-export-log');
        if (btnExport) btnExport.addEventListener('click', () => {
            const EXPORT_MAX = 100 * 1024 * 1024;
            let text = ''; let bytes = 0;
            for (let i = state.logBuffer.length - 1; i >= 0; i--) {
                const e = state.logBuffer[i];
                const line = `[${e.time}] [${e.tag}] ${e.msg}\n`;
                if (bytes + strBytes(line) > EXPORT_MAX) break;
                text = line + text; bytes += strBytes(line);
            }
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const d = new Date();
            a.download = `奥术摸鱼大师辅助脚本日志_v${SCRIPT_VERSION}_${d.toISOString().slice(0,10)}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
        });

        // 清空日志
        const btnClear = shadowRoot.getElementById('btn-clear-log');
        if (btnClear) btnClear.addEventListener('click', () => {
            state.logBuffer = []; state.logBufferBytes = 0; renderLogView();
        });

        // 暂停/恢复自动滚动
        const btnPauseScroll = shadowRoot.getElementById('btn-pause-log');
        if (btnPauseScroll) btnPauseScroll.addEventListener('click', () => {
            state.logPaused = !state.logPaused;
            btnPauseScroll.textContent = state.logPaused ? '▶ 滚动' : '⏸ 暂停';
            btnPauseScroll.title = state.logPaused ? '恢复自动滚动到底部' : '暂停自动滚动到底部';
            if (!state.logPaused) {
                const container = shadowRoot.getElementById('log-entries');
                if (container) container.scrollTop = container.scrollHeight;
            }
        });

        // 标签筛选（仅影响日志面板显示，导出/反馈仍全量）
        const selTagFilter = shadowRoot.getElementById('log-tag-filter');
        if (selTagFilter) selTagFilter.addEventListener('change', () => { state.logTagFilter = selTagFilter.value; renderLogView(); });

        // 拖动面板（setPointerCapture，Shadow DOM 内可靠）
        const header = shadowRoot.querySelector('.panel-header');
        if (header && dock) {
            let dragDSX, dragDSY, dragDSR, dragDST, dragMoved, dragPtrId, dragStartOnCollapse;
            header.addEventListener('pointerdown', (e) => {
                if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest('button')) return;
                dragMoved = false; dragPtrId = e.pointerId;
                dragStartOnCollapse = !!e.composedPath()[0]?.closest('#collapse');
                dragDSX = e.clientX; dragDSY = e.clientY;
                const r = dock.getBoundingClientRect();
                dragDSR = window.innerWidth - r.right; dragDST = r.top;
                dock.style.transition = 'none';
                header.setPointerCapture(e.pointerId);  // 立即捕获，快速拖动不丢 pointermove
            });
            header.addEventListener('pointermove', (e) => {
                if (dragPtrId !== e.pointerId) return;
                const dx = e.clientX - dragDSX, dy = e.clientY - dragDSY;
                if (!dragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                dragMoved = true;
                dock.style.right = Math.min(Math.max(0, dragDSR - dx), window.innerWidth - 52) + 'px';
                // 拖动时区分球/面板：球 clamp 到 52px，面板 clamp 到标题栏可见
                const maxTop = settings.isPanelCollapsed ? window.innerHeight - 52 : window.innerHeight - 60;
                dock.style.top = Math.min(maxTop, Math.max(0, dragDST + dy)) + 'px';
            });
            header.addEventListener('pointerup', (e) => {
                if (dragPtrId !== e.pointerId) return;
                if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
                dragPtrId = null; dock.style.transition = '';
                if (dragMoved) {
                    const r = dock.getBoundingClientRect();
                    const rr = window.innerWidth - r.right, tt = r.top;
                    if (settings.isPanelCollapsed) { settings.ballRight = rr; settings.ballTop = tt; }
                    else { settings.dockRight = rr; settings.dockTop = tt; }
                    saveSettings();
                } else if (dragStartOnCollapse) {
                    // 点击收起/展开按钮（未拖动）→ pointer capture 吞掉了原生 click，手动触发一次
                    collapse.click();
                }
            });
            header.addEventListener('pointercancel', (e) => {
                if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
                dragPtrId = null; dock.style.transition = '';
            });
        }

        // 面板展开时，点击外部自动折叠
        document.addEventListener('click', (e) => {
            if (!dock || dock.dataset.collapsed === 'true' || !host) return;
            if (!e.composedPath().includes(host)) {
                const r2 = dock.getBoundingClientRect();
                settings.dockRight = window.innerWidth - r2.right; settings.dockTop = r2.top;
                if (settings.ballRight >= 0) { clampBallPos(); applyDockPos(settings.ballRight, settings.ballTop); }
                settings.isPanelCollapsed = true;
                updateCollapseUI();
                saveSettings();
            }
        });
    }

    function getBaitScene(snapshot) {
        if (!snapshot) return null;
        const cur = snapshot.biomes?.find(b => b.isCurrent);
        if (!cur) return null;
        // 比赛优先：用脚本自己的比赛缓存判断（快照 activeCompetitions 加载滞后时，会先按天气切饵再切回比赛饵，产生抖动）
        if (shouldActForComp('personal')) return 'personalCompetition';
        if (shouldActForComp('guild')) return 'guildCompetition';
        if (cur.weather?.id === 'gilded_current') return 'golden';
        if (cur.weather?.id === 'arcane_surge') return 'arcaneSurge';
        return 'normal';
    }

    async function refreshBaitData() {
        try { const r = await apiFetch('/api/baits'); if (r.baits) updateState({ baitCache: r.baits }); }
        catch(e) { L.bait(`获取饵料数据失败: ${e.message}`); }
    }

    // ============================================================
    // 卖鱼 / 卖装备（给 NPC）
    // ============================================================

    // ---- 卖鱼 ----
    async function fetchFishInventory() {
        const r = await apiFetch('/api/inventory/fish', { method: 'GET' });
        return (r && Array.isArray(r.fish)) ? r.fish : [];
    }

    function fishShouldSell(f) {
        // 专精鱼 / 锁定鱼 硬编码保护，不可改
        if (f?.isLocked || f?.isMasteryLocked) return false;
        const rarity = String(f?.rarity || '').toLowerCase();
        return settings.sellFishRarities.includes(rarity);
    }

    function buildFishSellItems(fishList) {
        const map = new Map();
        for (const f of fishList) {
            if (!fishShouldSell(f)) continue;
            const id = f?.fishId; if (!id) continue;
            const qty = Number(f?.quantity ?? 0);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            map.set(id, (map.get(id) || 0) + qty);
        }
        return [...map.entries()].map(([fishId, quantity]) => ({ fishId, quantity }));
    }

    async function checkAndSellFish(manual = false) {
        if (state.sellFishRunning) return '正在卖出中…';
        state.sellFishRunning = true;
        try {
            const fishList = await fetchFishInventory();
            const items = buildFishSellItems(fishList);
            const totalCount = items.reduce((s, i) => s + i.quantity, 0);
            if (items.length === 0) { if (manual) OpLog.info('卖鱼', '没有需要卖的鱼（当前规则下）'); return '没有可卖的鱼'; }
            const beforeGold = state.playerGold;
            const r = await apiFetch('/api/inventory/fish/sell', { method: 'POST', body: { items }, idempotencyKey: crypto.randomUUID() });
            let earned = 0;
            if (r?.goldEarned !== undefined) earned = Number(r.goldEarned);
            else if (r?.player?.gold !== undefined) { earned = Math.max(0, Number(r.player.gold) - beforeGold); updateState({ playerGold: r.player.gold }); }
            OpLog.info('卖鱼', '已卖出 ' + totalCount + ' 条，获得 ' + earned.toLocaleString('zh-CN') + ' 金币');
            return '✅ 已卖出 ' + totalCount + ' 条';
        } catch (e) {
            OpLog.error('卖鱼', '卖鱼失败: ' + (e?.message || e));
            return '卖鱼失败';
        } finally {
            state.sellFishRunning = false;
        }
    }

    // ---- 卖装备 ----
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
        if (state.sellGearRunning) return '正在卖出中…';
        state.sellGearRunning = true;
        try {
            const rules = buildGearRules();
            if (rules.length === 0) { if (manual) OpLog.info('卖装备', '没有勾选要卖的稀有度'); return '没有勾选稀有度'; }
            const prev = await apiFetch('/api/inventory/gear/sale-preview', { method: 'POST', body: { rules } });
            const gearIds = prev?.gearIds || [];
            if (gearIds.length === 0) { if (manual) OpLog.info('卖装备', '没有需要卖的装备（当前规则下）'); return '没有可卖的装备'; }
            const beforeGold = state.playerGold;
            const r = await apiFetch('/api/inventory/gear/sell', { method: 'POST', body: { gearIds }, idempotencyKey: crypto.randomUUID() });
            let earned = 0;
            if (r?.goldEarned !== undefined) earned = Number(r.goldEarned);
            else if (r?.player?.gold !== undefined) { earned = Math.max(0, Number(r.player.gold) - beforeGold); updateState({ playerGold: r.player.gold }); }
            const truncated = prev?.isTruncated ? '（本次达100件上限）' : '';
            OpLog.info('卖装备', '已卖出 ' + gearIds.length + ' 件装备，获得 ' + earned.toLocaleString('zh-CN') + ' 金币' + truncated);
            return '✅ 已卖出 ' + gearIds.length + ' 件';
        } catch (e) {
            OpLog.error('卖装备', '卖装备失败: ' + (e?.message || e));
            return '卖装备失败';
        } finally {
            state.sellGearRunning = false;
        }
    }

    // ---- 卖鱼/卖装备 调度 ----
    let _sellFishTimer = null, _sellGearTimer = null;
    function stopSellFish() { if (_sellFishTimer) { clearTimeout(_sellFishTimer); _sellFishTimer = null; } }
    function stopSellGear() { if (_sellGearTimer) { clearTimeout(_sellGearTimer); _sellGearTimer = null; } }
    onTeardown(stopSellFish);
    onTeardown(stopSellGear);

    function startSellFish() {
        stopSellFish();
        if (!settings.sellFishEnabled) return;
        _sellFishTimer = setTimeout(sellFishTick, 5000);
    }
    async function sellFishTick() {
        _sellFishTimer = null;
        if (!settings.sellFishEnabled || state.paused) return;
        try { await checkAndSellFish(false); } catch (_) {}
        const ms = Math.min(Math.max(settings.sellFishIntervalMin, 3), 1440) * 60000;
        _sellFishTimer = setTimeout(sellFishTick, ms);
    }

    function startSellGear() {
        stopSellGear();
        if (!settings.sellGearEnabled) return;
        _sellGearTimer = setTimeout(sellGearTick, 5000);
    }
    async function sellGearTick() {
        _sellGearTimer = null;
        if (!settings.sellGearEnabled || state.paused) return;
        try { await checkAndSellGear(false); } catch (_) {}
        const ms = Math.min(Math.max(settings.sellGearIntervalMin, 3), 1440) * 60000;
        _sellGearTimer = setTimeout(sellGearTick, ms);
    }
    function getBaitQuantity(baitId, snapshot) {
        // 优先取缓存（/api/baits 主动获取的权威数量），其次取快照
        const c = state.baitCache?.find(b => b.id === baitId);
        if (c?.quantity !== undefined && c.quantity !== null) return c.quantity;
        const s = snapshot?.baits?.find(b => b.id === baitId);
        return s?.quantity ?? null;
    }
    function renderBaitControls(snapshot) {
        if (!shadowRoot) return;
        const ctr = shadowRoot.getElementById('bait-scene-ctr'); if (!ctr) return;
        ctr.innerHTML = '';
        // 合并快照和缓存的鱼饵列表（以快照为主，数量从缓存补）
        const baits = (snapshot?.baits || []).map(b => {
            const qty = getBaitQuantity(b.id, snapshot);
            return { ...b, quantity: qty };
        });
        for (const scene of BAIT_SCENES) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;';
            const label = document.createElement('span'); label.textContent = scene.label;
            label.style.cssText = 'font-size:12px;color:var(--as-muted);white-space:nowrap;';
            const sel = document.createElement('select');
            sel.style.cssText = 'width:130px;height:28px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;';
            const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '不切换'; sel.appendChild(optNone);
            for (const bait of baits) {
                const opt = document.createElement('option'); opt.value = bait.id;
                opt.textContent = `${bait.name}${bait.isUnlimited ? '' : ` · ${bait.quantity??'?'}`}`;
                sel.appendChild(opt);
            }
            sel.value = settings.baitByScene?.[scene.key] || '';
            sel.addEventListener('change', () => {
                const chosenId = sel.value;
                if (chosenId && !settings.baitAutoBuy) {
                    const chosen = baits.find(b => b.id === chosenId);
                    if (chosen && !chosen.isUnlimited && !chosen.quantity) {
                        sel.value = '';
                        warn(`[鱼饵] ${chosen.name} 库存为0且未开启自动购买，无法选择`);
                        return;
                    }
                }
                if (!settings.baitByScene) settings.baitByScene = {};
                settings.baitByScene[scene.key] = sel.value;
                saveSettings();
                // 改动后立即生效：若改的是当前场景，立刻切换（否则要等下一次场景变化才触发）
                if (settings.autoBait && !state.paused) evaluateBait();
            });
            row.appendChild(label); row.appendChild(sel); ctr.appendChild(row);
        }
    }

    // 降级链：从目标饵料开始，逐级往下尝试（有库存→切，没库存→买→切，买不起→继续降）
    async function trySwitchBait(targetId, scene) {
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const sceneLabel = BAIT_SCENES.find(s=>s.key===scene)?.label || '?';
        const startIdx = BAIT_TIER_ORDER.indexOf(targetId);
        if (startIdx === -1) { L.bait(`未知饵料: ${targetId}`); return; }
        for (let i = startIdx; i >= 0; i--) {
            const tryId = BAIT_TIER_ORDER[i];
            const tryBait = snap.baits?.find(b => b.id === tryId);
            if (!tryBait) continue;
            if (tryBait.isSelected) { L.bait(`已在 ${tryBait.name}`); return; }
            const hasStock = tryBait.isUnlimited || (tryBait.quantity > 0);
            if (hasStock) {
                try { await game.fishing.selectBait(tryId); OpLog.info('鱼饵', '✅ ' + tryBait.name + ' (' + sceneLabel + ')'); }
                catch(e) { OpLog.error('鱼饵', '装备失败: ' + tryBait.name + ' — ' + e.message); return; }
                if (tryId !== targetId) { settings.baitByScene[scene] = tryId; saveSettings(); }
                renderBaitControls(game.getSnapshot());
                return;
            }
            // 没库存且是基础饵 → 不需要买，直接切
            if (tryId === 'bait_basic') {
                try { await game.fishing.selectBait('bait_basic'); OpLog.info('鱼饵', '✅ 基础饵 (' + sceneLabel + ')'); }
                catch(e) { OpLog.error('鱼饵', '基础饵失败: ' + e.message); return; }
                if (targetId !== 'bait_basic') { settings.baitByScene[scene] = 'bait_basic'; saveSettings(); }
                renderBaitControls(game.getSnapshot());
                return;
            }
            // 没库存 → 尝试购买
            if (settings.baitAutoBuy) {
                L.bait(`${tryBait.name} 无库存，购买 x100`);
                try {
                    await apiFetch(`/api/baits/${tryId}/purchase`, { method:'POST', body:{quantity:100}, idempotencyKey: crypto.randomUUID() });
                    await game.fishing.selectBait(tryId);
                    refreshBaitData();
                    OpLog.info('鱼饵', '✅ 购买+切换 ' + tryBait.name + ' (' + sceneLabel + ')');
                    if (tryId !== targetId) { settings.baitByScene[scene] = tryId; saveSettings(); }
                    renderBaitControls(game.getSnapshot());
                    return;
                } catch(e) { OpLog.warn('鱼饵', '买不起 ' + tryBait.name + '，继续降级'); }
            } else {
                L.bait(`${tryBait.name} 无库存且未开启自动购买，继续降级`);
            }
        }
        OpLog.warn('鱼饵', '所有等级均不可用');
    }

    async function evaluateBait() {
        if (!settings.autoBait) return;
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        const baitId = settings.baitByScene?.[scene]; if (!baitId) return;
        await trySwitchBait(baitId, scene);
    }

    // 定期检测场景变化（比赛结束等）→ 鱼饵 + 洗点恢复
    function checkBaitScene() {
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        if (state.lastBaitScene && state.lastBaitScene !== scene) {
            const oldScene = state.lastBaitScene;
            updateState({ lastBaitScene: scene });
            // 比赛真正结束（非仅离开比赛地图）→ 恢复洗点 + 切回1号 + 重置蹭奖
            if ((oldScene === 'personalCompetition' || oldScene === 'guildCompetition')
                && !isCompetitionActive(oldScene === 'personalCompetition' ? 'personal' : 'guild')) {
                // 按结束的是个人赛还是公会赛，各自门控赛后分配，避免「只开公会赛洗点、个人赛结束也白洗」
                const compKind = oldScene === 'personalCompetition' ? 'personal' : 'guild';
                if (respecEnabled(compKind)) applyPostRespec();
                if (resetDipIfEnded(oldScene) && state.appGame) makeDecision(state.appGame);
                if (settings.autoLoadout) switchLoadout(1);
            }
            // 鱼饵切换
            if (settings.autoBait) { L.bait(`场景变化: ${oldScene} → ${scene}`); evaluateBait(); }
        }
        updateState({ lastBaitScene: scene });
    }
    // 降级检测：系统强制切到基础饵（带 5 分钟冷却，避免没钱买饵时每杆都刷「买不起/所有等级均不可用」日志）
    let _lastBaitFallbackAt = 0;
    function checkBaitFallback() {
        if (!settings.autoBait || !settings.baitFallback) return;
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        const configuredId = settings.baitByScene?.[scene]; if (!configuredId) return;
        const currentBait = snap.baits?.find(b => b.isSelected);
        if (currentBait?.id === 'bait_basic' && configuredId !== 'bait_basic') {
            const now = Date.now();
            if (now - _lastBaitFallbackAt < 5 * 60 * 1000) return;  // 5 分钟内不重复尝试
            _lastBaitFallbackAt = now;
            OpLog.info('鱼饵', '检测到基础饵，尝试切回');
            trySwitchBait(configuredId, scene);
        }
    }

    const STAT_LABELS = { strength:'力量', intelligence:'智力', luck:'运气', endurance:'耐力' };
    async function autoAllocateStats() {
        if (!settings.autoAllocateStats) return;
        if (state.paused) return;  // 暂停时不动属性
        if (!settings.statAllocationTarget) return;
        if (state.statAllocateInProgress || state.respecInProgress) return;
        if (state.unspentStatPoints <= 0) return;
        // 比赛期间 → 全加幸运；赛后 → 按用户设置的属性
        const inPersonal = shouldActForComp('personal'), inGuild = shouldActForComp('guild');
        const target = ((inPersonal && settings.autoRespecPersonal) || (inGuild && settings.autoRespecGuild)) ? 'luck' : settings.statAllocationTarget;
        L.spc(`加点检查: 未分配=${state.unspentStatPoints} 目标=${STAT_LABELS[target]||target} 赛程中=${onAnyCompMap()}`);
        const pts = state.unspentStatPoints;
        state.statAllocateInProgress = true;
        try {
            const body = { strength:0, intelligence:0, luck:0, endurance:0 };
            body[target] = pts;
            const r = await apiFetch('/api/player/stats/allocate', {
                method:'POST', body,
                idempotencyKey: crypto.randomUUID(),
            });
            if (r.player?.unspentStatPoints !== undefined) {
                updateState({ unspentStatPoints: r.player.unspentStatPoints });
                OpLog.info('加点', '✅ 自动分配 ' + pts + ' 点 → ' + (STAT_LABELS[target]||target));
            }
        } catch(e) {
            OpLog.error('加点', '分配失败: ' + e.message);
        } finally { updateState({ statAllocateInProgress: false }); }
    }

    function syncPlayerStats(r) {
        if (r.player) updateState({ playerGold: r.player.gold, unspentStatPoints: r.player.unspentStatPoints, playerStats: r.player.stats });
    }

    function respecEnabled(kind) {
        return kind === 'personal' ? settings.autoRespecPersonal : settings.autoRespecGuild;
    }
    function tripRespecCircuit(reason) {
        settings.autoRespecPersonal = false; settings.autoRespecGuild = false; saveSettings();
        warn(`🚨 洗点熔断！${reason} — 已自动关闭 autoRespecPersonal 和 autoRespecGuild，请检查后手动重新打开`);
        const cbP = shadowRoot?.getElementById('sw-autoRespecPersonal');
        const cbG = shadowRoot?.getElementById('sw-autoRespecGuild');
        if (cbP) cbP.checked = false;
        if (cbG) cbG.checked = false;
    }
    let _currentLoadout = 1; // 无法读取服务端实际配装号，默认 1 号（赛后/刷新后始终切回 1 号；若正处比赛中，checkRespecStart 会在初始化时切到比赛配装）
    async function switchLoadout(slot) {
        L.spc(`配装检查: 当前=#${_currentLoadout} 目标=#${slot}`);
        if (slot === _currentLoadout) { L.spc(`配装已在 #${slot}，无需切换`); return; }
        try {
            await apiFetch(`/api/gear/loadouts/${slot}/load`, { method:'POST', idempotencyKey: crypto.randomUUID() });
            _currentLoadout = slot;
            OpLog.info('配装', '✅ 加载配装 #' + slot);
        } catch(e) {
            OpLog.error('配装', '加载配装 #' + slot + ' 失败: ' + e.message);
        }
    }

    async function doRespec(kind) {
        if (state.respecInProgress) return;
        if (!respecEnabled(kind)) return;
        const label = kind === 'personal' ? '个人赛' : '公会赛';
        const _rg = respecLock.check(RESPEC_COST); if (_rg.blocked) { OpLog.warn('洗点', '安全锁拦截: ' + _rg.reason); return; }
        if (state.playerGold <= 0) { L.spc('金币数据未就绪，等待'); return; }
        if (state.playerGold < RESPEC_COST) { OpLog.warn('洗点', label + '金币不足'); return; }
        if (!state.playerStats) { L.spc('等待属性数据'); return; }
        state.respecInProgress = true;
        try {
            OpLog.info('洗点', label + '开始 → 全加幸运');
            const resetR = await apiFetch('/api/player/stats/reset', { method:'POST', idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(resetR);
            respecLock.record(RESPEC_COST); // reset 已扣金币，先记账，避免 allocate 失败时低估消费
            const totalPts = resetR.player?.unspentStatPoints ?? 0;
            const body = { strength: 0, intelligence: 0, luck: Math.max(0, totalPts - INIT_ENDURANCE), endurance: INIT_ENDURANCE };
            const allocR = await apiFetch('/api/player/stats/allocate', { method:'POST', body, idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(allocR);
            OpLog.info('洗点', '✅ ' + label + '洗点完成: 全加幸运 运' + body.luck + ' 耐' + INIT_ENDURANCE);
        } catch(e) {
            OpLog.error('洗点', label + '失败: ' + e.message);
        } finally { updateState({ respecInProgress: false }); }
    }

    async function applyPostRespec() {
        if (state.respecInProgress || !state.playerStats) return;
        const _rg = respecLock.check(RESPEC_COST); if (_rg.blocked) { OpLog.warn('洗点', '安全锁拦截: ' + _rg.reason); return; }
        if (state.playerGold <= 0) { L.spc('金币数据未就绪，等待'); return; }
        if (state.playerGold < RESPEC_COST) { OpLog.warn('洗点', '金币不足，跳过赛后分配'); return; }
        const targetStr = settings.statAllocationTarget === 'strength' ? 0 : (settings.respecStrengthTarget || 0);
        state.respecInProgress = true;
        try {
            const targetStat = settings.statAllocationTarget;
            const label = targetStr > 0 ? `总计力${targetStr}+其余${STAT_LABELS[targetStat]||targetStat}` : `全${STAT_LABELS[targetStat]||'自动'}`;
            OpLog.info('洗点', '赛后分配 → ' + label);
            // 先切回 1 号配装（正常装备），再按正常装备算力量目标，避免用比赛幸运装的低力量算偏
            if (settings.autoLoadout) await switchLoadout(1);
            const resetR = await apiFetch('/api/player/stats/reset', { method:'POST', idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(resetR);
            respecLock.record(RESPEC_COST); // reset 已扣金币，先记账
            const totalPts = resetR.player?.unspentStatPoints ?? 0;
            const body = { strength: 0, intelligence: 0, luck: 0, endurance: INIT_ENDURANCE };
            if (targetStr > 0) {
                const s = resetR.player?.stats || state.playerStats;  // 用 reset 后的权威 stats（含已切回的配装）
                // 固定加成（不随基础属性变化）：鱼竿+装备+个人奖杯+公会奖杯
                const flat = (s.rod?.strength || 0) + (s.gear?.strength || 0) + (s.medals?.strength || 0) + (s.guildTrophies?.strength || 0);
                // 公会图腾百分比：直接读图腾等级（每级 +1%），读不到时从 guild 反推兜底
                let totemPct = 0;
                if (state.guildTotemLevels?.strength != null) {
                    totemPct = state.guildTotemLevels.strength / 100;
                } else {
                    const guildStr = s.guild?.strength || 0;
                    const baseFlat = (s.total?.strength || 0) - guildStr;
                    totemPct = baseFlat > 0 ? guildStr / baseFlat : 0;
                    L.spc(`赛后力量: 未读到图腾等级，反推图腾%=${(totemPct * 100).toFixed(2)}%`);
                }
                // 总力量 = (基础+固定) + floor(图腾% × (基础+固定))，反解基础后微调消除 floor 的 ±1 误差
                const totalOf = (b) => (b + flat) + Math.floor(totemPct * (b + flat));
                let base = Math.max(0, Math.round(targetStr / (1 + totemPct) - flat));
                let exact = false;
                for (let d = -3; d <= 3; d++) {
                    const b = base + d;
                    if (b < 0) continue;
                    if (totalOf(b) === targetStr) { base = b; exact = true; break; }
                }
                if (!exact) {
                    // 目标落在图腾 floor 空档里（数学上不可达）→ 取最近值并告警，不静默接受
                    let best = base, bestDiff = Infinity;
                    for (let d = -3; d <= 3; d++) {
                        const b = base + d;
                        if (b < 0) continue;
                        const diff = Math.abs(totalOf(b) - targetStr);
                        if (diff < bestDiff) { best = b; bestDiff = diff; }
                    }
                    base = best;
                    L.spc(`赛后力量: 目标${targetStr} 落在图腾 floor 空档，取最近值(差${bestDiff})`);
                }
                body.strength = Math.max(0, Math.min(base, totalPts - INIT_ENDURANCE));
                L.spc(`赛后力量: 目标${targetStr} 固定${flat} 图腾${(totemPct * 100).toFixed(1)}% → 基础力量${body.strength}`);
            }
            const remain = totalPts - body.strength - INIT_ENDURANCE;
            if (remain > 0) body[targetStat] = remain;
            const allocR = await apiFetch('/api/player/stats/allocate', { method:'POST', body, idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(allocR);
            OpLog.info('洗点', '✅ 赛后分配完成: 力' + body.strength + ' ' + (targetStat) + (body[targetStat]) + ' 耐' + INIT_ENDURANCE);
        } catch(e) {
            OpLog.error('洗点', '赛后分配失败: ' + e.message);
        } finally { updateState({ respecInProgress: false }); }
    }
    function isCompetitionActive(kind) {
        const now = Date.now();
        if (kind === 'personal') {
            const p = state.competitionCache.personal;
            return p?.current?.isRegistered && now <= new Date(p.current.endAt).getTime();
        }
        const g = state.competitionCache.guild;
        return g?.current?.entryStatus === 'registered' && now <= new Date(g.current.endAt).getTime();
    }
    function isOnCompetitionMap(kind) {
        const g = state.appGame || window.arcaneReelax;
        const cur = g?.getSnapshot()?.currentBiomeId;
        if (!cur) return false;
        const cc = state.competitionCache[kind];
        const comp = cc?.current;
        if (!comp) return false;
        const biomeId = comp.groups?.length
            ? (comp.groups.find(g => g.id === (comp.myGroupId || comp.defaultGroupId))?.biomeId || comp.biomeId)
            : comp.biomeId;
        return cur === biomeId;
    }
    // 活跃比赛 + 人在比赛地图（船队蹭奖屏蔽的个人赛不算）
    function shouldActForComp(kind) { if (kind === 'personal' && isPersonalBlocked()) return false; return isCompetitionActive(kind) && isOnCompetitionMap(kind); }
    function onAnyCompMap() { return shouldActForComp('personal') || shouldActForComp('guild'); }
    function statsMatchPostRespec() {
        const b = state.playerStats?.base, t = state.playerStats?.total;
        if (!b || !t) return true;
        const targetStr = settings.statAllocationTarget === 'strength' ? 0 : (settings.respecStrengthTarget || 0);
        const targetStat = settings.statAllocationTarget;
        // 力量已打满（智力/运气均为 0，即点数全给了力量）：力量目标不可达，接受现状避免反复洗点死循环
        const strengthMaxedOut = targetStr > 0 && b.intelligence === 0 && b.luck === 0;  // 目标过高：点数全给力量仍不够
        const strengthMinZero = targetStr > 0 && b.strength === 0 && t.strength > targetStr;  // 目标过低：固定加成已超过目标，基础力量只能为 0
        // 力量目标偏差超过 1 点 → 不匹配（图腾 floor 空档允许差 1，差 ≥2 视为异常需重洗）
        if (targetStr > 0 && !strengthMaxedOut && !strengthMinZero && Math.abs(t.strength - targetStr) > 1) return false;
        // 只有耐力、力量(如有目标)、目标属性允许有 base 值
        const allowed = new Set(['endurance']);
        if (targetStr > 0) allowed.add('strength');
        if (targetStat) allowed.add(targetStat);
        for (const [stat, val] of Object.entries(b)) {
            if (val === 0) continue;
            if (!allowed.has(stat)) return false;
        }
        // 耐力不是目标时必须等于 100
        if (targetStat !== 'endurance' && b.endurance !== 100) return false;
        // 目标属性必须有值（力量已打满导致目标属性为 0 时除外）
        if (targetStat && targetStat !== 'strength' && !b[targetStat] && !strengthMaxedOut) return false;
        return true;
    }
    function checkRespecStart() {
        if (state.paused) return;
        const anyEnabled = respecEnabled('personal') || respecEnabled('guild');
        if (!anyEnabled) return;
        // 各赛制数据独立就绪，互不阻塞（公会赛数据未到不能阻塞个人赛洗点）
        const personalPending = respecEnabled('personal') && !state.competitionCache.personal;
        const guildPending = respecEnabled('guild') && !state.competitionCache.guild;
        if (personalPending) L.spc('洗点检查: 个人赛数据未就绪，等待');
        if (guildPending) L.spc('洗点检查: 公会赛数据未就绪，等待');
        if (personalPending && guildPending) return;  // 两者都没数据，等 competition:updated 再判断
        const personalActive = !personalPending && isCompetitionActive('personal') && !isPersonalBlocked();
        const guildActive = !guildPending && isCompetitionActive('guild');
        L.spc(`洗点检查: 个人赛=${personalActive} 公会赛=${guildActive} 在赛图=${onAnyCompMap()}`);
        if (personalActive || guildActive) {
            if (!onAnyCompMap()) { L.spc('洗点检查: 赛程活跃但不在比赛地图，跳过'); return; }
            const b = state.playerStats?.base;
            const inLuck = b && b.strength === 0 && b.intelligence === 0 && b.luck > 0 && b.endurance <= 100;
            // 开关关了但还在全运状态 → 恢复赛后方案（用 shouldActForComp 确保人在对应比赛地图）
            if (inLuck && ((shouldActForComp('personal') && !respecEnabled('personal')) || (shouldActForComp('guild') && !respecEnabled('guild')))) {
                L.spc('洗点检查: 开关已关但仍在全运，恢复赛后方案');
                applyPostRespec();
                if (settings.autoLoadout) switchLoadout(1);
                return;
            }
            if (inLuck) { L.spc('洗点检查: 已在全运状态，跳过'); return; }
            const doPersonal = shouldActForComp('personal') && respecEnabled('personal');
            const doGuild = shouldActForComp('guild') && respecEnabled('guild');
            // 蹭奖模式：积分已满足（刷新后内存标记丢失）→ 不洗全运，直接标记完成跳过比赛
            if (doPersonal && settings.dipPersonal && personalDipScoreMet(false)) {
                state._dipSeq = getPersonalCompContext()?.sequence || '';
                L.spc('洗点检查: 个人赛蹭奖已满足，不洗全运');
            } else if (doPersonal && settings.witherTideDipPersonal && personalDipScoreMet(true)) {
                state._witherDipSeq = getPersonalCompContext()?.sequence || '';
                L.spc('洗点检查: 枯潮蹭奖已满足，不洗全运');
            } else if (doPersonal) {
                doRespec('personal');
            }
            if (doGuild) doRespec('guild');
            // 开关关了但属性不匹配赛后方案 → 恢复
            if (!doPersonal && !doGuild && state.playerStats && !statsMatchPostRespec()) {
                L.spc('洗点检查: 属性不匹配赛后方案，恢复');
                applyPostRespec();
                if (settings.autoLoadout) switchLoadout(1);
            }
            if (settings.autoLoadout && (doPersonal || doGuild)) switchLoadout(settings.loadoutSlot);
            return;
        }
        // 仍有赛制数据待就绪时无法确定"确定无比赛"，先不恢复赛后方案（避免误判比赛还在进行）
        if (personalPending || guildPending) { L.spc('洗点检查: 仍有赛制数据待就绪，暂不恢复赛后方案'); return; }
        // 无比赛：重置蹭奖 + 属性不匹配赛后方案则补洗
        let dipReset = false;
        if (state._witherDipSeq) { state._witherDipSeq = ''; dipReset = true; L.map('枯潮蹭奖: 比赛结束，重置'); }
        if (state._dipSeq) { state._dipSeq = ''; dipReset = true; L.map('个人赛蹭奖: 比赛结束，重置'); }
        if (state.playerStats) {
            if (!statsMatchPostRespec()) { applyPostRespec(); }
            else { L.spc('属性与赛后方案一致，无需操作'); }
        }
        if (dipReset && state.appGame) makeDecision(state.appGame);
    }

    function updateModeStatus(snapshot) {
        const el = shadowRoot?.getElementById('snap-mode');
        const hint = shadowRoot?.getElementById('hint-mode');
        if (!el) return;
        const party = snapshot?.party;
        let modeText = '个人地图模式', tipText = '未加入船队，按个人优先级自动切图';
        if (party?.canChangeBoatBiome) {
            modeText = settings.autoPartyTravel ? '船长/舵手模式' : '个人地图模式';
            tipText = settings.autoPartyTravel ? '按船队优先级开船，整船一起切图' : '已关闭船队模式，按个人优先级只切自己';
        } else if (party?.isInParty) {
            modeText = '船员模式（跟随船队）';
            tipText = '你当前是船员无法开船，脚本不切图，退出船队后个人优先级才会生效';
        }
        el.textContent = modeText;
        if (hint) { hint.onmouseenter = (e) => showTooltip(e, tipText); hint.onclick = (e) => { e.stopPropagation(); hideTooltip(); showTooltip(e, tipText); }; hint.onmouseleave = hideTooltip; }
    }

    // ============================================================
    // 8. 主程序
    // ============================================================

    async function main() {
        try {
            const game = await waitForGameAPI();
            if (!game) { error('未获取到 game 对象'); return; }
            updateState({ appGame: game }); L.init('API就绪');

            await game.ready; L.init('数据就绪');

            const snap = game.getSnapshot();
            if (settings.debugLog && snap) {
                L.init(`快照: 当前=${snap.currentBiomeId}, 解锁=${(snap.biomes?.filter(b=>b.isUnlocked)||[]).length}张`);
                (snap.biomes?.filter(b=>b.isUnlocked)||[]).forEach(b => L.init(`${b.id} ${b.name}${b.isCurrent?' [当前]':''} ${b.weather?.name||'?'}`));
            }
            if (snap?.biomes) { const c = snap.biomes.find(b => b.isCurrent); if (c?.weather) updateState({ currentWeatherId: c.weather.id }); }

            loadCatchLog();  // 加载本地持久化的奇异/奥秘钓获记录
            loadBalance();  // 加载本地持久化的每日盈亏基准与历史
            loadLedger();  // 加载本地持久化的每日收支明细账本
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
            const versionTimer = setInterval(() => checkVersion(), 60 * 60 * 1000);  // 每小时检查一次版本
            onTeardown(() => clearInterval(versionTimer));
            maybeShowUpdateLog();

            let _weatherDebounce = null;
            game.on('weather:changed', ({biomeId,previous,current}) => { const snap = game.getSnapshot(); const curBiomeId = snap?.biomes?.find(b => b.isCurrent)?.id; if (biomeId === curBiomeId) updateState({currentWeatherId:current.id}); updatePanelInfo(snap); if (_weatherDebounce) clearTimeout(_weatherDebounce); _weatherDebounce = setTimeout(() => { _weatherDebounce = null; if (settings.showPity) { L.pity(`天气变化→${current.id}，重新校准`); fetchPity(); } if (state.paused) return; if(settings.autoBuyBuffs)checkAndBuyBuffs(); if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); }, 1200); });
            game.on('competition:started', ({competition}) => { dismissCompetitionReminder(); if (state.paused) return; if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); if(shouldActForComp(competition.kind)){ if(respecEnabled(competition.kind)) doRespec(competition.kind); if(settings.autoLoadout)switchLoadout(settings.loadoutSlot); } });
            game.on('guild-boost:started', () => { updatePanelInfo(game.getSnapshot()); if (state.paused) return; if(settings.autoSwitchMap)makeDecision(game); });
            game.on('guild-boost:ended', () => { updatePanelInfo(game.getSnapshot()); });

            // 定时刷新面板信息
            const panelTimer = setInterval(() => { if (state.appGame) { const s = state.appGame.getSnapshot(); updatePanelInfo(s); updateModeStatus(s); renderBaitControls(s); injectCastStats(); injectBalanceDisplay(); if (!state.paused) checkBaitScene(); } }, 5000);
            onTeardown(() => clearInterval(panelTimer));

            // 每日盈亏：每 1 分钟跨天结算 + 刷新实时显示
            checkDailyReset();
            const balanceTimer = setInterval(() => { checkDailyReset(); injectBalanceDisplay(); }, 60000);
            document.addEventListener('click', onDocClickBalanceToggle);
            document.addEventListener('click', onDocClickLedgerToggle);
            onTeardown(() => { clearInterval(balanceTimer); document.removeEventListener('click', onDocClickBalanceToggle); document.removeEventListener('click', onDocClickLedgerToggle); closeBalanceLog(); });

            window.switchToBiome = async (biomeId) => { if(!biomeId)return warn('缺少biomeId'); try{await game.biomes.travelTo(biomeId);updateState({lastSwitchTime:Date.now()});}catch(err){error('切换失败:',err);} };
            window.checkBuffs = checkAndBuyBuffs;
            window.applyPostRespec = applyPostRespec; // 手动触发赛后分配（调试用）

            // destroy：彻底卸载脚本（跑所有 teardown + 移除面板）
            window.destroyArcaneAssistant = () => {
                stopDomObserver(); stopRefill();
                for (const fn of teardowns.reverse()) { try { fn(); } catch(_) {} }
                teardowns.length = 0;
                const host = document.getElementById('script-panel-host');
                if (host) host.remove();
                shadowRoot = null;
                console.log(`${ts()} [辅助脚本] 已卸载`);
            };

            L.init('✅ 初始化完成');
        } catch (err) { error('初始化失败:', err); }
    }

    main();
})();

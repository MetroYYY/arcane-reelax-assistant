// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  自动地图切换、补满、报名个人赛、涌潮买buff、每日签到、弹窗处理、属性加点/比赛洗点、场景切饵
// @author       deepseek & yy
// @match        https://reelax.abang666.com/*
// @match        https://reelax.cn/*
// @grant        none
// @run-at       document-end
// @noframes
// @icon         https://reelax.abang666.com/branding/arcane-reelax-favicon-64.png
// @license      MIT
// @downloadURL none
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 1. 常量与配置
    // ============================================================

    const SCRIPT_VERSION = '1.5.0';
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
        respecPostMode: 'str1700',
        autoLoadout: false, loadoutSlot: 2,
        skipWitherTidePersonal: false, witherTideDipPersonal: false, dipPersonal: false,
        sectionCollapsed: {},
        viewMode: 'settings', paused: false,
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
    const RESPEC_STRENGTHS = { str1700:1700, str3800:3800, str5400:5400 };
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
        { key:'autoSwitchMap', label:'自动换图' },
        { key:'autoGuild', label:'自动进公会赛' },
        { key:'autoPersonal', label:'自动进个人赛' },
        { key:'autoRegisterPersonal', label:'自动报名个人赛' },
        { key:'autoCheckIn', label:'每日签到' },
        { key:'autoDismissCompetition', label:'赛事弹窗稍后处理' },
        { key:'autoDismissOffline', label:'离线结算弹窗处理' },
        { key:'debugLog', label:'调试日志' },
    ];

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
        playerGold: 0, playerStats: null, respecInProgress: false,
        logBuffer: [], logBufferBytes: 0, logPaused: false, paused: false,
        _witherDipDone: false, _dipDone: false,
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
                // 迁旧值：'str' → 'str1700'
                if (s.respecPostMode === 'str') s.respecPostMode = 'str1700';
                // 迁旧版 buffSelections：flat 转嵌套
                if (s.triggerWeathers?.length && s.buffSelections && !s.buffSelections[s.triggerWeathers[0]]) {
                    const old = s.buffSelections;
                    s.buffSelections = {};
                    for (const w of s.triggerWeathers) s.buffSelections[w] = { ...old };
                    delete s.triggerWeathers;
                }
                return { ...DEFAULTS, ...s };
            }
        } catch(e) {}
        return { ...DEFAULTS };
    }
    function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(e) {} }
    function ts() { return new Date().toLocaleTimeString(); }
    function log(...a) { if (settings.debugLog) console.log(`${ts()}`, ...a); }
    function warn(...a) { OpLog.warn('辅助脚本', a.join(' ')); }
    function error(...a) { OpLog.error('辅助脚本', a.join(' ')); }
    function logger(tag, color) { const s=`color:${color};font-weight:bold`; return (...a)=>{ if(settings.debugLog) console.log(`${ts()} %c[${tag}] ${a.join(' ')}`,s); }; }
    const L = { map:logger('切图','#4a9eff'), reg:logger('报名','#4ade80'), buff:logger('Buff','#f59e0b'), bait:logger('鱼饵','#fbbf24'), fetch:logger('拦截','#9ca3af'), event:logger('事件','#c084fc'), cfg:logger('设置','#2dd4bf'), dlg:logger('弹窗','#f472b6'), refill:logger('补杆','#a78bfa'), spc:logger('洗点','#f97316'), init:logger('主程序','#64748b') };

    const TAG_COLORS = { '报名':'#4ade80','切图':'#4a9eff','Buff':'#f59e0b','鱼饵':'#fbbf24','加点':'#f59e0b','配装':'#22c55e','洗点':'#f97316','辅助脚本':'#ef4444' };

    // === 控制台拦截 → 面板日志 ===
    function pushLog(time, level, tag, color, msg) {
        state.logBuffer.push({ time, level, tag, color, msg });
        state.logBufferBytes += msg.length + 10;
        while (state.logBufferBytes > 10 * 1024 * 1024 && state.logBuffer.length > 100) { state.logBufferBytes -= (state.logBuffer.shift()||{msg:''}).msg.length + 10; }
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
            if (msg && !/^\d{2}:\d{2}:\d{2}$/.test(msg)) pushLog(ts(), level, tag, color, msg);
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
    function getFrontendVersion() {
        const el = document.querySelector('[aria-label*="当前版本"]');
        if (el) { const m = el.getAttribute('aria-label').match(/v([\d.]+)/); if (m) return m[1]; }
        return '0.13.0';
    }
    let playerProof = null, playerKey = null;
    function base64Url(bytes) { let b=''; for(const x of new Uint8Array(bytes))b+=String.fromCharCode(x); return btoa(b).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
    async function apiFetch(path, opts = {}) {
        // 首次调用或 proof 过期：bootstrap（调 /api/me 拿 proof）
        if (!playerProof) {
            try {
                const meResp = await originalFetch('/api/me', { headers:{'Accept':'application/json','x-frontend-version':getFrontendVersion()}, credentials:'include' });
                const proof = meResp.headers.get('x-arcane-request-proof');
                if (proof) { playerProof = proof; playerKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(proof), { name:'HMAC', hash:'SHA-256' }, false, ['sign']); }
                const meData = await meResp.json();
                if (meData.player?.fragments !== undefined) updateState({ playerFragments: meData.player.fragments });
            } catch(_) {}
        }
        const h = { 'Accept':'application/json', 'x-frontend-version': getFrontendVersion() };
        if (opts.body !== undefined) h['Content-Type'] = 'application/json';
        if (opts.idempotencyKey) h['Idempotency-Key'] = opts.idempotencyKey;
        // HMAC 签名
        if (playerProof && playerKey) {
            const body = opts.body !== undefined ? JSON.stringify(opts.body) : '';
            const ts = String(Date.now());
            const url = new URL(path, 'https://arcane-reelax.invalid');
            const payload = `v1\n${(opts.method||'GET').toUpperCase()}\n${url.pathname}${url.search}\n${ts}\n${body}`;
            h['x-arcane-request-proof'] = playerProof;
            h['x-arcane-request-timestamp'] = ts;
            h['x-arcane-request-signature'] = base64Url(await crypto.subtle.sign('HMAC', playerKey, new TextEncoder().encode(payload)));
        }
        const r = await fetch(path, { method: opts.method||'GET', headers:h, credentials:'include', ...(opts.body===undefined?{}:{body:JSON.stringify(opts.body)}) });
        if (!r.ok) { let msg = `${r.status}`; try { const e = await r.clone().json(); if (e.error?.message) msg = e.error.message; } catch(_) {} throw new Error(msg); }
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
            const today = new Date().toISOString().slice(0, 10);
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
    function getCompetitionTarget(unlocked, now) {
        if (!settings.autoSwitchMap) return null;
        const cand = [];
        const add = (c) => { const s = new Date(c.startAt).getTime(); if (now >= s-300000 && now <= new Date(c.endAt).getTime()) cand.push({biomeId:getCompetitionBiomeId(c),startAt:s}); };
        if (settings.autoPersonal && state.competitionCache.personal) {
            const p = state.competitionCache.personal;
            if (p.current?.isRegistered) add(p.current);
            if (p.upcoming) for (const c of p.upcoming) if (c.isRegistered) { add(c); break; }
        }
        if (settings.autoGuild && state.competitionCache.guild) {
            const g = state.competitionCache.guild;
            if (g.current?.entryStatus==='registered') add(g.current);
            if (g.upcoming) for (const c of g.upcoming) if (c.entryStatus==='registered') { add(c); break; }
        }
        if (!cand.length) return null;
        cand.sort((a,b) => a.startAt - b.startAt);
        return unlocked.find(b => b.id === cand[0].biomeId && b.isUnlocked) || null;
    }

    // === 个人赛跳过/蹭奖 通用工具 ===
    function witherDipActive() {
        if (!settings.autoPersonal) return false;
        // 枯潮跳过：仅当比赛地图确实是枯潮时才生效
        if (settings.skipWitherTidePersonal) {
            const compBiomeId = state.competitionCache.personal?.current?.biomeId;
            if (!compBiomeId) return false;
            const snap = (state.appGame || window.arcaneReelax)?.getSnapshot();
            const biome = snap?.biomes?.find(b => b.id === compBiomeId);
            if (biome?.weather?.id === 'wither_tide') return true;
        }
        if (settings.witherTideDipPersonal && state._witherDipDone) return true;
        if (settings.dipPersonal && state._dipDone) return true;
        return false;
    }
    function shouldSkipComp(ct) {
        if (!settings.autoPersonal || !ct) return '';
        if (ct.weather?.id === 'wither_tide') {
            if (settings.skipWitherTidePersonal) return '枯潮跳过';
            if (settings.witherTideDipPersonal && state._witherDipDone) return '已蹭奖';
        }
        if (settings.dipPersonal && state._dipDone) return '已蹭奖';
        return '';
    }
    function resetDipIfEnded(oldScene) {
        if (oldScene !== 'personalCompetition') return false;
        let changed = false;
        if (state._witherDipDone) { state._witherDipDone = false; L.map('枯潮蹭奖: 比赛结束，重置'); changed = true; }
        if (state._dipDone) { state._dipDone = false; L.map('个人赛蹭奖: 比赛结束，重置'); changed = true; }
        return changed;
    }

    function makeDecision(game) {
        if (!settings.autoSwitchMap) { L.map('autoSwitchMap 已关闭'); return; }
        const snap = game.getSnapshot(); if (!snap?.biomes) { L.map('快照无数据'); return; }
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
        if (settings.autoPartyTravel && !snap.party?.canChangeBoatBiome) { settings.autoPartyTravel = false; saveSettings(); renderPriorities(); updateModeStatus(snap); L.map('已退出船队，自动切回个人模式'); }
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
                const skipReason = shouldSkipComp(ct);
                if (skipReason) { L.map(`→ competition: ${skipReason}，跳过 (${ct.name||ct.biomeId})`); skipWither = true; break; }
                if (ct && settings.autoPersonal) {
                    if (settings.witherTideDipPersonal && !state._witherDipDone && ct.weather?.id === 'wither_tide')
                        L.map(`→ competition: 枯潮蹭奖等待首竿 (${ct.name||ct.biomeId})`);
                    else if (settings.dipPersonal && !state._dipDone)
                        L.map(`→ competition: 蹭奖等待首竿 (${ct.name||ct.biomeId})`);
                }
                if (ct) { target=ct; tt='🏁 比赛'; L.map(`→ competition: ✅ ${ct.name||ct.biomeId}`); }
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
            g.fishing.refill().catch(() => {});
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
        const needBuy = cooled.filter(k => {
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
        if (relicBuffs.length && state.playerRelics < minRelic) { L.buff(`遗物不足`); }
        if (fragmentBuffs.length && state.playerFragments < minFrag) { L.buff(`碎片不足`); }
        if ((relicBuffs.length && state.playerRelics < minRelic) || (fragmentBuffs.length && state.playerFragments < minFrag)) return;

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
    // === 比赛提醒弹窗（官方 API） ===
    function dismissCompetitionReminder() {
        if (!settings.autoDismissCompetition) return;
        const api = state.appGame || window.arcaneReelax;
        L.dlg('比赛弹窗: 关闭提醒');
        api?.ui?.dismissReminder?.('competition');
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
    function startDomObserver() { stopDomObserver(); handleOfflineSummary(); state.domObserver = new MutationObserver(()=>{ const n=Date.now(); if(n-state.domObserverThrottle<1000)return; updateState({domObserverThrottle:n}); handleOfflineSummary(); }); state.domObserver.observe(document.body,{childList:true,subtree:true}); onTeardown(()=>stopDomObserver()); }
    function stopDomObserver() { if (state.domObserver) { state.domObserver.disconnect(); state.domObserver = null; } }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0]==='string'?args[0]:''; const resp = await originalFetch.apply(this,args); if(!url) return resp;
        // 截获 HMAC proof（服务器通过响应头下发）
        try { const proof = resp.headers.get('x-arcane-request-proof'); if (proof && proof !== playerProof) { playerProof = proof; playerKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(proof), { name:'HMAC', hash:'SHA-256' }, false, ['sign']); } } catch(_){}
        try {
            // /api/me：游戏自带请求，从中静默捕获碎片和遗物余额（零额外请求）
            if(url.includes('/api/me')){
                const d=await resp.clone().json();
                if(d.player?.fragments!==undefined)updateState({playerFragments:d.player.fragments});
                if(d.player?.relics!==undefined)updateState({playerRelics:d.player.relics});
                if(d.player?.unspentStatPoints!==undefined){ const prev=state.unspentStatPoints; updateState({unspentStatPoints:d.player.unspentStatPoints}); if(d.player.unspentStatPoints>0&&d.player.unspentStatPoints!==prev)autoAllocateStats(); }
                if(d.player?.gold!==undefined)updateState({playerGold:d.player.gold});
                if(d.player?.stats){ const hadStats=!!state.playerStats; updateState({playerStats:d.player.stats}); if(!hadStats)checkRespecStart(); }
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
                if(d.activeBuffs){ updateState({_activeBuffs:d.activeBuffs}); const now2=Date.now(); for(const b of d.activeBuffs){ if(b.buffType&&b.endsAt){ const g=activeBuffGroup(b); if(g&&new Date(b.endsAt).getTime()>now2)state.buffExpiryCache.set(g,b.endsAt); } } }
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
        if (sig !== state._lastFishingSig) { state._lastFishingSig = sig; if (!state.paused) scheduleRefill(); }
        try{const s=snap;if(s?.biomes){const c=s.biomes.find(b=>b.isCurrent);if(c?.weather)updateState({currentWeatherId:c.weather.id});}}catch(_){}
        if (state.paused) return;
        if(settings.autoBuyBuffs) checkAndBuyBuffs();
        checkBaitScene();
        if(settings.autoBait) checkBaitFallback();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
        // 蹭奖检测：比赛积分>0 → 标记（双源：比赛缓存 + 钓鱼lastResult）
        const dipCheck =(settingOn, dipDone, dipKey, label, needWither) => {
            if (!settingOn || dipDone) return;
            if (needWither) {
                const compBiome = state.competitionCache.personal?.current?.biomeId;
                const biome = snap?.biomes?.find(b => b.id === compBiome);
                if (biome?.weather?.id !== 'wither_tide') return;
            }
            const compScore = state.competitionCache.personal?.current?.score || 0;
            const fishScores = d?.lastResult?.competitionScores || [];
            const fishScore = fishScores.find(s => s.type === 'personal')?.score || 0;
            const totalScore = Math.max(compScore, fishScore);
            if (totalScore <= 0) return;
            if (dipKey === '_witherDipDone') state._witherDipDone = true;
            else state._dipDone = true;
            L.map(`${label}: 积分=${totalScore}，标记完成`);
            OpLog.info('切图', `${label}: 已获参与积分，跳过本次个人赛`);
            applyPostRespec();
            if (settings.autoLoadout) switchLoadout(1);
            if (state.appGame) makeDecision(state.appGame);
        };
        dipCheck(settings.witherTideDipPersonal, state._witherDipDone, '_witherDipDone', '枯潮蹭奖', true);
        dipCheck(settings.dipPersonal, state._dipDone, '_dipDone', '个人赛蹭奖', false);
        // 鱼饵库存 -1（每次抛竿消耗一个）
        if(state.baitCache){
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
        if (state.paused) return;
        L.cfg(`应用: refill=${settings.autoRefill} map=${settings.autoSwitchMap} checkIn=${settings.autoCheckIn} comp=${settings.autoDismissCompetition} offline=${settings.autoDismissOffline} buff=${settings.autoBuyBuffs} reg=${settings.autoRegisterPersonal} alloc=${settings.autoAllocateStats} bait=${settings.autoBait} respecP=${settings.autoRespecPersonal} respecG=${settings.autoRespecGuild} loadout=${settings.autoLoadout} party=${settings.autoPartyTravel} exMastery=${settings.excludeMasteryBonus} exGuild=${settings.excludeGuildBoost}`);
        settings.autoRefill ? scheduleRefill() : stopRefill();
        if(settings.autoSwitchMap&&state.appGame)makeDecision(state.appGame);
        if (settings.autoDismissOffline) startDomObserver(); else stopDomObserver();
        if (settings.autoCheckIn) attemptDailyCheckIn();
        if (settings.autoDismissCompetition) dismissCompetitionReminder();
        if(settings.autoBuyBuffs && state.playerRelics > 0) checkAndBuyBuffs();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
        // 洗点开关 → 开则检查比赛，关且有比赛则赛后分配
        if (settings.autoRespecPersonal || settings.autoRespecGuild) checkRespecStart();
        else if ((isCompetitionActive('personal') || isCompetitionActive('guild')) && state._prevAnyRespec) applyPostRespec();
        updateState({ _prevAnyRespec: settings.autoRespecPersonal || settings.autoRespecGuild });
        // 配装开关：关→切回1号，开→有比赛立即切
        if (!settings.autoLoadout && state._prevAutoLoadout) switchLoadout(1);
        else if (settings.autoLoadout && !state._prevAutoLoadout) {
            if (onAnyCompMap()) switchLoadout(settings.loadoutSlot);
        }
        updateState({ _prevAutoLoadout: settings.autoLoadout });
    }
    function resetAllSettings() { settings={...DEFAULTS};saveSettings();const p=shadowRoot?.getElementById('script-panel-host');if(p)syncUIFromSettings();applySettings(); }
    function syncUIFromSettings() {
        if (!shadowRoot) return;
        for (const item of SETTING_SCHEMA) { const cb = shadowRoot.getElementById('sw-'+item.key); if (cb) cb.checked = !!settings[item.key]; }
        const swAB = shadowRoot.getElementById('sw-autoBuyBuffs'); if (swAB) swAB.checked = !!settings.autoBuyBuffs;
        const autoG = shadowRoot.getElementById('sw-autoGuild'), autoP = shadowRoot.getElementById('sw-autoPersonal');
        const compOk = (autoG?.checked??settings.autoGuild) || (autoP?.checked??settings.autoPersonal);
        const list = shadowRoot.getElementById('priority-list'); if (list) renderPriorityList();
        renderBuffUI();
        const swExMastery2 = shadowRoot.getElementById('sw-excludeMasteryBonus'); if (swExMastery2) swExMastery2.checked = !!settings.excludeMasteryBonus;
        const swExGuild2 = shadowRoot.getElementById('sw-excludeGuildBoost'); if (swExGuild2) swExGuild2.checked = !!settings.excludeGuildBoost;
        renderStatsSection();
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
  .dock[data-collapsed="true"] #btn-tab-switch,.dock[data-collapsed="true"] #btn-pause{display:none !important;}
  .dock[data-collapsed="true"] #collapse{width:48px !important;height:48px !important;min-width:0 !important;padding:0 !important;border-radius:50% !important;background-image:url(https://reelax.cn/icons/currency/gold-coin.webp) !important;background-size:cover !important;background-position:center !important;border:0 !important;}
  .dock[data-collapsed="true"] #collapse span{display:none !important;}
  .dock[data-collapsed="true"] .panel-header{width:100%;height:100%;min-height:0;justify-content:center;padding:0;border-bottom:0;background:transparent;cursor:pointer;}
  .dock[data-collapsed="true"] .collapse-glyph{display:none;}
  .panel-header{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:12px;padding:8px 8px 8px 12px;border-bottom:1px solid var(--as-divider);background:var(--as-raised);cursor:move;user-select:none;}
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
</style>
<aside class="dock" data-collapsed="false" aria-label="奥术摸鱼大师">
  <header class="panel-header">
    <div class="identity"><span class="float-mark" aria-hidden="true"></span><span class="identity-copy"><strong id="panel-title">奥术摸鱼大师</strong><small id="headline">等待游戏快照</small></span></div>
    <button class="icon-button tab-btn" id="btn-tab-switch" type="button" title="查看运行日志" aria-label="运行日志" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span style="font-size:12px" id="tab-icon">📋</span><span style="margin-left:1px" id="tab-label">日志</span></button>
    <button class="icon-button tab-btn" id="btn-pause" type="button" title="暂停所有自动化功能" aria-label="暂停自动化" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span style="font-size:12px">⏯</span><span style="margin-left:1px">暂停</span></button>
    <button class="icon-button tab-btn" id="collapse" type="button" title="拖动标题栏可移动面板" aria-label="收起面板" aria-expanded="true" style="width:auto;padding:0 6px;font-size:11px;font-weight:650;border-color:var(--as-tide);background:color-mix(in srgb,var(--as-tide) 12%,transparent)"><span class="collapse-glyph" style="font-size:16px;line-height:1">−</span><span style="margin-left:1px" id="collapse-label">收起</span></button>
  </header>
  <div class="panel-body">
    <div id="view-settings">
    <div class="snapshot-grid">
      <div class="snapshot-cell"><span>当前地图</span><strong id="snap-biome">--</strong></div>
      <div class="snapshot-cell"><span>地图经验</span><strong id="snap-score">--</strong></div>
      <div class="snapshot-cell" style="grid-column:1/-1"><span>切图模式</span><strong id="snap-mode">个人地图模式</strong><span class="bait-hint" id="hint-mode" style="margin-left:4px;">?</span></div>
    </div>
    <div class="switches" id="switches"></div>
    <div class="section" data-section="priority" data-collapsed="false">
      <div class="section-heading" data-accordion><strong>换图优先级</strong></div>
      <div class="section-body">
        <div class="switch-item"><span>船队模式（船长/舵手自动开船）</span><input type="checkbox" id="sw-autoPartyTravel"></div>
        <div class="switch-item"><span>排除地图专精加成</span><input type="checkbox" id="sw-excludeMasteryBonus"></div>
        <div class="switch-item"><span>排除公会增益</span><input type="checkbox" id="sw-excludeGuildBoost"></div>
        <ol class="priority-list" id="priority-list"></ol>
      </div>
    </div>
    <div class="section" data-section="buff" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动购买 Buff</strong><span style="margin-left:6px;font-size:11px;color:var(--as-muted);">每天气独立配置</span></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动购买</span><input type="checkbox" id="sw-autoBuyBuffs"></div>
        <div id="buff-tabs" style="display:flex;flex-wrap:wrap;gap:2px;padding:4px 12px;border-top:1px solid var(--as-divider);"></div>
        <div id="buff-ctr" style="padding:4px 12px 8px;"></div>
      </div>
    </div>
    <div class="section" data-section="bait" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动切换鱼饵</strong><span style="margin-left:6px;font-size:11px;color:var(--as-muted);">按场景选饵，切图时自动切换</span></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动鱼饵</span><input type="checkbox" id="sw-autoBait"></div>
        <div class="switch-item"><span>没库存时主动购买100个 <span class="bait-hint" id="hint-baitAutoBuy">?</span></span><input type="checkbox" id="sw-baitAutoBuy"></div>
        <div class="switch-item"><span>买不起时自动降级 <span class="bait-hint" id="hint-baitFallback">?</span></span><input type="checkbox" id="sw-baitFallback"></div>
        <div id="bait-scene-ctr" style="padding:0 12px 8px"></div>
      </div>
    </div>
    <div class="section" data-section="stats" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动加点/洗点</strong></div>
      <div class="section-body" id="stats-section-body"></div>
    </div>
    </div><!-- /view-settings -->
    <div id="view-log" style="display:none">
      <div id="log-entries" style="overflow-y:auto;padding:4px 8px;font-family:monospace;font-size:11px;line-height:1.65;height:calc(100vh - 132px)"></div>
      <div style="display:flex;gap:6px;padding:6px 8px;border-top:1px solid var(--as-divider);flex-shrink:0">
        <button id="btn-export-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer" title="导出为 .txt 文件，上限 100MB">导出</button>
        <button id="btn-clear-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-muted);cursor:pointer" title="清空面板日志缓存">清空</button>
        <button id="btn-pause-log" type="button" style="font-size:11px;padding:3px 10px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-control);color:var(--as-text);cursor:pointer" title="暂停自动滚动到底部">⏸ 暂停</button>
        <span id="log-size-hint" style="font-size:10px;color:var(--as-muted);margin-left:auto;align-self:center"></span>
      </div>
    </div>
  </div>
</aside>`;

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
        spanA.append(document.createTextNode('升级自动加点'), hintA, statSel);
        const cbAlloc = document.createElement('input'); cbAlloc.type = 'checkbox'; cbAlloc.id = 'sw-autoAllocateStats'; cbAlloc.checked = !!settings.autoAllocateStats;
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
            row.appendChild(cb); ctr.appendChild(row);
        })();
        // 赛后分配方案下拉栏
        (()=>{
            const row = document.createElement('label'); row.className = 'switch-item';
            const span = document.createElement('span'); span.style.whiteSpace = 'nowrap';
            const sel = document.createElement('select');
            sel.style.cssText = 'width:130px;height:22px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;';
            const statName = STAT_LABELS[settings.statAllocationTarget] || '智力';
            const opts = [['',statName]];
            if (settings.statAllocationTarget !== 'strength') {
                opts.push(['str1700','力1700+'+statName],['str3800','力3800+'+statName],['str5400','力5400+'+statName]);
            }
            for (const [v, t] of opts) {
                const o = document.createElement('option'); o.value = v; o.textContent = t;
                if (settings.respecPostMode === v) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => { settings.respecPostMode = sel.value; saveSettings(); checkRespecStart(); });
            const hintP = makeHint('比赛结束后按此方案重新分配属性'); hintP.style.margin = '0 4px';
            span.append(document.createTextNode('赛后加点方案'), hintP, sel);
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
            row.appendChild(cb); ctr.appendChild(row);
        })();
    }

    function switchView(mode) {
        if (!shadowRoot) return;
        settings.viewMode = mode; saveSettings();
        const vs = shadowRoot.getElementById('view-settings');
        const vl = shadowRoot.getElementById('view-log');
        const btn = shadowRoot.getElementById('btn-tab-switch');
        const icon = shadowRoot.getElementById('tab-icon');
        const label = shadowRoot.getElementById('tab-label');
        const title = shadowRoot.getElementById('panel-title');
        if (mode === 'log') {
            if (vs) vs.style.display = 'none';
            if (vl) vl.style.display = 'block';
            if (title) title.textContent = '运行日志';
            renderLogView();
            if (icon) icon.textContent = '⚙';
            if (label) label.textContent = '设置';
            if (btn) { btn.title = '返回设置面板'; btn.setAttribute('aria-label','返回设置'); }
        } else {
            if (vs) vs.style.display = '';
            if (vl) vl.style.display = 'none';
            if (title) title.textContent = '奥术摸鱼大师';
            if (icon) icon.textContent = '📋';
            if (label) label.textContent = '日志';
            if (btn) { btn.title = '查看运行日志'; btn.setAttribute('aria-label','运行日志'); }
        }
    }
    function renderLogView() {
        if (!shadowRoot) return;
        if (settings.viewMode !== 'log') return;  // 非日志视图不浪费渲染
        const container = shadowRoot.getElementById('log-entries');
        const hint = shadowRoot.getElementById('log-size-hint');
        if (!container) return;
        const LOG_LIMIT = 100 * 1024 * 1024; // 100MB 导出上限
        const bytes = state.logBufferBytes;
        const buf = state.logBuffer;
        // 只渲染尾部 500 条，保持 DOM 轻量
        const slice = buf.length > 500 ? buf.slice(-500) : buf;
        container.innerHTML = slice.map(e => {
            const c = e.color || (e.level === 'error' ? '#dc2626' : e.level === 'warn' ? '#d97706' : 'var(--as-text)');
            const tagHtml = e.tag ? `<span class="log-tag" style="color:${c};font-weight:700">[${e.tag}]</span> ` : '';
            return `<div class="log-line"><span class="log-time" style="color:${c}">${e.time}</span>${tagHtml}<span class="log-msg" style="color:${c}">${escHtml(e.msg)}</span></div>`;
        }).join('');
        if (!state.logPaused) requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
        if (hint) hint.textContent = buf.length + '条 · ' + formatBytes(bytes);
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
                    const uncheckOthers = (except) => { if (except !== 1) { settings.skipWitherTidePersonal = false; cb1.checked = false; } if (except !== 2) { settings.witherTideDipPersonal = false; cb2.checked = false; } if (except !== 3) { settings.dipPersonal = false; cb3.checked = false; } };
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
        if (settings.autoPartyTravel) settings.partyMapPriority = keys;
        else settings.mapPriority = keys;
        saveSettings(); renderPriorities(); if (state.appGame) makeDecision(state.appGame);
    }

    let draggedItem = null, draggedHandle = null;
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
                    if(this.checked) opt.querySelectorAll('input[data-product-id]').forEach(o=>{if(BUFF_CONFIG[o.dataset.productId]?.group===gid&&o!==this&&o.checked)o.checked=false;});
                    if(!settings.buffSelections[curTab]) settings.buffSelections[curTab] = {};
                    settings.buffSelections[curTab][pid] = this.checked;
                    saveSettings();
                });
                l.appendChild(cb); l.appendChild(document.createTextNode(`${cfg.name} (${cfg.price}遗物)`)); opt.appendChild(l);
            }
            gd.appendChild(opt); buffCtr.appendChild(gd);
        }
    }

    const HINTS = {
        respec: '比赛开始自动洗成全幸运（消耗10,000金币），结束后按赛后加点方案分配。属性已生效，页面显示需刷新才能看到最新数值',
        loadout: '1号放平时装备，2-4号放比赛用幸运装，下拉栏选择比赛用幸运装。比赛开始时切换到下拉栏指定装备，比赛结束后自动切回1号装备',
        baitAutoBuy: '鱼饵库存为0时，主动购买100个再装备。不是游戏自带的自动补充',
        baitFallback: '买不起或购买失败时，自动降级到低一级饵料，直到基础饵',
    };
    let tooltipEl = null;
    function showTooltip(e, text) {
        hideTooltip();
        tooltipEl = document.createElement('div'); tooltipEl.textContent = text;
        tooltipEl.style.cssText = 'position:fixed;z-index:2147483700;max-width:240px;padding:5px 8px;background:rgba(0,0,0,0.85);color:#fff;border-radius:6px;font-size:11px;line-height:1.5;pointer-events:none;white-space:pre-line;';
        document.body.appendChild(tooltipEl);
        const r = tooltipEl.getBoundingClientRect();
        let x = e.clientX + 10, y = e.clientY - r.height - 4;
        if (y < 4) y = e.clientY + 14;
        if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 10;
        tooltipEl.style.left = x + 'px'; tooltipEl.style.top = y + 'px';
    }
    function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }
    document.addEventListener('click', hideTooltip);
    // 通用问号工厂：传入描述文本，返回带好悬浮/点击事件的 ? 元素
    function makeHint(desc) {
        const h = document.createElement('span'); h.className = 'bait-hint'; h.textContent = '?';
        h.style.cssText = 'cursor:help;margin-left:2px';
        h.addEventListener('mouseenter', e => showTooltip(e, desc));
        h.addEventListener('click', e => { e.stopPropagation(); hideTooltip(); showTooltip(e, desc); });
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
                    // 球 → 面板：保存球位置，恢复到面板位置
                    settings.ballRight = window.innerWidth - r.right; settings.ballTop = r.top;
                    if (settings.dockRight >= 0) applyDockPos(settings.dockRight, settings.dockTop);
                } else {
                    // 面板 → 球：保存面板位置，恢复到球位置
                    settings.dockRight = window.innerWidth - r.right; settings.dockTop = r.top;
                    if (settings.ballRight >= 0) applyDockPos(settings.ballRight, settings.ballTop);
                }
                settings.isPanelCollapsed = !settings.isPanelCollapsed;
                updateCollapseUI();
                saveSettings();
            });
        }

        // 开关——即时保存生效
        renderSwitches();
        renderStatsSection();
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

        // 每次刷新自动展开面板
        if (settings.isPanelCollapsed) { settings.isPanelCollapsed = false; saveSettings(); }

        // 恢复保存的位置
        // 恢复上次位置：面板和球各自独立
        if (settings.isPanelCollapsed && settings.ballRight >= 0 && dock) applyDockPos(settings.ballRight, settings.ballTop);
        else if (!settings.isPanelCollapsed && settings.dockRight >= 0 && dock) applyDockPos(settings.dockRight, settings.dockTop);
        else if (dock) { settings.dockRight = 16; settings.dockTop = 16; settings.ballRight = 16; settings.ballTop = window.innerHeight - 64; applyDockPos(16, 16); }

        // Tab 切换
        const btnSwitch = shadowRoot.getElementById('btn-tab-switch');
        if (btnSwitch) btnSwitch.addEventListener('click', () => switchView(settings.viewMode === 'log' ? 'settings' : 'log'));
        if (settings.viewMode === 'log') switchView('log');

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
                if (bytes + line.length > EXPORT_MAX) break;
                text = line + text; bytes += line.length;
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

        // 拖动面板（setPointerCapture，Shadow DOM 内可靠）
        const header = shadowRoot.querySelector('.panel-header');
        if (header && dock) {
            let dragDSX, dragDSY, dragDSR, dragDST, dragMoved, dragPtrId;
            header.addEventListener('pointerdown', (e) => {
                if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest('button')) return;
                dragMoved = false; dragPtrId = e.pointerId;
                dragDSX = e.clientX; dragDSY = e.clientY;
                const r = dock.getBoundingClientRect();
                dragDSR = window.innerWidth - r.right; dragDST = r.top;
                dock.style.transition = 'none';
            });
            header.addEventListener('pointermove', (e) => {
                if (dragPtrId !== e.pointerId) return;
                const dx = e.clientX - dragDSX, dy = e.clientY - dragDSY;
                if (!dragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                if (!dragMoved) { dragMoved = true; header.setPointerCapture(e.pointerId); }
                dock.style.right = Math.max(0, dragDSR - dx) + 'px';
                dock.style.top = Math.min(window.innerHeight - 52, Math.max(0, dragDST + dy)) + 'px';
            });
            header.addEventListener('pointerup', (e) => {
                if (dragPtrId !== e.pointerId) return;
                if (dragMoved) header.releasePointerCapture(e.pointerId);
                dragPtrId = null; dock.style.transition = '';
                if (dragMoved) {
                    const r = dock.getBoundingClientRect();
                    const rr = window.innerWidth - r.right, tt = r.top;
                    if (settings.isPanelCollapsed) { settings.ballRight = rr; settings.ballTop = tt; }
                    else { settings.dockRight = rr; settings.dockTop = tt; }
                    saveSettings();
                }
            });
        }

        // 面板展开时，点击外部自动折叠
        document.addEventListener('click', (e) => {
            if (!dock || dock.dataset.collapsed === 'true' || !host) return;
            if (!e.composedPath().includes(host)) {
                const r2 = dock.getBoundingClientRect();
                settings.dockRight = window.innerWidth - r2.right; settings.dockTop = r2.top;
                if (settings.ballRight >= 0) applyDockPos(settings.ballRight, settings.ballTop);
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
        const comps = cur.activeCompetitions || [];
        if (comps.some(c => c.kind === 'personal')) return 'personalCompetition';
        if (comps.some(c => c.kind === 'guild')) return 'guildCompetition';
        if (cur.weather?.id === 'gilded_current') return 'golden';
        if (cur.weather?.id === 'arcane_surge') return 'arcaneSurge';
        return 'normal';
    }

    async function refreshBaitData() {
        try { const r = await apiFetch('/api/baits'); if (r.baits) updateState({ baitCache: r.baits }); }
        catch(e) { L.bait(`获取饵料数据失败: ${e.message}`); }
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
                applyPostRespec();
                if (resetDipIfEnded(oldScene) && state.appGame) makeDecision(state.appGame);
                if (settings.autoLoadout) switchLoadout(1);
            }
            // 鱼饵切换
            if (settings.autoBait) { L.bait(`场景变化: ${oldScene} → ${scene}`); evaluateBait(); }
        }
        updateState({ lastBaitScene: scene });
    }
    // 降级检测：系统强制切到基础饵
    function checkBaitFallback() {
        if (!settings.autoBait || !settings.baitFallback) return;
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        const configuredId = settings.baitByScene?.[scene]; if (!configuredId) return;
        const currentBait = snap.baits?.find(b => b.isSelected);
        if (currentBait?.id === 'bait_basic' && configuredId !== 'bait_basic') {
            OpLog.info('鱼饵', '检测到基础饵，尝试切回');
            trySwitchBait(configuredId, scene);
        }
    }

    const STAT_LABELS = { strength:'力量', intelligence:'智力', luck:'运气', endurance:'耐力' };
    async function autoAllocateStats() {
        if (!settings.autoAllocateStats) return;
        if (!settings.statAllocationTarget) return;
        if (state.statAllocateInProgress || state.respecInProgress) return;
        if (state.unspentStatPoints <= 0) return;
        // 比赛期间 → 全加幸运；赛后 → 按用户设置的属性
        const target = (onAnyCompMap() && (settings.autoRespecPersonal || settings.autoRespecGuild)) ? 'luck' : settings.statAllocationTarget;
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
    let _currentLoadout = settings.autoLoadout ? settings.loadoutSlot : 1; // 启动时假设已在比赛配装（如果开关开着）或1号
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
        if (state.playerGold < RESPEC_COST) { OpLog.warn('洗点', label + '金币不足'); return; }
        if (!state.playerStats) { L.spc('等待属性数据'); return; }
        state.respecInProgress = true;
        try {
            OpLog.info('洗点', label + '开始 → 全加幸运');
            const resetR = await apiFetch('/api/player/stats/reset', { method:'POST', idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(resetR);
            const totalPts = resetR.player?.unspentStatPoints ?? 0;
            const body = { strength: 0, intelligence: 0, luck: Math.max(0, totalPts - INIT_ENDURANCE), endurance: INIT_ENDURANCE };
            const allocR = await apiFetch('/api/player/stats/allocate', { method:'POST', body, idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(allocR);
            respecLock.record(RESPEC_COST);
            OpLog.info('洗点', '✅ ' + label + '洗点完成: 全加幸运 运' + body.luck + ' 耐' + INIT_ENDURANCE);
        } catch(e) {
            OpLog.error('洗点', label + '失败: ' + e.message);
        } finally { updateState({ respecInProgress: false }); }
    }

    async function applyPostRespec() {
        if (state.respecInProgress || !state.playerStats) return;
        const _rg = respecLock.check(RESPEC_COST); if (_rg.blocked) { OpLog.warn('洗点', '安全锁拦截: ' + _rg.reason); return; }
        if (state.playerGold < RESPEC_COST) { OpLog.warn('洗点', '金币不足，跳过赛后分配'); return; }
        const mode = settings.respecPostMode;
        state.respecInProgress = true;
        try {
            const targetStr = RESPEC_STRENGTHS[mode] || 0;
            const targetStat = settings.statAllocationTarget;
            const label = targetStr > 0 ? `总计力${targetStr}+其余${STAT_LABELS[targetStat]||targetStat}` : `全${STAT_LABELS[targetStat]||'自动'}`;
            OpLog.info('洗点', '赛后分配 → ' + label);
            const preStats = state.playerStats;
            const resetR = await apiFetch('/api/player/stats/reset', { method:'POST', idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(resetR);
            const totalPts = resetR.player?.unspentStatPoints ?? 0;
            const body = { strength: 0, intelligence: 0, luck: 0, endurance: INIT_ENDURANCE };
            if (targetStr > 0) {
                const flatBonus = resetR.player?.stats?.total?.strength || 0;
                const mult = preStats.base?.strength > 0 ? ((preStats.total?.strength || 0) - flatBonus) / preStats.base.strength : 1;
                body.strength = Math.max(0, Math.min(Math.round((targetStr - flatBonus) / mult), totalPts - INIT_ENDURANCE));
            }
            const remain = totalPts - body.strength - INIT_ENDURANCE;
            if (remain > 0) body[targetStat] = remain;
            const allocR = await apiFetch('/api/player/stats/allocate', { method:'POST', body, idempotencyKey: crypto.randomUUID() });
            syncPlayerStats(allocR);
            respecLock.record(RESPEC_COST);
            if (settings.autoLoadout) switchLoadout(1);
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
    // 活跃比赛 + 人在比赛地图
    function shouldActForComp(kind) { return isCompetitionActive(kind) && isOnCompetitionMap(kind); }
    function onAnyCompMap() { return shouldActForComp('personal') || shouldActForComp('guild'); }
    function statsMatchPostRespec() {
        const b = state.playerStats?.base, t = state.playerStats?.total;
        if (!b || !t) return true;
        const mode = settings.respecPostMode;
        const targetStr = RESPEC_STRENGTHS[mode] || 0;
        const targetStat = settings.statAllocationTarget;
        // 力量目标不达标 → 不匹配
        if (targetStr > 0 && t.strength < targetStr) return false;
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
        // 目标属性必须有值
        if (targetStat && targetStat !== 'strength' && !b[targetStat]) return false;
        return true;
    }
    function checkRespecStart() {
        const anyEnabled = respecEnabled('personal') || respecEnabled('guild');
        if (!anyEnabled) return;
        // 比赛数据未就绪 → 等 competition:updated 事件再判断
        if (respecEnabled('personal') && !state.competitionCache.personal) { L.spc('洗点检查: 个人赛数据未就绪，等待'); return; }
        if (respecEnabled('guild') && !state.competitionCache.guild) { L.spc('洗点检查: 公会赛数据未就绪，等待'); return; }
        const personalActive = isCompetitionActive('personal');
        const guildActive = isCompetitionActive('guild');
        L.spc(`洗点检查: 个人赛=${personalActive} 公会赛=${guildActive} 在赛图=${onAnyCompMap()}`);
        if (personalActive || guildActive) {
            if (!onAnyCompMap()) { L.spc('洗点检查: 赛程活跃但不在比赛地图，跳过'); return; }
            const b = state.playerStats?.base;
            if (b && b.strength === 0 && b.intelligence === 0 && b.luck > 0 && b.endurance <= 100) { L.spc('洗点检查: 已在全运状态，跳过'); return; }
            if (personalActive && respecEnabled('personal')) doRespec('personal');
            if (guildActive && respecEnabled('guild')) doRespec('guild');
            if (settings.autoLoadout) switchLoadout(settings.loadoutSlot);
            return;
        }
        // 无比赛：重置蹭奖 + 属性不匹配赛后方案则补洗
        let dipReset = false;
        if (state._witherDipDone) { state._witherDipDone = false; dipReset = true; L.map('枯潮蹭奖: 比赛结束，重置'); }
        if (state._dipDone) { state._dipDone = false; dipReset = true; L.map('个人赛蹭奖: 比赛结束，重置'); }
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

            game.on('weather:changed', ({biomeId,previous,current}) => { updateState({currentWeatherId:current.id}); updatePanelInfo(game.getSnapshot()); if (state.paused) return; if(settings.autoBuyBuffs)checkAndBuyBuffs(); if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); });
            game.on('competition:started', ({competition}) => { dismissCompetitionReminder(); if (state.paused) return; if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); if(isOnCompetitionMap(competition.kind)){ doRespec(competition.kind); if(settings.autoLoadout)switchLoadout(settings.loadoutSlot); } });
            game.on('guild-boost:started', () => { updatePanelInfo(game.getSnapshot()); if (state.paused) return; if(settings.autoSwitchMap)makeDecision(game); });
            game.on('guild-boost:ended', () => { updatePanelInfo(game.getSnapshot()); });

            // 定时刷新面板信息
            const panelTimer = setInterval(() => { if (state.appGame) { const s = state.appGame.getSnapshot(); updatePanelInfo(s); updateModeStatus(s); renderBaitControls(s); if (!state.paused) checkBaitScene(); } }, 5000);
            onTeardown(() => clearInterval(panelTimer));

            window.switchToBiome = async (biomeId) => { if(!biomeId)return warn('缺少biomeId'); try{await game.biomes.travelTo(biomeId);updateState({lastSwitchTime:Date.now()});}catch(err){error('切换失败:',err);} };
            window.checkBuffs = checkAndBuyBuffs;

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

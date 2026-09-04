// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.3.4
// @description  自动地图切换、补满、报名个人赛、涌潮买buff、每日签到、弹窗处理、属性自动分配
// @author       deepseek & yy
// @match        https://reelax.abang666.com/*
// @match        https://reelax.cn/*
// @grant        none
// @run-at       document-end
// @icon         https://reelax.abang666.com/branding/arcane-reelax-favicon-64.png
// @license      MIT
// @downloadURL none
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 1. 常量与配置
    // ============================================================

    const STORAGE_KEY = 'arcane_auto_settings';

    const DEFAULTS = {
        autoRefill: true, autoSwitchMap: true, autoGuild: true, autoPersonal: true,
        autoRegisterPersonal: true, autoBuyBuffs: false, debugLog: false,
        buffSelections: {}, triggerWeathers: [],
        autoCheckIn: true, autoDismissCompetition: true, autoDismissOffline: true,
        mapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold'],
        designatedBiomeId: '', partyDesignatedBiomeId: '', isPanelCollapsed: false, dockRight: -1, dockBottom: -1,
        autoBait: false, baitByScene: {}, baitFallback: true, baitAutoBuy: true,
        autoPartyTravel: false, partyMapPriority: ['competition', 'designated', 'goldwind', 'experience', 'gold'],
        autoAllocateStats: false, statAllocationTarget: 'intelligence',
        sectionCollapsed: {},
    };

    const BUFF_CONFIG = {
        'relic-xp-i': { productId: 'relic-xp-i', name: '经验 +30%', price: 75, group: 'experience' },
        'relic-xp-ii': { productId: 'relic-xp-ii', name: '经验 +75%', price: 150, group: 'experience' },
        'relic-strength-i': { productId: 'relic-strength-i', name: '力量 +10%', price: 75, group: 'strength' },
        'relic-strength-ii': { productId: 'relic-strength-ii', name: '力量 +25%', price: 150, group: 'strength' },
        'relic-luck-i': { productId: 'relic-luck-i', name: '运气 +10%', price: 75, group: 'luck' },
        'relic-luck-ii': { productId: 'relic-luck-ii', name: '运气 +25%', price: 150, group: 'luck' },
        'fragment-personal-xp': { productId: 'fragment-personal-xp', name: '碎光顿悟 +25%经验', price: 20, group: 'fragment', currency: 'fragments' },
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
        registeredPersonalIds: new Set(), lastSwitchTime: 0, refillInterval: null,
        playerRelics: 0, playerFragments: 0, currentWeatherId: '', buffExpiryCache: new Map(),
        buffCheckInProgress: false,
        domObserver: null, domObserverThrottle: 0,
        unspentStatPoints: 0, statAllocateInProgress: false,
        baitCache: null,
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
                if (Array.isArray(s.triggerWeathers) && s.triggerWeathers.length)
                    s.triggerWeathers = s.triggerWeathers.map(w => WEATHER_NAME_TO_ID[w]||w).filter(w => WEATHER_ID_TO_NAME[w]);
                return { ...DEFAULTS, ...s };
            }
        } catch(e) {}
        return { ...DEFAULTS };
    }
    function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(e) {} }
    function log(...a) { if (settings.debugLog) console.log(...a); }
    function warn(...a) { console.warn('%c[辅助脚本]','color:#ef4444;font-weight:bold',...a); }
    function error(...a) { console.error('%c[辅助脚本]','color:#dc2626;font-weight:bold',...a); }
    // 按功能模块自动加前缀：const L = logger('切图'); L('消息'); → [AutoSwitch|切图] 消息
    function logger(tag, color) { const style=`color:${color};font-weight:bold`; return (...a)=>{ if(settings.debugLog) console.log(`%c[${tag}] ${a.join(' ')}`,style); }; }
    const L = { map:logger('切图','#4a9eff'), reg:logger('报名','#4ade80'), buff:logger('Buff','#f59e0b'), bait:logger('鱼饵','#fbbf24'), fetch:logger('拦截','#9ca3af'), event:logger('事件','#c084fc'), cfg:logger('设置','#2dd4bf'), dlg:logger('弹窗','#f472b6'), refill:logger('补杆','#a78bfa'), init:logger('主程序','#64748b') };

    function calculateTotalExpBonus(b) {
        let t = 0;
        if (b.weather && typeof b.weather.experienceBonusBasisPoints === 'number') t += b.weather.experienceBonusBasisPoints;
        if (typeof b.masteryExperienceBonusBasisPoints === 'number') t += b.masteryExperienceBonusBasisPoints;
        if (b.guildBoost && typeof b.guildBoost.experienceBonusBasisPoints === 'number') t += b.guildBoost.experienceBonusBasisPoints;
        return t;
    }
    function formatBasisPoints(bp) { const p = (bp/100).toFixed(1); return `${bp>=0?'+':''}${p}%`; }
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
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
    }
    function waitForGameAPI() {
        return new Promise(resolve => {
            if (window.arcaneReelax) { resolve(window.arcaneReelax); return; }
            (function c() { if (window.arcaneReelax) resolve(window.arcaneReelax); else setTimeout(c, 100); })();
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
                state.registeredPersonalIds.add(c.id); L.reg(`✅ #${c.sequence} 报名成功`);
            } catch(err) { L.reg(`报名失败: ${err.message}`); }
        }
    }

    function getCompetitionTarget(unlocked, now) {
        if (!settings.autoSwitchMap) return null;
        const cand = [];
        const add = (c) => { const s = new Date(c.startAt).getTime(); if (now >= s-300000 && now <= new Date(c.endAt).getTime()) cand.push({biomeId:c.biomeId,startAt:s}); };
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

    function makeDecision(game) {
        if (!settings.autoSwitchMap) { L.map('autoSwitchMap 已关闭'); return; }
        const snap = game.getSnapshot(); if (!snap?.biomes) { L.map('快照无数据'); return; }
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
        let dataPending = false;
        for (const pt of priority) {
            if (target) break;
            switch(pt) {
            case 'competition': {
                if (!compOk) { L.map(`→ competition: 开关未启用`); break; }
                if (!hasCompData) { L.map(`→ competition: 数据未就绪，待定`); dataPending = true; break; }
                const ct = getCompetitionTarget(unlocked, now);
                if (ct) { target=ct; tt='🏁 比赛'; L.map(`→ competition: ✅ ${ct.name||ct.biomeId}`); }
                else L.map(`→ competition: 无报名比赛`);
                break;
            }
            case 'designated': { const bid = partyMode ? settings.partyDesignatedBiomeId : settings.designatedBiomeId; if (bid) { const b = unlocked.find(u => u.id===bid); if (b) { target=b; tt='🎯 指定图'; L.map(`→ designated: ✅ ${b.name}`); } else L.map(`→ designated: ${bid} 未解锁`); } else L.map(`→ designated: 未指定`); break; }
            case 'goldwind': { const g = unlocked.filter(b => b.weather?.id==='gilded_current'); if (g.length) { target=g.reduce((a,b)=>a.id>b.id?a:b); tt='💰 金风'; L.map(`→ goldwind: ✅ ${g.length}张`); } else L.map(`→ goldwind: 无`); break; }
            case 'experience': { const nid=(x)=>parseInt(x.id.replace(/\D/g,''),10)||0; unlocked.sort((a,b)=>calculateTotalExpBonus(b)-calculateTotalExpBonus(a)||nid(b)-nid(a)); target=unlocked[0]; tt='📈 经验'; L.map(`→ experience: ✅ ${target.name} (${formatBasisPoints(calculateTotalExpBonus(target))})`); break; }
            case 'gold': { target=unlocked.reduce((a,b)=>a.id>b.id?a:b); tt='🪙 金币'; L.map(`→ gold: 兜底 ${target.name}`); break; }
            }
        }
        if (!target) { L.map('无目标'); return; }
        if (dataPending) { L.map(`数据未就绪，放弃 (目标=${target.name})`); return; }
        if (target.id === currentId) { L.map(`已在目标 ${target.name}`); return; }
        L.map(`🔄 切换${partyMode?'(船队)':''} ${tt}: ${currentId} → ${target.id}`);
        const travel = partyMode ? game.party.travelTo(target.id) : game.biomes.travelTo(target.id);
        travel.then(()=>{ updateState({lastSwitchTime:now}); evaluateBait(); }).catch(err=>error('切换失败:',err.message));
    }

    function startRefill() {
        stopRefill(); if (!settings.autoRefill) return;
        const g = state.appGame || window.arcaneReelax;
        if (!g?.fishing?.refill) return;
        state.refillInterval = setInterval(async () => { try { await g.fishing.refill(); } catch(e){} }, 60000);
        onTeardown(()=>stopRefill());
    }
    function stopRefill() { if (state.refillInterval) { clearInterval(state.refillInterval); state.refillInterval = null; } }

    async function checkAndBuyBuffs() {
        if (!settings.autoBuyBuffs) return;
        if (!settings.triggerWeathers?.length) { warn('[Buff] 未选择触发天气'); return; }
        if (!settings.triggerWeathers.includes(state.currentWeatherId)) { L.buff(`天气 ${state.currentWeatherId||'未知'} 不匹配`); return; }
        if (state.buffCheckInProgress) return;
        const sel = Object.keys(settings.buffSelections||{}).filter(k=>settings.buffSelections[k]); if (!sel.length) { L.buff('未选择具体Buff类型'); return; }
        // 分别检查遗物和碎片余额
        const relicBuffs = sel.filter(k => !BUFF_CONFIG[k]?.currency);
        const fragmentBuffs = sel.filter(k => BUFF_CONFIG[k]?.currency === 'fragments');
        const minRelic = relicBuffs.length ? Math.min(...relicBuffs.map(k=>BUFF_CONFIG[k]?.price??Infinity)) : Infinity;
        const minFrag = fragmentBuffs.length ? Math.min(...fragmentBuffs.map(k=>BUFF_CONFIG[k]?.price??Infinity)) : Infinity;
        if (relicBuffs.length && state.playerRelics < minRelic) { L.buff(`遗物不足 (${state.playerRelics} < ${minRelic})`); }
        if (fragmentBuffs.length && state.playerFragments < minFrag) { L.buff(`碎片不足 (${state.playerFragments} < ${minFrag})`); }
        if ((relicBuffs.length && state.playerRelics < minRelic) || (fragmentBuffs.length && state.playerFragments < minFrag)) return;
        state.buffCheckInProgress = true;
        try {
            const now = Date.now();
            const needC = sel.filter(k=>{const e=state.buffExpiryCache.get(k); return !e||new Date(e).getTime()<=now;});
            if (!needC.length) { L.buff('缓存命中，跳过'); return; }
            L.buff(`缓存不足 (${needC.length})，调shop API`);
            let shop; try { shop = await apiFetch('/api/shop?tab=relic&page=1&limit=8&queuePage=1&queueLimit=8'); } catch(e) { return; }
            if (shop.personalBuffs) { for (const b of shop.personalBuffs) if (b.productId&&b.endsAt) state.buffExpiryCache.set(b.productId,b.endsAt); for (const k of sel) if (!state.buffExpiryCache.has(k)) state.buffExpiryCache.set(k,null); }
            if (shop.balances?.relics!==undefined) updateState({playerRelics:shop.balances.relics});
            if (shop.balances?.fragments!==undefined) updateState({playerFragments:shop.balances.fragments});
            const needB = sel.filter(k=>{const e=state.buffExpiryCache.get(k); return !e||new Date(e).getTime()<=now;});
            if (!needB.length) { L.buff('验算后已激活，无需购买'); return; }
            for (const k of needB) {
                const cfg = BUFF_CONFIG[k]; if (!cfg) continue;
                const balance = cfg.currency === 'fragments' ? state.playerFragments : state.playerRelics;
                if (balance < cfg.price) { L.buff(`余额不足 (${balance} < ${cfg.price})，跳过 ${cfg.name}`); continue; }
                try {
                    const r = await apiFetch('/api/shop/purchases', { method:'POST', idempotencyKey:generateIdempotencyKey(`buy-${k}`), body:{productId:k} });
                    if (r.balances?.relics!==undefined) updateState({playerRelics:r.balances.relics});
                    if (r.balances?.fragments!==undefined) updateState({playerFragments:r.balances.fragments});
                    if (r.personalBuff?.endsAt) state.buffExpiryCache.set(k, r.personalBuff.endsAt);
                } catch(e) {}
            }
        } finally { updateState({buffCheckInProgress:false}); }
    }

    function handleDailyCheckIn() {
        if (!settings.autoCheckIn) return;
        const d = document.querySelector('dialog.daily-check-in-dialog'); if (!d) return;
        const b = d.querySelector('button.daily-check-in-claim-button'); if (!b) return;
        if (!b.disabled && b.textContent.includes('领取')) { b.click(); return; }
        const c = d.querySelector('button[aria-label="关闭每日签到"]'); if (c) c.click();
    }
    function handleCompetitionPopup() {
        if (!settings.autoDismissCompetition) return;
        const d = document.querySelector('.competition-reminder-dialog'); if (!d) return;
        const b = d.querySelector('button.secondary-button'); if (b&&!b.disabled) b.click();
    }
    function handleOfflineSummary() {
        if (!settings.autoDismissOffline) return;
        const d = document.querySelector('dialog.offline-summary-dialog'); if (!d) return;
        const p = d.querySelector('footer button.primary-button'); if (p&&!p.disabled) { p.click(); return; }
        const s = d.querySelector('footer button.secondary-button'); if (s&&!s.disabled) { s.click(); return; }
        const c = d.querySelector('header button[aria-label*="关闭"]'); if (c&&!c.disabled) { c.click(); return; }
        try{d.close()}catch(_){}
    }
    function checkAllDialogs() { handleDailyCheckIn(); handleCompetitionPopup(); handleOfflineSummary(); }
    function startDomObserver() { stopDomObserver(); checkAllDialogs(); state.domObserver = new MutationObserver(()=>{ const n=Date.now(); if(n-state.domObserverThrottle<1000)return; updateState({domObserverThrottle:n}); checkAllDialogs(); }); state.domObserver.observe(document.body,{childList:true,subtree:true}); onTeardown(()=>stopDomObserver()); }
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
                if(d.playerPatch?.unspentStatPoints!==undefined){ const prev2=state.unspentStatPoints; updateState({unspentStatPoints:d.playerPatch.unspentStatPoints}); if(d.playerPatch.unspentStatPoints>0&&d.playerPatch.unspentStatPoints!==prev2)autoAllocateStats(); }
                bus.emit('fishing:updated',d);
            }
        } catch(e){ warn('拦截器异常:', e.message); }
        return resp;
    };
    onTeardown(()=>{window.fetch=originalFetch;});
    bus.on('competition:updated', async ()=>{
        L.event('competition:updated → 报名+切图');
        await autoRegisterPersonal();
        if(state.appGame){ makeDecision(state.appGame); evaluateBait(); }
    });
    bus.on('fishing:updated', ()=>{
        if(!settings.autoBuyBuffs && !settings.autoBait && !settings.autoAllocateStats) return;
        const g=state.appGame||window.arcaneReelax;if(!g)return;
        try{const s=g.getSnapshot();if(s?.biomes){const c=s.biomes.find(b=>b.isCurrent);if(c?.weather)updateState({currentWeatherId:c.weather.id});}}catch(_){}
        if(settings.autoBuyBuffs){ L.event(`fishing:updated → Buff (relics=${state.playerRelics}, weather=${state.currentWeatherId||'?'})`); checkAndBuyBuffs(); }
        if(settings.autoBait) checkBaitFallback();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
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
        L.cfg(`应用: refill=${settings.autoRefill} map=${settings.autoSwitchMap} checkIn=${settings.autoCheckIn} comp=${settings.autoDismissCompetition} offline=${settings.autoDismissOffline} buff=${settings.autoBuyBuffs} reg=${settings.autoRegisterPersonal} allocStats=${settings.autoAllocateStats}`);
        settings.autoRefill?startRefill():stopRefill();
        if(settings.autoSwitchMap&&state.appGame)makeDecision(state.appGame);
        (settings.autoCheckIn||settings.autoDismissCompetition||settings.autoDismissOffline)?startDomObserver():stopDomObserver();
        if(settings.autoBuyBuffs && state.playerRelics > 0) checkAndBuyBuffs();
        if(settings.autoAllocateStats && state.unspentStatPoints > 0) autoAllocateStats();
    }
    function resetAllSettings() { settings={...DEFAULTS};saveSettings();const p=shadowRoot?.getElementById('script-panel-host');if(p)syncUIFromSettings();applySettings(); }
    function syncUIFromSettings() {
        if (!shadowRoot) return;
        for (const item of SETTING_SCHEMA) { const cb = shadowRoot.getElementById('sw-'+item.key); if (cb) cb.checked = !!settings[item.key]; }
        const swAB = shadowRoot.getElementById('sw-autoBuyBuffs'); if (swAB) swAB.checked = !!settings.autoBuyBuffs;
        const autoG = shadowRoot.getElementById('sw-autoGuild'), autoP = shadowRoot.getElementById('sw-autoPersonal');
        const compOk = (autoG?.checked??settings.autoGuild) || (autoP?.checked??settings.autoPersonal);
        const list = shadowRoot.getElementById('priority-list'); if (list) renderPriorityList();
        const wCtr = shadowRoot.getElementById('weather-ctr'); if (wCtr) renderWeatherCheckboxes(wCtr);
        const bCtr = shadowRoot.getElementById('buff-ctr'); if (bCtr) renderBuffCheckboxes(bCtr);
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
  .dock{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483600;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:hidden;border:1px solid var(--as-border);border-radius:6px;background:var(--as-surface);box-shadow:0 12px 32px var(--as-shadow);}
  .dock[data-collapsed="true"]{width:48px;height:48px;}
  .dock[data-collapsed="true"] .panel-body,.dock[data-collapsed="true"] .identity{display:none;}
  .dock[data-collapsed="true"] .panel-header{min-height:46px;height:46px;justify-content:center;padding:0;border-bottom:0;}
  .dock[data-collapsed="true"] .icon-button{width:46px;height:46px;}
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
  .panel-body{display:grid;max-height:calc(100vh - 76px);overflow-y:auto;overscroll-behavior:contain;}
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
</style>
<aside class="dock" data-collapsed="false" aria-label="奥术摸鱼大师">
  <header class="panel-header">
    <div class="identity"><span class="float-mark" aria-hidden="true"></span><span class="identity-copy"><strong>奥术摸鱼大师</strong><small id="headline">等待游戏快照</small></span></div>
    <button class="icon-button" id="collapse" type="button" title="拖动标题栏可移动面板" aria-label="收起面板" aria-expanded="true"><span class="collapse-glyph">−</span></button>
  </header>
  <div class="panel-body">
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
        <ol class="priority-list" id="priority-list"></ol>
      </div>
    </div>
    <div class="section" data-section="buff" data-collapsed="true">
      <div class="section-heading" data-accordion><strong>自动购买 Buff</strong><span style="margin-left:6px;font-size:11px;color:var(--as-muted);">每组只能选一个</span></div>
      <div class="section-body">
        <div class="switch-item"><span>启用自动购买</span><input type="checkbox" id="sw-autoBuyBuffs"></div>
        <div class="weather-ctr" id="weather-ctr"></div>
        <div id="buff-ctr"></div>
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
  </div>
</aside>`;

    function renderSwitches() {
        if (!shadowRoot) return;
        const ctr = shadowRoot.getElementById('switches'); if (!ctr) return;
        ctr.innerHTML = '';
        const allButLast = SETTING_SCHEMA.slice(0, -1);
        const lastItem = SETTING_SCHEMA[SETTING_SCHEMA.length - 1];
        for (const item of allButLast) {
            const row = document.createElement('label'); row.className = 'switch-item';
            row.innerHTML = `<span>${item.label}</span>`;
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'sw-' + item.key; cb.checked = !!settings[item.key];
            cb.addEventListener('change', function() {
                if (this.id === 'sw-autoGuild' || this.id === 'sw-autoPersonal') renderPriorities();
            });
            row.appendChild(cb); ctr.appendChild(row);
        }
        // 属性分配行（和调试日志并排，结构对齐其他开关）
        const attrRow = document.createElement('label'); attrRow.className = 'switch-item';
        const statSel = document.createElement('select');
        statSel.id = 'sel-statTarget';
        statSel.style.cssText = 'width:56px;height:22px;margin-left:4px;border:1px solid var(--as-border);border-radius:3px;background:var(--as-raised);color:var(--as-text);font:inherit;font-size:11px;';
        for (const [val, label] of Object.entries(STAT_LABELS)) {
            const o = document.createElement('option'); o.value = val; o.textContent = label; if (val === settings.statAllocationTarget) o.selected = true;
            statSel.appendChild(o);
        }
        statSel.addEventListener('change', () => { settings.statAllocationTarget = statSel.value; saveSettings(); });
        const span = document.createElement('span');
        span.style.whiteSpace = 'nowrap';
        span.append(document.createTextNode('自动加点'), statSel);
        const cbAlloc = document.createElement('input');
        cbAlloc.type = 'checkbox'; cbAlloc.id = 'sw-autoAllocateStats'; cbAlloc.checked = !!settings.autoAllocateStats;
        attrRow.appendChild(span);
        attrRow.appendChild(cbAlloc);
        ctr.appendChild(attrRow);
        // 最后一项（调试日志）
        if (lastItem) {
            const row = document.createElement('label'); row.className = 'switch-item';
            row.innerHTML = `<span>${lastItem.label}</span>`;
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'sw-' + lastItem.key; cb.checked = !!settings[lastItem.key];
            row.appendChild(cb); ctr.appendChild(row);
        }
    }

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

    function renderWeatherCheckboxes(container) {
        if (!container) return;
        container.innerHTML = '';
        for (const [wid, wname] of Object.entries(WEATHER_ID_TO_NAME)) {
            const l = document.createElement('label');
            const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=(settings.triggerWeathers||[]).includes(wid); cb.dataset.weather=wid;
            cb.addEventListener('change', () => { settings.triggerWeathers = [...container.querySelectorAll('input[data-weather]:checked')].map(c=>c.dataset.weather); saveSettings(); applySettings(); });
            l.appendChild(cb); l.appendChild(document.createTextNode(wname)); container.appendChild(l);
        }
    }
    function renderBuffCheckboxes(container) {
        if (!container) return;
        container.innerHTML = '';
        for (const [gid, grp] of Object.entries(BUFF_GROUPS)) {
            const gd = document.createElement('div'); gd.className = 'buff-group';
            gd.innerHTML = `<div class="buff-group-title">${grp.label}</div>`;
            const opt = document.createElement('div'); opt.className = 'buff-options';
            for (const pid of grp.options) {
                const cfg = BUFF_CONFIG[pid]; if (!cfg) continue;
                const l = document.createElement('label');
                const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=!!(settings.buffSelections&&settings.buffSelections[pid]); cb.dataset.productId=pid;
                cb.addEventListener('change', function() { if(this.checked) container.querySelectorAll('input[data-product-id]').forEach(o=>{if(BUFF_CONFIG[o.dataset.productId]?.group===gid&&o!==this&&o.checked)o.checked=false;}); if(!settings.buffSelections)settings.buffSelections={}; settings.buffSelections[pid] = this.checked; saveSettings(); applySettings(); });
                l.appendChild(cb); l.appendChild(document.createTextNode(`${cfg.name} (${cfg.price}遗物)`)); opt.appendChild(l);
            }
            gd.appendChild(opt); container.appendChild(gd);
        }
    }

    let tooltipEl = null;
    function showTooltip(e, text) {
        hideTooltip();
        tooltipEl = document.createElement('div'); tooltipEl.textContent = text;
        tooltipEl.style.cssText = 'position:fixed;z-index:2147483700;max-width:220px;padding:5px 8px;background:rgba(0,0,0,0.85);color:#fff;border-radius:6px;font-size:11px;line-height:1.4;pointer-events:none;';
        document.body.appendChild(tooltipEl);
        const r = tooltipEl.getBoundingClientRect();
        let x = e.clientX + 10, y = e.clientY - r.height - 4;
        if (y < 4) y = e.clientY + 14;
        if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 10;
        tooltipEl.style.left = x + 'px'; tooltipEl.style.top = y + 'px';
    }
    function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }

    function attachUI() {
        const host = document.createElement('div'); host.id = 'script-panel-host';
        shadowRoot = host.attachShadow({ mode: 'open' });
        shadowRoot.innerHTML = PANEL_HTML;
        document.documentElement.appendChild(host);

        const dock = shadowRoot.querySelector('.dock');
        const collapse = shadowRoot.getElementById('collapse');
        // 折叠
        if (dock && collapse) {
            const glyph = collapse.querySelector('.collapse-glyph');
            collapse.addEventListener('click', () => {
                settings.isPanelCollapsed = !settings.isPanelCollapsed;
                dock.dataset.collapsed = String(settings.isPanelCollapsed);
                collapse.setAttribute('aria-expanded', String(!settings.isPanelCollapsed));
                collapse.title = settings.isPanelCollapsed ? '点击展开辅助脚本设置' : '拖动标题栏可移动面板';
                if (glyph) glyph.textContent = settings.isPanelCollapsed ? '+' : '−';
                saveSettings();
            });
        }

        // 开关——即时保存生效
        renderSwitches();
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
        if (hintAutoBuy) { hintAutoBuy.addEventListener('mouseenter', (e) => showTooltip(e, '鱼饵库存为0时，主动购买100个再装备。不是游戏自带的自动补充')); hintAutoBuy.addEventListener('mouseleave', hideTooltip); }
        const hintFallback = shadowRoot.getElementById('hint-baitFallback');
        if (hintFallback) { hintFallback.addEventListener('mouseenter', (e) => showTooltip(e, '买不起或购买失败时，自动降级到低一级饵料，直到基础饵')); hintFallback.addEventListener('mouseleave', hideTooltip); }
        renderBaitControls(null);

        // Buff——同步初始状态
        const swAutoBuy = shadowRoot.getElementById('sw-autoBuyBuffs');
        if (swAutoBuy) swAutoBuy.checked = !!settings.autoBuyBuffs;
        const wCtr = shadowRoot.getElementById('weather-ctr'); if (wCtr) renderWeatherCheckboxes(wCtr);
        const bCtr = shadowRoot.getElementById('buff-ctr'); if (bCtr) renderBuffCheckboxes(bCtr);

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

        // 初始状态
        if (settings.isPanelCollapsed && dock) { dock.dataset.collapsed = 'true'; if (collapse) { collapse.querySelector('.collapse-glyph').textContent = '+'; collapse.title = '点击展开辅助脚本设置'; } }

        // 恢复保存的位置
        if (settings.dockRight >= 0 && dock) { dock.style.right = settings.dockRight + 'px'; dock.style.bottom = settings.dockBottom + 'px'; }

        // 拖动面板（setPointerCapture，Shadow DOM 内可靠）
        const header = shadowRoot.querySelector('.panel-header');
        if (header && dock) {
            let dragDSX, dragDSY, dragDSR, dragDSB, dragMoved, dragPtrId;
            header.addEventListener('pointerdown', (e) => {
                if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest('button')) return;
                dragMoved = false; dragPtrId = e.pointerId;
                dragDSX = e.clientX; dragDSY = e.clientY;
                const r = dock.getBoundingClientRect();
                dragDSR = window.innerWidth - r.right; dragDSB = window.innerHeight - r.bottom;
                dock.style.transition = 'none';
            });
            header.addEventListener('pointermove', (e) => {
                if (dragPtrId !== e.pointerId) return;
                const dx = e.clientX - dragDSX, dy = e.clientY - dragDSY;
                if (!dragMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
                if (!dragMoved) { dragMoved = true; header.setPointerCapture(e.pointerId); }
                dock.style.right = Math.max(0, dragDSR - dx) + 'px';
                dock.style.bottom = Math.max(0, dragDSB - dy) + 'px';
            });
            header.addEventListener('pointerup', (e) => {
                if (dragPtrId !== e.pointerId) return;
                if (dragMoved) header.releasePointerCapture(e.pointerId);
                dragPtrId = null; dock.style.transition = '';
                if (dragMoved) {
                    const r = dock.getBoundingClientRect();
                    settings.dockRight = window.innerWidth - r.right; settings.dockBottom = window.innerHeight - r.bottom;
                    saveSettings();
                }
            });
        }

        // 面板展开时，点击外部自动折叠
        document.addEventListener('click', (e) => {
            if (!dock || dock.dataset.collapsed === 'true' || !host) return;
            if (!e.composedPath().includes(host)) {
                dock.dataset.collapsed = 'true';
                settings.isPanelCollapsed = true;
                if (collapse) { collapse.setAttribute('aria-expanded', 'false'); collapse.querySelector('.collapse-glyph').textContent = '+'; }
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
                try { await game.fishing.selectBait(tryId); L.bait(`切换: ${tryBait.name} (${sceneLabel})`); }
                catch(e) { L.bait(`装备失败: ${e.message}`); return; }
                if (tryId !== targetId) { settings.baitByScene[scene] = tryId; saveSettings(); }
                renderBaitControls(game.getSnapshot());
                return;
            }
            // 没库存且是基础饵 → 不需要买，直接切
            if (tryId === 'bait_basic') {
                try { await game.fishing.selectBait('bait_basic'); L.bait(`切换基础饵 (${sceneLabel})`); }
                catch(e) { L.bait(`基础饵失败: ${e.message}`); return; }
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
                    L.bait(`购买+切换: ${tryBait.name} (${sceneLabel})`);
                    if (tryId !== targetId) { settings.baitByScene[scene] = tryId; saveSettings(); }
                    renderBaitControls(game.getSnapshot());
                    return;
                } catch(e) { L.bait(`买不起 ${tryBait.name}，继续降级`); }
            } else {
                L.bait(`${tryBait.name} 无库存且未开启自动购买，继续降级`);
            }
        }
        L.bait('所有等级均不可用');
    }

    async function evaluateBait() {
        if (!settings.autoBait) return;
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        const baitId = settings.baitByScene?.[scene]; if (!baitId) return;
        await trySwitchBait(baitId, scene);
    }

    // 定期检测是否被系统强制切到基础饵（钓着钓着没钱了）
    function checkBaitFallback() {
        if (!settings.autoBait || !settings.baitFallback) return;
        const game = state.appGame || window.arcaneReelax; if (!game) return;
        const snap = game.getSnapshot(); if (!snap) return;
        const scene = getBaitScene(snap); if (!scene) return;
        const configuredId = settings.baitByScene?.[scene]; if (!configuredId) return;
        const currentBait = snap.baits?.find(b => b.isSelected);
        // 系统强制切到基础饵，且配置的饵不是基础饵 → 触发降级链
        if (currentBait?.id === 'bait_basic' && configuredId !== 'bait_basic') {
            L.bait('检测到系统强制切回基础饵，触发降级链');
            trySwitchBait(configuredId, scene);
        }
    }

    const STAT_LABELS = { strength:'力量', intelligence:'智力', luck:'运气', endurance:'耐力' };
    async function autoAllocateStats() {
        if (!settings.autoAllocateStats) return;
        if (!settings.statAllocationTarget) return;
        if (state.statAllocateInProgress) return;
        if (state.unspentStatPoints <= 0) return;
        const pts = state.unspentStatPoints;
        state.statAllocateInProgress = true;
        try {
            const body = { strength:0, intelligence:0, luck:0, endurance:0 };
            body[settings.statAllocationTarget] = pts;
            const r = await apiFetch('/api/player/stats/allocate', {
                method:'POST', body,
                idempotencyKey: crypto.randomUUID(),
            });
            if (r.player?.unspentStatPoints !== undefined) {
                updateState({ unspentStatPoints: r.player.unspentStatPoints });
                console.log(`%c[加点]%c ✅ 自动分配 ${pts} 点 → ${STAT_LABELS[settings.statAllocationTarget]||settings.statAllocationTarget}`,'color:#f59e0b;font-weight:bold','');
            }
        } catch(e) {
            console.error(`%c[加点]%c 分配失败: ${e.message}`,'color:#f59e0b;font-weight:bold','');
        } finally { updateState({ statAllocateInProgress: false }); }
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
        if (hint) { hint.onmouseenter = (e) => showTooltip(e, tipText); hint.onmouseleave = hideTooltip; }
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

            game.on('weather:changed', ({biomeId,previous,current}) => { updateState({currentWeatherId:current.id}); if(settings.autoBuyBuffs)checkAndBuyBuffs(); if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); updatePanelInfo(game.getSnapshot()); });
            game.on('competition:started', () => { if(settings.autoSwitchMap)makeDecision(game); evaluateBait(); });
            game.on('guild-boost:started', () => { if(settings.autoSwitchMap)makeDecision(game); updatePanelInfo(game.getSnapshot()); });
            game.on('guild-boost:ended', () => { updatePanelInfo(game.getSnapshot()); });

            // 定时刷新面板信息
            setInterval(() => { if (state.appGame) { const s = state.appGame.getSnapshot(); updatePanelInfo(s); updateModeStatus(s); renderBaitControls(s); } }, 5000);

            window.switchToBiome = async (biomeId) => { if(!biomeId)return warn('缺少biomeId'); try{await game.biomes.travelTo(biomeId);updateState({lastSwitchTime:Date.now()});}catch(err){error('切换失败:',err);} };
            window.checkBuffs = checkAndBuyBuffs;
            L.init('✅ 初始化完成');
        } catch (err) { error('初始化失败:', err); }
    }

    main();
})();

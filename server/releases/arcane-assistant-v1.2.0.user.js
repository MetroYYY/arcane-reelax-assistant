// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  自动切换地图、比赛优先、自动补充鱼竿、自动报名个人赛、涌潮自动买buff、每日签到、赛事/离线弹窗处理、断线重连，分组折叠UI，保存/重置
// @author       deepseek & yy
// @match        https://reelax.abang666.com/*
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
    const RECONNECT_IDLE_MS = 3 * 60 * 1000; // 断线重连阈值：3 分钟无 fishing sync 即刷页面

    const DEFAULTS = {
        autoRefill: true,
        autoSwitchMap: true,
        autoGuild: true,
        autoPersonal: true,
        autoRegisterPersonal: true,
        autoBuyBuffs: false,
        debugLog: false,
        buffSelections: {},
        triggerWeathers: [],
        autoCheckIn: true,
        autoDismissCompetition: true,
        autoReconnect: true,
        autoDismissOffline: true,
    };

    const BUFF_CONFIG = {
        'relic-xp-i': { productId: 'relic-xp-i', name: '经验 +30%', price: 75, group: 'experience', groupLabel: '经验加成' },
        'relic-xp-ii': { productId: 'relic-xp-ii', name: '经验 +75%', price: 150, group: 'experience', groupLabel: '经验加成' },
        'relic-strength-i': { productId: 'relic-strength-i', name: '力量 +10%', price: 75, group: 'strength', groupLabel: '力量加成' },
        'relic-strength-ii': { productId: 'relic-strength-ii', name: '力量 +25%', price: 150, group: 'strength', groupLabel: '力量加成' },
        'relic-luck-i': { productId: 'relic-luck-i', name: '运气 +10%', price: 75, group: 'luck', groupLabel: '运气加成' },
        'relic-luck-ii': { productId: 'relic-luck-ii', name: '运气 +25%', price: 150, group: 'luck', groupLabel: '运气加成' },
    };

    const BUFF_GROUPS = {
        experience: { label: '经验加成', options: ['relic-xp-i', 'relic-xp-ii'] },
        strength: { label: '力量加成', options: ['relic-strength-i', 'relic-strength-ii'] },
        luck: { label: '运气加成', options: ['relic-luck-i', 'relic-luck-ii'] },
    };

    const WEATHER_ID_TO_NAME = {
        'clear': '晴朗', 'rain': '雨幕', 'gale': '强风', 'mist': '浓雾',
        'heatwave': '热浪', 'tempest': '雷暴', 'wither_tide': '枯潮',
        'gilded_current': '金风', 'arcane_surge': '奥秘涌流',
    };
    const WEATHER_NAME_TO_ID = Object.fromEntries(
        Object.entries(WEATHER_ID_TO_NAME).map(([id, name]) => [name, id])
    );

    // 设置项注册表 — 驱动 UI 渲染、保存、重置（仅 checkbox 型设置）
    // 新增 checkbox 设置只需在此数组加一行，UI/保存/重置 自动生效
    const SETTING_SCHEMA = [
        { key: 'autoRefill', label: '自动补充鱼竿' },
        { key: 'autoSwitchMap', label: '自动切换地图' },
        { key: 'autoGuild', label: '自动进公会赛' },
        { key: 'autoPersonal', label: '自动进个人赛' },
        { key: 'autoRegisterPersonal', label: '自动报名个人赛' },
        { key: 'autoCheckIn', label: '每日签到自动领取' },
        { key: 'autoDismissCompetition', label: '赛事弹窗自动稍后处理' },
        { key: 'autoDismissOffline', label: '离线结算弹窗自动处理' },
        { key: 'autoReconnect', label: '断线自动重连（3 分钟无活动刷新）' },
        { key: 'debugLog', label: '调试日志' },
    ];

    // ============================================================
    // 2. 全局状态（所有可变状态集中管理，updateState 统一入口）
    // ============================================================

    const state = {
        appGame: null,
        competitionCache: { personal: null, guild: null },
        registeredPersonalIds: new Set(),
        lastSwitchTime: 0,
        refillInterval: null,
        playerRelics: 0,
        currentWeatherId: '',
        buffExpiryCache: new Map(),
        buffCheckInProgress: false,
        lastActivityTime: null,
        reconnectTimer: null,
        domObserver: null,
        domObserverThrottle: 0,
    };

    function updateState(patch) {
        Object.assign(state, patch);
    }

    // ============================================================
    // 3. 事件总线（解耦 fetch 拦截器与业务逻辑）
    // ============================================================

    const bus = (() => {
        const handlers = {};
        return {
            on(event, handler) {
                (handlers[event] || (handlers[event] = [])).push(handler);
            },
            emit(event, data) {
                (handlers[event] || []).forEach(h => { try { h(data); } catch (e) { error('[bus]', event, e); } });
            },
        };
    })();

    // ============================================================
    // 4. Teardown 管理（所有需要清理的资源统一注册）
    // ============================================================

    const teardowns = [];
    function onTeardown(fn) { teardowns.push(fn); }
    function runTeardowns() {
        while (teardowns.length) { try { teardowns.pop()(); } catch (e) { error('[teardown]', e); } }
    }

    // ============================================================
    // 5. 通用工具
    // ============================================================

    let settings = loadSettings();

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                if (Array.isArray(saved.triggerWeathers) && saved.triggerWeathers.length > 0) {
                    saved.triggerWeathers = saved.triggerWeathers.map(w =>
                        WEATHER_NAME_TO_ID[w] || w
                    ).filter(w => WEATHER_ID_TO_NAME[w]);
                }
                return { ...DEFAULTS, ...saved };
            }
        } catch (e) {}
        return { ...DEFAULTS };
    }

    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
    }

    function log(...args)   { if (settings.debugLog) console.log('[AutoSwitch]', ...args); }
    function warn(...args)  { console.warn('[AutoSwitch]', ...args); }
    function error(...args) { console.error('[AutoSwitch]', ...args); }

    function calculateTotalExpBonus(biome) {
        let total = 0;
        if (biome.weather && typeof biome.weather.experienceBonusBasisPoints === 'number')
            total += biome.weather.experienceBonusBasisPoints;
        if (typeof biome.masteryExperienceBonusBasisPoints === 'number')
            total += biome.masteryExperienceBonusBasisPoints;
        if (biome.guildBoost && typeof biome.guildBoost.experienceBonusBasisPoints === 'number')
            total += biome.guildBoost.experienceBonusBasisPoints;
        return total;
    }

    function formatBasisPoints(bp) {
        const pct = (bp / 100).toFixed(1);
        return `${bp >= 0 ? '+' : ''}${pct}%`;
    }

    function generateIdempotencyKey(prefix, deterministicSuffix) {
        if (deterministicSuffix) return `${prefix}-${deterministicSuffix}`;
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    function waitForGameAPI() {
        return new Promise((resolve) => {
            if (window.arcaneReelax) { resolve(window.arcaneReelax); return; }
            const check = () => {
                if (window.arcaneReelax) resolve(window.arcaneReelax);
                else setTimeout(check, 100);
            };
            check();
        });
    }

    function waitForNav() {
        return new Promise((resolve) => {
            if (document.querySelector('.primary-nav .nav-group')) { resolve(); return; }
            let attempts = 0;
            const check = () => {
                if (document.querySelector('.primary-nav .nav-group')) { resolve(); return; }
                if (++attempts >= 100) { warn('导航栏未在时限内出现'); resolve(); return; }
                setTimeout(check, 100);
            };
            check();
        });
    }

    // ============================================================
    // 6. 业务逻辑
    // ============================================================

    // ---- 6.1 自动报名个人赛 ----
    async function autoRegisterPersonal() {
        if (!settings.autoRegisterPersonal) return;
        const personal = state.competitionCache.personal;
        if (!personal) return;

        const candidates = [];
        if (personal.current && personal.current.canRegister && !personal.current.isRegistered)
            candidates.push(personal.current);
        if (personal.upcoming) {
            for (const comp of personal.upcoming)
                if (comp.canRegister && !comp.isRegistered && comp.status === 'scheduled')
                    candidates.push(comp);
        }
        if (candidates.length === 0) { log('没有可报名的个人赛'); return; }

        candidates.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
        for (const comp of candidates) {
            if (state.registeredPersonalIds.has(comp.id)) continue;
            try {
                const key = generateIdempotencyKey('register', comp.id);
                log(`尝试自动报名个人赛 #${comp.sequence}`);
                const resp = await fetch(`/api/tournaments/${comp.id}/register`, {
                    method: 'POST', credentials: 'include',
                    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
                    body: JSON.stringify({}),
                });
                if (resp.ok) {
                    state.registeredPersonalIds.add(comp.id);
                    log(`✅ 个人赛 #${comp.sequence} 报名成功`);
                } else {
                    const text = await resp.text();
                    log(`❌ 个人赛 #${comp.sequence} 报名失败 (${resp.status}): ${text.slice(0, 200)}`);
                }
            } catch (err) { log(`报名个人赛出错: ${err.message}`); }
        }
    }

    // ---- 6.2 获取比赛目标 ----
    function getCompetitionTarget(unlocked, now) {
        if (!settings.autoSwitchMap) return null;
        const candidates = [];
        const addCandidate = (comp) => {
            const start = new Date(comp.startAt).getTime();
            if (now >= start - 300000 && now <= new Date(comp.endAt).getTime())
                candidates.push({ biomeId: comp.biomeId, startAt: start });
        };

        if (settings.autoPersonal && state.competitionCache.personal) {
            const p = state.competitionCache.personal;
            if (p.current?.isRegistered) addCandidate(p.current);
            if (p.upcoming) for (const c of p.upcoming) if (c.isRegistered) { addCandidate(c); break; }
        }
        if (settings.autoGuild && state.competitionCache.guild) {
            const g = state.competitionCache.guild;
            if (g.current?.entryStatus === 'registered') addCandidate(g.current);
            if (g.upcoming) for (const c of g.upcoming) if (c.entryStatus === 'registered') { addCandidate(c); break; }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.startAt - b.startAt);
        return unlocked.find(b => b.id === candidates[0].biomeId && b.isUnlocked) || null;
    }

    // ---- 6.3 核心决策与切换 ----
    function makeDecision(game) {
        if (!settings.autoSwitchMap) return;
        const snapshot = game.getSnapshot();
        if (!snapshot || !snapshot.biomes || !Array.isArray(snapshot.biomes)) return;

        const unlocked = snapshot.biomes.filter(b => b.isUnlocked);
        if (unlocked.length === 0) { log('没有已解锁地图'); return; }

        const now = Date.now();
        let target = null, targetType = '';

        // 1) 比赛优先
        const compTarget = getCompetitionTarget(unlocked, now);
        if (compTarget) { target = compTarget; targetType = '🏁 比赛'; log(`比赛优先 → ${target.name}`); }

        // 2) 奥秘涌流
        if (!target) {
            const surge = unlocked.filter(b => b.weather?.id === 'arcane_surge');
            if (surge.length > 0) {
                target = surge.reduce((a, b) => a.id > b.id ? a : b);
                targetType = '🌊 奥秘涌流'; log(`奥秘涌流 → ${target.name}`);
            }
        }

        // 3) 金风
        if (!target) {
            const gold = unlocked.filter(b => b.weather?.id === 'gilded_current');
            if (gold.length > 0) {
                target = gold.reduce((a, b) => a.id > b.id ? a : b);
                targetType = '💰 金风'; log(`金风 → ${target.name}`);
            }
        }

        // 4) 最高经验
        if (!target) {
            unlocked.sort((a, b) => calculateTotalExpBonus(b) - calculateTotalExpBonus(a) || (b.id > a.id ? 1 : -1));
            target = unlocked[0];
            targetType = '📈 最高经验';
            log(`最高经验 → ${target.name} 加成: ${formatBasisPoints(calculateTotalExpBonus(target))}`);
        }

        if (!target) { log('无合适目标'); return; }
        if (target.id === snapshot.currentBiomeId) { log('已在目标地图'); return; }
        if (now - state.lastSwitchTime < 60000) { log('切换冷却中'); return; }

        log(`🔄 切换 ${targetType}: ${snapshot.currentBiomeId} → ${target.id}`);
        game.biomes.travelTo(target.id)
            .then(() => { log(`✅ 已切换至 ${target.name}`); updateState({ lastSwitchTime: now }); })
            .catch(err => error(`❌ 切换失败: ${err.message || err}`));
    }

    // ---- 6.4 自动补充鱼竿 ----
    function startRefill() {
        stopRefill();
        if (!settings.autoRefill) return;
        state.refillInterval = setInterval(() => {
            const btn = document.querySelector('.topbar-fishing-status');
            if (btn && !btn.disabled) { btn.click(); if (settings.debugLog) log('已点击补充按钮'); }
        }, 60000);
        onTeardown(() => stopRefill());
        log('自动补充鱼竿已启动');
    }

    function stopRefill() {
        if (state.refillInterval) { clearInterval(state.refillInterval); state.refillInterval = null; }
    }

    // ---- 6.5 自动购买 Buff ----
    async function checkAndBuyBuffs() {
        if (state.buffCheckInProgress) return;
        if (!settings.autoBuyBuffs) return;
        if (!settings.triggerWeathers?.length) return;
        if (!settings.triggerWeathers.includes(state.currentWeatherId)) return;

        const selectedIds = Object.keys(settings.buffSelections || {}).filter(id => settings.buffSelections[id]);
        if (selectedIds.length === 0) return;

        const minPrice = Math.min(...selectedIds.map(id => BUFF_CONFIG[id]?.price ?? Infinity));
        if (state.playerRelics < minPrice) { log(`遗物不足 (${state.playerRelics} < ${minPrice})`); return; }

        state.buffCheckInProgress = true;
        try {
            // 第一轮：缓存检查
            const now = Date.now();
            const needConfirm = selectedIds.filter(id => {
                const end = state.buffExpiryCache.get(id);
                return !end || new Date(end).getTime() <= now;
            });

            if (needConfirm.length === 0) { log('所有 Buff 均在有效期内（缓存命中）'); return; }

            // 第二轮：缓存不足 → shop API 验算
            log(`缓存不足，${needConfirm.length} 个 Buff 需确认，调用 shop API`);
            let shopResp;
            try {
                shopResp = await fetch('/api/shop?tab=relic&page=1&limit=8&queuePage=1&queueLimit=8', {
                    credentials: 'include', headers: { 'Accept': 'application/json' },
                });
            } catch (err) { log(`获取 shop 数据失败: ${err.message}`); return; }
            if (!shopResp.ok) { log(`获取 shop 数据失败: ${shopResp.status}`); return; }

            const shopData = await shopResp.json();
            if (shopData.personalBuffs) {
                for (const b of shopData.personalBuffs) {
                    if (b.productId && b.endsAt) state.buffExpiryCache.set(b.productId, b.endsAt);
                }
                for (const id of selectedIds)
                    if (!state.buffExpiryCache.has(id)) state.buffExpiryCache.set(id, null);
                log('shop 数据已更新缓存');
            }
            if (shopData.balances?.relics !== undefined) updateState({ playerRelics: shopData.balances.relics });

            // 第三轮：最终确定需要购买的
            const needBuy = selectedIds.filter(id => {
                const end = state.buffExpiryCache.get(id);
                return !end || new Date(end).getTime() <= now;
            });

            if (needBuy.length === 0) { log('验算后所有 Buff 已激活'); return; }

            for (const id of needBuy) {
                const cfg = BUFF_CONFIG[id];
                if (!cfg) continue;
                if (state.playerRelics < cfg.price) { log(`遗物不足，跳过 ${cfg.name}`); continue; }
                try {
                    const key = generateIdempotencyKey(`buy-${id}`);
                    log(`尝试购买 ${cfg.name} (${id}), ${cfg.price} 遗物`);
                    const resp = await fetch('/api/shop/purchases', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
                        body: JSON.stringify({ productId: id }),
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        if (result.balances?.relics !== undefined) updateState({ playerRelics: result.balances.relics });
                        if (result.personalBuff?.endsAt) {
                            state.buffExpiryCache.set(id, result.personalBuff.endsAt);
                            log(`✅ 已购买 ${cfg.name}，到期: ${result.personalBuff.endsAt}`);
                        } else {
                            log(`✅ 已购买 ${cfg.name}（未获取到期时间）`);
                        }
                    } else {
                        const text = await resp.text();
                        log(`❌ 购买失败 ${cfg.name} (${resp.status}): ${text.slice(0, 200)}`);
                    }
                } catch (err) { log(`购买 ${cfg.name} 出错: ${err.message}`); }
            }
        } finally {
            updateState({ buffCheckInProgress: false });
        }
    }

    // ---- 6.6 DOM 弹窗处理（共用单个 MutationObserver） ----
    function handleDailyCheckIn() {
        if (!settings.autoCheckIn) return;
        const dialog = document.querySelector('dialog.daily-check-in-dialog');
        if (!dialog) return;
        const btn = dialog.querySelector('button.daily-check-in-claim-button');
        if (!btn) return;
        // 可领取 → 点击领取
        if (!btn.disabled && btn.textContent.includes('领取')) {
            btn.click();
            log('每日签到已自动领取');
            return;
        }
        // 已领取或不可领取 → 关闭弹窗
        const closeBtn = dialog.querySelector('button[aria-label="关闭每日签到"]');
        if (closeBtn) { closeBtn.click(); log('签到弹窗已自动关闭（已领取）'); }
    }

    function handleCompetitionPopup() {
        if (!settings.autoDismissCompetition) return;
        const dialog = document.querySelector('.competition-reminder-dialog');
        if (!dialog) return;
        const btn = dialog.querySelector('button.secondary-button');
        if (!btn || btn.disabled) return;
        btn.click();
        log('赛事弹窗已自动稍后处理');
    }

    function handleOfflineSummary() {
        if (!settings.autoDismissOffline) return;
        const dialog = document.querySelector('dialog.offline-summary-dialog');
        if (!dialog) return;
        const primary = dialog.querySelector('footer button.primary-button');
        if (primary && !primary.disabled) { primary.click(); log('离线结算 → 继续去钓鱼'); return; }
        const secondary = dialog.querySelector('footer button.secondary-button');
        if (secondary && !secondary.disabled) { secondary.click(); log('离线结算 → 完成'); return; }
        const closeBtn = dialog.querySelector('header button[aria-label*="关闭"]');
        if (closeBtn && !closeBtn.disabled) { closeBtn.click(); log('离线结算 → 关闭'); return; }
        try { dialog.close(); } catch (_) {}
    }

    function checkAllDialogs() {
        handleDailyCheckIn();
        handleCompetitionPopup();
        handleOfflineSummary();
    }

    function startDomObserver() {
        stopDomObserver();
        checkAllDialogs();
        state.domObserver = new MutationObserver(() => {
            const now = Date.now();
            if (now - state.domObserverThrottle < 1000) return;
            updateState({ domObserverThrottle: now });
            checkAllDialogs();
        });
        state.domObserver.observe(document.body, { childList: true, subtree: true });
        onTeardown(() => stopDomObserver());
        log('弹窗监听已启动（签到/赛事/离线结算）');
    }

    function stopDomObserver() {
        if (state.domObserver) { state.domObserver.disconnect(); state.domObserver = null; }
    }

    // ---- 6.7 断线自动重连 ----
    // 数据源：拦截游戏自带 POST /api/fishing/sync（每竿约 6 秒），不发额外网络请求
    // 巡检：客户端 setInterval 每 30 秒比对 lastActivityTime
    function startReconnectMonitor() {
        stopReconnectMonitor();
        if (!state.lastActivityTime) updateState({ lastActivityTime: Date.now() });
        log('断线重连已启动（阈值 3 分钟）');
        state.reconnectTimer = setInterval(() => {
            if (!state.lastActivityTime) return;
            if (Date.now() - state.lastActivityTime >= RECONNECT_IDLE_MS) {
                warn(`无活动超过 3 分钟，触发自动重连`);
                window.location.reload();
            }
        }, 30000);
        onTeardown(() => stopReconnectMonitor());
    }

    function stopReconnectMonitor() {
        if (state.reconnectTimer) { clearInterval(state.reconnectTimer); state.reconnectTimer = null; }
    }

    // ---- 6.8 拦截 fetch 响应（仅采集数据 + 发事件，不直接调用业务函数） ----
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : '';
        const response = await originalFetch.apply(this, args);

        if (!url) return response;

        try {
            if (url.includes('/api/tournaments/overview')) {
                const data = await response.clone().json();
                updateState({ competitionCache: { ...state.competitionCache, personal: data } });
                bus.emit('competition:updated');
            }

            if (url.includes('/api/guild-tournaments/overview')) {
                const data = await response.clone().json();
                updateState({ competitionCache: { ...state.competitionCache, guild: data } });
                bus.emit('competition:updated');
            }

            if (url.includes('/api/fishing/state') || url.includes('/api/fishing/sync')) {
                updateState({ lastActivityTime: Date.now() });
                const data = await response.clone().json();
                if (data.playerPatch?.relics !== undefined) updateState({ playerRelics: data.playerPatch.relics });
                bus.emit('fishing:updated', data);
            }
        } catch (_) { /* clone 失败不影响原始响应 */ }

        return response;
    };
    onTeardown(() => { window.fetch = originalFetch; });

    // ---- 6.9 事件订阅（业务逻辑订阅总线，与拦截器解耦） ----
    bus.on('competition:updated', async () => {
        await autoRegisterPersonal();
        if (state.appGame) makeDecision(state.appGame);
    });

    bus.on('fishing:updated', () => {
        if (!settings.autoBuyBuffs) return;
        const game = state.appGame || window.arcaneReelax;
        if (!game) return;
        try {
            const snapshot = game.getSnapshot();
            if (snapshot?.biomes) {
                const current = snapshot.biomes.find(b => b.isCurrent);
                if (current?.weather) updateState({ currentWeatherId: current.weather.id });
            }
        } catch (_) {}
        checkAndBuyBuffs();
    });

    // ---- 6.10 应用/重置设置 ----
    function applySettings() {
        // 鱼竿
        settings.autoRefill ? startRefill() : stopRefill();
        // 地图切换
        if (settings.autoSwitchMap && state.appGame) makeDecision(state.appGame);
        // DOM 弹窗
        (settings.autoCheckIn || settings.autoDismissCompetition || settings.autoDismissOffline)
            ? startDomObserver() : stopDomObserver();
        // 断线重连
        settings.autoReconnect ? startReconnectMonitor() : stopReconnectMonitor();
        log('设置已应用');
    }

    function resetAllSettings() {
        settings = { ...DEFAULTS };
        saveSettings();
        syncUIFromSettings();
        applySettings();
        log('已重置为默认配置');
    }

    /** 根据 settings 刷新 UI（schema checkbox + 天气 + buff） */
    function syncUIFromSettings() {
        const panel = document.getElementById('auto-settings-panel');
        if (!panel) return;
        // Schema checkboxes
        for (const item of SETTING_SCHEMA) {
            const cb = panel.querySelector(`input[data-key="${item.key}"]`);
            if (cb) cb.checked = !!settings[item.key];
        }
        // Weather checkboxes
        panel.querySelectorAll('input[data-weather]').forEach(cb => {
            cb.checked = (settings.triggerWeathers || []).includes(cb.dataset.weather);
        });
        // Buff checkboxes
        panel.querySelectorAll('input[data-product-id]').forEach(cb => {
            cb.checked = !!(settings.buffSelections && settings.buffSelections[cb.dataset.productId]);
        });
    }

    // ============================================================
    // 7. UI 设置面板
    // ============================================================

    let panelVisible = false;

    /** 创建 checkbox 元素（由 SETTING_SCHEMA 驱动） */
    function createSchemaCheckbox(item) {
        const wrapper = document.createElement('label');
        wrapper.style.cssText = 'display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!settings[item.key];
        cb.dataset.key = item.key;
        cb.style.marginRight = '8px';
        wrapper.appendChild(cb);
        wrapper.appendChild(document.createTextNode(item.label));
        return wrapper;
    }

    function createSettingsUI() {
        const panel = document.createElement('div');
        panel.id = 'auto-settings-panel';
        panel.style.cssText = `
            position: fixed; top: 60px; right: 20px; background: var(--surface, #fff);
            border: 1px solid var(--border, #ccc); border-radius: 8px; padding: 16px 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; min-width: 260px;
            max-height: 80vh; overflow-y: auto; color: var(--text, #333); font-size: 14px;
        `;

        const title = document.createElement('div');
        title.textContent = '⚙️ 辅助脚本设置';
        title.style.cssText = 'font-weight: bold; margin-bottom: 12px; font-size: 16px;';
        panel.appendChild(title);

        const list = document.createElement('div');

        // ---- Schema 驱动的 checkbox ----
        for (const item of SETTING_SCHEMA) {
            list.appendChild(createSchemaCheckbox(item));
        }

        // ---- 自动购买 Buff（复杂 UI，独立渲染） ----
        const buffDetails = document.createElement('details');
        buffDetails.style.cssText = 'margin: 4px 0;';

        const buffSummary = document.createElement('summary');
        buffSummary.textContent = '自动购买Buff';
        buffSummary.style.cssText = 'cursor: pointer; font-weight: 600; padding: 4px 0;';
        buffDetails.appendChild(buffSummary);

        const buffContent = document.createElement('div');
        buffContent.style.cssText = 'padding: 4px 0 4px 12px;';

        // Buff 总开关
        buffContent.appendChild(createSchemaCheckbox({ key: 'autoBuyBuffs', label: '自动购买Buff开关' }));

        // 触发天气选择
        const weatherDetails = document.createElement('details');
        weatherDetails.style.cssText = 'margin: 4px 0;';
        const weatherSummary = document.createElement('summary');
        weatherSummary.textContent = '选择触发天气';
        weatherSummary.style.cssText = 'cursor: pointer; font-weight: 500; font-size: 13px; color: var(--text-muted, #555);';
        weatherDetails.appendChild(weatherSummary);

        const weatherContent = document.createElement('div');
        weatherContent.style.cssText = 'padding: 6px 4px 4px 12px; display: flex; flex-wrap: wrap; gap: 6px;';
        for (const [weatherId, weatherName] of Object.entries(WEATHER_ID_TO_NAME)) {
            const label = document.createElement('label');
            label.style.cssText = 'display: inline-flex; align-items: center; cursor: pointer; font-size: 13px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = (settings.triggerWeathers || []).includes(weatherId);
            cb.dataset.weather = weatherId;
            cb.style.marginRight = '3px';
            label.appendChild(cb);
            label.appendChild(document.createTextNode(weatherName));
            weatherContent.appendChild(label);
        }
        weatherDetails.appendChild(weatherContent);
        buffContent.appendChild(weatherDetails);

        // Buff 选择（同组互斥）
        const buffSelectDetails = document.createElement('details');
        buffSelectDetails.style.cssText = 'margin: 4px 0;';
        const buffSelectSummary = document.createElement('summary');
        buffSelectSummary.textContent = '选择Buff';
        buffSelectSummary.style.cssText = 'cursor: pointer; font-weight: 500; font-size: 13px; color: var(--text-muted, #555);';
        buffSelectDetails.appendChild(buffSelectSummary);

        const buffSelectContent = document.createElement('div');
        buffSelectContent.style.cssText = 'padding: 6px 4px 4px 12px;';

        for (const [groupId, group] of Object.entries(BUFF_GROUPS)) {
            const gDiv = document.createElement('div');
            gDiv.style.cssText = 'margin-bottom: 6px; padding: 4px 6px; background: var(--surface-secondary, #f5f5f5); border-radius: 4px;';
            const gTitle = document.createElement('div');
            gTitle.textContent = group.label;
            gTitle.style.cssText = 'font-weight: 600; font-size: 13px;';
            gDiv.appendChild(gTitle);

            const optWrap = document.createElement('div');
            optWrap.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap;';
            for (const pid of group.options) {
                const config = BUFF_CONFIG[pid];
                if (!config) continue;
                const label = document.createElement('label');
                label.style.cssText = 'display: flex; align-items: center; cursor: pointer; font-size: 13px;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = !!(settings.buffSelections && settings.buffSelections[pid]);
                cb.dataset.productId = pid;
                cb.dataset.groupId = groupId;
                cb.style.marginRight = '4px';
                cb.addEventListener('change', function() {
                    if (this.checked) {
                        const p = document.getElementById('auto-settings-panel');
                        if (p) p.querySelectorAll(`input[data-group-id="${groupId}"]`).forEach(o => {
                            if (o !== this && o.checked) o.checked = false;
                        });
                    }
                });
                label.appendChild(cb);
                label.appendChild(document.createTextNode(`${config.name} (${config.price}遗物)`));
                optWrap.appendChild(label);
            }
            gDiv.appendChild(optWrap);
            buffSelectContent.appendChild(gDiv);
        }
        buffSelectDetails.appendChild(buffSelectContent);
        buffContent.appendChild(buffSelectDetails);

        buffDetails.appendChild(buffContent);
        list.appendChild(buffDetails);

        panel.appendChild(list);

        // ---- 保存 / 重置按钮 ----
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display: flex; gap: 10px; margin-top: 12px;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存';
        saveBtn.style.cssText = 'flex: 1; padding: 6px 12px; background: #2a8790; color: #fff; border: none; border-radius: 4px; cursor: pointer;';

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '重置';
        resetBtn.style.cssText = 'flex: 1; padding: 6px 12px; background: #e0e0e0; color: #333; border: none; border-radius: 4px; cursor: pointer;';

        btnWrap.appendChild(saveBtn);
        btnWrap.appendChild(resetBtn);
        panel.appendChild(btnWrap);

        // ---- 保存 ----
        saveBtn.addEventListener('click', () => {
            const p = document.getElementById('auto-settings-panel');
            if (!p) return;
            const newSettings = { ...settings };

            // Schema checkboxes
            for (const item of SETTING_SCHEMA) {
                const cb = p.querySelector(`input[data-key="${item.key}"]`);
                if (cb) newSettings[item.key] = cb.checked;
            }

            // Weather
            newSettings.triggerWeathers = [];
            p.querySelectorAll('input[data-weather]').forEach(cb => {
                if (cb.checked) newSettings.triggerWeathers.push(cb.dataset.weather);
            });

            // Buff
            if (!newSettings.buffSelections) newSettings.buffSelections = {};
            p.querySelectorAll('input[data-product-id]').forEach(cb => {
                newSettings.buffSelections[cb.dataset.productId] = cb.checked;
            });

            settings = newSettings;
            saveSettings();
            applySettings();
            log('设置已保存并应用');
        });

        // ---- 重置 ----
        resetBtn.addEventListener('click', () => resetAllSettings());

        // ---- 点击外部关闭 ----
        document.addEventListener('click', function closePanel(e) {
            if (panelVisible && !panel.contains(e.target) && e.target.id !== 'settings-toggle-btn') {
                panel.style.display = 'none';
                panelVisible = false;
            }
        });

        document.body.appendChild(panel);
        return panel;
    }

    function toggleSettingsPanel() {
        let panel = document.getElementById('auto-settings-panel');
        if (!panel) panel = createSettingsUI();
        panelVisible = panel.style.display !== 'block';
        panel.style.display = panelVisible ? 'block' : 'none';
    }

    // ---- 导航栏按钮 ----
    function insertSettingsButton() {
        const navGroups = document.querySelectorAll('.nav-group');
        let accountGroup = null;
        for (const g of navGroups) {
            if (g.querySelector('.nav-group-title')?.textContent.trim() === '账户') { accountGroup = g; break; }
        }
        if (!accountGroup) {
            const nav = document.querySelector('.primary-nav');
            if (!nav) return;
            accountGroup = document.createElement('div');
            accountGroup.className = 'nav-group';
            const title = document.createElement('span');
            title.className = 'nav-group-title';
            title.textContent = '辅助';
            accountGroup.appendChild(title);
            nav.appendChild(accountGroup);
        }

        const btn = document.createElement('a');
        btn.id = 'settings-toggle-btn';
        btn.className = 'nav-item';
        btn.href = 'javascript:void(0)';
        btn.style.cssText = 'display: flex; align-items: center; width: 100%; cursor: pointer;';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true" style="pointer-events: none;"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span class="nav-label" style="pointer-events: none;">辅助脚本设置</span>`;
        btn.addEventListener('click', e => { e.preventDefault(); toggleSettingsPanel(); });

        const items = accountGroup.querySelectorAll('.nav-item');
        let before = null;
        for (const item of items) {
            if (item.querySelector('.nav-label')?.textContent === '设置') { before = item; break; }
        }
        before ? accountGroup.insertBefore(btn, before) : accountGroup.appendChild(btn);
    }

    // ============================================================
    // 8. 主程序
    // ============================================================

    async function main() {
        try {
            await waitForNav();
            insertSettingsButton();

            const game = await waitForGameAPI();
            if (!game) { error('未获取到 game 对象'); return; }
            updateState({ appGame: game });
            log('官方 API 已就绪');

            await game.ready;
            log('数据已就绪');

            const snapshot = game.getSnapshot();
            if (settings.debugLog && snapshot) {
                log('=== 当前快照 ===');
                log('当前地图:', snapshot.currentBiomeId);
                const unlocked = snapshot.biomes?.filter(b => b.isUnlocked) || [];
                log(`已解锁地图 (${unlocked.length} 个):`);
                unlocked.forEach(b => log(`  ${b.id} ${b.name}${b.isCurrent ? ' [当前]' : ''} 天气: ${b.weather?.name || '未知'}`));
                log('========================');
            }

            if (snapshot?.biomes) {
                const current = snapshot.biomes.find(b => b.isCurrent);
                if (current?.weather) updateState({ currentWeatherId: current.weather.id });
            }

            applySettings();

            game.on('weather:changed', ({ biomeId, previous, current }) => {
                log(`[天气变化] ${biomeId}: "${previous.name}" → "${current.name}"`);
                updateState({ currentWeatherId: current.id });
                if (settings.autoBuyBuffs) checkAndBuyBuffs();
                if (settings.autoSwitchMap) makeDecision(game);
            });

            game.on('competition:started', () => {
                log('[比赛开始] 重新决策');
                if (settings.autoSwitchMap) makeDecision(game);
            });

            // 调试接口
            window.switchToBiome = async (biomeId) => {
                if (!biomeId) return warn('缺少 biomeId');
                try { await game.biomes.travelTo(biomeId); log(`手动切换至 ${biomeId} 成功`); updateState({ lastSwitchTime: Date.now() }); }
                catch (err) { error(`手动切换至 ${biomeId} 失败:`, err); }
            };
            window.checkBuffs = checkAndBuyBuffs;

            log('✅ 脚本初始化完成');
            log('💡 点击导航栏"辅助脚本设置"按钮打开设置面板');
        } catch (err) {
            error('初始化失败:', err);
        }
    }

    main();
})();

// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  自动切换地图、比赛优先、自动补充鱼竿、自动报名个人赛、涌潮自动买buff，分组折叠UI，保存/重置
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
    // 1. 通用工具区
    // ============================================================

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
    };
    const STORAGE_KEY = 'arcane_auto_settings';

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

    // 天气ID ↔ 中文名映射（必须在 loadSettings() 之前定义，供迁移使用）
    const WEATHER_ID_TO_NAME = {
        'clear': '晴朗',
        'rain': '雨幕',
        'gale': '强风',
        'mist': '浓雾',
        'heatwave': '热浪',
        'tempest': '雷暴',
        'wither_tide': '枯潮',
        'gilded_current': '金风',
        'arcane_surge': '奥秘涌流',
    };
    const WEATHER_NAME_TO_ID = Object.fromEntries(
        Object.entries(WEATHER_ID_TO_NAME).map(([id, name]) => [name, id])
    );

    let settings = loadSettings();
    let appGame = null;

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                // 迁移：将旧版中文天气名转换为天气ID
                if (Array.isArray(saved.triggerWeathers) && saved.triggerWeathers.length > 0) {
                    saved.triggerWeathers = saved.triggerWeathers.map(w => {
                        // 已经是天气ID则保留，否则从映射表转换
                        return WEATHER_NAME_TO_ID[w] || w;
                    }).filter(w => WEATHER_ID_TO_NAME[w]); // 只保留已知的天气ID
                }
                return { ...DEFAULTS, ...saved };
            }
        } catch (e) {}
        return { ...DEFAULTS };
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    function log(...args) {
        if (settings.debugLog) console.log('[AutoSwitch]', ...args);
    }
    function warn(...args) {
        console.warn('[AutoSwitch]', ...args);
    }
    function error(...args) {
        console.error('[AutoSwitch]', ...args);
    }


    // 计算地图总经验加成（基点制，100基点 = 1%）
    // 数据来源：官方 window.arcaneReelax 快照，字段可能为 null（表示前端内存未知）
    function calculateTotalExpBonus(biome) {
        let total = 0;
        // 天气经验加成（基点）
        if (biome.weather && typeof biome.weather.experienceBonusBasisPoints === 'number') {
            total += biome.weather.experienceBonusBasisPoints;
        }
        // 专精经验加成（基点）
        if (typeof biome.masteryExperienceBonusBasisPoints === 'number') {
            total += biome.masteryExperienceBonusBasisPoints;
        }
        // 公会区域增益（基点）
        if (biome.guildBoost && typeof biome.guildBoost.experienceBonusBasisPoints === 'number') {
            total += biome.guildBoost.experienceBonusBasisPoints;
        }
        return total;
    }

    // 将基点格式化为可读字符串（如 7500 → "+75.0%"）
    function formatBasisPoints(basisPoints) {
        const pct = (basisPoints / 100).toFixed(1);
        return `${basisPoints >= 0 ? '+' : ''}${pct}%`;
    }

    function waitForGameAPI() {
        return new Promise((resolve) => {
            if (window.arcaneReelax) {
                resolve(window.arcaneReelax);
                return;
            }
            const check = () => {
                if (window.arcaneReelax) {
                    resolve(window.arcaneReelax);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    // 生成幂等键：用于防止网络重试导致重复请求
    // deterministicSuffix 应包含业务唯一标识（如比赛ID、产品ID+日期）
    // 传入后生成确定性幂等键，服务器可正确识别重试
    function generateIdempotencyKey(prefix, deterministicSuffix) {
        if (deterministicSuffix) {
            return `${prefix}-${deterministicSuffix}`;
        }
        // 回退：无确定性后缀时使用时间+随机数
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    function waitForNavigation() {
        return new Promise((resolve) => {
            if (document.querySelector('.primary-nav .nav-group')) {
                resolve();
                return;
            }
            let attempts = 0;
            const maxAttempts = 100;
            const check = () => {
                if (document.querySelector('.primary-nav .nav-group')) {
                    resolve();
                    return;
                }
                attempts++;
                if (attempts >= maxAttempts) {
                    warn('导航栏未在时限内出现，按钮可能插入失败');
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

    // ============================================================
    // 2. 数据变量区
    // ============================================================

    let competitionCache = { personal: null, guild: null };
    let registeredPersonalIds = new Set();
    let lastSwitchTime = 0;
    let refillInterval = null;
    let playerRelics = 0;
    let surgeActive = false;
    let currentWeatherId = '';
    const buffExpiryCache = new Map();
    let shopDataLoaded = false;
    let buffCheckInProgress = false;  // 防并发：同一时刻只允许一次购买 Buff 检查

    // ============================================================
    // 3. 业务逻辑区
    // ============================================================

    // ---------- 3.1 自动报名个人赛 ----------
    async function autoRegisterPersonal() {
        if (!settings.autoRegisterPersonal) {
            log('自动报名个人赛已禁用');
            return;
        }
        const personal = competitionCache.personal;
        if (!personal) {
            log('未获取到个人赛数据');
            return;
        }

        const candidates = [];
        if (personal.current && personal.current.canRegister && !personal.current.isRegistered) {
            candidates.push(personal.current);
        }
        if (personal.upcoming) {
            for (const comp of personal.upcoming) {
                if (comp.canRegister && !comp.isRegistered && comp.status === 'scheduled') {
                    candidates.push(comp);
                }
            }
        }

        if (candidates.length === 0) {
            log('没有可报名的个人赛');
            return;
        }

        candidates.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

        for (const comp of candidates) {
            if (registeredPersonalIds.has(comp.id)) {
                log(`已报名过个人赛 #${comp.sequence}，跳过`);
                continue;
            }
            try {
                const idempotencyKey = generateIdempotencyKey('register', comp.id);
                log(`尝试自动报名个人赛 #${comp.sequence} (${comp.biomeId})`);
                const resp = await fetch(`/api/tournaments/${comp.id}/register`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify({}),
                });
                if (resp.ok) {
                    registeredPersonalIds.add(comp.id);
                    log(`✅ 个人赛 #${comp.sequence} 报名成功`);
                } else {
                    const text = await resp.text();
                    log(`❌ 个人赛 #${comp.sequence} 报名失败 (${resp.status}): ${text}`);
                }
            } catch (err) {
                log(`报名个人赛出错: ${err.message}`);
            }
        }
    }

    // ---------- 3.2 获取比赛目标 ----------
    function getCompetitionTarget(allBiomes, now) {
        if (!settings.autoSwitchMap) return null;
        const candidates = [];

        if (settings.autoPersonal && competitionCache.personal) {
            const personal = competitionCache.personal;
            if (personal.current && personal.current.isRegistered) {
                const start = new Date(personal.current.startAt).getTime();
                const end = new Date(personal.current.endAt).getTime();
                if (now >= start - 300000 && now <= end) {
                    candidates.push({ biomeId: personal.current.biomeId, startAt: start });
                }
            }
            if (personal.upcoming) {
                for (const comp of personal.upcoming) {
                    if (comp.isRegistered) {
                        const start = new Date(comp.startAt).getTime();
                        if (now >= start - 300000 && now <= new Date(comp.endAt).getTime()) {
                            candidates.push({ biomeId: comp.biomeId, startAt: start });
                            break;
                        }
                    }
                }
            }
        }

        if (settings.autoGuild && competitionCache.guild) {
            const guild = competitionCache.guild;
            if (guild.current && guild.current.entryStatus === 'registered') {
                const start = new Date(guild.current.startAt).getTime();
                const end = new Date(guild.current.endAt).getTime();
                if (now >= start - 300000 && now <= end) {
                    candidates.push({ biomeId: guild.current.biomeId, startAt: start });
                }
            }
            if (guild.upcoming) {
                for (const comp of guild.upcoming) {
                    if (comp.entryStatus === 'registered') {
                        const start = new Date(comp.startAt).getTime();
                        if (now >= start - 300000 && now <= new Date(comp.endAt).getTime()) {
                            candidates.push({ biomeId: comp.biomeId, startAt: start });
                            break;
                        }
                    }
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.startAt - b.startAt);
        const targetBiomeId = candidates[0].biomeId;
        return allBiomes.find(b => b.id === targetBiomeId && b.isUnlocked) || null;
    }

    // ---------- 3.3 核心决策与切换 ----------
    function makeDecision(game) {
        if (!settings.autoSwitchMap) {
            log('自动切换地图已禁用');
            return;
        }

        const snapshot = game.getSnapshot();
        if (!snapshot) {
            log('快照为空');
            return;
        }

        const allBiomes = snapshot.biomes;
        const currentBiomeId = snapshot.currentBiomeId;
        if (!allBiomes || !Array.isArray(allBiomes)) {
            log('地图数据无效');
            return;
        }

        const unlocked = allBiomes.filter(b => b.isUnlocked);
        if (unlocked.length === 0) {
            log('没有已解锁地图');
            return;
        }

        const now = Date.now();
        let target = null;
        let targetType = '';

        const compTarget = getCompetitionTarget(unlocked, now);
        if (compTarget) {
            target = compTarget;
            targetType = '🏁 比赛';
            log(`比赛优先，目标: ${target.name} (${target.id})`);
        }

        if (!target) {
            const surgeMaps = unlocked.filter(b => b.weather && b.weather.id === 'arcane_surge');
            if (surgeMaps.length > 0) {
                target = surgeMaps.reduce((a, b) => (a.id > b.id ? a : b));
                targetType = '🌊 奥秘涌流';
                log(`奥秘涌流，目标: ${target.name} (${target.id})`);
            }
        }

        if (!target) {
            const goldMaps = unlocked.filter(b => b.weather && b.weather.id === 'gilded_current');
            if (goldMaps.length > 0) {
                target = goldMaps.reduce((a, b) => (a.id > b.id ? a : b));
                targetType = '💰 金风';
                log(`金风，目标: ${target.name} (${target.id})`);
            }
        }

        if (!target) {
            const sorted = unlocked.slice().sort((a, b) => {
                const expA = calculateTotalExpBonus(a);
                const expB = calculateTotalExpBonus(b);
                return expB - expA || (b.id > a.id ? 1 : -1);
            });
            target = sorted[0];
            if (target) {
                targetType = '📈 最高经验';
                log(`最高经验: ${target.name} (${target.id}) 经验加成: ${formatBasisPoints(calculateTotalExpBonus(target))}`);
            }
        }

        if (!target) {
            log('无合适目标');
            return;
        }

        if (target.id === currentBiomeId) {
            log('已在目标地图');
            return;
        }

        if (now - lastSwitchTime < 60000) {
            log(`冷却中 (${Math.round((60000 - (now - lastSwitchTime)) / 1000)}s)`);
            return;
        }

        log(`🔄 切换 (${targetType}): ${currentBiomeId} → ${target.id} (${target.name})`);
        game.biomes.travelTo(target.id)
            .then(() => {
                log(`✅ 切换成功: ${target.name}`);
                lastSwitchTime = now;
            })
            .catch(err => error(`❌ 切换失败: ${err.message || err}`));
    }

    // ---------- 3.4 自动补充鱼竿 ----------
    function startRefill() {
        if (refillInterval) clearInterval(refillInterval);
        if (!settings.autoRefill) {
            log('自动补充鱼竿已禁用');
            return;
        }
        refillInterval = setInterval(() => {
            const button = document.querySelector('.topbar-fishing-status');
            if (button && !button.disabled) {
                button.click();
                if (settings.debugLog) log('已点击补充按钮');
            }
        }, 60000);
        log('自动补充鱼竿已启动');
    }

    function stopRefill() {
        if (refillInterval) {
            clearInterval(refillInterval);
            refillInterval = null;
            log('自动补充鱼竿已停止');
        }
    }

    // ---------- 3.5 自动购买 Buff ----------
    async function checkAndBuyBuffs() {
        // 防并发：上一次检查尚未完成则跳过本次
        if (buffCheckInProgress) {
            log('上一次 Buff 检查仍在进行中，跳过本次');
            return;
        }
        if (!settings.autoBuyBuffs) {
            return;
        }

        buffCheckInProgress = true;
        try {

        const triggerWeathers = settings.triggerWeathers || [];
        if (triggerWeathers.length === 0) {
            return;
        }
        if (!triggerWeathers.includes(currentWeatherId)) {
            return;
        }

        const selections = settings.buffSelections || {};
        const selectedIds = Object.keys(selections).filter(id => selections[id] === true);
        if (selectedIds.length === 0) {
            return;
        }

        let minPrice = Infinity;
        for (const id of selectedIds) {
            const config = BUFF_CONFIG[id];
            if (config && config.price < minPrice) {
                minPrice = config.price;
            }
        }
        if (playerRelics < minPrice) {
            log(`遗物不足 (${playerRelics} < ${minPrice})，跳过购买`);
            return;
        }

        // 第一轮：先用缓存判断，缓存足够就不发请求
        const now = Date.now();
        const needConfirm = [];
        for (const id of selectedIds) {
            const cachedEnd = buffExpiryCache.get(id);
            if (!cachedEnd || new Date(cachedEnd).getTime() <= now) {
                needConfirm.push(id);
            }
        }

        if (needConfirm.length === 0) {
            log('所有 Buff 均在有效期内（缓存命中），跳过');
            return;
        }

        // 第二轮：缓存不足以确认 → 调 shop API 验算
        log(`缓存不足，${needConfirm.length} 个 Buff 需确认，调用 shop API`);
        try {
            const resp = await fetch('/api/shop?tab=relic&page=1&limit=8&queuePage=1&queueLimit=8', {
                credentials: 'include',
                headers: { 'Accept': 'application/json' }
            });
            if (!resp.ok) {
                log(`获取 shop 数据失败: ${resp.status}`);
                return;
            }
            const data = await resp.json();

            if (data.personalBuffs) {
                for (const buff of data.personalBuffs) {
                    if (buff.productId && buff.endsAt) {
                        buffExpiryCache.set(buff.productId, buff.endsAt);
                    }
                }
                // 标记 shop 中不存在的 buff 为未购买（null = 已知未激活）
                for (const id of selectedIds) {
                    if (!buffExpiryCache.has(id)) {
                        buffExpiryCache.set(id, null);
                    }
                }
                log('shop 数据已更新缓存');
                shopDataLoaded = true;
            }

            if (data.balances && data.balances.relics !== undefined) {
                playerRelics = data.balances.relics;
            }

        } catch (err) {
            log(`获取 shop 数据失败: ${err.message}`);
            return;
        }

        // 第三轮：基于最新缓存，最终决定买哪些
        const needBuy = [];
        for (const id of selectedIds) {
            const cachedEnd = buffExpiryCache.get(id);
            if (!cachedEnd || new Date(cachedEnd).getTime() <= now) {
                needBuy.push(id);
            }
        }

        if (needBuy.length === 0) {
            log('验算后所有 Buff 已激活，无需购买');
            return;
        }

        for (const id of needBuy) {
            const config = BUFF_CONFIG[id];
            if (!config) {
                log(`未知 Buff: ${id}`);
                continue;
            }

            if (playerRelics < config.price) {
                log(`遗物不足 (${playerRelics} < ${config.price})，跳过购买 ${config.name}`);
                continue;
            }

            try {
                const idempotencyKey = generateIdempotencyKey(`buy-${id}`);
                log(`尝试购买 ${config.name} (${id})，价格 ${config.price} 遗物`);
                const resp = await fetch('/api/shop/purchases', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Idempotency-Key': idempotencyKey,
                    },
                    body: JSON.stringify({ productId: id }),
                });

                if (resp.ok) {
                    const result = await resp.json();
                    if (result.balances && result.balances.relics !== undefined) {
                        playerRelics = result.balances.relics;
                    }
                    if (result.personalBuff && result.personalBuff.endsAt) {
                        buffExpiryCache.set(id, result.personalBuff.endsAt);
                        log(`✅ 购买 ${config.name} 成功，结束时间: ${result.personalBuff.endsAt}`);
                    } else {
                        log(`✅ 购买 ${config.name} 成功，但未获取到结束时间`);
                    }
                } else {
                    const text = await resp.text();
                    log(`❌ 购买 ${config.name} 失败 (${resp.status}): ${text}`);
                }
            } catch (err) {
                log(`购买 ${config.name} 出错: ${err.message}`);
            }
        }
        } finally {
            buffCheckInProgress = false;
        }
    }

    // ---------- 3.6 拦截 fetch 响应 ----------
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string') {
            if (url.includes('/api/tournaments/overview')) {
                return originalFetch.apply(this, args).then(response => {
                    const cloned = response.clone();
                    cloned.json().then(async data => {
                        competitionCache.personal = data;
                        log('个人赛数据已更新（拦截）');
                        await autoRegisterPersonal();
                        const game = window.arcaneReelax;
                        if (game) makeDecision(game);
                    }).catch(() => {});
                    return response;
                });
            }
            if (url.includes('/api/guild-tournaments/overview')) {
                return originalFetch.apply(this, args).then(response => {
                    const cloned = response.clone();
                    cloned.json().then(data => {
                        competitionCache.guild = data;
                        log('公会赛数据已更新（拦截）');
                        const game = window.arcaneReelax;
                        if (game) makeDecision(game);
                    }).catch(() => {});
                    return response;
                });
            }
            if (url.includes('/api/fishing/state') || url.includes('/api/fishing/sync')) {
                return originalFetch.apply(this, args).then(response => {
                    const cloned = response.clone();
                    cloned.json().then(data => {
                        if (data.playerPatch && data.playerPatch.relics !== undefined) {
                            playerRelics = data.playerPatch.relics;
                        }
                        if (data.arcaneSacrifice && data.arcaneSacrifice.surge) {
                            surgeActive = data.arcaneSacrifice.surge.isActive || false;
                        }
                        if (settings.autoBuyBuffs) {
                            Promise.resolve().then(() => {
                                try {
                                    const game = window.arcaneReelax;
                                    if (game) {
                                        const snapshot = game.getSnapshot();
                                        if (snapshot && snapshot.biomes) {
                                            const current = snapshot.biomes.find(b => b.isCurrent);
                                            if (current && current.weather) {
                                                currentWeatherId = current.weather.id;
                                            }
                                        }
                                    }
                                } catch (e) {}
                                checkAndBuyBuffs();
                            });
                        }
                    }).catch(() => {});
                    return response;
                });
            }
        }
        return originalFetch.apply(this, args);
    };

    // ---------- 3.7 应用/重置设置 ----------
    function applySettings() {
        if (settings.autoRefill) {
            startRefill();
        } else {
            stopRefill();
        }
        if (settings.autoSwitchMap && appGame) {
            makeDecision(appGame);
        }
        log('设置已应用');
    }

    function resetSettings() {
        settings = { ...DEFAULTS };
        saveSettings();
        const panel = document.getElementById('auto-settings-panel');
        if (panel) {
            panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                const key = cb.dataset.key;
                if (key && settings.hasOwnProperty(key)) {
                    cb.checked = settings[key];
                }
                if (cb.dataset.weather) {
                    cb.checked = (settings.triggerWeathers || []).includes(cb.dataset.weather);
                }
                if (cb.dataset.productId) {
                    cb.checked = (settings.buffSelections && settings.buffSelections[cb.dataset.productId]) || false;
                }
            });
        }
        applySettings();
        log('已重置为默认配置');
    }

    // ============================================================
    // 4. UI 设置面板
    // ============================================================

    let panelVisible = false;

    function createSettingsUI() {
        const panel = document.createElement('div');
        panel.id = 'auto-settings-panel';
        panel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        background: var(--surface, #fff);
        border: 1px solid var(--border, #ccc);
        border-radius: 8px;
        padding: 16px 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        min-width: 260px;
        max-height: 80vh;
        overflow-y: auto;
        color: var(--text, #333);
        font-size: 14px;
    `;

        const title = document.createElement('div');
        title.textContent = '⚙️ 辅助脚本设置';
        title.style.cssText = 'font-weight: bold; margin-bottom: 12px; font-size: 16px;';
        panel.appendChild(title);

        // ---------- 扁平列表 ----------
        const list = document.createElement('div');

        // 1. 自动补充鱼竿开关
        list.appendChild(createCheckbox('autoRefill', '自动补充鱼竿开关'));

        // 2. 自动切换地图开关
        list.appendChild(createCheckbox('autoSwitchMap', '自动切换地图开关'));

        // 3. 自动进工会赛开关
        list.appendChild(createCheckbox('autoGuild', '自动进工会赛开关'));

        // 4. 自动进个人赛开关
        list.appendChild(createCheckbox('autoPersonal', '自动进个人赛开关'));

        // 5. 自动报名个人赛开关
        list.appendChild(createCheckbox('autoRegisterPersonal', '自动报名个人赛开关'));

        // 6. 调试日志开关
        list.appendChild(createCheckbox('debugLog', '调试日志开关'));

        // 7. 自动购买Buff开关
        const buffDetails = document.createElement('details');
        buffDetails.style.cssText = 'margin: 4px 0;';
        const buffSummary = document.createElement('summary');
        buffSummary.textContent = '自动购买Buff';
        buffSummary.style.cssText = 'cursor: pointer; font-weight: 600; padding: 4px 0;';
        buffDetails.appendChild(buffSummary);

        const buffContent = document.createElement('div');
        buffContent.style.cssText = 'padding: 4px 0 4px 12px;';

        // 7.1 自动购买 Buff 开关
        buffContent.appendChild(createCheckbox('autoBuyBuffs', '自动购买Buff开关'));

        // 7.2 选择触发天气
        const weatherDetails = document.createElement('details');
        weatherDetails.style.cssText = 'margin: 4px 0;';
        const weatherSummary = document.createElement('summary');
        weatherSummary.textContent = '选择触发天气';
        weatherSummary.style.cssText = 'cursor: pointer; font-weight: 500; font-size: 13px; color: var(--text-muted, #555);';
        weatherDetails.appendChild(weatherSummary);

        const weatherContent = document.createElement('div');
        weatherContent.style.cssText = 'padding: 6px 4px 4px 12px; display: flex; flex-wrap: wrap; gap: 6px;';
        // 从天气ID映射表动态生成选项（覆盖所有游戏天气类型）
        Object.entries(WEATHER_ID_TO_NAME).forEach(([weatherId, weatherName]) => {
            const label = document.createElement('label');
            label.style.cssText = 'display: inline-flex; align-items: center; cursor: pointer; font-size: 13px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = (settings.triggerWeathers || []).includes(weatherId);
            cb.dataset.weather = weatherId;
            cb.style.marginRight = '3px';
            const text = document.createTextNode(weatherName);
            label.appendChild(cb);
            label.appendChild(text);
            weatherContent.appendChild(label);
        });
        weatherDetails.appendChild(weatherContent);
        buffContent.appendChild(weatherDetails);

        // 5.3 选择Buff
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
                cb.checked = (settings.buffSelections && settings.buffSelections[pid]) || false;
                cb.dataset.productId = pid;
                cb.dataset.groupId = groupId;
                cb.style.marginRight = '4px';
                // 实时同组互斥：勾选时自动取消同组其他选项
                cb.addEventListener('change', function() {
                    if (this.checked) {
                        const panel = document.getElementById('auto-settings-panel');
                        if (panel) {
                            panel.querySelectorAll(`input[data-group-id="${groupId}"]`).forEach(otherCb => {
                                if (otherCb !== this && otherCb.checked) {
                                    otherCb.checked = false;
                                }
                            });
                        }
                    }
                });
                const text = document.createTextNode(`${config.name} (${config.price}遗物)`);
                label.appendChild(cb);
                label.appendChild(text);
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

        // ---------- 保存和重置按钮 ----------
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

        // ---------- 保存逻辑 ----------
        saveBtn.addEventListener('click', function() {
            const panel = document.getElementById('auto-settings-panel');
            const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
            const newSettings = { ...settings };
            checkboxes.forEach(cb => {
                if (cb.dataset.key) {
                    newSettings[cb.dataset.key] = cb.checked;
                }
                if (cb.dataset.weather) {
                    const weather = cb.dataset.weather;
                    if (cb.checked) {
                        if (!newSettings.triggerWeathers) newSettings.triggerWeathers = [];
                        if (!newSettings.triggerWeathers.includes(weather)) newSettings.triggerWeathers.push(weather);
                    } else {
                        if (newSettings.triggerWeathers) {
                            newSettings.triggerWeathers = newSettings.triggerWeathers.filter(w => w !== weather);
                        }
                    }
                }
                if (cb.dataset.productId) {
                    const pid = cb.dataset.productId;
                    const groupId = cb.dataset.groupId;
                    if (cb.checked) {
                        if (groupId && BUFF_GROUPS[groupId]) {
                            for (const otherId of BUFF_GROUPS[groupId].options) {
                                if (otherId !== pid) {
                                    newSettings.buffSelections[otherId] = false;
                                    const otherCb = panel.querySelector(`input[data-product-id="${otherId}"]`);
                                    if (otherCb) otherCb.checked = false;
                                }
                            }
                        }
                        newSettings.buffSelections[pid] = true;
                    } else {
                        newSettings.buffSelections[pid] = false;
                    }
                }
            });
            if (!newSettings.triggerWeathers) newSettings.triggerWeathers = [];
            settings = newSettings;
            saveSettings();
            applySettings();
            log('设置已保存并应用');
        });

        // ---------- 重置逻辑 ----------
        resetBtn.addEventListener('click', function() {
            resetSettings();
        });

        // ---------- 点击外部关闭 ----------
        document.addEventListener('click', function(e) {
            if (panelVisible && !panel.contains(e.target) && e.target.id !== 'settings-toggle-btn') {
                panel.style.display = 'none';
                panelVisible = false;
            }
        });

        document.body.appendChild(panel);
        return panel;
    }

    // 辅助函数：创建带 dataset.key 的 checkbox
    function createCheckbox(key, label) {
        const wrapper = document.createElement('label');
        wrapper.style.cssText = 'display: flex; align-items: center; margin-bottom: 6px; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = settings[key] || false;
        cb.dataset.key = key;
        cb.style.marginRight = '8px';
        const text = document.createTextNode(label);
        wrapper.appendChild(cb);
        wrapper.appendChild(text);
        return wrapper;
    }
        function toggleSettingsPanel() {
        let panel = document.getElementById('auto-settings-panel');
        if (!panel) {
            panel = createSettingsUI();
        }
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        panelVisible = !isVisible;
    }

    function insertSettingsButton() {
        const navGroups = document.querySelectorAll('.nav-group');
        let accountGroup = null;
        for (const group of navGroups) {
            const title = group.querySelector('.nav-group-title');
            if (title && title.textContent.trim() === '账户') {
                accountGroup = group;
                break;
            }
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
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true" style="pointer-events: none;"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span class="nav-label" style="pointer-events: none;">辅助脚本设置</span>
        `;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            toggleSettingsPanel();
        });

        const items = accountGroup.querySelectorAll('.nav-item');
        let insertBefore = null;
        for (const item of items) {
            const label = item.querySelector('.nav-label');
            if (label && label.textContent === '设置') {
                insertBefore = item;
                break;
            }
        }
        if (insertBefore) {
            accountGroup.insertBefore(btn, insertBefore);
        } else {
            accountGroup.appendChild(btn);
        }
    }

    // ============================================================
    // 5. 主程序
    // ============================================================

    async function main() {
        try {
            await waitForNavigation();
            insertSettingsButton();

            const game = await waitForGameAPI();
            if (!game) {
                error('未获取到 game 对象');
                return;
            }
            appGame = game;
            log('官方 API 已就绪');

            await game.ready;
            log('数据已就绪');

            const snapshot = game.getSnapshot();
            if (settings.debugLog) {
                log('=== 当前快照 ===');
                log('当前地图:', snapshot.currentBiomeId);
                log('服务器时间:', snapshot.serverTime);
                const unlocked = snapshot.biomes?.filter(b => b.isUnlocked) || [];
                log(`已解锁地图 (${unlocked.length} 个):`);
                unlocked.forEach(b => {
                    const mark = b.isCurrent ? ' [当前]' : '';
                    log(`  ${b.id} ${b.name}${mark} 天气: ${b.weather?.name || '未知'} ${b.weather?.effect || ''}`);
                });
                log('========================');
            }

            if (snapshot && snapshot.biomes) {
                const current = snapshot.biomes.find(b => b.isCurrent);
                if (current && current.weather) {
                    currentWeatherId = current.weather.id;
                }
            }

            applySettings();

            game.on('weather:changed', ({ biomeId, previous, current }) => {
                log(`[天气变化] ${biomeId} 从 "${previous.name}" 变为 "${current.name}"`);
                currentWeatherId = current.id;
                if (settings.autoBuyBuffs) {
                    checkAndBuyBuffs();
                }
                if (settings.autoSwitchMap) {
                    makeDecision(game);
                }
            });

            game.on('competition:started', () => {
                log('[比赛开始] 重新决策');
                if (settings.autoSwitchMap) {
                    makeDecision(game);
                }
            });

            window.switchToBiome = async (biomeId) => {
                if (!biomeId) return warn('缺少 biomeId');
                try {
                    await game.biomes.travelTo(biomeId);
                    log(`手动切换至 ${biomeId} 成功`);
                    lastSwitchTime = Date.now();
                } catch (err) {
                    error(`手动切换至 ${biomeId} 失败:`, err);
                }
            };

            window.checkBuffs = checkAndBuyBuffs;

            log('✅ 脚本初始化完成');
            log('💡 点击导航栏“辅助脚本设置”按钮打开设置面板');
        } catch (err) {
            error('初始化失败:', err);
        }
    }

    main();
})();
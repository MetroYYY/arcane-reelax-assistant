// ==UserScript==
// @name         奥术摸鱼大师辅助
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  自动切换地图、比赛优先、自动补充鱼竿，全部功能可开关，零额外请求
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

    // ==================== 默认配置 ====================
    const DEFAULTS = {
        autoRefill: true,
        autoSwitchMap: true,
        autoGuild: true,
        autoPersonal: true,
        debugLog: false,
    };
    const STORAGE_KEY = 'arcane_auto_settings';

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                return { ...DEFAULTS, ...saved };
            }
        } catch (e) {}
        return { ...DEFAULTS };
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
    }

    let settings = loadSettings();

    function log(...args) {
        if (settings.debugLog) console.log('[AutoSwitch]', ...args);
    }
    function warn(...args) {
        console.warn('[AutoSwitch]', ...args);
    }
    function error(...args) {
        console.error('[AutoSwitch]', ...args);
    }

    // ---------- 等待官方 API 就绪 ----------
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

    function extractExpBonus(effectStr) {
        if (!effectStr) return 0;
        const match = effectStr.match(/(\d+)%/);
        return match ? parseInt(match[1], 10) : 0;
    }

    let competitionCache = { personal: null, guild: null };

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

    let lastSwitchTime = 0;

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
            const surgeMaps = unlocked.filter(b => b.weather.name === '奥秘涌流');
            if (surgeMaps.length > 0) {
                target = surgeMaps.reduce((a, b) => (a.requiredLevel || 0) > (b.requiredLevel || 0) ? a : b);
                targetType = '🌊 奥秘涌流';
                log(`奥秘涌流，目标: ${target.name} (${target.id})`);
            }
        }

        if (!target) {
            const goldMaps = unlocked.filter(b => b.weather.name === '金风');
            if (goldMaps.length > 0) {
                target = goldMaps.reduce((a, b) => (a.requiredLevel || 0) > (b.requiredLevel || 0) ? a : b);
                targetType = '💰 金风';
                log(`金风，目标: ${target.name} (${target.id})`);
            }
        }

        if (!target) {
            const sorted = unlocked.slice().sort((a, b) => {
                const expA = extractExpBonus(a.weather.effect);
                const expB = extractExpBonus(b.weather.effect);
                return expB - expA || b.requiredLevel - a.requiredLevel;
            });
            target = sorted[0];
            if (target) {
                targetType = '📈 最高经验';
                log(`最高经验: ${target.name} (${target.id}) 经验: ${extractExpBonus(target.weather.effect)}%`);
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

    // ---------- 自动补充鱼竿 ----------
    let refillInterval = null;

    function startRefill() {
        if (refillInterval) clearInterval(refillInterval);
        if (!settings.autoRefill) {
            log('自动补充鱼竿已禁用');
            return;
        }
        refillInterval = setInterval(() => {
            const button = document.querySelector('.topbar-fishing-status');
            if (button) {
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

    // ---------- 拦截 fetch 响应 ----------
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string') {
            if (url.includes('/api/tournaments/overview')) {
                return originalFetch.apply(this, args).then(response => {
                    const cloned = response.clone();
                    cloned.json().then(data => {
                        competitionCache.personal = data;
                        log('个人赛数据已更新（拦截）');
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
        }
        return originalFetch.apply(this, args);
    };

    // ---------- 设置面板 ----------
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
            min-width: 200px;
            display: none;
            color: var(--text, #333);
            font-size: 14px;
        `;

        const title = document.createElement('div');
        title.textContent = '⚙️ 辅助脚本设置';
        title.style.cssText = 'font-weight: bold; margin-bottom: 12px; font-size: 16px;';
        panel.appendChild(title);

        const items = [
            { key: 'autoRefill', label: '自动补充鱼竿' },
            { key: 'autoSwitchMap', label: '自动切换地图' },
            { key: 'autoGuild', label: '自动进工会赛' },
            { key: 'autoPersonal', label: '自动进个人赛' },
            { key: 'debugLog', label: '开启调试日志' },
        ];

        items.forEach(({ key, label }) => {
            const wrapper = document.createElement('label');
            wrapper.style.cssText = 'display: flex; align-items: center; margin-bottom: 8px; cursor: pointer;';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = settings[key];
            checkbox.dataset.key = key;
            checkbox.style.marginRight = '8px';
            const text = document.createTextNode(label);
            wrapper.appendChild(checkbox);
            wrapper.appendChild(text);
            panel.appendChild(wrapper);

            checkbox.addEventListener('change', function() {
                const key = this.dataset.key;
                settings[key] = this.checked;
                saveSettings(settings);
                if (key === 'autoRefill') {
                    if (settings.autoRefill) startRefill();
                    else stopRefill();
                } else if (key === 'autoSwitchMap' || key === 'autoGuild' || key === 'autoPersonal') {
                    const game = window.arcaneReelax;
                    if (game) makeDecision(game);
                }
            });
        });

        document.addEventListener('click', function(e) {
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
        if (!panel) {
            panel = createSettingsUI();
        }
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        panelVisible = !isVisible;
    }

    // ---------- 插入导航栏按钮 ----------
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
            <span class="nav-label" style="pointer-events: none;">辅助脚本</span>
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

    // ---------- 等待导航栏出现 ----------
    function waitForNavigation() {
        return new Promise((resolve) => {
            if (document.querySelector('.primary-nav .nav-group')) {
                resolve();
                return;
            }
            const observer = new MutationObserver(() => {
                if (document.querySelector('.primary-nav .nav-group')) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            // 超时保护：5 秒后即使没出现也继续
            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 5000);
        });
    }

    // ---------- 主程序 ----------
    async function main() {
        try {
            // 等待导航栏出现
            await waitForNavigation();
            insertSettingsButton();

            if (settings.autoRefill) startRefill();
            else stopRefill();

            const game = await waitForGameAPI();
            if (!game) {
                error('未获取到 game 对象');
                return;
            }
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
                    log(`  ${b.id} ${b.name}${mark} 天气: ${b.weather.name} ${b.weather.effect || ''}`);
                });
                log('========================');
            }

            makeDecision(game);

            game.on('weather:changed', ({ biomeId, previous, current }) => {
                log(`[天气变化] ${biomeId} 从 "${previous.name}" 变为 "${current.name}"`);
                makeDecision(game);
            });

            game.on('competition:started', () => {
                log('[比赛开始] 重新决策');
                makeDecision(game);
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

            log('✅ 脚本初始化完成');
            log('💡 点击导航栏“辅助脚本”按钮打开设置面板');
        } catch (err) {
            error('初始化失败:', err);
        }
    }

    main();
})();
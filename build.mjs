import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const sourceFile = 'src/arcane-assistant-v2.1.3.base.js';
const outputFile = 'dist/奥术摸鱼大师辅助.user.js';
const constantsFile = 'src/constants.js';
const releaseOutputs = [
  'releases/奥术摸鱼大师辅助-v2.1.3.js',
  'server/arcane-assistant.user.js',
  'server/releases/arcane-assistant-v2.1.3.user.js',
];

const embeddedHost = String.raw`  function setupEmbeddedPanelHost(host) {
    host.dataset.embedded = "true";
    host.style.display = "none";
    const style = document.createElement("style");
    style.textContent = ` + "`" + String.raw`
      :host{display:block;width:100%;height:100%;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;color:inherit}
      .dock{position:relative!important;z-index:auto!important;inset:auto!important;right:auto!important;top:auto!important;width:calc(100% - 32px)!important;max-width:960px!important;max-height:none!important;margin:0 auto 24px!important;border-radius:8px!important;box-shadow:none!important}
      .dock[data-collapsed="true"]{width:100%!important;height:auto!important;border-radius:8px!important;border-width:1px!important}
      .dock[data-collapsed="true"] .panel-body,.dock[data-collapsed="true"] .identity{display:initial!important}
      .panel-header{cursor:default!important}
      .panel-body{max-height:none!important;overflow:visible!important}
      #collapse{display:none!important}
      #view-log #log-entries{height:min(64vh,720px)!important}
    ` + "`" + String.raw`;
    state.shadowRoot.appendChild(style);

    let opened = false;
    let mainContent = null;
    const hiddenSiblings = new Map();
    let previousActiveLinks = [];

    const navSelector = "[data-arcane-assistant-nav]";
    const floatButton = document.createElement("button");
    floatButton.type = "button";
    floatButton.dataset.arcaneAssistantFloat = "";
    floatButton.title = "打开奥术摸鱼大师辅助";
    floatButton.setAttribute("aria-label", "打开奥术摸鱼大师辅助");
    const initialBallRight = Number.isFinite(Number(settings.ballRight)) && Number(settings.ballRight) >= 0 ? Number(settings.ballRight) : 16;
    const initialBallTop = Number.isFinite(Number(settings.ballTop)) && Number(settings.ballTop) >= 0 ? Number(settings.ballTop) : Math.max(0, window.innerHeight - 68);
    floatButton.style.cssText = "position:fixed;right:" + Math.min(initialBallRight, Math.max(0, window.innerWidth - 52)) + "px;top:" + Math.min(initialBallTop, Math.max(0, window.innerHeight - 52)) + "px;z-index:2147483599;width:52px;height:52px;padding:0;border:0;border-radius:50%;background:transparent url('https://static.reelax.cn/icons/currency/gold-coin.webp') center/cover no-repeat;box-shadow:none;cursor:pointer;touch-action:none;";
    document.documentElement.appendChild(floatButton);
    const restoreContent = () => {
      for (const [node, display] of hiddenSiblings) {
        if (node.isConnected) node.style.display = display;
      }
      hiddenSiblings.clear();
    };
    const sizeEmbeddedPanel = () => {
      if (!opened || !mainContent?.isConnected) return;
      const top = Math.max(0, mainContent.getBoundingClientRect().top);
      const available = Math.max(320, mainContent.clientHeight || window.innerHeight - top);
      host.style.height = available + "px";
      host.style.maxHeight = available + "px";
      host.style.overflowY = "auto";
    };
    const markNavigation = (active) => {
      const link = document.querySelector(navSelector + " [data-arcane-assistant-open]");
      link?.classList.toggle("active", active);
      if (active) link?.setAttribute("aria-current", "page");
      else link?.removeAttribute("aria-current");
    };
    const closeEmbeddedPanel = () => {
      if (!opened) return;
      opened = false;
      restoreContent();
      markNavigation(false);
      for (const link of previousActiveLinks) {
        if (link.isConnected) {
          link.classList.add("active");
          link.setAttribute("aria-current", "page");
        }
      }
      previousActiveLinks = [];
      host.style.display = "none";
      document.documentElement.appendChild(host);
      floatButton.style.display = "block";
    };
    const openEmbeddedPanel = () => {
      mainContent = document.querySelector(".main-content");
      if (!mainContent) return false;
      if (!opened) {
        previousActiveLinks = [...document.querySelectorAll(".primary-nav .nav-item.active, .primary-nav .nav-item[aria-current='page']")]
          .filter((link) => !link.closest(navSelector));
        for (const link of previousActiveLinks) {
          link.classList.remove("active");
          link.removeAttribute("aria-current");
        }
      }
      opened = true;
      for (const child of [...mainContent.children]) {
        if (child === host || hiddenSiblings.has(child)) continue;
        hiddenSiblings.set(child, child.style.display);
        child.style.display = "none";
      }
      const dock = state.shadowRoot.querySelector(".dock");
      if (dock) dock.dataset.collapsed = "false";
      mainContent.appendChild(host);
      host.removeAttribute("style");
      host.style.display = "block";
      floatButton.style.display = "none";
      sizeEmbeddedPanel();
      markNavigation(true);
      document.querySelector(".nav-backdrop")?.click();
      return true;
    };
    const mountNavigation = () => {
      const nav = document.querySelector(".primary-nav");
      if (!nav || nav.querySelector(navSelector)) return;
      const group = document.createElement("div");
      group.className = "nav-group";
      group.dataset.arcaneAssistantNav = "";
      group.innerHTML = ` + "`" + String.raw`<span class="nav-group-title">脚本管理</span><a href="#" class="nav-item" data-arcane-assistant-open aria-label="奥术摸鱼大师辅助" title="奥术摸鱼大师辅助"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 15c3-5 7-7 12-7h4l-3 3 3 3h-4c-5 0-9-2-12-7z"/><circle cx="15.5" cy="10.5" r=".8" fill="currentColor"/></svg><span class="nav-label">辅助设置</span></a>` + "`" + String.raw`;
      const account = [...nav.querySelectorAll(".nav-group")].find((item) => item.querySelector(".nav-group-title")?.textContent.trim() === "账户");
      account ? nav.insertBefore(group, account) : nav.appendChild(group);
      group.addEventListener("click", (event) => {
        const link = event.target.closest("[data-arcane-assistant-open]");
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        openEmbeddedPanel();
      });
      if (opened) markNavigation(true);
    };
    let mountQueued = false;
    const observer = new MutationObserver(() => {
      if (mountQueued) return;
      mountQueued = true;
      queueMicrotask(() => {
        mountQueued = false;
        mountNavigation();
        if (opened && !host.isConnected) openEmbeddedPanel();
      });
    });
    const onOriginalNavigation = (event) => {
      const link = event.target.closest(".nav-item");
      if (link && !link.closest(navSelector)) closeEmbeddedPanel();
    };
    let ballPointerId = null;
    let ballStartX = 0;
    let ballStartY = 0;
    let ballStartRight = 0;
    let ballStartTop = 0;
    let ballMoved = false;
    floatButton.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      ballPointerId = event.pointerId;
      ballStartX = event.clientX;
      ballStartY = event.clientY;
      const rect = floatButton.getBoundingClientRect();
      ballStartRight = window.innerWidth - rect.right;
      ballStartTop = rect.top;
      ballMoved = false;
      floatButton.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    floatButton.addEventListener("pointermove", (event) => {
      if (ballPointerId !== event.pointerId) return;
      const dx = event.clientX - ballStartX;
      const dy = event.clientY - ballStartY;
      if (!ballMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      ballMoved = true;
      floatButton.style.right = Math.min(Math.max(0, ballStartRight - dx), Math.max(0, window.innerWidth - 52)) + "px";
      floatButton.style.top = Math.min(Math.max(0, ballStartTop + dy), Math.max(0, window.innerHeight - 52)) + "px";
    });
    const finishBallDrag = (event) => {
      if (ballPointerId !== event.pointerId) return;
      if (floatButton.hasPointerCapture(event.pointerId)) floatButton.releasePointerCapture(event.pointerId);
      ballPointerId = null;
      if (ballMoved) {
        const rect = floatButton.getBoundingClientRect();
        settings.ballRight = window.innerWidth - rect.right;
        settings.ballTop = rect.top;
        saveSettings();
      }
    };
    floatButton.addEventListener("pointerup", finishBallDrag);
    floatButton.addEventListener("pointercancel", finishBallDrag);
    floatButton.addEventListener("click", (event) => {
      if (ballMoved) {
        event.preventDefault();
        event.stopPropagation();
        ballMoved = false;
        return;
      }
      openEmbeddedPanel();
    });
    host.__openEmbeddedPanel = openEmbeddedPanel;
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("click", onOriginalNavigation, true);
    window.addEventListener("resize", sizeEmbeddedPanel);
    mountNavigation();
    onTeardown(() => {
      observer.disconnect();
      document.removeEventListener("click", onOriginalNavigation, true);
      window.removeEventListener("resize", sizeEmbeddedPanel);
      restoreContent();
      document.querySelector(navSelector)?.remove();
      floatButton.remove();
    });
  }`;

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Build guard failed: ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replacePatternOnce(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')) || [];
  if (matches.length !== 1) throw new Error(`Build guard failed: ${label} (${matches.length} matches)`);
  return source.replace(pattern, replacement);
}

const fixedUpcomingSacrificeResource = String.raw`  function hasUpcomingArcaneSacrificeResource(overview, resourceType) {
    if (!resourceType) return false;
    if (getNextArcaneSacrificeResourceType(overview) === resourceType) return true;
    const current = overview?.currentRound;
    const roundLists = [overview?.upcomingRounds, overview?.nextRounds, overview?.day?.upcomingRounds, overview?.schedule?.upcomingRounds];
    for (const rounds of roundLists) {
      if (Array.isArray(rounds) && rounds.some((round) => !isFinishedRound(round) && roundResourceType(round) === resourceType)) return true;
    }
    const orderOf = (round) => {
      for (const value of [round?.cycleOrdinal, round?.roundNumber, round?.sequence, round?.ordinal]) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
      return null;
    };
    const timeOf = (round) => {
      for (const value of [round?.startAt, round?.opensAt, round?.scheduledAt]) {
        const time = Date.parse(value || "");
        if (Number.isFinite(time)) return time;
      }
      return null;
    };
    const schedules = [overview?.day?.rounds, overview?.schedule?.rounds, overview?.rounds];
    for (const rounds of schedules) {
      if (!Array.isArray(rounds)) continue;
      const currentIndex = rounds.findIndex((item) =>
        current?.id != null && item?.id === current.id ||
        current?.cycleOrdinal != null && item?.cycleOrdinal === current.cycleOrdinal ||
        current?.roundNumber != null && item?.roundNumber === current.roundNumber
      );
      let futureRounds;
      if (currentIndex >= 0) futureRounds = rounds.slice(currentIndex + 1);
      else {
        const currentOrder = orderOf(current);
        const currentTime = timeOf(current);
        futureRounds = rounds.filter((round) => {
          if (isFinishedRound(round)) return false;
          const order = orderOf(round);
          if (currentOrder != null && order != null) return order > currentOrder;
          const time = timeOf(round);
          if (currentTime != null && time != null) return time > currentTime;
          return ["scheduled", "upcoming", "open"].includes(String(round?.status || "").toLowerCase());
        });
      }
      if (futureRounds.some((round) => !isFinishedRound(round) && roundResourceType(round) === resourceType)) return true;
    }
    return false;
  }`;

function buildEmbeddedRelease() {
  let source = readFileSync(sourceFile, 'utf8');
  const constantsSource = readFileSync(constantsFile, 'utf8');
  const updateNotesLiteral = constantsSource.match(/export const RELEASE_NOTES = ('(?:\\.|[^'\\])*');/)?.[1];
  if (!updateNotesLiteral) throw new Error('Build guard failed: RELEASE_NOTES in src/constants.js');
  const updateNotes = Function(`"use strict"; return (${updateNotesLiteral});`)()
    .replaceAll('【日常－购买 Buff】', '【资产－购买 Buff】')
    .replace('【修复】\n\n', '【修复】\n\n- 【脚本面板】修复手机端展开游戏左侧导航栏时，辅助设置面板错误覆盖导航遮罩与导航栏的问题。\n\n- 【资产－购买 Buff】将购买 Buff 从“日常”移动到“资产”；仅把明确属于个人商店的 Buff 识别为已生效，避免天气、活动或其他经验效果被误判为潮痕研习或碎光顿悟；手动检查会读取服务端最新状态。\n\n');
  source = replacePatternOnce(source, /  var RELEASE_UPDATE_NOTES = .*$/m, `  var RELEASE_UPDATE_NOTES = ${JSON.stringify(updateNotes)}; // generated from src/constants.js`, 'release notes from src/constants.js');
  source = replaceOnce(source, '    autoEquipmentProfiles: true,\n    profileEngineMode: "full",', '    autoEquipmentProfiles: false,\n    profileEngineMode: "legacy",', 'disable profile engine defaults');
  source = replaceOnce(source, '        migrateProfileSettings(s);\n', '        s.autoEquipmentProfiles = false;\n        s.profileEngineMode = "legacy";\n', 'disable stored profile engine');
  source = replaceOnce(source, '    migrateProfileSettings(fresh);\n', '    fresh.autoEquipmentProfiles = false;\n    fresh.profileEngineMode = "legacy";\n', 'disable fresh profile migration');
  source = replaceOnce(
    source,
    '    <div class="section" data-section="equipment-profiles" data-settings-category="assets" data-collapsed="true">\n      <div class="section-heading" data-accordion><strong>\\u642D\\u914D\\u65B9\\u6848\\u5E93</strong></div>\n      <div class="section-body" id="equipment-profiles-body"></div>\n    </div>\n',
    '',
    'remove profile cards from original settings page',
  );
  source = replacePatternOnce(
    source,
    /  function hasUpcomingArcaneSacrificeResource\(overview, resourceType\) \{[\s\S]*?\n  \}(?=\n  function logNextArcaneSacrificeResource)/,
    fixedUpcomingSacrificeResource,
    'arcane sacrifice future fish detection',
  );
  source = replaceOnce(source, '  function attachUI() {', `${embeddedHost}\n  function attachUI() {`, 'attachUI insertion point');
  source = replaceOnce(
    source,
    '    state.shadowRoot.innerHTML = PANEL_HTML;\n    document.documentElement.appendChild(host);',
    '    state.shadowRoot.innerHTML = PANEL_HTML;\n    document.documentElement.appendChild(host);\n    setupEmbeddedPanelHost(host);',
    'panel host setup',
  );
  source = replaceOnce(
    source,
    '      header.addEventListener("pointerdown", (e) => {\n        if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest("button")) return;',
    '      header.addEventListener("pointerdown", (e) => {\n        if (host.dataset.embedded === "true") return;\n        if (!settings.isPanelCollapsed && e.composedPath()[0]?.closest("button")) return;',
    'embedded drag guard',
  );
  source = replaceOnce(
    source,
    '    document.addEventListener("click", (e) => {\n      if (collapseClickSuppressed()) return;',
    '    document.addEventListener("click", (e) => {\n      if (host.dataset.embedded === "true") return;\n      if (collapseClickSuppressed()) return;',
    'embedded collapse guard',
  );
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, source);
  for (const releaseOutput of releaseOutputs) {
    mkdirSync(dirname(releaseOutput), { recursive: true });
    writeFileSync(releaseOutput, source);
  }
  console.log(`Built original 2.1.3 UI as an embedded game page -> ${[outputFile, ...releaseOutputs].join(', ')}`);
}

buildEmbeddedRelease();
if (process.argv.includes('--watch')) {
  watch(sourceFile, { persistent: true }, () => buildEmbeddedRelease());
  console.log(`Watching ${sourceFile}`);
}

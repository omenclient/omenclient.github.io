import { getSettings } from "./settings.js";
import { getVar } from "./gameInterface.js";
import { attacksPerCycleToIntervalMs, intervalMsToAttacksPerCycle } from "./botAttackRate.js";

const PANEL_POSITION_STORAGE_KEY = "fx_automation_controls_position";
const BOT_MODE_SEQUENCE = ["off", "v20reserve", "best"];

function nextBotMode(currentMode) {
  const index = BOT_MODE_SEQUENCE.indexOf(currentMode);
  return BOT_MODE_SEQUENCE[(index + 1) % BOT_MODE_SEQUENCE.length];
}

function makeButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.textContent = label;
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.currentTarget.blur();
    onClick(event);
  });
  return button;
}

export default function initAutomationControls() {
  const settings = getSettings();
  const container = document.createElement("div");
  container.id = "demonAutomationControls";

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.textContent = "Automation";

  const buttonGrid = document.createElement("div");
  buttonGrid.className = "button-grid";

  const offButton = makeButton("All Off", () => {
    window.__fx.openingAutomation.setAllAutomationEnabled(false);
    render();
  });
  offButton.className = "all-toggle";
  const openingButton = makeButton("Opening", () => {
    window.__fx.openingAutomation.toggleOpeningAutomationEnabled();
    render();
  });
  const infiniteButton = makeButton("Inf", () => {
    window.__fx.openingAutomation.toggleInfiniteExpansion();
    render();
  });
  const botButton = makeButton("Bot", () => {
    window.__fx.openingAutomation.setAutoAttackMode(nextBotMode(window.__fx.openingAutomation.getAutoAttackMode()));
    render();
  });
  const logButton = makeButton("Log", () => {
    window.__fx.openingAutomation.downloadBotAttackTelemetry("csv");
  });
  const onButton = makeButton("All On", () => {
    window.__fx.openingAutomation.setAllAutomationEnabled(true);
    render();
  });
  onButton.className = "all-toggle";

  const botSpendLabel = document.createElement("label");
  botSpendLabel.className = "bot-rate-control";
  const botSpendHeader = document.createElement("span");
  botSpendHeader.className = "bot-rate-label";
  botSpendHeader.textContent = "Bot send";
  const botSpendText = document.createElement("span");
  botSpendText.className = "bot-rate-value";
  const spendSlider = document.createElement("input");
  spendSlider.type = "range";
  spendSlider.min = "0";
  spendSlider.max = "100";
  spendSlider.step = "5";
  spendSlider.value = String(window.__fx.openingAutomation.getBotSpendPercent());
  spendSlider.addEventListener("input", () => {
    const spendPercent = Number(spendSlider.value);
    window.__fx.openingAutomation.setBotSpendPercent(spendPercent);
    botSpendText.textContent = `${spendPercent}%`;
  });
  botSpendLabel.append(botSpendHeader, spendSlider, botSpendText);

  const botRateLabel = document.createElement("label");
  botRateLabel.className = "bot-rate-control";
  const botRateHeader = document.createElement("span");
  botRateHeader.className = "bot-rate-label";
  botRateHeader.textContent = "Bot rate";
  const botRateText = document.createElement("span");
  botRateText.className = "bot-rate-value";
  const rateSlider = document.createElement("input");
  rateSlider.type = "range";
  rateSlider.min = "0";
  rateSlider.max = "20";
  rateSlider.step = "1";
  rateSlider.addEventListener("input", () => {
    const attacksPerCycle = Number(rateSlider.value);
    window.__fx.openingAutomation.setBestAttackIntervalMs(attacksPerCycleToIntervalMs(attacksPerCycle));
    botRateText.textContent = `${attacksPerCycle}/cy`;
  });
  botRateLabel.append(botRateHeader, rateSlider, botRateText);

  buttonGrid.append(openingButton, infiniteButton, botButton, logButton, offButton, onButton);
  container.append(dragHandle, buttonGrid, botSpendLabel, botRateLabel);

  function loadPanelPosition() {
    try {
      const position = JSON.parse(localStorage.getItem(PANEL_POSITION_STORAGE_KEY) || "null");
      if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return null;
      return position;
    } catch (_error) {
      return null;
    }
  }

  function clampPanelPosition(left, top) {
    const rect = container.getBoundingClientRect();
    const width = rect.width || 220;
    const height = rect.height || 110;
    return {
      left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width)),
      top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - height))
    };
  }

  function applyPanelPosition(left, top, persist = true) {
    const position = clampPanelPosition(left, top);
    container.style.left = `${position.left}px`;
    container.style.top = `${position.top}px`;
    container.style.right = "auto";
    container.style.bottom = "auto";
    if (persist) localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
  }

  function applyInitialPanelPosition() {
    const savedPosition = loadPanelPosition();
    if (savedPosition) {
      applyPanelPosition(savedPosition.left, savedPosition.top, false);
      return;
    }
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || 220;
      const height = rect.height || 110;
      applyPanelPosition(Math.round((window.innerWidth - width) / 2), Math.round(window.innerHeight - height - 86), false);
    });
  }

  function initDrag() {
    let dragState = null;
    dragHandle.addEventListener("pointerdown", (event) => {
      if (!isInGame()) return;
      const rect = container.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      dragHandle.setPointerCapture(event.pointerId);
      container.classList.add("dragging");
      event.preventDefault();
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      applyPanelPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
    });
    const stopDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dragState = null;
      container.classList.remove("dragging");
    };
    dragHandle.addEventListener("pointerup", stopDrag);
    dragHandle.addEventListener("pointercancel", stopDrag);
    window.addEventListener("resize", () => {
      const rect = container.getBoundingClientRect();
      applyPanelPosition(rect.left, rect.top);
    });
  }

  function attach() {
    if (!document.body) return;
    if (!document.body.contains(container)) {
      document.body.append(container);
      applyInitialPanelPosition();
    }
  }

  function setActive(button, active) {
    button.classList.toggle("active", Boolean(active));
  }

  function isInGame() {
    try {
      const gameState = Number(getVar("gameState") || 0);
      return (gameState === 1 || gameState === 2) && !getVar("gIsReplay");
    } catch (_error) {
      return false;
    }
  }

  function render() {
    attach();
    container.classList.toggle("in-game", isInGame());
    const botMode = window.__fx.openingAutomation.getAutoAttackMode();
    const botEnabled = botMode !== "off";
    botButton.textContent = botMode === "v20reserve" ? "Bot V20" : botMode === "best" ? "Bot Land" : "Bot Off";
    botButton.title = "Cycles bot route: Off → V20 reserve → Land max";
    setActive(openingButton, settings.openingAutomationEnabled);
    setActive(infiniteButton, settings.infiniteExpansionEnabled);
    setActive(botButton, botEnabled);
    setActive(onButton, settings.openingAutomationEnabled && settings.infiniteExpansionEnabled && botEnabled);
    setActive(offButton, !settings.openingAutomationEnabled && !settings.infiniteExpansionEnabled && !botEnabled);
    const spendPercent = window.__fx.openingAutomation.getBotSpendPercent();
    spendSlider.value = String(spendPercent);
    botSpendText.textContent = `${spendPercent}%`;
    const attacksPerCycle = intervalMsToAttacksPerCycle(window.__fx.openingAutomation.getBestAttackIntervalMs());
    rateSlider.value = String(attacksPerCycle);
    botRateText.textContent = `${attacksPerCycle}/cy`;
  }

  window.addEventListener("load", () => {
    attach();
    render();
  });
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    if (!isInGame()) return;
    if (event.key === "q" || event.key === "Q") {
      window.__fx.openingAutomation.setAllAutomationEnabled(false);
      render();
    } else if (event.key === "e" || event.key === "E") {
      window.__fx.openingAutomation.setAllAutomationEnabled(true);
      render();
    }
  });
  setTimeout(() => {
    attach();
    render();
  }, 1000);
  setInterval(render, 500);
  initDrag();

  render();
  return { render };
}

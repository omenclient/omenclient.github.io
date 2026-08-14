import versionData from '../version.json';
const { version, lastUpdated, isSignificant } = versionData;

import settingsManager from './settings.js';
import { clanFilter, leaderboardFilter } from "./clanFilters.js";
import WindowManager from "./windowManager.js";
import donationsTracker from "./donationsTracker.js";
import winCounter from "./winCounter.js";
import playerList from "./playerList.js";
import gameScriptUtils from "./gameScriptUtils.js";
import hoveringTooltip from "./hoveringTooltip.js";
import { keybindFunctions, keybindHandler, mobileKeybinds } from "./keybinds.js";
import customLobby from './customLobby.js';
import { displayChangelog } from './changelog.js';
import { reportError } from './debugging.js';
import replayHistory from './replayHistory.js';
import replay from './replay.js';
import lobbyReminders from './lobbyReminders.js';
import pingFilter from './pingFilter.js';
import nameFilter from './nameFilter.js';
import followedAccounts from './followedAccounts.js';
import openingAutomation from './openingAutomation.js';
import initAutomationControls from './automationControls.js';

window.__fx = window.__fx || {};
const __fx = window.__fx;
__fx.version = version + " " + lastUpdated;
__fx.isCustomLobbyVersion = window.location.href.startsWith("https://fxclient.github.io/custom-lobbies")

const savedVersion = localStorage.getItem("fx_version");
if (savedVersion !== version && !__fx.isCustomLobbyVersion) {
  localStorage.setItem("fx_version", version);
  if (savedVersion !== null && isSignificant) displayChangelog();
}

__fx.settingsManager = settingsManager;
__fx.leaderboardFilter = leaderboardFilter;
__fx.utils = gameScriptUtils;
__fx.WindowManager = WindowManager;
__fx.keybindFunctions = {
  setAbsolute() {},
  setRelative() {},
  getAttackPercentage() { return 0; },
  repaintAttackPercentageBar() {},
  ...keybindFunctions
};
__fx.keybindHandler = keybindHandler;
__fx.mobileKeybinds = mobileKeybinds;
__fx.donationsTracker = donationsTracker;
__fx.reportError = reportError;
__fx.playerList = playerList;
__fx.hoveringTooltip = hoveringTooltip;
__fx.clanFilter = clanFilter;
__fx.wins = winCounter;
__fx.customLobby = customLobby;
__fx.replayHistory = replayHistory;
__fx.replay = replay;
__fx.lobbyReminders = lobbyReminders;
__fx.pingFilter = pingFilter;
__fx.nameFilter = nameFilter;
__fx.followedAccounts = followedAccounts;
__fx.openingAutomation = openingAutomation;
__fx.automationControls = initAutomationControls();

(function() {
    var bgImg = new Image();
    bgImg.src = "assets/omen_bg.webp";
    var canvas = document.getElementById("canvasA");
    if (!canvas) return;

    function drawBg(ctx) {
        if (!bgImg.complete || !bgImg.naturalWidth) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.85;
        var cw = canvas.width, ch = canvas.height;
        var imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
        var canvasRatio = cw / ch;
        var dw, dh, dx, dy;
        if (canvasRatio > imgRatio) {
            dw = cw; dh = cw / imgRatio;
            dx = 0; dy = (ch - dh) / 2;
        } else {
            dh = ch; dw = ch * imgRatio;
            dx = (cw - dw) / 2; dy = 0;
        }
        ctx.drawImage(bgImg, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    __fx.omenDrawMenuBg = function(ctx) { drawBg(ctx); };
})();

console.log('Successfully loaded Omen Client');

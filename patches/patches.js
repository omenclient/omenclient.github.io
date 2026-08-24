import assets from '../assets.js';
import ModUtils, { insert } from '../modUtils.js';

export default (/** @type {ModUtils} */ modUtils) => {
    const { insertCode, waitForMinification } = modUtils

    // Render win count
    insertCode(`var s = Math.floor((Device.a1.largeUIEnabled() ? 0.018 : 0.0137) * h___.hz);
		ctx.font = Util.qd.sS(0, Math.max(5, s));
		Util.qd.textBaseline(ctx, 0);
		Util.qd.textAlign(ctx, 2);
		ctx.fillStyle = Colors.nl;
		ctx.fillText(clientInfo.gameVersion, h___.w, 0);
        /* here */`,
        `const text = "Win count: " + __fx.wins.count;
        const textLength = ctx.measureText(text).width;
        const size = Math.max(5, s);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(text, ctx.canvas.width - textLength - size / 2, size * 2);`)

    // Make the main canvas context have an alpha channel if a custom background is being used
    insertCode(`mainCanvasElement = document.getElementById("canvasA");
		if (Device.id === 2) { mainCanvasElement.style.webkitUserSelect = "none"; }
		mainCanvas = mainCanvasElement.getContext("2d", { alpha: /* here */ false });`,
    `__fx.makeMainMenuTransparent ? true :`)

	// Reset donation history and leaderboard filter when a new game is started
	insertCode(`an.init();ai.a5l();bA.pQ.qC = [];bA.hZ.pT = 1;/* here */`,
	`__fx.donationsTracker.reset(), __fx.leaderboardFilter.reset(), __fx.customLobby.isActive() && __fx.customLobby.hideWindow();`);

    waitForMinification(() => applyPatches(modUtils))
}
//export const requiredVariables = ["game", "playerId", "playerData", "rawPlayerNames", "gIsSingleplayer", "playerTerritories"];

function applyPatches(/** @type {ModUtils} */ modUtils) {
    const { replace, replaceOne, replaceRawCode, safeDictionary, matchOne, matchRawCode, escapeRegExp } = modUtils;

    // A bare `replace` silently does nothing when it matches nothing, which is how a patch
    // quietly dies across a game update. Warn instead of throwing: the patches that use this
    // are cosmetic, so a stale one should not block a build.
    const replaceOrWarn = (description, expression, replacement) => {
        const before = modUtils.script;
        replace(expression, replacement);
        if (modUtils.script === before)
            console.warn(`Warning: patch "${description}" matched nothing in this game build`);
    };

    // Constants for easy usage of otherwise long variable access expressions
    const dict = safeDictionary;
    const playerId = `${dict.game}.${dict.playerId}`;
    const rawPlayerNames = `${dict.playerData}.${dict.rawPlayerNames}`;
    const gIsSingleplayer = `${dict.game}.${dict.gIsSingleplayer}`;

    // Raw game-internal names the injected automation code reads directly. Unlike `dict`,
    // these are not discovered by build.js's pattern matching: they are the obfuscated
    // spellings for the game build this client was last updated against (Territorial.io
    // 2.16.46) and the obfuscator reshuffles them on every release. The readable names are
    // from the deobfuscation project in ../deobfuscate (its function-mappings.json /
    // property-mappings.json translate a name from one release to the next). Every entry is
    // checked below for presence, which catches the common case where a name disappears
    // outright. It cannot catch a name that survives but now belongs to something else -- e.g.
    // "h8", the 2.16.33 spelling of playerTiles, still exists in 2.16.46 as an unrelated field --
    // so after a game update, re-derive these from ../deobfuscate rather than trusting a green build.
    const g = {
        mapData: "ad",                  // global MapData instance
        attackManager: "ae",            // global AttackManager instance
        protocolHandler: "bB",          // global ProtocolHandler instance
        teamUtils: "bv",                // global TeamUtils instance
        playerTiles: "h7",              // PlayerData.playerTiles[player]: that player's border tiles
        neighborOffsets: "fT",          // MapData.neighborOffsets: 4-direction offsets, sized to map width
        isNeutralTile: "fI",            // MapData.isNeutralTile(tile)
        isOwnedTile: "h1",              // MapData.isOwnedTile(tile)
        getTileOwner: "fJ",             // MapData.getTileOwner(tile)
        getAvailableAttackCount: "gY",  // AttackManager.getAvailableAttackCount(player)
        getAttackTarget: "gd",          // AttackManager.getAttackTarget(player, attackIndex)
        getAttackValue: "ge",           // AttackManager.getAttackValue(player, attackIndex)
        gameCommandSender: "hr",        // ProtocolHandler.gameCommandSender
        sendAttack: "hy",               // GameCommandSender.sendAttack(sliderValue, target)
        cancelAttack: "q0",             // GameCommandSender.cancelAttack(target)
        canAttack: "fK",                // TeamUtils.canAttack(attacker, target)
        mapIsRendered: "xr",            // MapManager.xr: the map raster has been drawn and is on screen
    };

    // Each raw name above must at least still appear in the game script in the access shape the
    // automation uses it in. A missing one means the game update moved it: look the readable
    // name up in ../deobfuscate/generated/*-mappings.json to find its new spelling. Presence is
    // necessary, not sufficient -- see the note on the table above.
    [
        [`${g.mapData}.${g.neighborOffsets}`, "MapData.neighborOffsets"],
        [`${g.mapData}.${g.isNeutralTile}(`, "MapData.isNeutralTile"],
        [`${g.mapData}.${g.isOwnedTile}(`, "MapData.isOwnedTile"],
        [`${g.mapData}.${g.getTileOwner}(`, "MapData.getTileOwner"],
        [`${dict.playerData}.${g.playerTiles}`, "PlayerData.playerTiles"],
        [`${g.attackManager}.${g.getAvailableAttackCount}(`, "AttackManager.getAvailableAttackCount"],
        [`${g.attackManager}.${g.getAttackTarget}(`, "AttackManager.getAttackTarget"],
        [`${g.attackManager}.${g.getAttackValue}(`, "AttackManager.getAttackValue"],
        [`${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack}(`, "GameCommandSender.sendAttack"],
        [`${g.protocolHandler}.${g.gameCommandSender}.${g.cancelAttack}(`, "GameCommandSender.cancelAttack"],
        [`${g.teamUtils}.${g.canAttack}(`, "TeamUtils.canAttack"],
        [`${dict.mapHolder}.${g.mapIsRendered}`, "MapManager.xr"],
    ].forEach(([access, readableName]) => {
        if (!modUtils.script.includes(access))
            throw new Error(`Automation raw name check failed: "${access}" (${readableName}) is not in this game build. `
                + `The game was updated -- re-derive it from ../deobfuscate and update the "g" table in patches/patches.js.`);
    });

    // Replace assets
    replaceOne(/(\(4,"crown",4,")[^"]+"\),/g, "$1" + assets.crownIcon + "\"),");
    replaceOne(/(\(6,"territorial\.io",6,")[^"]+"\),/g, "$1" + assets.fxClientLogo + "\"),");
    replaceOne(/(\(22,"logo",8,")[^"]+"\)/g, "$1" + assets.smallLogo + "\")");

    // Add update information
    replaceRawCode(`new k("🚀 New Game Update","The game was updated! Please reload the game. An internet connection is required.",!0,[`,
        `new k("🚀 New Game Update","The game was updated! Please reload the game. An internet connection is required."
        + "<div style='border: white; border-width: 1px; border-style: solid; margin: 10px; padding: 5px;'><h2>Omen Client may need a patch for this Territorial.io update.</h2><p>You can still try singleplayer, then rebuild after updating patches.</p></div>",true,[`
    );

    // Max size for custom maps: from 4096x4096 to 8192x8192
    // TODO: test this; it might cause issues with new boat mechanics?

    { // Add Troop Density and Maximum Troops in side panel
        const { valuesArray } = replaceRawCode(`,labels[5]=__L(0,"Interest"),labels[6]=__L(),labels[7]=__L(),(truncatedLabels=new Array(labels.length)).fill(""),(valuesArray=new Array(labels.length))[0]=game.io?`,
            `,labels[5]=__L(0,"Interest"),labels[6]=__L(),labels[7]=__L(),
		labels.push("Max Troops", "Density"), // add labels
		(truncatedLabels=new Array(labels.length)).fill(""),(valuesArray=new Array(labels.length))[0]=game.io?`);
        replaceOne(new RegExp(/(:(?<valueIndex>\w+)<7\?\w+\.\w+\.\w+\(valuesArray\[\2\]\)):(\w+\.\w+\(valuesArray\[7\]\))}/
            .source.replace(/valuesArray/g, valuesArray), "g"),
            '$1 : $<valueIndex> === 7 ? $3 '
            + `: $<valueIndex> === 8 ? __fx.utils.getMaxTroops(${dict.playerData}.${dict.playerTerritories}, ${playerId}) `
            + `: __fx.utils.getDensity(${playerId}) }`);
        // increase the size of the side panel by 25% to make the text easier to read
        replaceOne(/(this\.\w+=Math\.floor\(\(\w+\.\w+\.\w+\(\)\?\.1646:\.126\))\*(\w+\.\w+\),)/g, "$1 * 1.25 * $2");
    }

    { // Add settings button
        // add buttons
        replaceRawCode(`,new nQ("☰<br>"+__L(),function(){aD6(3)},aa.ks),new nQ("",function(){at.d5(12)},aa.kg,!1)]`,
            `,new nQ("☰<br>"+__L(),function(){aD6(3)},aa.ks),new nQ("",function(){at.d5(12)},aa.kg,!1),
            new nQ("Omen Client Settings", function() { __fx.WindowManager.openWindow("settings"); }, "rgba(0, 0, 20, 0.5)")]`)
        // set position
        replaceRawCode(`aZ.g5.vO(aD3[3].button,x+a0S+gap,a3X+h+gap,a0S,h);`,
            `aZ.g5.vO(aD3[3].button,x+a0S+gap,a3X+h+gap,a0S,h);
            aZ.g5.vO(aD3[5].button, x, a3X + h * 2 + gap * 2, a0S * 2 + gap, h / 3);`);
    }

    { // Keybinds
        // match required variables
        const { 0: match, groups: { attackBarObject, setRelative } } = matchOne(/:\w+\.\w+\(\w+,8\)\?(?<attackBarObject>\w+)\.(?<setRelative>\w+)\(32\/31\):/g);
        // create a setAbsolutePercentage function on the attack percentage bar object,
        // and also register the keybind handler functions
        replaceOne(/}(function \w+\((\w+)\){return!\(1<\2&&1===(?<attackPercentage>\w+)\|\|\(1<\2&&\2\*\3-\3<1\/1024\?\2=\(\3\+1\/1024\)\/\3:\2<1)/g,
            "} this.setAbsolutePercentage = function(newPercentage) { $<attackPercentage> = newPercentage; }; "
            + "__fx.keybindFunctions.setAbsolute = this.setAbsolutePercentage; "
            + "__fx.keybindFunctions.getAttackPercentage = () => $<attackPercentage>; "
            + `__fx.keybindFunctions.setRelative = (arg1) => ${attackBarObject}.${setRelative}(arg1); $1`);
    }

    { // Opening automation
        replaceOne(/(function \w+\(\)\{)(var \w+=0,\w+=0;this\.\w+=function\(\w+,\w+\)\{)/g,
            `$1
            // MapData's global instance. The name is asserted at build time, but it is still read
            // through typeof and used with ?. everywhere below: this block runs every tick via
            // onTick/onTickAutoAttack, so a bad read must degrade to a safe default (false/0/null/
            // no-op) rather than throw a ReferenceError and take the render loop down with it.
            var __fxAd = typeof ${g.mapData} !== "undefined" ? ${g.mapData} : undefined;
            // Attacks are not sent through the click-to-attack UI dispatcher at all: attackFreeLand
            // below calls GameCommandSender.sendAttack directly, which is the same call the UI path
            // ends in, minus the input handling.
            __fx.openingAutomation.attack=()=> __fx.openingAutomation.attackFreeLand();
            // The per-player "attack border" tile list is PlayerData.playerTiles (g.playerTiles):
            // MapData's classification loop pushes a tile onto it exactly when
            // MapData.hasAdjacentAttackableTile(tile, player) is true, i.e. the tile has a
            // neutral-or-enemy neighbor. __fxAd (MapData's global instance) supplies the primitives
            // that narrow that down to neutral-only: g.neighborOffsets is the real 4-direction
            // neighbor offset array (Int32Array sized to the actual map width, NOT a hardcoded
            // stride) and g.isNeutralTile(tile) is the real neutral check. __fxNeutralBorderTileCount
            // walks those tiles' neighbors and dedupes, matching ThighClient's
            // getNeutralBorderTileCount exactly.
            var __fxNeutralBorderTileCount = ()=> {
                var player = ${dict.game}.${dict.playerId};
                var borderTiles = ${dict.playerData}.${g.playerTiles}?.[player];
                if (!borderTiles || !borderTiles.length) return 0;
                var offsets = __fxAd?.${g.neighborOffsets};
                if (!offsets || typeof __fxAd.${g.isNeutralTile} !== "function") return 0;
                var seen = new Set();
                var count = 0;
                for (var i = borderTiles.length - 1; i >= 0; i--) {
                    var tile = borderTiles[i];
                    for (var d = 0; d < 4; d++) {
                        var neighbor = tile + offsets[d];
                        var key = neighbor >> 2;
                        if (seen.has(key)) continue;
                        if (!__fxAd.${g.isNeutralTile}(neighbor)) continue;
                        seen.add(key);
                        count++;
                    }
                }
                return count;
            };
            __fx.openingAutomation.hasFreeLandAroundPlayer=()=> __fxNeutralBorderTileCount() > 0;
            // Ported from ThighClient MPV3's runRawBotAttacks (the function actually wired into its
            // main loop -- not the elaborate scored findRawBotAttackTarget, which is dead code there,
            // never called from anything reachable at runtime). Real bot-phase attacks there are just:
            // walk the player's border tiles' real neighbors, collect adjacent bot-owned tiles,
            // keep the single largest one under 0.2% density. Reuses the same playerTiles/__fxAd
            // primitives as
            // __fxNeutralBorderTileCount, swapped from "is this neighbor neutral" to "is this neighbor
            // an attackable bot" (owned + in the bot id range). Deliberately does NOT touch the attack
            // percent -- ThighClient's own version calls attackTargetWithCurrentPercent (reads
            // whatever's already on the slider), so this only picks a target; the caller sends with
            // whatever __fx.keybindFunctions.getAttackPercentage() already is, same as everywhere else.
            __fx.openingAutomation.findBorderBotAttackTarget=()=> {
                var player = ${dict.game}.${dict.playerId};
                var borderTiles = ${dict.playerData}.${g.playerTiles}?.[player];
                if (!borderTiles || !borderTiles.length) return -1;
                var offsets = __fxAd?.${g.neighborOffsets};
                if (!offsets || typeof __fxAd.${g.isOwnedTile} !== "function" || typeof __fxAd.${g.getTileOwner} !== "function") return -1;
                var humans = ${dict.game}.${dict.gHumans};
                var maxPlayers = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                var lastTick = __fx.openingAutomation.lastTick;
                var seen = new Set();
                var bestId = -1;
                var bestLand = -1;
                for (var i = borderTiles.length - 1; i >= 0; i--) {
                    var tile = borderTiles[i];
                    for (var d = 0; d < 4; d++) {
                        var neighbor = tile + offsets[d];
                        if (!__fxAd.${g.isOwnedTile}(neighbor)) continue;
                        var owner = __fxAd.${g.getTileOwner}(neighbor);
                        if (owner < humans || owner >= maxPlayers || owner === player || seen.has(owner)) continue;
                        seen.add(owner);
                        if (recentTargets?.has(owner) && lastTick - recentTargets.get(owner) < 30) continue;
                        var land = ${dict.playerData}.${dict.playerTerritories}[owner] || 0;
                        if (land <= bestLand) continue;
                        var troops = ${dict.playerData}.${dict.playerBalances}[owner] || 0;
                        var density = land > 0 ? troops / (land * 150) * 100 : Infinity;
                        if (!isFinite(density) || density > 0.2) continue;
                        bestId = owner;
                        bestLand = land;
                    }
                }
                return bestId;
            };
            __fx.openingAutomation.findV20ReserveBotAttackTarget=(tick, attackPercent)=> {
                var player = ${dict.game}.${dict.playerId};
                var borderTiles = ${dict.playerData}.${g.playerTiles}?.[player];
                if (!borderTiles || !borderTiles.length) return -1;
                var offsets = __fxAd?.${g.neighborOffsets};
                if (!offsets || typeof __fxAd.${g.isOwnedTile} !== "function" || typeof __fxAd.${g.getTileOwner} !== "function") return -1;
                var humans = Number(${dict.game}.${dict.gHumans});
                var maxPlayers = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                if (!isFinite(humans) || humans < 1) return -1;
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[player] || 0;
                var ownLand = ${dict.playerData}.${dict.playerTerritories}[player] || 0;
                if (ownTroops <= 0 || ownLand <= 0) return -1;
                var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                var activeTargets = __fx.openingAutomation.automatedBotAttacks;
                var cycle = Math.floor(tick / 100);
                var breakeven = { 9: 1.84, 10: 2.01, 11: 2.16, 12: 2.25, 13: 2.27, 14: 2.18, 15: 1.95, 16: 1.56, 17: 1.88 };
                var maxCostPerLand = (breakeven[cycle] || 1.8) * 2.0;
                if (ownTroops > ownLand * 70) maxCostPerLand = Math.max(maxCostPerLand, 6);
                var minLand = Math.max(300, Math.floor(ownLand * 0.005));
                var sendTroops = ownTroops * Math.max(0, Math.min(0.11, Number(attackPercent) || 0));
                if (sendTroops < 200) return -1;
                var seen = new Set();
                var bestId = -1;
                var bestScore = -1;
                for (var i = borderTiles.length - 1; i >= 0; i--) {
                    var tile = borderTiles[i];
                    for (var d = 0; d < 4; d++) {
                        var neighbor = tile + offsets[d];
                        if (!__fxAd.${g.isOwnedTile}(neighbor)) continue;
                        var id = __fxAd.${g.getTileOwner}(neighbor);
                        if (id < humans || id >= maxPlayers || id === player || seen.has(id)) continue;
                        seen.add(id);
                        if (!__fxCanAttack(player, id) || !__fxBorders(id, player)) continue;
                        if (activeTargets?.has(id)) continue;
                        if (recentTargets?.has(id) && tick - recentTargets.get(id) < 20) continue;
                        var land = ${dict.playerData}.${dict.playerTerritories}[id] || 0;
                        if (land < minLand) continue;
                        var troops = ${dict.playerData}.${dict.playerBalances}[id] || 0;
                        var density = troops / Math.max(1, land);
                        var costPerLand = 2 * (1 + 1.6 * density);
                        if (!isFinite(costPerLand) || costPerLand > maxCostPerLand) continue;
                        var killCost = costPerLand * land / (253 / 256);
                        var expectedLand = Math.min(sendTroops, killCost) / Math.max(2, costPerLand);
                        var completionRatio = Math.min(1, sendTroops / Math.max(1, killCost));
                        var efficiencyMultiplier = Math.pow(2 / Math.max(2, costPerLand), 0.70);
                        var score = expectedLand * efficiencyMultiplier * (0.70 + completionRatio * 0.30);
                        if (score > bestScore) {
                            bestId = id;
                            bestScore = score;
                        }
                    }
                }
                return bestId;
            };
            __fx.openingAutomation.getDeployedTroops=()=> {
                var player = ${dict.game}.${dict.playerId};
                if (typeof ${g.attackManager} !== "undefined" && typeof ${g.attackManager}.${g.getAvailableAttackCount} === "function") {
                    var freeLandTarget = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                    var count = ${g.attackManager}.${g.getAvailableAttackCount}(player) || 0;
                    for (var attackIndex = count - 1; attackIndex >= 0; attackIndex--) {
                        var target = ${g.attackManager}.${g.getAttackTarget}(player, attackIndex);
                        if (target === freeLandTarget) return ${g.attackManager}.${g.getAttackValue}(player, attackIndex) || 0;
                    }
                }
                return 0;
            };
            __fx.openingAutomation.getNeutralOutgoing=()=> __fx.openingAutomation.getDeployedTroops();
            __fx.openingAutomation.getNeutralBorderTileCount=()=> __fxNeutralBorderTileCount();
            __fx.openingAutomation.getPlayerTroops=()=> ${dict.playerData}.${dict.playerBalances}[${dict.game}.${dict.playerId}];
            __fx.openingAutomation.getPlayerLand=()=> ${dict.playerData}.${dict.playerTerritories}[${dict.game}.${dict.playerId}];
            __fx.openingAutomation.attack=()=> __fx.openingAutomation.attackFreeLand();
            __fx.openingAutomation.attackFreeLand=()=> {
                if (${dict.game}.${dict.gIsReplay}) return false;
                var freeLandTarget = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                var percent = __fx.keybindFunctions.getAttackPercentage();
                var sliderValue = Math.max(0, Math.min(1023, Math.round(percent * 1024 - 1)));
                if (typeof ${g.protocolHandler} !== "undefined" && ${g.protocolHandler}.${g.gameCommandSender} && typeof ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack} === "function") {
                    ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack}(sliderValue, freeLandTarget);
                    return true;
                }
                return false;
            };
            __fx.openingAutomation.attackFreeLandWithPercent=(percent)=> {
                if (${dict.game}.${dict.gIsReplay}) return false;
                percent = Math.max(0, Math.min(1, Number(percent || 0)));
                var freeLandTarget = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                var sliderValue = Math.max(0, Math.min(1023, Math.round(percent * 1024 - 1)));
                __fx.keybindFunctions.setAbsolute(percent);
                __fx.keybindFunctions.repaintAttackPercentageBar();
                if (typeof ${g.protocolHandler} !== "undefined" && ${g.protocolHandler}.${g.gameCommandSender} && typeof ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack} === "function") {
                    ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack}(sliderValue, freeLandTarget);
                    return true;
                }
                return false;
            };
            var __fxCanAttack = (attacker, target)=> !${dict.game}.${dict.gIsTeamGame};
            var __fxBorders = (left, right)=> {
                if (typeof ${g.teamUtils} !== "undefined" && typeof ${g.teamUtils}.${g.canAttack} === "function") {
                    return ${g.teamUtils}.${g.canAttack}(left, right);
                }
                return true;
            };
            // Deliberately inert stubs. The scoring helpers that use them (inferBotAttackTarget,
            // getBotExposure and the map-walking branches of the safe/best bot scorers) therefore
            // always fall through to their empty result, which is the behaviour the current
            // targeting was tuned against -- do not "fix" them without re-running the benchmarks.
            // The real primitives now exist on __fxAd (g.neighborOffsets / g.isOwnedTile /
            // g.getTileOwner / g.isNeutralTile) if these are ever wired up for real; note they also
            // read ${dict.playerData}.gp / .go for the bot's tiles, which is a name from an older
            // build and no longer resolves either.
            var __fxOffsets = ()=> [1, -1, 512, -512];
            var __fxTileOwned = (tile)=> false;
            var __fxTileOwner = (tile)=> undefined;
            var __fxTileNeutral = (tile)=> false;
            __fx.openingAutomation.attackPlayer=(target)=> {
                if (${dict.game}.${dict.gIsReplay}) return false;
                var humans = Number(${dict.game}.${dict.gHumans});
                var maxPlayers = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                // Automated attacks are bot-only. Fail closed if the human/bot boundary
                // is unavailable, and re-check here so no selector can accidentally send
                // an attack against another player.
                if (!isFinite(humans) || humans < 1) return false;
                if (target < humans || target >= maxPlayers) return false;
                var targetLand = ${dict.playerData}.${dict.playerTerritories}[target];
                if (!targetLand || targetLand <= 0) return false;
                if (!__fxCanAttack(${dict.game}.${dict.playerId}, target)) return false;
                var percent = Number(__fx.keybindFunctions.getAttackPercentage?.() || 0.32);
                if (!isFinite(percent) || percent <= 0) percent = 0.32;
                __fx.keybindFunctions.setAbsolute(percent);
                __fx.keybindFunctions.repaintAttackPercentageBar();
                var sliderValue = Math.max(0, Math.min(1023, Math.round(percent * 1024 - 1)));
                if (typeof ${g.protocolHandler} !== "undefined" && ${g.protocolHandler}.${g.gameCommandSender} && typeof ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack} === "function") {
                    ${g.protocolHandler}.${g.gameCommandSender}.${g.sendAttack}(sliderValue, target);
                    return true;
                }
                return false;
            };
            __fx.openingAutomation.cancelPlayerAttack=(target)=> {
                if (${dict.game}.${dict.gIsReplay}) return false;
                if (target < 0 || target >= ${dict.game}.${dict.gLobbyMaxJoin}) return false;
                if (typeof ${g.protocolHandler} !== "undefined" && ${g.protocolHandler}.${g.gameCommandSender} && typeof ${g.protocolHandler}.${g.gameCommandSender}.${g.cancelAttack} === "function") {
                    ${g.protocolHandler}.${g.gameCommandSender}.${g.cancelAttack}(target);
                    return true;
                }
                return false;
            };
            __fx.openingAutomation.cancelFreeLandAttack=()=> {
                if (${dict.game}.${dict.gIsReplay}) return false;
                var freeLandTarget = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                if (typeof ${g.protocolHandler} !== "undefined" && ${g.protocolHandler}.${g.gameCommandSender} && typeof ${g.protocolHandler}.${g.gameCommandSender}.${g.cancelAttack} === "function") {
                    ${g.protocolHandler}.${g.gameCommandSender}.${g.cancelAttack}(freeLandTarget);
                    return true;
                }
                return false;
            };
            __fx.openingAutomation.getTargetLand=(target)=> ${dict.playerData}.${dict.playerTerritories}[target];
            __fx.openingAutomation.getTargetTroops=(target)=> ${dict.playerData}.${dict.playerBalances}[target];
            __fx.openingAutomation.getBotAttackSnapshot=(target)=> {
                if (target < ${dict.game}.${dict.gHumans} || target >= ${dict.game}.${dict.gLobbyMaxJoin}) return null;
                var targetLand = ${dict.playerData}.${dict.playerTerritories}[target];
                if (targetLand <= 0) return null;
                var targetTroops = ${dict.playerData}.${dict.playerBalances}[target];
                var targetDensity = targetTroops / (targetLand * 150) * 100;
                var attackPercent = Number(__fx.keybindFunctions.getAttackPercentage?.() || 0);
                var playerTroops = ${dict.playerData}.${dict.playerBalances}[${dict.game}.${dict.playerId}];
                return {
                    target,
                    targetName: ${rawPlayerNames}[target],
                    targetLand,
                    targetTroops,
                    targetDensity: Number(targetDensity.toFixed(4)),
                    attackPercent: Number(attackPercent.toFixed(4)),
                    playerTroops,
                    attackTroops: Math.floor(playerTroops * attackPercent)
                };
            };
            __fx.openingAutomation.isLiveLowDensityBotTarget=(target, mode, reserved)=> {
                if (target < ${dict.game}.${dict.gHumans} || target >= ${dict.game}.${dict.gLobbyMaxJoin}) return false;
                var land = ${dict.playerData}.${dict.playerTerritories}[target];
                if (land <= 0) return false;
                if (!__fxBorders(target, ${dict.game}.${dict.playerId}) || !__fxCanAttack(${dict.game}.${dict.playerId}, target)) return false;
                var troops = ${dict.playerData}.${dict.playerBalances}[target];
                var density = troops / (land * 150);
                if (reserved) return isFinite(density) && density <= 0.3;
                if (mode === "raw") {
                    var rawDensity = density * 100;
                    var record = (__fx.openingAutomation.safeBotDensityTracker ||= new Map()).get(target);
                    var now = __fx.openingAutomation.lastTick;
                    var attackTarget = __fx.openingAutomation.inferBotAttackTarget(target);
                    var landGrowthAge = record?.landGrowthTick !== undefined ? now - record.landGrowthTick : Infinity;
                    var lowDensityAge = record?.rawLowDensityTick !== undefined ? now - record.rawLowDensityTick : Infinity;
                    var sizeableTarget = attackTarget && (attackTarget.land >= 300 || attackTarget.land >= land * 0.08);
                    var movingWindow = sizeableTarget && landGrowthAge <= 35;
                    var freshLowDensity = lowDensityAge <= 18;
                    var stationaryException = rawDensity <= 0.1 && land >= 1800 && freshLowDensity;
                    return isFinite(rawDensity) && rawDensity <= 0.3 && (movingWindow || stationaryException);
                }
                if (mode !== "safe" && mode !== "best") return isFinite(density) && density <= 0.2;
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[${dict.game}.${dict.playerId}];
                var estimatedKillCost = troops * 2;
                return isFinite(density) && estimatedKillCost <= ownTroops * 0.55;
            };
            __fx.openingAutomation.findLowDensityBorderingBots=(limit, mode)=> {
                var targets = [];
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    if (${dict.playerData}.${dict.playerTerritories}[id] <= 0) continue;
                    if (!__fxBorders(id, ${dict.game}.${dict.playerId}) || !__fxCanAttack(${dict.game}.${dict.playerId}, id)) continue;
                    var density = ${dict.playerData}.${dict.playerBalances}[id] / (${dict.playerData}.${dict.playerTerritories}[id] * 150);
                    if (density >= 0.4) continue;
                    targets.push({ id, density, land: ${dict.playerData}.${dict.playerTerritories}[id], balance: ${dict.playerData}.${dict.playerBalances}[id] });
                }
                if (mode === "small") targets.sort((a, b) => a.density - b.density || a.land - b.land || a.balance - b.balance);
                else targets.sort((a, b) => a.density - b.density || b.land - a.land || b.balance - a.balance);
                return targets.slice(0, limit || 10).map(target => target.id);
            };
            __fx.openingAutomation.updateSafeBotDensityTracker=()=> {
                var playerId = ${dict.game}.${dict.playerId};
                var now = __fx.openingAutomation.lastTick;
                if (!isFinite(now) || now < 0) now = 0;
                if (__fx.openingAutomation.safeBotDensityTrackerLastUpdate === now) return;
                __fx.openingAutomation.safeBotDensityTrackerLastUpdate = now;
                var tracker = __fx.openingAutomation.safeBotDensityTracker ||= new Map();
                var seen = new Set();
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land <= 0) continue;
                    var record = tracker.get(id) || {};
                    record.landDelta = isFinite(record.land) ? land - record.land : 0;
                    if (isFinite(record.land) && land > record.land) {
                        record.landGrowthTick = now;
                    }
                    if (__fxBorders(id, playerId) && __fxCanAttack(playerId, id)) {
                        var density = ${dict.playerData}.${dict.playerBalances}[id] / (land * 150);
                        if ((!isFinite(record.density) && density < 0.12) || (isFinite(record.density) && record.density >= 0.25 && density < 0.12)) {
                            record.fullsendAt = performance.now();
                        }
                        var rawDensity = density * 100;
                        if (rawDensity <= 0.3) {
                            record.rawLowDensityTick = now;
                        }
                        record.density = density;
                        record.rawDensity = rawDensity;
                    }
                    record.land = land;
                    record.seenAt = now;
                    tracker.set(id, record);
                    seen.add(id);
                }
                tracker.forEach((record, id)=> {
                    if (!seen.has(id) || now - (record.seenAt || 0) > 150) tracker.delete(id);
                });
            };
            __fx.openingAutomation.inferBotAttackTarget=(botId)=> {
                var tracker = __fx.openingAutomation.safeBotDensityTracker ||= new Map();
                var botTiles = ${dict.playerData}.gp?.[botId] || ${dict.playerData}.go?.[botId] || [];
                var offsets = __fxOffsets();
                if (!botTiles.length || offsets.length < 4) return null;
                var best = null;
                for (var tileIndex = botTiles.length - 1; tileIndex >= 0; tileIndex--) {
                    var tile = botTiles[tileIndex];
                    for (var offsetIndex = 3; offsetIndex >= 0; offsetIndex--) {
                        var neighbor = tile + offsets[offsetIndex];
                        if (__fxTileNeutral(neighbor) || !__fxTileOwned(neighbor)) continue;
                        var owner = __fxTileOwner(neighbor);
                        if (owner === botId || owner < ${dict.game}.${dict.gHumans} || owner >= ${dict.game}.${dict.gLobbyMaxJoin}) continue;
                        var record = tracker.get(owner);
                        if (!record || !isFinite(record.landDelta) || record.landDelta >= 0) continue;
                        var land = ${dict.playerData}.${dict.playerTerritories}[owner];
                        if (land <= 0) continue;
                        var loss = -record.landDelta;
                        var score = loss * Math.sqrt(Math.max(1, land));
                        if (!best || score > best.score) best = { id: owner, land, loss, score };
                    }
                }
                return best;
            };
            __fx.openingAutomation.getBotExposure=(botId)=> {
                var playerId = ${dict.game}.${dict.playerId};
                var botTiles = ${dict.playerData}.gp?.[botId] || ${dict.playerData}.go?.[botId] || [];
                var offsets = __fxOffsets();
                var botNeighbors = new Set();
                var playerEdges = 0;
                var botEdges = 0;
                if (!botTiles.length || offsets.length < 4) return { botNeighbors: 0, botEdges: 0, playerEdges: 0, ratio: 0 };
                for (var tileIndex = botTiles.length - 1; tileIndex >= 0; tileIndex--) {
                    var tile = botTiles[tileIndex];
                    for (var offsetIndex = 3; offsetIndex >= 0; offsetIndex--) {
                        var neighbor = tile + offsets[offsetIndex];
                        if (__fxTileNeutral(neighbor) || !__fxTileOwned(neighbor)) continue;
                        var owner = __fxTileOwner(neighbor);
                        if (owner === botId) continue;
                        if (owner === playerId) {
                            playerEdges++;
                        } else if (owner >= ${dict.game}.${dict.gHumans} && owner < ${dict.game}.${dict.gLobbyMaxJoin} && ${dict.playerData}.${dict.playerTerritories}[owner] > 0) {
                            botNeighbors.add(owner);
                            botEdges++;
                        }
                    }
                }
                return {
                    botNeighbors: botNeighbors.size,
                    botEdges,
                    playerEdges,
                    ratio: botEdges / Math.max(1, playerEdges)
                };
            };
            __fx.openingAutomation.findWeakEncapsulatedBot=(attackPercent, mode)=> {
                __fx.openingAutomation.updateSafeBotDensityTracker();
                var playerId = ${dict.game}.${dict.playerId};
                var nowTick = __fx.openingAutomation.lastTick;
                var tickInCycle = nowTick % 100;
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[playerId];
                var ownLand = ${dict.playerData}.${dict.playerTerritories}[playerId];
                if (ownTroops <= 0 || ownLand < 18000 || tickInCycle > 88) return null;
                var requestedPercent = Number(attackPercent);
                var landCap = ownLand < 60000 ? 0.18 : 0.12;
                var cycleCap = tickInCycle < 35 ? 0.26 : tickInCycle < 70 ? 0.38 : 0.42;
                var maxPercent = Math.min(cycleCap, landCap);
                if (isFinite(requestedPercent) && requestedPercent > 0) maxPercent = Math.min(maxPercent, requestedPercent);
                var reserveTroops = ownTroops * 0.18;
                var taxTroops = Math.floor(ownTroops * 12 / 1024);
                var maxSendTroops = Math.max(0, ownTroops - reserveTroops - taxTroops);
                maxSendTroops = Math.min(maxSendTroops, ownTroops * maxPercent);
                if (maxSendTroops < 1) return null;
                var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                var best = null;
                var bestScore = -1;
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land < 120 || land > Math.max(2400, ownLand * 0.10)) continue;
                    if (!__fxBorders(id, playerId) || !__fxCanAttack(playerId, id)) continue;
                    if (recentTargets?.has(id) && nowTick - recentTargets.get(id) < 18) continue;
                    var exposure = __fx.openingAutomation.getBotExposure(id);
                    if (exposure.playerEdges < 8 || exposure.botNeighbors > 1) continue;
                    var troops = ${dict.playerData}.${dict.playerBalances}[id];
                    var density = land > 0 ? troops / (land * 150) * 100 : Infinity;
                    if (!isFinite(density) || density > 0.42) continue;
                    var required = 2 * (land + troops) / (253 / 256);
                    var plannedSendTroops = Math.min(required * 1.16, maxSendTroops);
                    var oneShotRatio = plannedSendTroops / Math.max(1, required);
                    if (oneShotRatio < 1.04 || oneShotRatio > 1.75) continue;
                    var percent = Math.max(0.02, Math.min(maxPercent, plannedSendTroops / Math.max(1, ownTroops)));
                    var score = (land * 2.2 + exposure.playerEdges * 12) * oneShotRatio / Math.sqrt(Math.max(density, 0.06));
                    if (score > bestScore) {
                        best = { target: id, percent, score, oneShotRatio, land, density, exposure };
                        bestScore = score;
                    }
                }
                __fx.openingAutomation.lastWeakEncapsulatedSelection = best;
                return best;
            };
            __fx.openingAutomation.findBestDynamicBotAttackTarget=(tick, options)=> {
                options = options || {};
                __fx.openingAutomation.updateSafeBotDensityTracker();
                var playerId = ${dict.game}.${dict.playerId};
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[playerId];
                var _atkCount = __fxAd ? (__fxAd.gF || __fxAd.gG)?.(playerId) || 0 : 0;
                var _ownOutgoing = 0;
                for (var _ai = 0; _ai < _atkCount; _ai++) { _ownOutgoing += (__fxAd.gK ? __fxAd.gL : __fxAd.gM)?.(playerId, _ai) || 0; }
                if (_ownOutgoing / Math.max(1, ownTroops + _ownOutgoing) >= 0.5) return null;
                var ownLand = ${dict.playerData}.${dict.playerTerritories}[playerId];
                var tickInCycle = tick % 100;
                var fixedPercent = Number(options.fixedPercent);
                var hasFixedPercent = isFinite(fixedPercent) && fixedPercent > 0;
                var forceBest = options.forceBest === true;
                var safeMode = options.mode === "safe";
                var reserveRatio = tickInCycle < 35 ? 0.44 : tickInCycle < 70 ? 0.26 : 0.18;
                var landCap = ownLand < 60000 ? 0.30 : ownLand < 90000 ? 0.15 : 0.10;
                var cycleCap = tickInCycle < 35 ? 0.26 : tickInCycle < 70 ? 0.38 : 0.42;
                var maxPercent = hasFixedPercent ? Math.min(0.50, Math.max(0.01, fixedPercent)) : Math.min(cycleCap, landCap);
                var taxTroops = Math.floor(ownTroops * 12 / 1024);
                var maxSendTroops = Math.max(0, ownTroops - ownTroops * reserveRatio - taxTroops);
                maxSendTroops = Math.min(maxSendTroops, ownTroops * maxPercent);
                if (maxSendTroops < 1) return null;
                var minLand = ownLand < 10000 ? 180 : ownLand < 30000 ? 260 : ownLand < 60000 ? 500 : 700;
                var minScore = tickInCycle < 35
                    ? (ownLand < 60000 ? 520 : 850)
                    : tickInCycle < 70
                        ? (ownLand < 60000 ? 700 : 1050)
                        : (ownLand < 60000 ? 1150 : 1850);
                var stockpilePressure = ownTroops / Math.max(1, ownLand);
                var tracker = __fx.openingAutomation.safeBotDensityTracker ||= new Map();
                var best = null;
                var bestScore = -1;
                var fallbackBest = null;
                var fallbackBestScore = -1;
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land < minLand) continue;
                    if (!__fxBorders(id, playerId) || !__fxCanAttack(playerId, id)) continue;
                    var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                    if (recentTargets?.has(id) && tick - recentTargets.get(id) < (forceBest ? 8 : 14)) continue;
                    var troops = ${dict.playerData}.${dict.playerBalances}[id];
                    var density = land > 0 ? troops / (land * 150) * 100 : Infinity;
                    var maxAllowedDensity = safeMode ? 0.3 : 0.32;
                    if (!isFinite(density) || density > maxAllowedDensity) continue;
                    var record = tracker.get(id);
                    var attackTarget = __fx.openingAutomation.inferBotAttackTarget(id);
                    var landGrowthAge = record?.landGrowthTick !== undefined ? tick - record.landGrowthTick : Infinity;
                    var lowDensityAge = record?.rawLowDensityTick !== undefined ? tick - record.rawLowDensityTick : Infinity;
                    var targetIsSizeable = attackTarget && (attackTarget.land >= (safeMode ? 180 : 300) || attackTarget.land >= land * (safeMode ? 0.04 : 0.08));
                    var movingWindow = targetIsSizeable && landGrowthAge <= (safeMode ? 55 : 35);
                    var freshLowDensity = lowDensityAge <= (safeMode ? 42 : 30);
                    var earlyStationaryException = ownLand < 15000 && density <= (safeMode ? 0.24 : 0.11) && land >= 220 && freshLowDensity;
                    var stationaryException = density <= (safeMode ? 0.24 : 0.12) && land >= (safeMode ? 850 : 1200) && freshLowDensity;
                    var stockpileException = stockpilePressure >= 0.85 && density <= (safeMode ? 0.28 : 0.11) && land >= (safeMode ? 900 : 1500);
                    if (stockpilePressure >= 1.1 && density <= (safeMode ? 0.3 : 0.12) && land >= (safeMode ? 1500 : 2500)) stockpileException = true;
                    var oneShotRequired = 2 * (land + troops) / (253 / 256);
                    var desiredSendTroops = oneShotRequired * (movingWindow ? 1.18 : 1.28);
                    var plannedSendTroops = hasFixedPercent ? maxSendTroops : Math.min(desiredSendTroops, maxSendTroops);
                    var oneShotRatio = plannedSendTroops / Math.max(1, oneShotRequired);
                    if (forceBest) {
                        var forcedDensityScore = Math.pow(land, safeMode ? 1.35 : 1.22) / Math.sqrt(Math.max(density, 0.05));
                        var forcedKillScore = Math.min(1.4, Math.max(0.25, oneShotRatio));
                        var forcedScore = forcedDensityScore * forcedKillScore;
                        if (forcedScore > fallbackBestScore) {
                            fallbackBest = {
                                target: id,
                                percent: Math.max(0.02, Math.min(maxPercent, plannedSendTroops / Math.max(1, ownTroops))),
                                score: forcedScore,
                                oneShotRatio,
                                forced: true
                            };
                            fallbackBestScore = forcedScore;
                        }
                    }
                    if (!movingWindow && !earlyStationaryException && !stationaryException && !stockpileException) continue;
                    var troopKillRatio = plannedSendTroops / Math.max(1, troops * 2.8);
                    if (oneShotRatio < (movingWindow ? 0.95 : 1.05) || oneShotRatio > 2.25) continue;
                    var exposure = __fx.openingAutomation.getBotExposure(id);
                    var exposurePenalty = 1 / (1 + Math.max(0, exposure.botNeighbors - 2) * 0.12);
                    var movingBonus = movingWindow ? 2.4 : stockpileException ? 1.35 : 1;
                    var windowBonus = attackTarget ? 1 + Math.min(1.5, Math.sqrt(Math.max(1, attackTarget.land)) / 65) : 1;
                    var oneShotBonus = 2.4 + Math.min(0.8, oneShotRatio - 1);
                    var troopKillBonus = Math.min(1.4, Math.max(0.7, troopKillRatio));
                    var valueRatio = land / Math.max(1, oneShotRequired);
                    var incomeUrgency = tickInCycle <= 70 ? 1 + (70 - tickInCycle) / 140 : 1;
                    var overpayPenalty = 1 / (1 + Math.max(0, oneShotRatio - 1.25) * 0.45);
                    var score = Math.pow(land, safeMode ? 1.28 : 1.08) * movingBonus * windowBonus * oneShotBonus * troopKillBonus * exposurePenalty * incomeUrgency * overpayPenalty * (1 + valueRatio * (safeMode ? 30 : 22)) / Math.sqrt(Math.max(density, 0.05));
                    if (score < minScore) continue;
                    if (score > bestScore) {
                        best = {
                            target: id,
                            percent: Math.max(0.02, Math.min(maxPercent, plannedSendTroops / Math.max(1, ownTroops))),
                            score,
                            oneShotRatio
                        };
                        bestScore = score;
                    }
                }
                return best || fallbackBest;
            };
            __fx.openingAutomation.findThighClientBotAttackTarget=(tick)=> {
                __fx.openingAutomation.updateSafeBotDensityTracker();
                var playerId = ${dict.game}.${dict.playerId};
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[playerId];
                var ownLand = ${dict.playerData}.${dict.playerTerritories}[playerId];
                var tickInCycle = tick % 100;
                var reserveRatio = tickInCycle < 35 ? 0.44 : tickInCycle < 70 ? 0.26 : 0.18;
                var landCap = ownLand < 60000 ? 0.30 : ownLand < 90000 ? 0.15 : 0.10;
                var cycleCap = tickInCycle < 35 ? 0.26 : tickInCycle < 70 ? 0.38 : 0.42;
                var maxPercent = Math.min(cycleCap, landCap);
                var taxTroops = Math.floor(ownTroops * 12 / 1024);
                var maxSendTroops = Math.max(0, ownTroops - ownTroops * reserveRatio - taxTroops);
                maxSendTroops = Math.min(maxSendTroops, ownTroops * maxPercent);
                if (maxSendTroops < 1) return null;
                var minLand = ownLand < 10000 ? 250 : ownLand < 30000 ? 350 : ownLand < 60000 ? 650 : 900;
                var minScore = tickInCycle < 35
                    ? (ownLand < 60000 ? 750 : 1200)
                    : tickInCycle < 70
                        ? (ownLand < 60000 ? 1000 : 1550)
                        : tickInCycle < 86
                            ? (ownLand < 60000 ? 1550 : 2550)
                            : (ownLand < 60000 ? 2600 : 4200);
                var stockpilePressure = ownTroops / Math.max(1, ownLand);
                var tracker = __fx.openingAutomation.safeBotDensityTracker ||= new Map();
                var best = null;
                var bestScore = -1;
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land <= 0 || land < minLand) continue;
                    if (!__fxBorders(id, playerId) || !__fxCanAttack(playerId, id)) continue;
                    var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                    if (recentTargets?.has(id) && tick - recentTargets.get(id) < 30) continue;
                    var troops = ${dict.playerData}.${dict.playerBalances}[id];
                    var density = land > 0 ? troops / (land * 150) * 100 : Infinity;
                    if (!isFinite(density) || density > 0.26) continue;
                    var record = tracker.get(id);
                    var attackTarget = __fx.openingAutomation.inferBotAttackTarget(id);
                    var landGrowthAge = record?.landGrowthTick !== undefined ? tick - record.landGrowthTick : Infinity;
                    var lowDensityAge = record?.rawLowDensityTick !== undefined ? tick - record.rawLowDensityTick : Infinity;
                    var targetIsSizeable = attackTarget && (attackTarget.land >= 300 || attackTarget.land >= land * 0.08);
                    var movingWindow = targetIsSizeable && landGrowthAge <= 35;
                    var freshLowDensity = lowDensityAge <= 18;
                    var earlyStationaryException = ownLand < 15000 && density <= 0.08 && land >= 300 && freshLowDensity;
                    var earlyFallbackException = ownLand >= 12000 && ownLand < 24000 && tick < 1000 && density <= 0.2 && land >= 350;
                    var stationaryException = density <= 0.09 && land >= 2000 && freshLowDensity;
                    var stockpileException = stockpilePressure >= 0.9 && density <= 0.08 && land >= 2400;
                    if (stockpilePressure >= 1.15 && density <= 0.09 && land >= 3800) stockpileException = true;
                    if (tickInCycle >= 86 && !(movingWindow || stockpileException || (freshLowDensity && density <= 0.12 && land >= 900))) continue;
                    if (!movingWindow && !earlyStationaryException && !earlyFallbackException && !stationaryException && !stockpileException) continue;
                    var oneShotRequired = 2 * (land + troops) / (253 / 256);
                    var desiredSendTroops = oneShotRequired * (movingWindow ? 1.18 : (earlyFallbackException ? 1.22 : 1.28));
                    var plannedSendTroops = Math.min(desiredSendTroops, maxSendTroops);
                    var oneShotRatio = plannedSendTroops / Math.max(1, oneShotRequired);
                    var troopKillRatio = plannedSendTroops / Math.max(1, troops * 2.8);
                    var efficientOneShot = oneShotRatio >= (movingWindow ? 1.1 : (earlyFallbackException ? 1.20 : 1.2)) && oneShotRatio <= 1.8;
                    if (tickInCycle >= 86 && oneShotRatio < 1.24) efficientOneShot = false;
                    if (!efficientOneShot) continue;
                    var exposure = __fx.openingAutomation.getBotExposure(id);
                    var exposurePenalty = 1 / (1 + Math.max(0, exposure.botNeighbors - 2) * 0.12);
                    var movingBonus = movingWindow ? 2.4 : (earlyFallbackException ? 1.7 : (stockpileException ? 1.35 : 1));
                    var windowBonus = attackTarget ? 1 + Math.min(1.5, Math.sqrt(Math.max(1, attackTarget.land)) / 65) : 1;
                    var oneShotBonus = oneShotRatio >= 1 ? 2.4 + Math.min(0.8, oneShotRatio - 1) : 0.9;
                    var troopKillBonus = Math.min(1.4, Math.max(0.7, troopKillRatio));
                    var valueRatio = land / Math.max(1, oneShotRequired);
                    var incomeUrgency = tickInCycle <= 70 ? 1 + (70 - tickInCycle) / 140 : 1;
                    var overpayPenalty = oneShotRatio > 1 ? 1 / (1 + Math.max(0, oneShotRatio - 1.25) * 0.45) : 1;
                    var lateFinishBonus = tickInCycle >= 86 ? (movingWindow ? 1.25 : 0.78) : 1;
                    var score = Math.pow(land, 1.18) * movingBonus * windowBonus * oneShotBonus * troopKillBonus * exposurePenalty * incomeUrgency * overpayPenalty * lateFinishBonus * (1 + valueRatio * 30) / Math.sqrt(Math.max(density, 0.05));
                    if (score < minScore) continue;
                    if (score > bestScore) {
                        best = {
                            target: id,
                            percent: Math.max(0.02, Math.min(maxPercent, plannedSendTroops / Math.max(1, ownTroops))),
                            score,
                            oneShotRatio
                        };
                        bestScore = score;
                    }
                }
                return best;
            };
            __fx.openingAutomation.findSimpleBestBotAttackTarget=(tick)=> {
                var playerId = ${dict.game}.${dict.playerId};
                var humans = Number(${dict.game}.${dict.gHumans});
                var maxPlayers = ${dict.game}.${dict.gLobbyMaxJoin} || 512;
                if (!isFinite(humans) || humans < 1) return -1;
                var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                var best = -1;
                var bestScore = -1;
                for (var id = humans; id < maxPlayers; id++) {
                    if (id === playerId) continue;
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (!land || land <= 0) continue;
                    if (!__fxCanAttack(playerId, id)) continue;
                    if (recentTargets?.has(id) && tick - recentTargets.get(id) < 40) continue;
                    var troops = ${dict.playerData}.${dict.playerBalances}[id];
                    var density = land > 0 ? troops / (land * 150) * 100 : Infinity;
                    if (!isFinite(density) || density > 0.45) continue;
                    var score = Math.pow(land, 1.35) / Math.sqrt(Math.max(density, 0.03));
                    if (score > bestScore) {
                        best = id;
                        bestScore = score;
                    }
                }
                if (best >= 0) return best;
                for (var fallbackId = humans; fallbackId < maxPlayers; fallbackId++) {
                    if (fallbackId === playerId) continue;
                    var fallbackLand = ${dict.playerData}.${dict.playerTerritories}[fallbackId];
                    if (!fallbackLand || fallbackLand <= 0) continue;
                    if (!__fxCanAttack(playerId, fallbackId)) continue;
                    if (recentTargets?.has(fallbackId) && tick - recentTargets.get(fallbackId) < 15) continue;
                    var fallbackTroops = ${dict.playerData}.${dict.playerBalances}[fallbackId];
                    var fallbackDensity = fallbackLand > 0 ? fallbackTroops / (fallbackLand * 150) * 100 : Infinity;
                    if (!isFinite(fallbackDensity)) continue;
                    var fallbackScore = Math.pow(fallbackLand, 1.2) / Math.sqrt(Math.max(fallbackDensity, 0.03));
                    if (fallbackScore > bestScore) {
                        best = fallbackId;
                        bestScore = fallbackScore;
                    }
                }
                return best;
            };
            __fx.openingAutomation.findFullsendEncapsulatedBot=(attackPercent, mode)=> {
                var conservativeMode = mode === "safe";
                var playerId = ${dict.game}.${dict.playerId};
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[playerId];
                var now = performance.now();
                var stats = { type: "safe-check", kind: "reserved", considered: 0, lowDensity: 0, rejectKill: 0, selected: false };
                var isEncapsulatedBot = (botId)=> {
                    var botTiles = ${dict.playerData}.gp?.[botId] || ${dict.playerData}.go?.[botId] || [];
                    var offsets = __fxOffsets();
                    var touchesUs = false;
                    if (!botTiles.length || offsets.length < 4) return false;
                    for (var tileIndex = botTiles.length - 1; tileIndex >= 0; tileIndex--) {
                        var tile = botTiles[tileIndex];
                        for (var offsetIndex = 3; offsetIndex >= 0; offsetIndex--) {
                            var neighbor = tile + offsets[offsetIndex];
                            if (__fxTileNeutral(neighbor)) return false;
                            if (!__fxTileOwned(neighbor)) continue;
                            var owner = __fxTileOwner(neighbor);
                            if (owner === botId) continue;
                            if (owner !== playerId) return false;
                            touchesUs = true;
                        }
                    }
                    return touchesUs;
                };
                var best = -1, bestScore = -1;
                var bestInfo = null;
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land <= 0) continue;
                    if (!__fxBorders(id, playerId) || !__fxCanAttack(playerId, id)) continue;
                    if (!isEncapsulatedBot(id)) continue;
                    var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                    if (recentTargets?.has(id) && now - recentTargets.get(id) < 5000) continue;
                    stats.considered++;
                    var botTroops = ${dict.playerData}.${dict.playerBalances}[id];
                    var density = botTroops / (land * 150);
                    if (density >= 0.3) continue;
                    stats.lowDensity++;
                    var estimatedKillCost = botTroops * 2;
                    var minSendPercent = estimatedKillCost / Math.max(1, ownTroops);
                    var recommendedSendPercent = Math.min(conservativeMode ? 0.12 : 0.50, Math.max(0.05, minSendPercent * 1.1));
                    var actualSendTroops = ownTroops * recommendedSendPercent;
                    var fullKillRatio = actualSendTroops / Math.max(1, estimatedKillCost);
                    if (fullKillRatio < 0.7) {
                        stats.rejectKill++;
                        continue;
                    }
                    var score = (land * land) / Math.max(1, estimatedKillCost);
                    if (score > bestScore) {
                        best = id;
                        bestScore = score;
                        bestInfo = { id, land, density, fullKillRatio, estimatedKillCost, recommendedSendPercent, score };
                    }
                }
                if (bestInfo) {
                    stats.selected = true;
                    stats.target = bestInfo;
                }
                __fx.openingAutomation.lastSafeReservedSelection = bestInfo;
                __fx.openingAutomation.recordSafeTelemetry(stats);
                return best;
            };
            __fx.openingAutomation.findBestLowDensityBorderingBot=(cycleProgress, mode, attackPercent, excludeEncapsulated)=> {
                cycleProgress = Math.max(0, Math.min(0.99, Number(cycleProgress) || 0));
                var playerId = ${dict.game}.${dict.playerId};
                var now = performance.now();
                var safeMode = mode === "safe" || mode === "best";
                var conservativeMode = mode === "safe";
                var rawMode = mode === "raw";
                if (!safeMode) __fx.openingAutomation.updateSafeBotDensityTracker();
                var ownTroops = ${dict.playerData}.${dict.playerBalances}[playerId];
                var sendPercent = Number(attackPercent);
                if (!isFinite(sendPercent) || sendPercent <= 0) sendPercent = Number(__fx.keybindFunctions.getAttackPercentage?.() || 0);
                var sendTroops = ownTroops * sendPercent;
                var tracker = safeMode ? null : (__fx.openingAutomation.safeBotDensityTracker ||= new Map());
                var minKillRatio = safeMode ? 0 : (cycleProgress >= 0.65 ? 0.7 : 0.45);
                var stats = safeMode ? { type: "safe-check", kind: "normal", cycleProgress, considered: 0, rejectKill: 0, selected: false } : null;
                var fallbackBest = -1, fallbackScore = -1, fallbackInfo = null;
                var isEncapsulatedBot = (botId)=> {
                    var botTiles = ${dict.playerData}.gp?.[botId] || ${dict.playerData}.go?.[botId] || [];
                    var offsets = __fxOffsets();
                    var touchesUs = false;
                    if (!botTiles.length || offsets.length < 4) return false;
                    for (var tileIndex = botTiles.length - 1; tileIndex >= 0; tileIndex--) {
                        var tile = botTiles[tileIndex];
                        for (var offsetIndex = 3; offsetIndex >= 0; offsetIndex--) {
                            var neighbor = tile + offsets[offsetIndex];
                            if (__fxTileNeutral(neighbor)) return false;
                            if (!__fxTileOwned(neighbor)) continue;
                            var owner = __fxTileOwner(neighbor);
                            if (owner === botId) continue;
                            if (owner !== playerId) return false;
                            touchesUs = true;
                        }
                    }
                    return touchesUs;
                };
                var best = -1, bestScore = -1;
                var bestInfo = null;
                for (var id = ${dict.game}.${dict.gHumans}; id < ${dict.game}.${dict.gLobbyMaxJoin}; id++) {
                    var land = ${dict.playerData}.${dict.playerTerritories}[id];
                    if (land <= 0) continue;
                    if (!__fxBorders(id, playerId) || !__fxCanAttack(playerId, id)) continue;
                    var botTroops = ${dict.playerData}.${dict.playerBalances}[id];
                    var encapsulated = isEncapsulatedBot(id);
                    if (excludeEncapsulated && encapsulated) continue;
                    var density = botTroops / (land * 150);
                    var score;
                    if (safeMode) {
                        var recentTargets = __fx.openingAutomation.autoAttackRecentTargets;
                        if (recentTargets?.has(id) && now - recentTargets.get(id) < 5000) continue;
                        stats.considered++;
                        // Only attack bots with very low troop density — they have almost no troops to defend
                        var safeDensity = botTroops / Math.max(1, land * 100);
                        var densityThreshold = land >= 3000 ? 0.05 : land >= 2000 ? 0.04 : land >= 1000 ? 0.03 : 0.02;
                        if (safeDensity > densityThreshold) { stats.rejectDensity = (stats.rejectDensity || 0) + 1; continue; }
                        var killCost = botTroops * 2;
                        var minSendPercent = killCost / Math.max(1, ownTroops);
                        var recommendedSendPercent = Math.min(conservativeMode ? 0.12 : 0.50, Math.max(0.05, minSendPercent * 1.6));
                        var actualSendTroops = ownTroops * recommendedSendPercent;
                        var requiredKillRatio = encapsulated ? 0.7 : 1.0;
                        var fullKillRatio = actualSendTroops / Math.max(1, killCost);
                        if (fullKillRatio < requiredKillRatio) { stats.rejectKill++; continue; }
                        score = (land * land) / Math.max(1, killCost);
                        if (encapsulated) score *= 2;
                        if (score > bestScore) {
                            best = id; bestScore = score;
                            bestInfo = { id, land, safeDensity: safeDensity.toFixed(4), killCost, fullKillRatio, recommendedSendPercent, score };
                        }
                    } else if (rawMode) {
                        var recentRawTargets = __fx.openingAutomation.autoAttackRecentTargets;
                        if (recentRawTargets?.has(id) && __fx.openingAutomation.lastTick - recentRawTargets.get(id) < 30) continue;
                        var rawDensity = density * 100;
                        if (!isFinite(rawDensity) || rawDensity > 0.3) continue;
                        var rawRecord = tracker.get(id);
                        var rawAttackTarget = __fx.openingAutomation.inferBotAttackTarget(id);
                        var rawLandGrowthAge = rawRecord?.landGrowthTick !== undefined ? __fx.openingAutomation.lastTick - rawRecord.landGrowthTick : Infinity;
                        var rawLowDensityAge = rawRecord?.rawLowDensityTick !== undefined ? __fx.openingAutomation.lastTick - rawRecord.rawLowDensityTick : Infinity;
                        var rawTargetIsSizeable = rawAttackTarget && (rawAttackTarget.land >= 300 || rawAttackTarget.land >= land * 0.08);
                        var rawMovingWindow = rawTargetIsSizeable && rawLandGrowthAge <= 35;
                        var rawFreshLowDensity = rawLowDensityAge <= 18;
                        var rawStationaryException = rawDensity <= 0.1 && land >= 1800 && rawFreshLowDensity;
                        if (!rawMovingWindow && !rawStationaryException) continue;
                        var rawKillRatio = sendTroops / Math.max(1, botTroops * 2);
                        if (rawKillRatio < (rawMovingWindow ? 0.2 : 0.45)) continue;
                        var rawExposure = __fx.openingAutomation.getBotExposure(id);
                        var rawExposurePenalty = 1 / (1 + Math.max(0, rawExposure.botNeighbors - 2) * 0.12);
                        var rawMovingBonus = rawMovingWindow ? 2.4 : 1;
                        var rawWindowBonus = rawAttackTarget ? 1 + Math.min(1.5, Math.sqrt(Math.max(1, rawAttackTarget.land)) / 65) : 1;
                        var rawKillBonus = Math.min(1.7, Math.max(0.35, rawKillRatio));
                        var rawDensityFloor = Math.max(rawDensity, 0.05);
                        score = Math.pow(land, 1.08) * rawMovingBonus * rawWindowBonus * rawKillBonus * rawExposurePenalty / Math.sqrt(rawDensityFloor);
                        if (score > bestScore) {
                            best = id; bestScore = score;
                            bestInfo = {
                                id,
                                land,
                                density: Number(rawDensity.toFixed(4)),
                                score,
                                moving: rawMovingWindow,
                                lowDensityAge: isFinite(rawLowDensityAge) ? Math.round(rawLowDensityAge) : null,
                                landGrowthAge: isFinite(rawLandGrowthAge) ? Math.round(rawLandGrowthAge) : null,
                                attackTarget: rawAttackTarget,
                                killRatio: rawKillRatio,
                                exposure: rawExposure
                            };
                        }
                    } else {
                        // Best mode: density threshold + freshness filter + original score formula
                        if (density > 0.2) continue;
                        var record = tracker.get(id);
                        var age = record?.fullsendAt ? Math.round(now - record.fullsendAt) : null;
                        var landGrowthAge = record?.landGrowthAt ? Math.round(now - record.landGrowthAt) : null;
                        var attackTarget = __fx.openingAutomation.inferBotAttackTarget(id);
                        var maxFreshAge = density <= 0.12 ? 1400 : 1000;
                        var targetIsSizeable = attackTarget && (attackTarget.land >= 300 || attackTarget.land >= land * 0.08);
                        var recentlyGrowing = landGrowthAge !== null && landGrowthAge <= 1400 && targetIsSizeable;
                        var recentlyDropped = age !== null && age <= maxFreshAge;
                        if (!record || (!recentlyGrowing && !recentlyDropped)) continue;
                        density = Math.max(density, 0.001);
                        var killRatio = sendTroops / Math.max(1, botTroops * 2);
                        var reqKillRatio = encapsulated ? Math.max(0.35, minKillRatio - 0.15) : minKillRatio;
                        if (killRatio < reqKillRatio) continue;
                        score = Math.pow(land, 1.1) / Math.pow(density, 1.4) * Math.pow(Math.min(killRatio, 1.6), 2.5);
                        if (attackTarget) score *= 1 + Math.min(1.5, Math.sqrt(Math.max(1, attackTarget.land)) / 60);
                        if (encapsulated) score *= killRatio >= 1 ? 8 : 4;
                        if (score > bestScore) {
                            best = id; bestScore = score;
                            bestInfo = { id, land, density, killRatio, reqKillRatio, age, landGrowthAge, attackTarget, score };
                        }
                    }
                }
                if (rawMode && best === -1 && fallbackBest !== -1) { best = fallbackBest; bestInfo = fallbackInfo; }
                if (safeMode) {
                    if (bestInfo) { stats.selected = true; stats.target = bestInfo; }
                    __fx.openingAutomation.lastSafeNormalSelection = bestInfo;
                    __fx.openingAutomation.recordSafeTelemetry(stats);
                }
                return best;
            };
            __fx.openingAutomation.findLowDensityBorderingBot=()=> __fx.openingAutomation.findLowDensityBorderingBots(1)[0] ?? -1;
            $2`);

        replaceOne(/(this\.\w+=function\(\)\{this\.(\w+)\.(\w+)\+\+)(\})/g,
            "$1,__fx.openingAutomation.onTick(this.$2.$3),__fx.openingAutomation.onTickAutoAttack(this.$2.$3)$4");
    }

    // Set the default font to Trebuchet MS
    replaceOrWarn("default font", /sans-serif"/g, 'Trebuchet MS"');

    // Track donations
    replaceOne(/(this\.\w+=function\((\w+),(\w+)\)\{)(\2===\w+\.\w+&&\(\w+\.\w+\((\w+\.\w+)\[0\],\5\[1\],\3\),this\.(\w+)\[12\]\+=\5\[1\],this\.\6\[16\]\+=\5\[0\]\),\3===\w+\.\w+&&\()/g,
        `$1 __fx.donationsTracker.logDonation($2, $3, $5[0], ${dict.sidebar}.${dict.getTime}()); $4`)

    // Detailed team pie chart percentage
    replaceRawCode(`qr=Math.floor(100*f0+.5)+"%"`,
        `qr = (__fx.settings.detailedTeamPercentage ? (100*f0).toFixed(2) : Math.floor(100*f0+.5)) + "%"`)
    replaceRawCode(",fontSize=+dz*Math.min(f0,.37);", ",fontSize=(__fx.settings.detailedTeamPercentage ? 0.75 : 1)*dz*Math.min(f0,.37);")

    // Draw Omen background image on menu screen
    // Draw the Omen menu background right after MenuManager.draw hands the screen to its
    // background pass, so it sits under the menu widgets. Anchored on the minified shape
    // `<ctx>.imageSmoothingEnabled=!0,this.<drawBackground>(),` -- replaceOne, so a game update
    // that moves it fails the build instead of quietly dropping the branding.
    // Only when no map raster is on screen: that background pass either fills the screen with a
    // flat colour (nothing to preserve, so our image goes there) or blits the map -- which is the
    // lobby's map preview, and must stay visible.
    replaceOne(/(\w+)(\.imageSmoothingEnabled=!0,this\.\w+\(\),)/g,
        `$1$2(typeof __fx!=="undefined"&&__fx.omenDrawMenuBg&&!${dict.mapHolder}.${g.mapIsRendered}&&__fx.omenDrawMenuBg($1)),`
    );

    console.log('Removing ads...');
    // Remove ads
    replaceOrWarn("ad script removal", '//api.adinplay.com/libs/aiptag/pub/TRT/territorial.io/tag.min.js', '');
}

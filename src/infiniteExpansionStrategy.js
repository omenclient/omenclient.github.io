export const INFINITE_EXPANSION_START_TICK = 508;
export const INFINITE_EXPANSION_END_CYCLE = 9;

export function computeInfiniteExpansionStartTick(cycle, neutralBorderTiles) {
    const baseStart = cycle === 5 ? 40 : cycle === 6 ? 40 : cycle === 7 ? 25 : 15;
    const referenceTiles = cycle === 5 ? 184 : cycle === 6 ? 220 : cycle === 7 ? 272 : 336;
    return Math.max(2, Math.round(baseStart * neutralBorderTiles / referenceTiles));
}

export function getInfiniteExpansionMaxSendPercent(ownLand) {
    if (ownLand < 15000) return 0.35;
    if (ownLand < 30000) return 0.30;
    return 0.25;
}

// Ported from ThighClient MPV3's runInfiniteExpansion (the border-tile-driven rewrite, not the
// older ratio/plan-based generation). Models neutral expansion as a troop-flow-to-consume-borders
// system instead of a flat percent-per-attack: keep enough troops in flight to cover what the
// border tiles are consuming, refill once that flow drops too low, and dump any leftover troops
// right before the cycle ends instead of losing them to the next cycle's income cap.
export function getDynamicInfiniteExpansionDecision({
    tick,
    hasAccessibleNeutralLand,
    neutralBorderTiles,
    neutralOutgoing,
    homeTroops,
    ownLand,
    started,
    optimalStart,
    lastAttackTick
}) {
    if (tick < INFINITE_EXPANSION_START_TICK) return { type: "wait" };

    const cycle = Math.floor(tick / 100);
    const tickInCycle = tick % 100;
    if (cycle >= INFINITE_EXPANSION_END_CYCLE) {
        return { type: "finish", cancelNeutral: neutralOutgoing > 0 };
    }
    if (tickInCycle >= 96) return { type: "wait" };

    // Dump remaining troops into the last live attack before the cycle locks (tickInCycle 90-95)
    // rather than let them sit idle once regular sends stop being worth the overhead.
    if (started && tickInCycle >= 90 && hasAccessibleNeutralLand) {
        if (homeTroops > 200 && neutralOutgoing < homeTroops && tick - lastAttackTick >= 1) {
            const dumpPercent = Math.min(0.95, (homeTroops - 100) / Math.max(1, homeTroops));
            return { type: "attack", optimalStart, percent: dumpPercent };
        }
    }

    if (!hasAccessibleNeutralLand) {
        return { type: "finish", cancelNeutral: false };
    }

    // Border list can transiently read 0 tiles mid-tile-update; retry rather than giving up outright.
    if (neutralBorderTiles <= 0) return { type: "wait", optimalStart };

    const nextOptimalStart = optimalStart < 0
        ? computeInfiniteExpansionStartTick(cycle, neutralBorderTiles)
        : optimalStart;

    let effectiveStarted = started;
    if (!effectiveStarted) {
        if (tickInCycle < nextOptimalStart) return { type: "wait", optimalStart: nextOptimalStart };
        // Troops already outgoing toward neutral land (e.g. from a prior cycle's late send)
        // count as already started, without forcing an extra send this tick.
        if (neutralOutgoing > 0) effectiveStarted = true;
    }

    if (tick - lastAttackTick < 1) return { type: "wait", optimalStart: nextOptimalStart, started: effectiveStarted || undefined };

    const maxSendPercent = getInfiniteExpansionMaxSendPercent(ownLand);
    const minToKeepAlive = 3 * neutralBorderTiles;
    const consumptionPerTick = 2 * neutralBorderTiles;
    const targetOutgoing = minToKeepAlive + consumptionPerTick * 8;
    const refillThreshold = minToKeepAlive + consumptionPerTick * 3;

    if (!effectiveStarted || neutralOutgoing <= 0) {
        if (neutralOutgoing <= 0 && tickInCycle >= 91) return { type: "wait", optimalStart: nextOptimalStart };
        const sendTarget = minToKeepAlive + consumptionPerTick * 5;
        let initialSend = Math.min(sendTarget, homeTroops * maxSendPercent);
        if (initialSend < minToKeepAlive && homeTroops > minToKeepAlive * 2) initialSend = minToKeepAlive;
        if (initialSend < consumptionPerTick * 3) return { type: "wait", optimalStart: nextOptimalStart };
        const percent = Math.max(0.02, Math.min(maxSendPercent, initialSend / Math.max(1, homeTroops)));
        return { type: "attack", optimalStart: nextOptimalStart, percent, started: true };
    }

    // Outgoing troops still cover consumption comfortably; let the bot-attack systems use any
    // surplus instead of duplicating their targeting here.
    if (neutralOutgoing > refillThreshold) return { type: "wait", optimalStart: nextOptimalStart, started: true };

    const neededTroops = targetOutgoing - neutralOutgoing;
    if (neededTroops <= 0) return { type: "wait", optimalStart: nextOptimalStart, started: true };

    const maxSend = homeTroops * maxSendPercent;
    const sendTroops = Math.min(neededTroops, maxSend);
    if (sendTroops < 50) return { type: "wait", optimalStart: nextOptimalStart, started: true };

    const percent = Math.max(0.02, Math.min(maxSendPercent, sendTroops / Math.max(1, homeTroops)));
    return { type: "attack", optimalStart: nextOptimalStart, percent, started: true };
}

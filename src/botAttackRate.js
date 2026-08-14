export const CYCLE_MS = 5600;

export function attacksPerCycleToIntervalMs(attacksPerCycle) {
    const attacks = Number(attacksPerCycle);
    if (!Number.isFinite(attacks) || attacks <= 0) return 0;
    return Math.round(CYCLE_MS / Math.min(20, attacks));
}

export function intervalMsToAttacksPerCycle(intervalMs) {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval <= 0) return 0;
    return Math.min(20, Math.max(0, Math.round(CYCLE_MS / interval)));
}

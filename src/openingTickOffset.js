const OFFSET_UNIT_VERSION = "internal100-v3";

function formatOffset(value) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function openingTickOffsetToInternalTicks(value) {
  const offset = Number(value || 0);
  return Number.isFinite(offset) ? offset : 0;
}

function migrateOpeningTickOffset(settings) {
  if (settings.openingAutomationTickOffsetUnit === OFFSET_UNIT_VERSION) return false;

  const oldOffset = Number(settings.openingAutomationTickOffset || 0);
  const wasInternal100 = settings.openingAutomationTickOffsetUnit === "internal100"
    || settings.openingAutomationTickOffsetUnit === "internal100-v2"
    || settings.openingAutomationTickOffsetUnit === "internal100-v3";
  const displayOffset = wasInternal100 ? oldOffset : oldOffset * 10;
  settings.openingAutomationTickOffset = Number.isFinite(oldOffset)
    ? formatOffset(displayOffset)
    : "0";
  settings.openingAutomationTickOffsetUnit = OFFSET_UNIT_VERSION;
  return true;
}

function shouldMigrateOpeningTickOffset(savedSettings) {
  return Boolean(
    savedSettings
    && Object.prototype.hasOwnProperty.call(savedSettings, "openingAutomationTickOffset")
    && savedSettings.openingAutomationTickOffsetUnit !== OFFSET_UNIT_VERSION
  );
}

export {
  OFFSET_UNIT_VERSION,
  migrateOpeningTickOffset,
  openingTickOffsetToInternalTicks,
  shouldMigrateOpeningTickOffset
};

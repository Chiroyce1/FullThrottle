// ─── Telemetry chart constants ────────────────────────────────────────────────

/** Height in px for the smaller telemetry charts (throttle, brake, rpm, gear) */
export const CHART_HEIGHT = 150;

/** Height in px for the main speed chart */
export const CHART_HEIGHT_SPEED = 300;

// ─── Lap time constants ───────────────────────────────────────────────────────

/** Maximum plausible F1 lap time in seconds — anything above is treated as invalid */
export const MAX_LAP_TIME_SECONDS = 600;

// ─── LiCO (Lift and Coast) detection ─────────────────────────────────────────

/** Default throttle % threshold below which a segment is flagged as LiCO.
 *  The live value comes from user settings (licoThrottleSensitivity); this
 *  is the hard-wired fallback used on the telemetry comparison page. */
export const LICO_THROTTLE_THRESHOLD = 20;

/** Minimum distance (metres) a LiCO segment must span to be rendered */
export const LICO_MIN_DISTANCE = 20;

/** Highlight colour used to shade LiCO regions on charts */
export const LICO_COLOR = "#7dd3fc";

// ─── Slot / driver defaults ───────────────────────────────────────────────────

/**
 * Colour palette used as fallback when a slot's driver has no team colour.
 * Index 0 = slot A, 1 = slot B, …
 */
export const SLOT_FALLBACK_COLORS = [
	"#ef4444",
	"#3b82f6",
	"#22c55e",
	"#f59e0b",
	"#a855f7",
	"#06b6d4",
] as const;

/**
 * Driver numbers (as strings) auto-selected for slot A and slot B on the
 * telemetry page when metadata first loads.
 *  63 = George Russell  |  44 = Lewis Hamilton
 */
export const DEFAULT_DRIVER_NUMBERS = ["63", "44"] as const;

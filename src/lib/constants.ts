// ─── Lap time constants ───────────────────────────────────────────────────────

/** Maximum plausible F1 lap time in seconds. Anything above counts as invalid. */
export const MAX_LAP_TIME_SECONDS = 600;

// ─── LiCO (Lift and Coast) detection ─────────────────────────────────────────

/** Default throttle % threshold below which a segment is flagged as LiCO.
 *  Users can override it via settings.licoThrottleSensitivity. */
export const LICO_THROTTLE_THRESHOLD = 20;

/**
 * Minimum coast (metres, from lifting to braking) that counts as LiCO. On
 * real 2026 race laps the gap between lifting and braking is a median 5 m
 * and under ~35 m for 90% of braking zones (pedal transitions and sample
 * spacing); 60 m+ is ~2%, deliberate lifts.
 */
export const LICO_MIN_DISTANCE = 60;

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

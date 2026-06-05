// ─── Parquet Row (snake_case, matches Python output columns) ──────────────

export interface TelemetryRow {
  session_time: number;
  distance: number;
  speed: number;
  rpm: number;
  n_gear: number;
  throttle: number;
  brake: boolean;
  drs: number;
  x: number;
  y: number;
  z: number;
  driver_number: number;
  distance_to_driver_ahead: number;
  time_gap?: number;
  lap_number: number;
  stint: number;
  compound: CompoundType;
  tyre_life: number;
  track_status: number;
  position: number;
  in_pit?: boolean;
}

export type SectorStatus = "purple" | "green" | "yellow" | "none";

export interface TelemetryFrameRow extends TelemetryRow {
  _cached_last_lap?: number | null;
  _cached_best_lap?: number | null;
  _cached_current_lap?: number | null;
  _is_purple?: boolean;
  _sector1_state?: SectorStatus;
  _sector2_state?: SectorStatus;
  _sector3_state?: SectorStatus;
  _sector1_time?: number | null;
  _sector2_time?: number | null;
  _sector3_time?: number | null;
  gap_to_leader?: number;
}

// ─── Tyre Compound Literal Union ─────────────────────────────────────────

export type CompoundType =
  | "SOFT"
  | "MEDIUM"
  | "HARD"
  | "INTERMEDIATE"
  | "WET"
  | "UNKNOWN"
  | string; // fallback for future additions

// ─── Valid Lap Data (from JSON sidecar) ──────────────────────────────────

export interface ValidLap {
  lap_number: number;
  lap_time: number;
  sector1: number;
  sector2: number;
  sector3: number;
  compound: CompoundType;
  tyre_life: number;
  is_personal_best: boolean;
}

// ─── Driver Metadata (from JSON sidecar) ─────────────────────────────────

export interface DriverMeta {
  driver_number: number;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  abbreviation: string | null;
  broadcast_name: string | null;
  team: string | null;
  team_id: string | null;
  color: string | null;
  country_code: string | null;
  headshot_url: string | null;
  grid: number;
  pos: number;
  valid_laps?: ValidLap[];
}

// ─── Session Info (from JSON sidecar) ────────────────────────────────────

export interface SessionInfo {
  name: string;
  type: string;
  round?: number;
  year?: number;
  country?: string | null;
  location?: string | null;
  circuit?: string | null;
  date?: string | null;
  session_name?: string;
  // Testing-only
  test_number?: number;
  day?: number;
  // UI-computed
  totalLaps?: number;
}

// ─── Qualifying Phase Entry ──────────────────────────────────────────────

export interface QualiPhaseEntry {
  q1: number | null;
  q2: number | null;
  q3: number | null;
}

// ─── Full Telemetry Metadata Envelope ────────────────────────────────────

export interface TelemetryMeta {
  session_info: SessionInfo;
  drivers: Record<string, DriverMeta>;
  qualifying?: Record<string, QualiPhaseEntry>;
}

// ─── Reusable Helper Types ───────────────────────────────────────────────

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackStatusSegment {
  start: number;
  end: number;
  status: number;
}

export interface LapTimingEntry {
  lap: number;
  time: number;
  compound: CompoundType;
  stint: number;
  tyreLife: number;
}

export interface StintEntry {
  stint: number;
  compound: CompoundType;
  startLap: number;
  endLap: number;
  laps: number;
}

export interface LeaderboardEntry {
  id: string;
  row: TelemetryFrameRow;
  meta: DriverMeta | null | undefined;
}

export interface DriverCompareMetaRef {
  name: string;
  color: string;
}

// Compound → hex color mapping (reusable constant)
export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#ef4444",
  MEDIUM: "#eab308",
  HARD: "#e4e4e7",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
  UNKNOWN: "#71717a",
} as const;

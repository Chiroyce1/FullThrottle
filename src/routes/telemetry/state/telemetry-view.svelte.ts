/**
 * View-level state for the telemetry page: chart interaction (hover, zoom),
 * display toggles, track corners, and everything derived from the loaded
 * laps for the charts, map and tables. Data loading stays in TelemetryState.
 *
 * Must be constructed during component initialisation (it registers an
 * effect that loads track corners for the selected circuit).
 */
import type { ChartSeries } from "$lib/components/SyncedTelemetryChart.svelte";
import { alignLapToReference, type LapAlignment } from "$lib/telemetry/align";
import { analyzeCorners, cornerKey } from "$lib/telemetry/corners";
import { loadTrackCorners, type TrackCorner } from "$lib/track-corners";
import type { ValidLap } from "$lib/types";
import { settings } from "$lib/settings";
import { rowAtDist, buildSpeedDeltaSegmentsN } from "../telemetry-utils";
import type { TelemetryState } from "./telemetry-state.svelte";
import {
	activeCornerAt,
	activeCornerSummary,
	computeApexMarkers,
	computeLicoHighlights,
	hoverCursorDots,
	cornerRows,
	type LapIdentity,
} from "./view-derivations";

export class TelemetryView {
	readonly tm: TelemetryState;

	// ── Interaction & display state ─────────────────────────────────────
	xDomain = $state<[number, number] | null>(null);
	hoverDist = $state<number | null>(null);
	showCorners = $state(true);
	showCornerSpeeds = $state(true);
	trackCorners = $state<TrackCorner[]>([]);
	/** The circuit's usual map orientation (FastF1), degrees. */
	trackRotation = $state(0);
	#lastCornerLocation = "";

	constructor(tm: TelemetryState) {
		this.tm = tm;

		$effect(() => {
			const location = this.tm.roundData(0)?.location || "";
			if (location === this.#lastCornerLocation) return;
			this.#lastCornerLocation = location;
			if (!location) {
				this.trackCorners = [];
				this.trackRotation = 0;
				return;
			}
			loadTrackCorners(location).then((data) => {
				this.trackCorners = data?.corners ?? [];
				this.trackRotation = data?.rotation ?? 0;
			});
		});
	}

	// ── Lap alignment ───────────────────────────────────────────────────
	// Lap slices start at slightly different physical points per driver
	// (sampling phase, dropouts at the line, misassigned boundaries in race
	// data). Overlaying raw slices compares different pieces of tarmac, so
	// every non-reference lap is shift-aligned to the reference lap by
	// maximizing speed-trace correlation.
	readonly alignedLaps = $derived.by(() => {
		const raw = this.tm.slots.map((_, sid) => this.tm.lapData(sid));
		const refIdx = raw.findIndex((d) => d.length >= 2);
		return raw.map((data, sid) => {
			if (data.length < 2 || sid === refIdx || refIdx < 0) {
				return { rows: data, alignment: null as LapAlignment | null };
			}
			return alignLapToReference(raw[refIdx], data);
		});
	});

	alignedData(sid: number) {
		return this.alignedLaps[sid]?.rows ?? [];
	}

	/**
	 * Laps whose traces barely correlate even after shifting (pit laps,
	 * broken slices): flagged instead of showing fake-precision overlays.
	 */
	readonly weakAlignmentTlas = $derived.by(() =>
		this.alignedLaps
			.map((a, sid) => ({ sid, alignment: a.alignment }))
			.filter((x) => x.alignment !== null && !x.alignment.confident)
			.map((x) => this.tm.driverTla(x.sid)),
	);

	// ── Charts ──────────────────────────────────────────────────────────
	readonly series = $derived.by<ChartSeries[]>(() =>
		this.tm.slots
			.map((_, sid) => ({
				data: this.alignedData(sid),
				color: this.tm.color(sid),
				label: this.tm.driverTla(sid),
			}))
			.filter((s) => s.data.length > 0),
	);

	// Read once per view: the setting is changed on /settings, which remounts this page.
	readonly #licoThreshold = settings.licoThrottleSensitivity;

	readonly licoHighlights = $derived.by(() =>
		computeLicoHighlights(
			this.series.map((s) => s.data),
			this.#licoThreshold,
		),
	);

	readonly hasData = $derived.by(() => this.series.length > 0);

	// ── Hover ───────────────────────────────────────────────────────────
	readonly hoverRows = $derived.by(() =>
		this.tm.slots.map((_, sid) => rowAtDist(this.alignedData(sid), this.hoverDist)),
	);

	readonly mapCursor = $derived.by(() => {
		if (this.hoverDist === null) return [];
		return hoverCursorDots(
			this.hoverRows.map((row, sid) =>
				row ? { tla: this.tm.driverTla(sid), row } : null,
			),
		);
	});

	// ── Track map ───────────────────────────────────────────────────────
	readonly speedDeltaSegments = $derived.by(() => {
		const datasets = this.tm.slots
			.map((_, sid) => ({ data: this.alignedData(sid), color: this.tm.color(sid) }))
			.filter((d) => d.data.length >= 2);
		if (datasets.length < 2) return [];
		return buildSpeedDeltaSegmentsN(datasets);
	});

	readonly speedDeltaMode = $derived.by(() =>
		this.tm.slots.length > 1 &&
			this.tm.lapData(0).length > 0 &&
			this.tm.lapData(1).length > 0,
	);

	readonly visibleCorners = $derived.by(() => (this.showCorners ? this.corners.corners : []));

	// ── Lap stats ───────────────────────────────────────────────────────
	readonly lapStats = $derived.by(() =>
		this.tm.slots.map((_, sid) => ({
			tla: this.tm.driverTla(sid),
			color: this.tm.color(sid),
			lap: this.#selectedLap(sid),
		})),
	);

	#selectedLap(sid: number): ValidLap | null {
		const slot = this.tm.slots[sid];
		if (!slot?.driver || !slot.lap || !slot.meta) return null;
		const driverMeta = slot.meta.drivers[slot.driver];
		if (!driverMeta?.valid_laps) return null;
		return (
			driverMeta.valid_laps.find((l: ValidLap) => l.lap_number === slot.lap) ??
			null
		);
	}

	// ── Corners ─────────────────────────────────────────────────────────
	readonly #laps = $derived.by<LapIdentity[]>(() =>
		this.tm.slots.map((_, sid) => ({ tla: this.tm.driverTla(sid), color: this.tm.color(sid) })),
	);

	/** Corners placed on the chart, and every lap measured through them. */
	readonly corners = $derived.by(() =>
		analyzeCorners(this.trackCorners, this.tm.slots.map((_, sid) => this.alignedData(sid))),
	);

	readonly cornerRows = $derived.by(() => cornerRows(this.corners, this.#laps.length));

	/** Laps with at least one corner reading, as indices into `cornerRows` speeds. */
	readonly cornerLaps = $derived.by(() =>
		this.#laps
			.map((lap, i) => ({ ...lap, i }))
			.filter(({ i }) => this.corners.readings[i]?.some((r) => r !== null)),
	);

	readonly hasCornerSpeeds = $derived.by(() => this.cornerLaps.length > 0);

	readonly apexMarkers = $derived.by(() =>
		this.showCornerSpeeds ? computeApexMarkers(this.corners, this.#laps) : [],
	);

	readonly activeCorner = $derived.by(() => activeCornerAt(this.corners.corners, this.hoverDist));

	readonly activeCornerData = $derived.by(() =>
		activeCornerSummary(this.cornerRows, this.activeCorner, this.#laps),
	);

	// ── Actions ─────────────────────────────────────────────────────────
	/** Chart-frame distance of a track corner (from the map or table). */
	#chartDistance(corner: TrackCorner): number {
		const key = cornerKey(corner);
		return this.corners.corners.find((c) => c.key === key)?.distance ?? corner.distance;
	}

	selectCorner = (corner: TrackCorner) => {
		const d = this.#chartDistance(corner);
		const pad = 200;
		this.xDomain = [Math.max(0, d - pad), d + pad];
		this.hoverDist = d;
	};

	hoverCorner = (corner: TrackCorner | null) => {
		this.hoverDist = corner ? this.#chartDistance(corner) : null;
	};

	resetZoom = () => {
		this.xDomain = null;
	};

	/** Clear hover + zoom, e.g. before a reload or reset. */
	clearInteraction = () => {
		this.hoverDist = null;
		this.xDomain = null;
	};

	// ── Share link ──────────────────────────────────────────────────────
	shareCopied = $state(false);
	#shareTimer: ReturnType<typeof setTimeout> | null = null;

	readonly canShare = $derived.by(() => this.tm.slots.some((s) => s.driver));

	copyShareLink = () => {
		const params = this.tm.toUrlParams();
		if (!params) return;
		const url = `${window.location.origin}/telemetry?${params}`;
		navigator.clipboard.writeText(url).then(() => {
			this.shareCopied = true;
			if (this.#shareTimer) clearTimeout(this.#shareTimer);
			this.#shareTimer = setTimeout(() => (this.shareCopied = false), 2000);
		});
	};
}

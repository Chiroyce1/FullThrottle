/**
 * State for the session replay page: data loading via TelemetryEngine,
 * the playback clock, the focused driver, map options, and everything
 * derived from the current frame. Components read from this; the page
 * only arranges them.
 *
 * Must be constructed during component initialisation (registers effects).
 */
import { TelemetryEngine } from "$lib/TelemetryEngine.svelte";
import { generateJsonUrl, generateParquetUrl } from "$lib";
import { loadTrackCorners, type TrackCorner } from "$lib/track-corners";
import { getTelemetryIssue } from "$lib/telemetry-issues";
import type { DriverMeta, LeaderboardEntry, TelemetryFrameRow } from "$lib/types";
import { deriveSessionMode } from "$lib/utils";
import {
	buildActiveDots,
	buildTrackStatusGradient,
	getFocusedNearbyDrivers,
	getReplayFilename,
	sampleWeatherAtTime,
	sortLiveLeaderboard,
	TRACK_STATUS_SAFE,
} from "./replay-utils";

export interface ReplayParams {
	year?: string;
	round?: string;
	session?: string;
}

export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 20, 50, 100] as const;

export class ReplayView {
	readonly engine = new TelemetryEngine();
	readonly #params: () => ReplayParams;
	#preparedSessionKey = "";

	// ── Playback ────────────────────────────────────────────────────────
	globalTime = $state(0);
	isPlaying = $state(false);
	playbackSpeed = $state(1);
	#lastFrameTime = 0;
	#lastCommitTime = 0;
	#preciseTime = 0;
	#reqFrameId = 0;

	// ── Focus & map options ─────────────────────────────────────────────
	focusedDriver = $state("");
	mapRotation = $state(0);
	showOnlySelectedOnMap = $state(false);
	showCornersOnMap = $state(false);
	trackCorners = $state<TrackCorner[]>([]);
	#lastCornerLocation = "";

	constructor(params: () => ReplayParams) {
		this.#params = params;

		// Load the session whenever the route params change
		$effect(() => {
			const { year, round, session } = this.#params();
			if (!year || !round || !session) return;
			const sessionKey = `${year}/${round}/${session}`;
			if (this.#preparedSessionKey && this.#preparedSessionKey !== sessionKey) {
				this.teardown();
			}
			this.#preparedSessionKey = sessionKey;
			const filename = getReplayFilename(year, round, session);
			this.engine.prepare(
				generateParquetUrl(year, filename),
				generateJsonUrl(year, filename),
			);
		});

		$effect(() => {
			if (this.engine.awaitingPreset && !this.engine.isLoading && typeof window !== "undefined") {
				import("$lib/settings").then(({ settings }) => {
					this.engine.load(settings.dataFrequency);
				});
			}
		});

		// Start the clock at the first sample once data is in
		$effect(() => {
			if (
				this.engine.minSessionTime !== Infinity &&
				this.globalTime === 0 &&
				!this.engine.isLoading
			) {
				this.globalTime = this.engine.minSessionTime;
			}
		});

		// Focus the winner (or first driver) once metadata loads
		$effect(() => {
			if (this.engine.metadata?.drivers && this.focusedDriver === "") {
				const drivers: DriverMeta[] = Object.values(this.engine.metadata.drivers);
				const winner = drivers.find((d) => d.pos === 1);
				this.focusedDriver = winner
					? winner.driver_number.toString()
					: this.engine.driverList[0];
			}
		});

		$effect(() => {
			const location = this.engine.metadata?.session_info?.location || "";
			if (!location || location === this.#lastCornerLocation) return;
			this.#lastCornerLocation = location;
			loadTrackCorners(location).then((data) => {
				this.trackCorners = data?.corners ?? [];
				// Start in the circuit's usual orientation; the slider adjusts from there.
				this.mapRotation = Math.round(data?.rotation ?? 0) % 360;
			});
		});
	}

	// ── Session ─────────────────────────────────────────────────────────
	readonly sessionMode = $derived.by(() =>
		deriveSessionMode(this.engine.metadata?.session_info?.type, this.#params().session),
	);
	readonly isQualifying = $derived.by(() => this.sessionMode === "qualifying");
	readonly sessionName = $derived.by(
		() =>
			this.engine.metadata?.session_info?.name ||
			(this.#params().session ?? "").toUpperCase(),
	);
	readonly telemetryIssue = $derived.by(() => {
		const { year, round, session } = this.#params();
		return getTelemetryIssue(year, round, session);
	});
	readonly hasData = $derived.by(() => this.engine.totalRows > 0);

	// ── Current frame ───────────────────────────────────────────────────
	/** All drivers at `globalTime`. */
	readonly frame = $derived.by(() => this.engine.getFrame(this.globalTime));

	readonly weather = $derived.by(() =>
		sampleWeatherAtTime(this.engine.metadata?.session_info, this.globalTime),
	);

	readonly mapDots = $derived.by(() => {
		const dots = buildActiveDots(this.frame, this.engine.metadata);
		return this.showOnlySelectedOnMap && this.focusedDriver
			? dots.filter((dot) => dot.id === this.focusedDriver)
			: dots;
	});

	readonly visibleCorners = $derived.by(() =>
		this.showCornersOnMap ? this.trackCorners : [],
	);

	readonly leaderboard = $derived.by((): LeaderboardEntry[] => {
		const entries = Object.entries(this.frame).map(
			([id, row]: [string, TelemetryFrameRow]) => ({
				id,
				row,
				meta: this.engine.metadata?.drivers?.[id],
			}),
		);
		return sortLiveLeaderboard(entries, this.sessionMode, this.isQualifying);
	});

	/** The leader's lap, held at the race distance during the run back after the flag. */
	readonly leaderLap = $derived.by(() => {
		const lap = this.leaderboard[0]?.row?.lap_number || 1;
		const total = this.engine.totalLaps;
		return total ? Math.min(lap, total) : lap;
	});

	/** Flags are global, so the leader's track status stands for the session. */
	readonly trackStatus = $derived.by(
		() => this.leaderboard[0]?.row.track_status ?? TRACK_STATUS_SAFE,
	);

	readonly trackStatusGradient = $derived.by(() =>
		buildTrackStatusGradient(
			this.engine.trackStatusTimeline,
			this.engine.minSessionTime,
			this.engine.maxSessionTime,
		),
	);

	// ── Focused driver ──────────────────────────────────────────────────
	readonly nearby = $derived.by(() =>
		getFocusedNearbyDrivers(this.leaderboard, this.focusedDriver),
	);

	// getFrame() mutates frame rows in place for performance, so shallow-copy
	// to give Svelte a new reference each commit (~30 Hz after throttling).
	readonly focusedTelemetry = $derived.by(() => {
		const row = this.frame[this.focusedDriver];
		return row ? { ...row } : undefined;
	});

	readonly focusedMeta = $derived.by(() =>
		this.focusedDriver && this.engine.metadata?.drivers
			? (this.engine.metadata.drivers[this.focusedDriver] ?? null)
			: null,
	);

	readonly focusedLapData = $derived.by(() => {
		if (!this.focusedDriver) return [];
		const lap = this.focusedTelemetry?.lap_number || 1;
		return this.engine.getNormalizedLapTelemetry(this.focusedDriver, lap);
	});

	// ── Playback loop ───────────────────────────────────────────────────
	// State commits are throttled to ~30 Hz: getFrame() re-derives every
	// driver cursor + neighbour gaps per commit, so 60 fps commits are pure
	// GC churn. Session time stays exact; only the reactive commit coalesces.
	#loop = (timestamp: number) => {
		if (!this.isPlaying) return;
		if (this.#lastFrameTime === 0) this.#lastFrameTime = timestamp;
		const deltaSeconds = (timestamp - this.#lastFrameTime) / 1000;
		this.#lastFrameTime = timestamp;

		this.#preciseTime += deltaSeconds * this.playbackSpeed;

		if (this.#preciseTime >= this.engine.maxSessionTime) {
			this.#preciseTime = this.engine.maxSessionTime;
			this.globalTime = this.#preciseTime;
			this.isPlaying = false;
			return;
		}

		if (timestamp - this.#lastCommitTime >= 33 || this.playbackSpeed > 2) {
			this.globalTime = this.#preciseTime;
			this.#lastCommitTime = timestamp;
		}

		if (this.isPlaying) this.#reqFrameId = requestAnimationFrame(this.#loop);
	};

	togglePlay = () => {
		this.isPlaying = !this.isPlaying;
		if (this.isPlaying) {
			this.#preciseTime = this.globalTime;
			this.#lastCommitTime = performance.now();
			this.#lastFrameTime = performance.now();
			this.#reqFrameId = requestAnimationFrame(this.#loop);
		} else {
			cancelAnimationFrame(this.#reqFrameId);
		}
	};

	seek = (time: number) => {
		this.globalTime = time;
		this.#preciseTime = time;
	};

	focus = (driverId: string) => {
		this.focusedDriver = driverId;
	};

	teardown = () => {
		this.isPlaying = false;
		if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.#reqFrameId);
		this.#lastFrameTime = 0;
		this.#lastCommitTime = 0;
		this.#preciseTime = 0;
		this.globalTime = 0;
		this.focusedDriver = "";
		this.engine.dispose();
	};
}

import type { SampleRate } from "$lib/TelemetryEngine.svelte";
import type {
	TelemetryRow,
	TrackPoint,
	LapTimingEntry,
	TelemetryMeta,
} from "$lib/types";
import { formatDriverNameWithAbbr, getDriverAbbreviation } from "$lib/utils";
import type {
	YearEntry,
	RoundEntry,
	SessionEntry,
	SlotState,
	MetaFetchTarget,
} from "$lib/metadata-types";
import { latestYear, latestRound, latestSession } from "$lib/metadata-types";
import { bestLapFromMeta, topDrivers } from "$lib/metadata-types";
import { SLOT_FALLBACK_COLORS } from "$lib/constants";

import { MetadataManager } from "./metadata-manager.svelte";
import { EngineManager } from "./engine-manager.svelte";

export type { YearEntry, RoundEntry, SessionEntry, SlotState };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlotId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		try {
			return crypto.randomUUID();
		} catch {
			// Insecure HTTP contexts or unsupported environments
		}
	}
	// Fallback to Math.random for non-secure HTTP contexts
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

function makeSlot(defaults: Partial<SlotState> = {}): SlotState {
	return {
		id: generateSlotId(),
		year: "",
		round: "",
		session: "",
		driver: "",
		lap: null,
		color: "",
		meta: null,
		metaLoading: false,
		lastDriver: "",
		hasLoaded: false,
		loadError: "",
		loadedKey: "",
		...defaults,
	};
}

function normalizeSessionCode(session: string): string {
	const s = session.toLowerCase();
	if (s === "race") return "r";
	if (s.startsWith("qual")) return "q";
	if (s === "sprint") return "s";
	if (s.startsWith("sprint") || s === "sq") return "sq";
	if (s === "practice-1" || s === "practice1" || s === "fp1") return "fp1";
	if (s === "practice-2" || s === "practice2" || s === "fp2") return "fp2";
	if (s === "practice-3" || s === "practice3" || s === "fp3") return "fp3";
	return s;
}

function buildFilename(year: string, round: string, session: string): string {
	const rn = parseInt(round, 10);
	const norm = normalizeSessionCode(session);
	if (Number.isNaN(rn) || rn === 0) return `f1_${year}_${norm}`;
	return `f1_${year}_rd${rn}_${norm}`;
}

export type AddDriverFeedback = "idle" | "added";
export type LoadFeedback = "idle" | "loading" | "success" | "error";

// ─── TelemetryState ───────────────────────────────────────────────────────────
//
// Each slot represents an independent comparison column with its own year,
// round, session, driver, lap, and color. Comparing drivers across different
// sessions or seasons (e.g. 2025 vs 2026) is fully supported.

export class TelemetryState {
	slots = $state<SlotState[]>([makeSlot(), makeSlot()]);

	addDriverFeedback = $state<AddDriverFeedback>("idle");
	loadFeedback = $state<LoadFeedback>("idle");
	loadErrorMessage = $state("");
	#isLoadingData = $state(false);

	readonly #meta = new MetadataManager();
	readonly #engines = new EngineManager();

	readonly #pendingMeta = new Map<string, Promise<void>>();

	#addFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	#loadFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

	getYears: () => YearEntry[];

	constructor(getYears: () => YearEntry[]) {
		this.getYears = getYears;
	}

	// ── Public slot management ────────────────────────────────────────────

	addSlot() {
		const lastSlot = this.slots[this.slots.length - 1];
		const s = makeSlot(
			lastSlot
				? {
						year: lastSlot.year,
						round: lastSlot.round,
						session: lastSlot.session,
						meta: lastSlot.meta,
					}
				: {},
		);
		this.slots.push(s);

		if (this.#addFeedbackTimer) clearTimeout(this.#addFeedbackTimer);
		this.addDriverFeedback = "added";
		this.#addFeedbackTimer = setTimeout(() => {
			this.addDriverFeedback = "idle";
		}, 1200);
	}

	removeSlot(sid: number) {
		if (this.slots.length <= 1) return;
		const s = this.slots[sid];
		if (s) {
			this.#meta.removeSlot(s.id);
		}
		this.slots.splice(sid, 1);
		const activeKeys = new Set(
			this.slots
				.map((s) => this.selectionKeyByValues(s.year, s.round, s.session))
				.filter(Boolean),
		);
		this.#engines.cleanup(activeKeys);
	}

	reset() {
		this.#isLoadingData = false;
		if (this.#loadFeedbackTimer) clearTimeout(this.#loadFeedbackTimer);
		this.#engines.reset();
		this.#meta.reset();

		this.slots.length = 0;
		this.slots.push(makeSlot(), makeSlot());

		this.loadFeedback = "idle";
		this.loadErrorMessage = "";
		this.addDriverFeedback = "idle";
	}

	async init(dataFrequency: SampleRate, autoLoad = true) {
		if (autoLoad) {
			this.loadFeedback = "loading";
		} else {
			this.loadFeedback = "idle";
		}
		const latestY = latestYear(this.getYears());
		const latestR = latestRound(latestY);
		const latestS = latestSession(latestR);
		if (!latestY || !latestR || !latestS) {
			this.loadFeedback = "idle";
			return;
		}

		const yStr = latestY.year.toString();
		const rStr = latestR.round.toString();
		const sStr = latestS.code;

		for (const s of this.slots) {
			s.year = yStr;
			s.round = rStr;
			s.session = sStr;
		}

		await this.#triggerMetaFetch(this.slots[0]);

		// Pre-fill top drivers for both initial slots from the loaded meta
		const meta = this.slots[0].meta;
		if (meta) {
			if (this.slots[1]) {
				this.slots[1].meta = meta;
				this.slots[1].metaLoading = false;
			}
			const defaults = topDrivers(meta, this.slots.length);
			this.slots.forEach((s, i) => {
				if (defaults[i]) {
					s.driver = defaults[i];
					s.lap = bestLapFromMeta(meta, s.driver);
				}
			});
		}

		if (autoLoad && this.canLoadData) {
			await this.load(dataFrequency);
		} else {
			this.loadFeedback = "idle";
		}
	}

	dispose() {
		this.#isLoadingData = false;
		this.#engines.dispose();
		this.#meta.reset();
		if (this.#addFeedbackTimer) clearTimeout(this.#addFeedbackTimer);
		if (this.#loadFeedbackTimer) clearTimeout(this.#loadFeedbackTimer);
	}

	// ── Explicit Event Handlers ───────────────────────────────────────────

	/** Change track for a specific slot. */
	setTrack(slotId: string, year: string, round?: string) {
		const s = this.slots.find((slot) => slot.id === slotId);
		if (!s) return;

		const yEntry = this.getYears().find((y) => y.year.toString() === year);
		if (!yEntry) return;

		let rEntry = round
			? yEntry.rounds.find((r) => r.round.toString() === round)
			: null;

		// If round wasn't explicitly chosen, attempt to match the same circuit location
		if (!rEntry && s.round) {
			const curYearData = this.getYears().find((y) => y.year.toString() === s.year);
			const curRoundData = curYearData?.rounds.find((r) => r.round.toString() === s.round);
			if (curRoundData?.location) {
				rEntry =
					yEntry.rounds.find(
						(r) =>
							r.location &&
							curRoundData.location &&
							r.location.toLowerCase() === curRoundData.location.toLowerCase(),
					) ?? null;
			}
		}

		if (!rEntry) rEntry = latestRound(yEntry);
		if (!rEntry) return;

		s.year = yEntry.year.toString();
		s.round = rEntry.round.toString();

		const sEntry = rEntry.sessions.find((sess) => sess.code === s.session);
		if (!sEntry) {
			const latestSess = latestSession(rEntry);
			if (latestSess) s.session = latestSess.code;
		}

		this.#triggerMetaFetch(s);
	}

	/** Change session for a specific slot. */
	setSession(slotId: string, session: string) {
		const s = this.slots.find((slot) => slot.id === slotId);
		if (!s) return;

		const yEntry = this.getYears().find((y) => y.year.toString() === s.year);
		const rEntry = yEntry?.rounds.find((r) => r.round.toString() === s.round);
		if (!rEntry) return;

		const sEntry = rEntry.sessions.find((sess) => sess.code === session);
		if (!sEntry) return;

		s.session = session;
		this.#triggerMetaFetch(s);
	}

	/** Change a single slot's driver. Never reloads data — if the current
	 *  session's engine is already in memory, the new driver's laps are
	 *  simply read out of it. */
	setDriver(slotId: string, driver: string) {
		const s = this.slots.find((slot) => slot.id === slotId);
		if (!s) return;
		s.driver = driver;
		s.lap = bestLapFromMeta(s.meta, driver);

		const key = this.selectionKeyByValues(s.year, s.round, s.session);
		const engine = this.#engines.getEngine(key);
		if (engine && engine.totalRows > 0) {
			s.hasLoaded = true;
			s.loadedKey = key;
			s.loadError = "";
		}
	}

	setLap(slotId: string, lap: number | null) {
		const s = this.slots.find((slot) => slot.id === slotId);
		if (!s) return;
		s.lap = lap;
	}

	#triggerMetaFetch(s: SlotState): Promise<void> {
		s.lap = null;
		s.hasLoaded = false;
		s.loadError = "";
		const preservedDriver = s.driver;
		s.metaLoading = true;
		const filename = buildFilename(s.year, s.round, s.session);
		const p = (
			this.#meta.fetchMeta(s, filename, preservedDriver) ?? Promise.resolve()
		)
			.then(() => {
				if (s.driver) {
					const key = this.selectionKeyByValues(s.year, s.round, s.session);
					const engine = this.#engines.getEngine(key);
					if (engine && engine.totalRows > 0) {
						s.hasLoaded = true;
						s.loadedKey = key;
						s.loadError = "";
					}
				}
			})
			.finally(() => {
				this.#pendingMeta.delete(s.id);
			});

		this.#pendingMeta.set(s.id, p);
		return p;
	}

	// ── Slot helpers ──────────────────────────────────────────────────────

	badge(sid: number): string {
		if (sid >= 0 && sid < 26) return String.fromCharCode(65 + sid);
		return `${sid + 1}`;
	}

	yearData(sid = 0): YearEntry | undefined {
		const s = this.slots[sid];
		if (!s) return undefined;
		return this.getYears().find((y) => y.year.toString() === s.year);
	}

	roundData(sid = 0): RoundEntry | undefined {
		const s = this.slots[sid];
		if (!s) return undefined;
		return this.yearData(sid)?.rounds.find((r) => r.round.toString() === s.round);
	}

	selectionKeyByValues(year: string, round: string, session: string): string {
		if (!year || !round || !session) return "";
		return `${year}|${round}|${session}`;
	}

	selectionKey(sid: number): string {
		const s = this.slots[sid];
		if (!s) return "";
		return this.selectionKeyByValues(s.year, s.round, s.session);
	}

	// ── Engine delegation ────────────────────────────────────────────────

	get isLoading(): boolean {
		return (
			this.#isLoadingData ||
			this.loadFeedback === "loading" ||
			this.#engines.isLoading()
		);
	}

	get canLoadData(): boolean {
		return this.slots.some(
			(s) => (s.driver || s.metaLoading) && s.year && s.round && s.session,
		);
	}

	// Plain-language reason the Load button is disabled. Empty when loadable.
	get loadHint(): string {
		if (this.canLoadData) return "";
		if (this.slots.some((s) => s.metaLoading)) return "Loading drivers…";
		if (!this.slots[0]?.meta) return "Waiting for session data…";
		return "Pick a driver to load";
	}

	get needsReloadAny(): boolean {
		return this.slots.some((s) => {
			if (!s.year || !s.round || !s.session) return false;
			const key = this.selectionKeyByValues(s.year, s.round, s.session);
			return !!s.loadedKey && s.loadedKey !== key;
		});
	}

	// ── Driver data accessors ────────────────────────────────────────────

	driverMeta(sid: number) {
		const slot = this.slots[sid];
		return slot?.driver && slot.meta
			? (slot.meta.drivers[slot.driver] ?? null)
			: null;
	}

	driverName(sid: number): string {
		const m = this.driverMeta(sid);
		if (!m) return sid === 0 ? "Driver A" : "Driver B";
		return formatDriverNameWithAbbr(m, this.slots[sid].driver);
	}

	driverTla(sid: number): string {
		const slot = this.slots[sid];
		const m = this.driverMeta(sid);
		let tla = getDriverAbbreviation(
			m,
			slot?.driver || this.badge(sid),
		);
		const years = new Set(this.slots.map((s) => s.year).filter(Boolean));
		if (years.size > 1 && slot?.year) {
			tla = `${tla} '${slot.year.slice(-2)}`;
		}
		return tla;
	}

	color(sid: number): string {
		const s = this.slots[sid];
		if (s?.color) return s.color;
		return (
			this.driverMeta(sid)?.color ||
			SLOT_FALLBACK_COLORS[sid % SLOT_FALLBACK_COLORS.length]
		);
	}

	driverLaps(sid: number): LapTimingEntry[] {
		const s = this.slots[sid];
		if (!s?.hasLoaded || !s.driver) return [];
		return this.#engines.driverLaps(s, this.selectionKey(sid));
	}

	lapData(sid: number): TelemetryRow[] {
		const s = this.slots[sid];
		if (!s?.hasLoaded || !s.driver || !s.lap) return [];
		return this.#engines.lapData(s, this.selectionKey(sid));
	}

	get trackPath(): TrackPoint[] {
		return this.#engines.trackPath();
	}

	// ── Data loading ─────────────────────────────────────────────────────

	async load(dataFrequency: SampleRate) {
		if (this.#isLoadingData || this.loadFeedback === "loading") {
			return;
		}
		if (this.#loadFeedbackTimer) clearTimeout(this.#loadFeedbackTimer);
		this.#isLoadingData = true;
		this.loadFeedback = "loading";
		this.loadErrorMessage = "";

		try {
			if (this.#pendingMeta.size > 0) {
				await Promise.all(Array.from(this.#pendingMeta.values()));
			}

			const keysToLoad: Array<{ key: string; year: string; filename: string }> = [];
			for (const s of this.slots) {
				if (!s.driver || !s.year || !s.round || !s.session) continue;
				s.hasLoaded = false;
				s.loadError = "";
				const key = this.selectionKeyByValues(s.year, s.round, s.session);
				const filename = buildFilename(s.year, s.round, s.session);
				keysToLoad.push({ key, year: s.year, filename });
			}

			if (keysToLoad.length === 0) {
				this.loadFeedback = "idle";
				return;
			}

			const result = await this.#engines.load(keysToLoad, dataFrequency);

			for (const s of this.slots) {
				if (!s.driver) continue;
				const key = this.selectionKeyByValues(s.year, s.round, s.session);
				const engine = this.#engines.getEngine(key);
				if (engine && engine.totalRows > 0) {
					s.hasLoaded = true;
					s.loadedKey = key;
					s.loadError = "";
				} else if (result === "error") {
					s.loadError = "Failed to load telemetry.";
				} else if (result === "empty") {
					s.loadError = "No telemetry rows found.";
				}
			}

			if (result === "success") {
				this.loadFeedback = "success";
				this.#loadFeedbackTimer = setTimeout(() => {
					this.loadFeedback = "idle";
				}, 2000);
			} else if (result === "error" || result === "empty") {
				this.loadFeedback = "error";
				this.loadErrorMessage =
					result === "empty"
						? "No telemetry rows found."
						: "Failed to load telemetry.";
				this.#loadFeedbackTimer = setTimeout(() => {
					this.loadFeedback = "idle";
					this.loadErrorMessage = "";
				}, 3000);
			}
		} catch {
			this.loadFeedback = "error";
			this.loadErrorMessage = "Failed to load telemetry.";
			this.#loadFeedbackTimer = setTimeout(() => {
				this.loadFeedback = "idle";
				this.loadErrorMessage = "";
			}, 3000);
		} finally {
			this.#isLoadingData = false;
		}
	}
}

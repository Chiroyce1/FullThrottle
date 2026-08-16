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
} from "$lib/metadata-types";
import { latestYear, latestRound, latestSession } from "$lib/metadata-types";
import {
	SLOT_FALLBACK_COLORS,
	DEFAULT_DRIVER_NUMBERS,
} from "$lib/constants";

import { MetadataManager } from "./metadata-manager.svelte";
import { EngineManager } from "./engine-manager.svelte";
import { SelectionCascade } from "./selection-cascade.svelte";

// Re-export for convenience
export type { YearEntry, RoundEntry, SessionEntry, SlotState };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSlot(defaults: Partial<SlotState> = {}): SlotState {
	return {
		year: "",
		round: "",
		session: "",
		lastMetaKey: "",
		driver: "",
		lap: null,
		color: "",
		meta: null,
		metaLoading: false,
		hasLoaded: false,
		lastLoadedKey: "",
		loadError: "",
		lastDriver: "",
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

function buildFilenameForSlot(
	year: string,
	round: string,
	session: string,
): string {
	const rn = parseInt(round, 10);
	const norm = normalizeSessionCode(session);
	if (Number.isNaN(rn) || rn === 0) return `f1_${year}_${norm}`;
	return `f1_${year}_rd${rn}_${norm}`;
}

// ─── UI Feedback Types ────────────────────────────────────────────────────────

export type AddDriverFeedback = "idle" | "added";
export type LoadFeedback = "idle" | "loading" | "success" | "error";

// ─── TelemetryState ───────────────────────────────────────────────────────────

/**
 * Root orchestrator for the telemetry page. Composes MetadataManager,
 * EngineManager, and SelectionCascade and exposes the public API that
 * page components consume.
 *
 * This replaces the old monolithic SlotManager.
 */
export class TelemetryState {
	// ── Reactive state ───────────────────────────────────────────────────
	slots = $state<SlotState[]>([makeSlot(), makeSlot()]);

	// ── UI feedback state ────────────────────────────────────────────────
	addDriverFeedback = $state<AddDriverFeedback>("idle");
	loadFeedback = $state<LoadFeedback>("idle");
	loadErrorMessage = $state("");

	// ── Composed managers (non-reactive internals) ───────────────────────
	readonly #meta = new MetadataManager();
	readonly #engines = new EngineManager();
	readonly #cascade: SelectionCascade;

	// ── Feedback timers ──────────────────────────────────────────────────
	#addFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	#loadFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

	/** Getter injected by the page — returns the live years array. */
	getYears: () => YearEntry[];

	constructor(getYears: () => YearEntry[]) {
		this.getYears = getYears;

		// Build the context object that cascades and managers share
		this.#cascade = new SelectionCascade(
			{
				slots: this.slots,
				getYears: this.getYears,
				selectionKey: (sid) => this.selectionKey(sid),
				yearData: (sid) => this.yearData(sid),
				roundData: (sid) => this.roundData(sid),
				buildFilename: (sid) => this.#filename(sid),
				driverLaps: (sid) => this.driverLaps(sid),
			},
			this.#meta,
			this.#engines,
		);
	}

	// ── Public slot management ────────────────────────────────────────────

	addSlot() {
		this.slots.push(makeSlot());
		this.#engines.ensureCapacity(this.slots.length - 1);
		this.#meta.ensureCapacity(this.slots.length - 1);

		// Visual feedback
		if (this.#addFeedbackTimer) clearTimeout(this.#addFeedbackTimer);
		this.addDriverFeedback = "added";
		this.#addFeedbackTimer = setTimeout(() => {
			this.addDriverFeedback = "idle";
		}, 1200);
	}

	removeSlot(sid: number) {
		if (this.slots.length <= 1) return;
		this.#meta.removeSid(sid);
		this.#engines.removeSid(sid);
		this.slots.splice(sid, 1);
	}

	/** Reset all slots back to defaults (in-context recovery). */
	reset() {
		// Dispose all engines first
		this.#engines.dispose();

		// Reset slots to initial two
		this.slots.length = 0;
		this.slots.push(makeSlot(), makeSlot());

		// Re-create engines for the new slots
		this.#engines.engines.length = 0;
		this.#engines.ensureCapacity(0);
		this.#engines.ensureCapacity(1);

		// Reset UI feedback
		this.loadFeedback = "idle";
		this.loadErrorMessage = "";
		this.addDriverFeedback = "idle";
	}

	dispose() {
		this.#engines.dispose();
		if (this.#addFeedbackTimer) clearTimeout(this.#addFeedbackTimer);
		if (this.#loadFeedbackTimer) clearTimeout(this.#loadFeedbackTimer);
	}

	// ── Slot helpers ──────────────────────────────────────────────────────

	badge(sid: number): string {
		if (sid >= 0 && sid < 26) return String.fromCharCode(65 + sid);
		return `${sid + 1}`;
	}

	yearData(sid: number): YearEntry | undefined {
		if (!this.slots[sid]) return undefined;
		return this.getYears().find(
			(y) => y.year.toString() === this.slots[sid].year,
		);
	}

	roundData(sid: number): RoundEntry | undefined {
		if (!this.slots[sid]) return undefined;
		return this.yearData(sid)?.rounds.find(
			(r) => r.round.toString() === this.slots[sid].round,
		);
	}

	selectionKey(sid: number): string {
		const s = this.slots[sid];
		if (!s || !s.year || !s.round || !s.session) return "";
		return `${s.year}|${s.round}|${s.session}`;
	}

	#filename(sid: number): string {
		const s = this.slots[sid];
		if (!s || !s.year || !s.round || !s.session) return "";
		return buildFilenameForSlot(s.year, s.round, s.session);
	}

	// ── Engine delegation ────────────────────────────────────────────────

	#engineCtx() {
		return {
			slots: this.slots,
			selectionKey: (sid: number) => this.selectionKey(sid),
			buildFilename: (sid: number) => this.#filename(sid),
		};
	}

	get isLoading(): boolean {
		return this.#engines.isLoading(this.#engineCtx());
	}

	get canLoadData(): boolean {
		return this.slots.some(
			(s) => s.driver && s.year && s.round && s.session,
		);
	}

	get needsReloadAny(): boolean {
		return this.slots.some((_, sid) => this.slotNeedsReload(sid));
	}

	slotNeedsReload(sid: number): boolean {
		const key = this.selectionKey(sid);
		const loadedKey = this.slots[sid].lastLoadedKey;
		return !!loadedKey && !!key && key !== loadedKey;
	}

	// ── Driver data accessors ────────────────────────────────────────────

	driverMeta(sid: number) {
		const slot = this.slots[sid];
		return slot.driver && slot.meta
			? (slot.meta.drivers[slot.driver] ?? null)
			: null;
	}

	driverName(sid: number): string {
		const m = this.driverMeta(sid);
		if (!m) return sid === 0 ? "Driver A" : "Driver B";
		return formatDriverNameWithAbbr(m, this.slots[sid].driver);
	}

	driverTla(sid: number): string {
		const m = this.driverMeta(sid);
		return getDriverAbbreviation(
			m,
			this.slots[sid]?.driver || this.badge(sid),
		);
	}

	color(sid: number): string {
		const s = this.slots[sid];
		if (s.color) return s.color;
		return (
			this.driverMeta(sid)?.color ||
			SLOT_FALLBACK_COLORS[sid % SLOT_FALLBACK_COLORS.length]
		);
	}

	driverLaps(sid: number): LapTimingEntry[] {
		return this.#engines.driverLaps(this.#engineCtx(), sid);
	}

	lapData(sid: number): TelemetryRow[] {
		return this.#engines.lapData(this.#engineCtx(), sid);
	}

	get trackPath(): TrackPoint[] {
		return this.#engines.trackPath(this.#engineCtx());
	}

	// ── Data loading ─────────────────────────────────────────────────────

	async load(dataFrequency: SampleRate) {
		// Clear previous feedback timer
		if (this.#loadFeedbackTimer) clearTimeout(this.#loadFeedbackTimer);
		this.loadFeedback = "loading";
		this.loadErrorMessage = "";

		const result = await this.#engines.load(
			this.#engineCtx(),
			dataFrequency,
		);

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
	}
}

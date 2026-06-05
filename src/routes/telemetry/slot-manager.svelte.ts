import {
	TelemetryEngine,
	type SampleRate,
} from "$lib/TelemetryEngine.svelte";
import type { LapTimingEntry, TelemetryMeta, TelemetryRow } from "$lib/types";
import { formatDriverNameWithAbbr, getDriverAbbreviation } from "$lib/utils";
import { generateJsonUrl, generateParquetUrl } from "$lib";
import type { YearEntry, RoundEntry, SessionEntry, SlotState } from "$lib/metadata-types";
import { latestYear, latestRound, latestSession } from "$lib/metadata-types";
import {
	MAX_LAP_TIME_SECONDS,
	SLOT_FALLBACK_COLORS,
	DEFAULT_DRIVER_NUMBERS,
} from "$lib/constants";

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

function buildFilename(year: string, round: string, session: string): string {
	const rn = parseInt(round, 10);
	const norm = normalizeSessionCode(session);
	if (Number.isNaN(rn) || rn === 0) return `f1_${year}_${norm}`;
	return `f1_${year}_rd${rn}_${norm}`;
}

// ─── SlotManager class ────────────────────────────────────────────────────────

export class SlotManager {
	// ── Reactive state ───────────────────────────────────────────────────
	slots = $state<SlotState[]>([makeSlot(), makeSlot()]);

	// ── Internal (non-reactive) parallel arrays ──────────────────────────
	readonly engines: TelemetryEngine[] = [
		new TelemetryEngine(),
		new TelemetryEngine(),
	];
	private readonly metaFetchSeq: number[] = [0, 0];
	private readonly metaFetchControllers: Array<AbortController | null> = [
		null,
		null,
	];

	/** Getter injected by the page — returns the live years array */
	getYears: () => YearEntry[];

	constructor(getYears: () => YearEntry[]) {
		this.getYears = getYears;
		this.#registerEffects();
	}

	// ── Private setup ─────────────────────────────────────────────────────

	#registerEffects() {
		// Auto-init slot year/round/session when years load, with RUS/HAM defaults
		$effect(() => {
			const years = this.getYears();
			if (!years.length) return;

			const yr = latestYear(years);
			const rd = latestRound(yr);
			const sess = latestSession(rd);

			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				this.#ensureResources(sid);
				const slot = this.slots[sid];
				if (slot.year) continue;

				// All slots default to the latest year/round/session
				slot.year = yr?.year.toString() ?? "";
				if (rd) slot.round = rd.round.toString();
				if (sess) slot.session = sess.code;
				// Pre-fill preferred driver numbers (RUS=63, HAM=44)
				if (DEFAULT_DRIVER_NUMBERS[sid]) {
					slot.driver = DEFAULT_DRIVER_NUMBERS[sid];
				}
			}
		});

		// Trigger meta fetch when selection changes
		$effect(() => {
			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				const key = this.selectionKey(sid);
				key;
				if (this.slots[sid].lastMetaKey === key) continue;
				this.slots[sid].lastMetaKey = key;
				this.slots[sid].meta = null;
				// Preserve the desired driver across meta reloads
				const desiredDriver = this.slots[sid].driver || (DEFAULT_DRIVER_NUMBERS[sid] ?? "");
				this.slots[sid].driver = "";
				this.slots[sid].lap = null;
				this.#fetchMeta(sid, desiredDriver);
			}
		});

		// Reset hasLoaded when selection drifts from what was loaded
		$effect(() => {
			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				const key = this.selectionKey(sid);
				key;
				if (!key || key !== this.slots[sid].lastLoadedKey) {
					this.slots[sid].hasLoaded = false;
					this.slots[sid].lap = null;
				}
			}
		});

		// Cascade: reset round when not valid for chosen year
		$effect(() => {
			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				if (!this.slots[sid].year) continue;
				const yr = this.yearData(sid);
				if (!yr) continue;
				if (!yr.rounds.some((r) => r.round.toString() === this.slots[sid].round)) {
					const latest = [...yr.rounds].sort((a, b) => b.round - a.round)[0];
					this.slots[sid].round = latest ? latest.round.toString() : "";
					this.slots[sid].session = "";
				}
			}
		});

		// Cascade: reset session when not valid for chosen round
		$effect(() => {
			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				if (!this.slots[sid].year || !this.slots[sid].round) continue;
				const rd = this.roundData(sid);
				if (!rd) continue;
				if (!rd.sessions.some((s) => s.code === this.slots[sid].session)) {
					const def =
						rd.sessions.find((s) => s.code === "r") ||
						rd.sessions[rd.sessions.length - 1];
					this.slots[sid].session = def ? def.code : "";
				}
			}
		});

		// Lock non-primary slots to slot-0's track
		$effect(() => {
			this.slots.length;
			const sourceYear = this.slots[0]?.year;
			const sourceRound = this.slots[0]?.round;
			const sourceRoundData = this.roundData(0);
			sourceYear; sourceRound; sourceRoundData;
			if (!sourceYear || !sourceRound || !sourceRoundData) return;

			for (let sid = 1; sid < this.slots.length; sid++) {
				const targetYr = this.yearData(sid);
				if (!targetYr) continue;
				const targetRd = this.roundData(sid);
				if (targetRd?.name === sourceRoundData.name) continue;

				const sameTrack = targetYr.rounds.find(
					(r) => r.name === sourceRoundData.name,
				);
				if (sameTrack) {
					this.slots[sid].round = sameTrack.round.toString();
				} else {
					this.slots[sid].year = sourceYear;
					this.slots[sid].round = sourceRound;
				}
			}
		});

		// Auto-select fastest lap when engine loads or driver changes
		$effect(() => {
			this.slots.length;
			for (let sid = 0; sid < this.slots.length; sid++) {
				const s = this.slots[sid];
				if (!s.hasLoaded) continue;
				if (s.driver && s.driver !== s.lastDriver) {
					s.lastDriver = s.driver;
					s.lap = this.#fastestLapNum(this.driverLaps(sid));
				}
				if (s.lap === null) s.lap = this.#fastestLapNum(this.driverLaps(sid));
			}
		});
	}

	// ── Resource management ───────────────────────────────────────────────

	#ensureResources(sid: number) {
		while (this.engines.length <= sid) this.engines.push(new TelemetryEngine());
		while (this.metaFetchSeq.length <= sid) this.metaFetchSeq.push(0);
		while (this.metaFetchControllers.length <= sid)
			this.metaFetchControllers.push(null);
	}

	// ── Public slot management ────────────────────────────────────────────

	addSlot() {
		this.slots.push(makeSlot());
		this.#ensureResources(this.slots.length - 1);
	}

	removeSlot(sid: number) {
		if (this.slots.length <= 1) return;
		this.metaFetchControllers[sid]?.abort();
		this.engines[sid]?.dispose();
		this.slots.splice(sid, 1);
		this.engines.splice(sid, 1);
		this.metaFetchSeq.splice(sid, 1);
		this.metaFetchControllers.splice(sid, 1);
	}

	dispose() {
		for (const engine of this.engines) engine.dispose();
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
		return buildFilename(s.year, s.round, s.session);
	}

	get engineIndex(): number[] {
		const loadedByKey = new Map<string, number>();
		for (let sid = 0; sid < this.slots.length; sid++) {
			const key = this.selectionKey(sid);
			if (!key || !this.slots[sid].hasLoaded) continue;
			if (!loadedByKey.has(key)) loadedByKey.set(key, sid);
		}
		return this.slots.map((_, sid) => {
			const key = this.selectionKey(sid);
			if (!key) return sid;
			const loaded = loadedByKey.get(key);
			return loaded !== undefined ? loaded : sid;
		});
	}

	engineForSlot(sid: number): TelemetryEngine {
		const idx = this.engineIndex[sid] ?? sid;
		return this.engines[idx];
	}

	get activeEngineIndices(): number[] {
		const seen = new Set<number>();
		const out: number[] = [];
		for (let sid = 0; sid < this.slots.length; sid++) {
			const idx = this.engineIndex[sid] ?? sid;
			if (seen.has(idx)) continue;
			seen.add(idx);
			out.push(idx);
		}
		return out;
	}

	get isLoading(): boolean {
		return this.activeEngineIndices.some((idx) => this.engines[idx]?.isLoading);
	}

	get canLoadData(): boolean {
		return this.slots.some((s) => s.driver && s.year && s.round && s.session);
	}

	get needsReloadAny(): boolean {
		return this.slots.some((_, sid) => this.slotNeedsReload(sid));
	}

	slotNeedsReload(sid: number): boolean {
		const key = this.selectionKey(sid);
		const loadedKey = this.slots[sid].lastLoadedKey;
		return !!loadedKey && !!key && key !== loadedKey;
	}

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
		return getDriverAbbreviation(m, this.slots[sid]?.driver || this.badge(sid));
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
		const s = this.slots[sid];
		if (!s) return [];
		return s.hasLoaded && s.driver
			? this.engineForSlot(sid).getDriverLapTimes(s.driver)
			: [];
	}

	lapData(sid: number): TelemetryRow[] {
		const s = this.slots[sid];
		if (!s) return [];
		return s.hasLoaded && s.driver && s.lap
			? this.engineForSlot(sid).getNormalizedLapTelemetry(s.driver, s.lap)
			: [];
	}

	get trackPath() {
		for (let sid = 0; sid < this.slots.length; sid++) {
			if (!this.slots[sid].hasLoaded) continue;
			const path = this.engineForSlot(sid)?.trackPath ?? [];
			if (path.length > 0) return path;
		}
		return [];
	}

	// ── Data loading ──────────────────────────────────────────────────────

	load(dataFrequency: SampleRate) {
		const groups = new Map<
			string,
			{ leadSid: number; members: number[]; year: string; filename: string }
		>();

		for (let sid = 0; sid < this.slots.length; sid++) {
			const s = this.slots[sid];
			const key = this.selectionKey(sid);
			const fn = this.#filename(sid);
			if (!s.driver || !key || !fn) continue;
			if (!groups.has(key)) {
				groups.set(key, { leadSid: sid, members: [sid], year: s.year, filename: fn });
			} else {
				groups.get(key)!.members.push(sid);
			}
		}

		for (const [key, group] of groups) {
			const engine = this.engines[group.leadSid];
			const parquetUrl = generateParquetUrl(group.year, group.filename);
			const jsonUrl = generateJsonUrl(group.year, group.filename);

			for (const sid of group.members) {
				this.slots[sid].loadError = "";
				this.slots[sid].hasLoaded = false;
			}

			engine
				.load(dataFrequency, parquetUrl, jsonUrl)
				.then(() => {
					if (engine.totalRows > 0) {
						for (const sid of group.members) {
							this.slots[sid].lastLoadedKey = key;
							this.slots[sid].hasLoaded = true;
							this.slots[sid].lap = null;
						}
					} else {
						for (const sid of group.members) {
							this.slots[sid].hasLoaded = false;
							this.slots[sid].loadError = "No telemetry rows loaded for this session.";
						}
					}
				})
				.catch((e: unknown) => {
					const err = String(e);
					for (const sid of group.members) {
						this.slots[sid].loadError = err;
					}
				});
		}
	}

	// ── Private helpers ───────────────────────────────────────────────────

	#fastestLapNum(laps: LapTimingEntry[]): number | null {
		const valid = laps.filter(
			(l) => l.time > 0 && l.time < MAX_LAP_TIME_SECONDS,
		);
		if (valid.length === 0) return null;
		return valid.reduce((best, cur) => (cur.time < best.time ? cur : best)).lap;
	}

	/**
	 * Fetch session metadata for a slot. If `preferredDriver` is provided and
	 * present in the returned metadata, it is auto-selected; otherwise the first
	 * driver alphabetically is chosen.
	 */
	#fetchMeta(sid: number, preferredDriver = "") {
		this.#ensureResources(sid);
		const fn = this.#filename(sid);
		const s = this.slots[sid];
		if (!s) return;

		if (this.metaFetchControllers[sid]) {
			this.metaFetchControllers[sid]!.abort();
			this.metaFetchControllers[sid] = null;
		}

		const seq = ++this.metaFetchSeq[sid];
		if (!fn) {
			s.meta = null;
			s.metaLoading = false;
			return;
		}

		const controller = new AbortController();
		this.metaFetchControllers[sid] = controller;
		s.metaLoading = true;

		fetch(generateJsonUrl(s.year, fn), { signal: controller.signal })
			.then((r) =>
				r.ok ? (r.json() as Promise<TelemetryMeta>) : Promise.resolve(null),
			)
			.then((d) => {
				if (this.metaFetchSeq[sid] !== seq || controller.signal.aborted) return;
				s.meta = d as TelemetryMeta | null;
				s.metaLoading = false;

				if (s.meta?.drivers && !s.driver) {
					// Prefer the requested driver number if present in this session
					if (preferredDriver && s.meta.drivers[preferredDriver]) {
						s.driver = preferredDriver;
					} else {
						// Fall back to first alphabetically
						const sorted = Object.values(s.meta.drivers).sort((a, b) => {
							const na =
								`${a.first_name || ""} ${a.last_name || ""}`.trim() || a.name || "";
							const nb =
								`${b.first_name || ""} ${b.last_name || ""}`.trim() || b.name || "";
							return na.localeCompare(nb);
						});
						if (sorted.length > 0) s.driver = sorted[0].driver_number.toString();
					}
				}

				if (this.metaFetchControllers[sid] === controller) {
					this.metaFetchControllers[sid] = null;
				}
			})
			.catch(() => {
				if (this.metaFetchSeq[sid] !== seq || controller.signal.aborted) return;
				s.meta = null;
				s.metaLoading = false;
				if (this.metaFetchControllers[sid] === controller) {
					this.metaFetchControllers[sid] = null;
				}
			});
	}
}

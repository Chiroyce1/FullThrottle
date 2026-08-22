import type {
	YearEntry,
	RoundEntry,
	SlotState,
} from "$lib/metadata-types";
import { latestYear, latestRound, latestSession } from "$lib/metadata-types";
import {
	MAX_LAP_TIME_SECONDS,
	DEFAULT_DRIVER_NUMBERS,
} from "$lib/constants";
import type { LapTimingEntry } from "$lib/types";
import type { MetadataManager } from "./metadata-manager.svelte";
import type { EngineManager } from "./engine-manager.svelte";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CascadeContext {
	slots: SlotState[];
	getYears: () => YearEntry[];
	selectionKey: (sid: number) => string;
	yearData: (sid: number) => YearEntry | undefined;
	roundData: (sid: number) => RoundEntry | undefined;
	buildFilename: (sid: number) => string;
	driverLaps: (sid: number) => LapTimingEntry[];
}

// ─── SelectionCascade ─────────────────────────────────────────────────────────

/**
 * Registers all cascade $effect chains that keep slot selections consistent.
 * Extracted from old SlotManager.#registerEffects().
 *
 * Each effect is a separate method for clarity. All effects are registered
 * in the constructor and run within the Svelte 5 reactive graph.
 */
export class SelectionCascade {
	private readonly ctx: CascadeContext;
	private readonly meta: MetadataManager;
	private readonly engines: EngineManager;

	constructor(
		ctx: CascadeContext,
		meta: MetadataManager,
		engines: EngineManager,
	) {
		this.ctx = ctx;
		this.meta = meta;
		this.engines = engines;
		this.#registerAll();
	}

	#registerAll() {
		this.#effectAutoInitSlots();
		this.#effectTriggerMetaFetch();
		this.#effectResetHasLoaded();
		this.#effectCascadeRound();
		this.#effectCascadeSession();
		this.#effectLockToSlot0Track();
		this.#effectAutoSelectFastestLap();
	}

	// ── Effect: Auto-init slots when years load ──────────────────────────

	#effectAutoInitSlots() {
		$effect(() => {
			const years = this.ctx.getYears();
			if (!years.length) return;

			const yr = latestYear(years);
			const rd = latestRound(yr);
			const sess = latestSession(rd);

			// Read slots.length to track array mutations
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				this.engines.ensureCapacity(sid);
				this.meta.ensureCapacity(sid);
				const slot = this.ctx.slots[sid];
				if (slot.year) continue;

				slot.year = yr?.year.toString() ?? "";
				if (rd) slot.round = rd.round.toString();
				if (sess) slot.session = sess.code;
				if (DEFAULT_DRIVER_NUMBERS[sid]) {
					slot.driver = DEFAULT_DRIVER_NUMBERS[sid];
				}
			}
		});
	}

	// ── Effect: Trigger meta fetch when selection changes ────────────────

	#effectTriggerMetaFetch() {
		$effect(() => {
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				const key = this.ctx.selectionKey(sid);
				// Read key to subscribe
				key;
				if (this.ctx.slots[sid].lastMetaKey === key) continue;
				this.ctx.slots[sid].lastMetaKey = key;
				this.ctx.slots[sid].meta = null;
				// Preserve the desired driver across meta reloads
				const desiredDriver =
					this.ctx.slots[sid].driver ||
					(DEFAULT_DRIVER_NUMBERS[sid] ?? "");
				this.ctx.slots[sid].driver = "";
				this.ctx.slots[sid].lap = null;
				this.meta.fetchMeta(
					{
						slots: this.ctx.slots,
						buildFilename: this.ctx.buildFilename,
					},
					sid,
					desiredDriver,
				);
			}
		});
	}

	// ── Effect: Reset hasLoaded when selection drifts ────────────────────

	#effectResetHasLoaded() {
		$effect(() => {
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				const key = this.ctx.selectionKey(sid);
				key;
				if (!key || key !== this.ctx.slots[sid].lastLoadedKey) {
					this.ctx.slots[sid].hasLoaded = false;
					this.ctx.slots[sid].lap = null;
				}
			}
		});
	}

	// ── Effect: Cascade round when invalid for chosen year ───────────────

	#effectCascadeRound() {
		$effect(() => {
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				if (!this.ctx.slots[sid].year) continue;
				const yr = this.ctx.yearData(sid);
				if (!yr) continue;
				if (
					!yr.rounds.some(
						(r) =>
							r.round.toString() === this.ctx.slots[sid].round,
					)
				) {
					const latest = [...yr.rounds].sort(
						(a, b) => b.round - a.round,
					)[0];
					this.ctx.slots[sid].round = latest
						? latest.round.toString()
						: "";
					this.ctx.slots[sid].session = "";
				}
			}
		});
	}

	// ── Effect: Cascade session when invalid for chosen round ────────────

	#effectCascadeSession() {
		$effect(() => {
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				if (
					!this.ctx.slots[sid].year ||
					!this.ctx.slots[sid].round
				)
					continue;
				const rd = this.ctx.roundData(sid);
				if (!rd) continue;
				if (
					!rd.sessions.some(
						(s) => s.code === this.ctx.slots[sid].session,
					)
				) {
					const def =
						rd.sessions.find((s) => s.code === "r") ||
						rd.sessions[rd.sessions.length - 1];
					this.ctx.slots[sid].session = def ? def.code : "";
				}
			}
		});
	}

	// ── Effect: Lock non-primary slots to slot-0's track ────────────────

	#effectLockToSlot0Track() {
		$effect(() => {
			this.ctx.slots.length;
			const sourceYear = this.ctx.slots[0]?.year;
			const sourceRound = this.ctx.slots[0]?.round;
			const sourceRoundData = this.ctx.roundData(0);
			// Read values to subscribe
			sourceYear;
			sourceRound;
			sourceRoundData;
			if (!sourceYear || !sourceRound || !sourceRoundData) return;

			for (let sid = 1; sid < this.ctx.slots.length; sid++) {
				const targetYr = this.ctx.yearData(sid);
				if (!targetYr) continue;
				const targetRd = this.ctx.roundData(sid);
				if (targetRd?.name === sourceRoundData.name) continue;

				const sameTrack = targetYr.rounds.find(
					(r) => r.name === sourceRoundData.name,
				);
				if (sameTrack) {
					this.ctx.slots[sid].round = sameTrack.round.toString();
				} else {
					this.ctx.slots[sid].year = sourceYear;
					this.ctx.slots[sid].round = sourceRound;
				}
			}
		});
	}

	// ── Effect: Auto-select fastest lap ─────────────────────────────────

	#effectAutoSelectFastestLap() {
		$effect(() => {
			this.ctx.slots.length;
			for (let sid = 0; sid < this.ctx.slots.length; sid++) {
				const s = this.ctx.slots[sid];
				if (!s.hasLoaded) continue;
				if (s.driver && s.driver !== s.lastDriver) {
					s.lastDriver = s.driver;
					s.lap = this.#fastestLapNum(this.ctx.driverLaps(sid));
				}
				if (s.lap === null)
					s.lap = this.#fastestLapNum(this.ctx.driverLaps(sid));
			}
		});
	}

	// ── Helpers ──────────────────────────────────────────────────────────

	#fastestLapNum(laps: LapTimingEntry[]): number | null {
		const valid = laps.filter(
			(l) => l.time > 0 && l.time < MAX_LAP_TIME_SECONDS,
		);
		if (valid.length === 0) return null;
		return valid.reduce((best, cur) =>
			cur.time < best.time ? cur : best,
		).lap;
	}
}

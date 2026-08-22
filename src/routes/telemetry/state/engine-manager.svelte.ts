import {
	TelemetryEngine,
	type SampleRate,
} from "$lib/TelemetryEngine.svelte";
import type { TelemetryRow, TrackPoint, LapTimingEntry } from "$lib/types";
import type { SlotState } from "$lib/metadata-types";
import { generateJsonUrl, generateParquetUrl } from "$lib";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineContext {
	slots: SlotState[];
	selectionKey: (sid: number) => string;
	buildFilename: (sid: number) => string;
}

export type LoadResult = "success" | "empty" | "error";

// ─── EngineManager ────────────────────────────────────────────────────────────

/**
 * Manages the parallel TelemetryEngine array, slot-to-engine mapping,
 * and grouped data loading. Extracted from old SlotManager.
 */
export class EngineManager {
	readonly engines: TelemetryEngine[] = [
		new TelemetryEngine(),
		new TelemetryEngine(),
	];

	/** Ensure we have enough engines for `sid`. */
	ensureCapacity(sid: number) {
		while (this.engines.length <= sid) this.engines.push(new TelemetryEngine());
	}

	/** Remove engine at `sid` and dispose it. */
	removeSid(sid: number) {
		this.engines[sid]?.dispose();
		this.engines.splice(sid, 1);
	}

	/** Dispose all engines. */
	dispose() {
		for (const engine of this.engines) engine.dispose();
	}

	// ── Slot → Engine mapping ────────────────────────────────────────────

	/**
	 * Build a mapping of slot index → engine index.
	 * Slots sharing the same selection key share the lead engine.
	 */
	engineIndex(ctx: EngineContext): number[] {
		const loadedByKey = new Map<string, number>();
		for (let sid = 0; sid < ctx.slots.length; sid++) {
			const key = ctx.selectionKey(sid);
			if (!key || !ctx.slots[sid].hasLoaded) continue;
			if (!loadedByKey.has(key)) loadedByKey.set(key, sid);
		}
		return ctx.slots.map((_, sid) => {
			const key = ctx.selectionKey(sid);
			if (!key) return sid;
			const loaded = loadedByKey.get(key);
			return loaded !== undefined ? loaded : sid;
		});
	}

	/** Get the engine that serves a given slot. */
	engineForSlot(ctx: EngineContext, sid: number): TelemetryEngine {
		const idx = this.engineIndex(ctx)[sid] ?? sid;
		return this.engines[idx];
	}

	/** Indices of unique active engines (deduped by selection key). */
	activeEngineIndices(ctx: EngineContext): number[] {
		const seen = new Set<number>();
		const out: number[] = [];
		const index = this.engineIndex(ctx);
		for (let sid = 0; sid < ctx.slots.length; sid++) {
			const idx = index[sid] ?? sid;
			if (seen.has(idx)) continue;
			seen.add(idx);
			out.push(idx);
		}
		return out;
	}

	/** Whether any active engine is currently loading. */
	isLoading(ctx: EngineContext): boolean {
		return this.activeEngineIndices(ctx).some(
			(idx) => this.engines[idx]?.isLoading,
		);
	}

	// ── Data access ──────────────────────────────────────────────────────

	/** Get lap timing entries for a driver in a slot. */
	driverLaps(ctx: EngineContext, sid: number): LapTimingEntry[] {
		const s = ctx.slots[sid];
		if (!s) return [];
		return s.hasLoaded && s.driver
			? this.engineForSlot(ctx, sid).getDriverLapTimes(s.driver)
			: [];
	}

	/** Get normalized lap telemetry for the selected lap. */
	lapData(ctx: EngineContext, sid: number): TelemetryRow[] {
		const s = ctx.slots[sid];
		if (!s) return [];
		return s.hasLoaded && s.driver && s.lap
			? this.engineForSlot(ctx, sid).getNormalizedLapTelemetry(
					s.driver,
					s.lap,
				)
			: [];
	}

	/** Get the track path from the first loaded engine. */
	trackPath(ctx: EngineContext): TrackPoint[] {
		for (let sid = 0; sid < ctx.slots.length; sid++) {
			if (!ctx.slots[sid].hasLoaded) continue;
			const path = this.engineForSlot(ctx, sid)?.trackPath ?? [];
			if (path.length > 0) return path;
		}
		return [];
	}

	// ── Loading ──────────────────────────────────────────────────────────

	/**
	 * Load telemetry data for all slots, grouped by selection key.
	 * Returns a promise that resolves with the overall load result.
	 */
	async load(
		ctx: EngineContext,
		dataFrequency: SampleRate,
	): Promise<LoadResult> {
		const groups = new Map<
			string,
			{
				leadSid: number;
				members: number[];
				year: string;
				filename: string;
			}
		>();

		for (let sid = 0; sid < ctx.slots.length; sid++) {
			const s = ctx.slots[sid];
			const key = ctx.selectionKey(sid);
			const fn = ctx.buildFilename(sid);
			if (!s.driver || !key || !fn) continue;
			if (!groups.has(key)) {
				groups.set(key, {
					leadSid: sid,
					members: [sid],
					year: s.year,
					filename: fn,
				});
			} else {
				groups.get(key)!.members.push(sid);
			}
		}

		const promises: Promise<LoadResult>[] = [];

		for (const [key, group] of groups) {
			const engine = this.engines[group.leadSid];
			const parquetUrl = generateParquetUrl(group.year, group.filename);
			const jsonUrl = generateJsonUrl(group.year, group.filename);

			for (const sid of group.members) {
				ctx.slots[sid].loadError = "";
				ctx.slots[sid].hasLoaded = false;
			}

			const p = engine
				.load(dataFrequency, parquetUrl, jsonUrl)
				.then((): LoadResult => {
					if (engine.totalRows > 0) {
						for (const sid of group.members) {
							ctx.slots[sid].lastLoadedKey = key;
							ctx.slots[sid].hasLoaded = true;
							ctx.slots[sid].lap = null;
						}
						return "success";
					} else {
						for (const sid of group.members) {
							ctx.slots[sid].hasLoaded = false;
							ctx.slots[sid].loadError =
								"No telemetry rows loaded for this session.";
						}
						return "empty";
					}
				})
				.catch((e: unknown): LoadResult => {
					const err = String(e);
					for (const sid of group.members) {
						ctx.slots[sid].loadError = err;
					}
					return "error";
				});

			promises.push(p);
		}

		if (promises.length === 0) return "error";

		const results = await Promise.all(promises);
		if (results.some((r) => r === "error")) return "error";
		if (results.some((r) => r === "empty")) return "empty";
		return "success";
	}
}

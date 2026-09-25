import {
	TelemetryEngine,
	type SampleRate,
} from "$lib/TelemetryEngine.svelte";
import type { TelemetryRow, TrackPoint, LapTimingEntry } from "$lib/types";
import type { SlotState } from "$lib/metadata-types";
import { generateJsonUrl, generateParquetUrl } from "$lib";

export type LoadResult = "success" | "empty" | "error";

export class EngineManager {
	readonly engines = new Map<string, TelemetryEngine>();
	#loading = false;

	dispose() {
		this.#loading = false;
		for (const engine of this.engines.values()) {
			engine.dispose();
		}
		this.engines.clear();
	}
	
	reset() {
		this.dispose();
	}

	/** Ensures engines are cleaned up if no active slot uses their key. */
	cleanup(activeKeys: Set<string>) {
		for (const [key, engine] of this.engines.entries()) {
			if (!activeKeys.has(key)) {
				engine.dispose();
				this.engines.delete(key);
			}
		}
	}

	isLoading(): boolean {
		if (this.#loading) return true;
		for (const engine of this.engines.values()) {
			if (engine.isLoading) return true;
		}
		return false;
	}

	getEngine(selectionKey: string | null): TelemetryEngine | undefined {
		if (!selectionKey) return undefined;
		return this.engines.get(selectionKey);
	}

	driverLaps(slot: SlotState, selectionKey: string | null): LapTimingEntry[] {
		if (!slot.hasLoaded || !slot.driver || !selectionKey) return [];
		return this.getEngine(selectionKey)?.getDriverLapTimes(slot.driver) ?? [];
	}

	lapData(slot: SlotState, selectionKey: string | null): TelemetryRow[] {
		if (!slot.hasLoaded || !slot.driver || !slot.lap || !selectionKey) return [];
		return this.getEngine(selectionKey)?.getNormalizedLapTelemetry(slot.driver, slot.lap) ?? [];
	}

	trackPath(): TrackPoint[] {
		for (const engine of this.engines.values()) {
			if (engine.trackPath.length > 0) return engine.trackPath;
		}
		return [];
	}

	async load(
		keysToLoad: Array<{ key: string; year: string; filename: string }>,
		dataFrequency: SampleRate,
	): Promise<LoadResult> {
		if (this.#loading) return "error";
		this.#loading = true;

		try {
			// Dispose every previous engine — a committed load is always a clean slate.
			for (const engine of this.engines.values()) {
				engine.dispose();
			}
			this.engines.clear();

			if (keysToLoad.length === 0) return "success";

			// Dedupe: N slots on the same session share one engine + one fetch.
			// Without this, 4 slots on 1 session fired 4 identical 20MB downloads
			// and all but the last engine leaked (overwritten in the map).
			const unique = new Map<string, { year: string; filename: string }>();
			for (const { key, year, filename } of keysToLoad) {
				if (!unique.has(key)) unique.set(key, { year, filename });
			}

			const results: LoadResult[] = [];
			for (const [key, { year, filename }] of unique.entries()) {
				if (!this.#loading) return "error";

				const engine = new TelemetryEngine();
				this.engines.set(key, engine);

				const parquetUrl = generateParquetUrl(year, filename);
				const jsonUrl = generateJsonUrl(year, filename);

				try {
					await engine.load(dataFrequency, parquetUrl, jsonUrl);
					if (!this.#loading) return "error";
					results.push(engine.totalRows > 0 ? "success" : "empty");
				} catch {
					results.push("error");
				}

				if (!this.#loading) return "error";
				// Yield to allow UI paint and avoid memory spikes when loading multiple engines
				await new Promise((r) => setTimeout(r, 40));
			}

			if (results.some((r) => r === "error")) return "error";
			if (results.some((r) => r === "empty")) return "empty";
			return "success";
		} finally {
			this.#loading = false;
		}
	}
}

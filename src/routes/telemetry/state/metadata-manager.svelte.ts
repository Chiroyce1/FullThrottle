import type { TelemetryMeta } from "$lib/types";
import { generateJsonUrl } from "$lib";
import type { MetaFetchTarget } from "$lib/metadata-types";
import { bestLapFromMeta } from "$lib/metadata-types";

export class MetadataManager {
	private readonly seqs = new Map<string, number>();
	private readonly controllers = new Map<string, AbortController>();
	private readonly cache = new Map<string, TelemetryMeta>();
	private readonly inFlight = new Map<string, Promise<TelemetryMeta | null>>();

	abort(slotId: string) {
		this.controllers.get(slotId)?.abort();
		this.controllers.delete(slotId);
	}

	removeSlot(slotId: string) {
		this.abort(slotId);
		this.seqs.delete(slotId);
	}

	reset() {
		for (const controller of this.controllers.values()) {
			controller.abort();
		}
		this.controllers.clear();
		this.seqs.clear();
		this.inFlight.clear();
		this.cache.clear();
	}

	fetchMeta(
		slot: MetaFetchTarget,
		filename: string,
		preferredDriver = "",
	): Promise<void> {
		this.abort(slot.id);

		if (!filename) {
			slot.meta = null;
			slot.metaLoading = false;
			return Promise.resolve();
		}

		const currentSeq = (this.seqs.get(slot.id) ?? 0) + 1;
		this.seqs.set(slot.id, currentSeq);

		const url = generateJsonUrl(slot.year, filename);

		// Instant cache hit
		const cached = this.cache.get(url);
		if (cached) {
			slot.meta = cached;
			slot.metaLoading = false;
			if (preferredDriver && cached.drivers?.[preferredDriver]) {
				slot.driver = preferredDriver;
				slot.lap = bestLapFromMeta(cached, preferredDriver);
			}
			return Promise.resolve();
		}

		const controller = new AbortController();
		this.controllers.set(slot.id, controller);
		slot.metaLoading = true;

		// Deduplicate in-flight fetches for the same session metadata
		let fetchPromise = this.inFlight.get(url);
		if (!fetchPromise) {
			fetchPromise = fetch(url, { signal: controller.signal })
				.then((r) => (r.ok ? (r.json() as Promise<TelemetryMeta>) : null))
				.then((d) => {
					if (d) this.cache.set(url, d);
					return d;
				})
				.catch((err) => {
					if (controller.signal.aborted) return null;
					return null;
				})
				.finally(() => {
					this.inFlight.delete(url);
				});
			this.inFlight.set(url, fetchPromise);
		}

		return fetchPromise
			.then((d) => {
				if (this.seqs.get(slot.id) !== currentSeq || controller.signal.aborted) return;
				slot.meta = d;
				slot.metaLoading = false;

				if (preferredDriver && slot.meta?.drivers?.[preferredDriver]) {
					slot.driver = preferredDriver;
					slot.lap = bestLapFromMeta(slot.meta, preferredDriver);
				}

				if (this.controllers.get(slot.id) === controller) {
					this.controllers.delete(slot.id);
				}
			})
			.catch(() => {
				if (this.seqs.get(slot.id) !== currentSeq || controller.signal.aborted) return;
				slot.meta = null;
				slot.metaLoading = false;
				if (this.controllers.get(slot.id) === controller) {
					this.controllers.delete(slot.id);
				}
			});
	}
}

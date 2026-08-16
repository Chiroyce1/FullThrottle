import type { TelemetryMeta } from "$lib/types";
import { formatDriverNameWithAbbr, getDriverAbbreviation } from "$lib/utils";
import { generateJsonUrl } from "$lib";
import type { SlotState } from "$lib/metadata-types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaFetchContext {
	slots: SlotState[];
	buildFilename: (sid: number) => string;
}

// ─── MetadataManager ──────────────────────────────────────────────────────────

/**
 * Handles per-slot session metadata fetching with proper abort/sequence
 * tracking. Extracted from the old SlotManager.#fetchMeta.
 */
export class MetadataManager {
	private readonly seqs: number[] = [];
	private readonly controllers: Array<AbortController | null> = [];

	/** Ensure tracking arrays are large enough for `sid`. */
	ensureCapacity(sid: number) {
		while (this.seqs.length <= sid) this.seqs.push(0);
		while (this.controllers.length <= sid) this.controllers.push(null);
	}

	/**
	 * Abort any in-flight fetch for `sid` and clean up.
	 */
	abort(sid: number) {
		this.controllers[sid]?.abort();
		this.controllers[sid] = null;
	}

	/**
	 * Remove tracking entries when a slot is removed.
	 */
	removeSid(sid: number) {
		this.abort(sid);
		this.seqs.splice(sid, 1);
		this.controllers.splice(sid, 1);
	}

	/**
	 * Fetch session metadata for a slot. If `preferredDriver` is provided and
	 * present in the returned metadata, it is auto-selected; otherwise the
	 * first driver alphabetically is chosen.
	 */
	fetchMeta(
		ctx: MetaFetchContext,
		sid: number,
		preferredDriver = "",
	) {
		this.ensureCapacity(sid);
		const fn = ctx.buildFilename(sid);
		const s = ctx.slots[sid];
		if (!s) return;

		// Abort previous in-flight fetch for this slot
		this.abort(sid);

		const seq = ++this.seqs[sid];
		if (!fn) {
			s.meta = null;
			s.metaLoading = false;
			return;
		}

		const controller = new AbortController();
		this.controllers[sid] = controller;
		s.metaLoading = true;

		fetch(generateJsonUrl(s.year, fn), { signal: controller.signal })
			.then((r) =>
				r.ok ? (r.json() as Promise<TelemetryMeta>) : Promise.resolve(null),
			)
			.then((d) => {
				if (this.seqs[sid] !== seq || controller.signal.aborted) return;
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
								`${a.first_name || ""} ${a.last_name || ""}`.trim() ||
								a.name ||
								"";
							const nb =
								`${b.first_name || ""} ${b.last_name || ""}`.trim() ||
								b.name ||
								"";
							return na.localeCompare(nb);
						});
						if (sorted.length > 0)
							s.driver = sorted[0].driver_number.toString();
					}
				}

				if (this.controllers[sid] === controller) {
					this.controllers[sid] = null;
				}
			})
			.catch(() => {
				if (this.seqs[sid] !== seq || controller.signal.aborted) return;
				s.meta = null;
				s.metaLoading = false;
				if (this.controllers[sid] === controller) {
					this.controllers[sid] = null;
				}
			});
	}
}

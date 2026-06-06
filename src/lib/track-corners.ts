/**
 * Track corner data loader.
 *
 * Loads corner metadata from /static/tracks/{track}.json and provides
 * a mapping from F1 session metadata locations to track filenames.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrackCorner {
	number: number;
	letter: string;
	angle: number;
	distance: number;
	x: number;
	y: number;
}

export interface TrackData {
	name: string;
	country: string;
	rotation: number;
	corners: TrackCorner[];
}

// ─── Location → filename mapping ─────────────────────────────────────────────

/**
 * Normalises a location string into the track JSON filename (without extension).
 * e.g. "Spa-Francorchamps" → "spafrancorchamps", "Miami Gardens" → "miami"
 */
const LOCATION_OVERRIDES: Record<string, string> = {
	"miami gardens": "miami",
	bahrain: "sakhir",
	"monte carlo": "monaco",
};

function locationToFilename(location: string): string {
	const lower = location.toLowerCase();
	if (LOCATION_OVERRIDES[lower]) return LOCATION_OVERRIDES[lower];
	return lower.replace(/-/g, "").replace(/\s+/g, "_");
}

// ─── Loader ──────────────────────────────────────────────────────────────────

const cache = new Map<string, TrackData>();

/**
 * Fetches track corner data for a given location name (from metadata).
 * Results are cached in-memory to avoid redundant network requests.
 */
export async function loadTrackCorners(location: string): Promise<TrackData | null> {
	if (!location) return null;

	const filename = locationToFilename(location);
	if (cache.has(filename)) return cache.get(filename)!;

	try {
		const res = await fetch(`/tracks/${filename}.json`);
		if (!res.ok) return null;
		const data: TrackData = await res.json();
		cache.set(filename, data);
		return data;
	} catch {
		return null;
	}
}

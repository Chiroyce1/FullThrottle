/**
 * AppSettings — typed localStorage preference store.
 *
 * All reads / writes go through this single object so the rest of the app
 * never touches localStorage keys directly.
 *
 * Usage (anywhere that runs in the browser):
 *   import { settings } from '$lib/settings';
 *   const threshold = settings.licoThrottleSensitivity;   // read
 *   settings.licoThrottleSensitivity = 10;                // write + persist
 */

const KEY = "ft_settings";

export interface AppSettingsValues {
	/** Whether to interpolate speed telemetry on the replay page */
	speedInterpolation: boolean;
	/** Whether to interpolate throttle telemetry on the replay page */
	throttleInterpolation: boolean;
	/** Whether to interpolate brake telemetry on the replay page */
	brakeInterpolation: boolean;
	/**
	 * Data frequency (sample rate) in Hz for replay and telemetry.
	 * Can be 2, 4, or 8.
	 */
	dataFrequency: 2 | 4 | 8;
	/**
	 * LiCO detection threshold — the maximum throttle % below which a segment
	 * is considered "off-throttle" for Lift and Coast highlighting.
	 * Applies to both the telemetry page and the replay page.
	 */
	licoThrottleSensitivity: number;
}

const DEFAULTS: AppSettingsValues = {
	speedInterpolation: true,
	throttleInterpolation: true,
	brakeInterpolation: true,
	dataFrequency: 4,
	licoThrottleSensitivity: 15,
};

export const LICO_SENSITIVITY_OPTIONS = [3, 5, 10, 15, 30, 50] as const;
export type LicoSensitivity = (typeof LICO_SENSITIVITY_OPTIONS)[number];

class Settings {
	private _values: AppSettingsValues;

	constructor() {
		this._values = this._load();
	}

	// ── Internal ────────────────────────────────────────────────────────────

	private _load(): AppSettingsValues {
		if (typeof window === "undefined") return { ...DEFAULTS };
		try {
			const raw = window.localStorage.getItem(KEY);
			if (!raw) return { ...DEFAULTS };
			const parsed = JSON.parse(raw) as Partial<AppSettingsValues>;
			return { ...DEFAULTS, ...parsed };
		} catch {
			return { ...DEFAULTS };
		}
	}

	private _save() {
		if (typeof window === "undefined") return;
		try {
			window.localStorage.setItem(KEY, JSON.stringify(this._values));
		} catch {
			// Quota exceeded or private mode — silently fail.
		}
	}

	// ── Public API ──────────────────────────────────────────────────────────
	get speedInterpolation(): boolean {
		return this._values.speedInterpolation;
	}
	set speedInterpolation(v: boolean) {
		this._values.speedInterpolation = v;
		this._save();
	}
	get throttleInterpolation(): boolean {
		return this._values.throttleInterpolation;
	}
	set throttleInterpolation(v: boolean) {
		this._values.throttleInterpolation = v;
		this._save();
	}

	get brakeInterpolation(): boolean {
		return this._values.brakeInterpolation;
	}
	set brakeInterpolation(v: boolean) {
		this._values.brakeInterpolation = v;
		this._save();
	}

	get dataFrequency(): 2 | 4 | 8 {
		return this._values.dataFrequency;
	}
	set dataFrequency(v: 2 | 4 | 8) {
		this._values.dataFrequency = v;
		this._save();
	}

	get licoThrottleSensitivity(): number {
		return this._values.licoThrottleSensitivity;
	}
	set licoThrottleSensitivity(v: number) {
		this._values.licoThrottleSensitivity = v;
		this._save();
	}

	/** Return a plain snapshot of all current values */
	snapshot(): AppSettingsValues {
		return { ...this._values };
	}

	/** Reset every setting to its default */
	resetAll() {
		this._values = { ...DEFAULTS };
		this._save();
	}
}

export const settings = new Settings();

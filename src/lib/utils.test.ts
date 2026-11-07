import { describe, expect, it } from "vitest";
import { cn, formatLapTime } from "./utils";
import { MAX_LAP_TIME_SECONDS } from "./constants";

describe("formatLapTime", () => {
	it("formats minutes and sub-minute laps", () => {
		expect(formatLapTime(97.976)).toBe("1:37.976");
		expect(formatLapTime(59.5)).toBe("59.500");
		expect(formatLapTime(65.0049)).toBe("1:05.005");
	});

	it("uses the fallback for missing or implausible values", () => {
		expect(formatLapTime(null)).toBe("–");
		expect(formatLapTime(undefined, "---")).toBe("---");
		expect(formatLapTime(0)).toBe("–");
		expect(formatLapTime(NaN)).toBe("–");
		// e.g. time since session start before lap 1 has begun
		expect(formatLapTime(1799.953)).toBe("–");
		expect(formatLapTime(MAX_LAP_TIME_SECONDS + 1)).toBe("–");
	});
});

describe("cn", () => {
	it("resolves conflicts within the custom type scale", () => {
		expect(cn("text-sm", "text-display-sm")).toBe("text-display-sm");
		expect(cn("text-2xs text-muted-foreground", "text-xs")).toBe("text-muted-foreground text-xs");
	});
});

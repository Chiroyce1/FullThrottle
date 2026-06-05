import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DriverMeta } from "$lib/types";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatSessionTime(s: number): string {
	if (!Number.isFinite(s)) return "00:00:00.0";
	const h = Math.floor(s / 3600)
		.toString()
		.padStart(2, "0");
	const m = Math.floor((s % 3600) / 60)
		.toString()
		.padStart(2, "0");
	const sec = (s % 60).toFixed(1).padStart(4, "0");
	return `${h}:${m}:${sec}`;
}

export function formatSectorTime(seconds: number | null | undefined): string {
	if (!seconds || isNaN(seconds) || seconds === 0) return "-";
	return seconds.toFixed(3);
}

export function getDriverAbbreviation(
	meta:
		| Pick<DriverMeta, "abbreviation" | "last_name" | "name">
		| null
		| undefined,
	fallback = "",
): string {
	const abbr = meta?.abbreviation?.trim();
	if (abbr) return abbr.toUpperCase();

	const lastName = meta?.last_name?.trim();
	if (lastName) return lastName.slice(0, 3).toUpperCase();

	const fullName = meta?.name?.trim();
	if (fullName) {
		const token = fullName.split(" ").filter(Boolean).pop() ?? fullName;
		return token.slice(0, 3).toUpperCase();
	}

	return fallback.trim().slice(0, 3).toUpperCase();
}

export function formatDriverNameWithAbbr(
	meta:
		| Pick<
				DriverMeta,
				"first_name" | "last_name" | "name" | "broadcast_name" | "abbreviation"
		  >
		| null
		| undefined,
	fallback = "",
): string {
	const first = meta?.first_name?.trim() ?? "";
	const last = meta?.last_name?.trim() ?? "";
	const fullName =
		`${first} ${last}`.trim() ||
		meta?.name?.trim() ||
		meta?.broadcast_name?.trim() ||
		fallback;
	const abbr = getDriverAbbreviation(meta, fallback);
	return fullName ? `${fullName} (${abbr})` : abbr;
}

export type SessionMode = "race" | "qualifying" | "timed";

function normalizeSessionToken(value?: string | null): string {
	return (value || "")
		.trim()
		.toLowerCase()
		.replace(/_/g, " ")
		.replace(/-/g, " ");
}

export function deriveSessionMode(
	sessionType?: string | null,
	sessionCode?: string | null,
): SessionMode {
	const normalizedType = normalizeSessionToken(sessionType);
	const normalizedCode = normalizeSessionToken(sessionCode);
	const compactCode = normalizedCode.replace(/\s+/g, "");

	if (
		normalizedType === "qualifying" ||
		normalizedType === "sprint qualifying" ||
		compactCode === "q" ||
		compactCode === "sq" ||
		normalizedCode === "qualifying" ||
		normalizedCode === "sprint qualifying"
	) {
		return "qualifying";
	}

	if (
		normalizedType === "race" ||
		normalizedType === "sprint" ||
		compactCode === "r" ||
		compactCode === "s" ||
		normalizedCode === "race" ||
		normalizedCode === "sprint"
	) {
		return "race";
	}

	return "timed";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: unknown }
	? Omit<T, "child">
	: T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: unknown }
	? Omit<T, "children">
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

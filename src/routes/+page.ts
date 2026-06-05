import type { PageLoad } from "./$types";
export type { SessionEntry, RoundEntry, YearEntry } from "$lib/metadata-types";

export const load: PageLoad = async ({ fetch }) => {
  try {
    const res = await fetch("/metadata.json");
    if (res.ok) {
      const data = (await res.json()) as { years: import("$lib/metadata-types").YearEntry[] };
      return data;
    }
    return { years: [] as import("$lib/metadata-types").YearEntry[] };
  } catch (e) {
    console.error("Failed to fetch metadata.json:", e);
    return { years: [] as import("$lib/metadata-types").YearEntry[] };
  }
};

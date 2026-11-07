<script lang="ts">
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import type { YearEntry } from "$lib/metadata/types";
	import { cn } from "$lib/utils";

	/**
	 * Season → Grand Prix → Session selects. Presentational: the parent owns
	 * the values and decides what a change means. `labelled` puts a caption
	 * above each select; `class` lays out the three (use "contents" to make
	 * them items of the parent's grid).
	 */
	let {
		years,
		year,
		round,
		session,
		onyear,
		onround,
		onsession,
		labelled = false,
		size = "sm",
		class: className = "",
	}: {
		years: YearEntry[];
		year: string;
		round: string;
		session: string;
		onyear: (year: string) => void;
		onround: (round: string) => void;
		onsession: (session: string) => void;
		labelled?: boolean;
		size?: "sm" | "md";
		class?: string;
	} = $props();

	const yearData = $derived(years.find((y) => y.year.toString() === year));
	const roundData = $derived(yearData?.rounds.find((r) => r.round.toString() === round));

	const yearOptions = $derived(
		years.map((y) => ({ value: y.year.toString(), label: y.year.toString() })),
	);
	const roundOptions = $derived(
		[...(yearData?.rounds ?? [])]
			.sort((a, b) => b.round - a.round)
			.map((r) => ({
				value: r.round.toString(),
				label: r.name,
				keywords: `${r.name ?? ""} ${r.location ?? ""} ${r.country ?? ""} ${r.circuit ?? ""} Round ${r.round} R${r.round}`,
				rightLabel: r.location || r.country || "",
			})),
	);
	const sessionOptions = $derived(
		(roundData?.sessions ?? []).map((s) => ({ value: s.code, label: s.label, keywords: s.code })),
	);

	const trigger = $derived(
		cn(
			"w-full rounded-md border-border bg-background text-sm font-normal text-foreground transition-colors hover:border-border-strong",
			size === "md" ? "h-9" : "h-8",
		),
	);

	const fields = $derived([
		{
			label: "Season",
			value: year,
			options: yearOptions,
			placeholder: year || "Season",
			search: "Search season…",
			onchange: onyear,
			list: "",
		},
		{
			label: "Grand Prix",
			value: round,
			options: roundOptions,
			placeholder: roundData?.name ?? "Grand Prix",
			search: "Search circuit or round…",
			onchange: onround,
			list: "max-h-80",
		},
		{
			label: "Session",
			value: session,
			options: sessionOptions,
			placeholder: roundData?.sessions.find((s) => s.code === session)?.label ?? "Session",
			search: "Search session…",
			onchange: onsession,
			list: "",
		},
	]);
</script>

<div class={className}>
	{#each fields as f (f.label)}
		{#if labelled}
			<label class="flex min-w-0 flex-col gap-1.5">
				<span class="text-xs text-muted-foreground">{f.label}</span>
				<SearchableSelect
					value={f.value}
					options={f.options}
					placeholder={f.placeholder}
					searchPlaceholder={f.search}
					onchange={f.onchange}
					triggerClass={trigger}
					contentClass="border-border bg-popover {f.list}"
					listClass={f.list}
				/>
			</label>
		{:else}
			<div class="min-w-0" aria-label={f.label}>
				<SearchableSelect
					value={f.value}
					options={f.options}
					placeholder={f.placeholder}
					searchPlaceholder={f.search}
					onchange={f.onchange}
					triggerClass={trigger}
					contentClass="border-border bg-popover {f.list}"
					listClass={f.list}
				/>
			</div>
		{/if}
	{/each}
</div>

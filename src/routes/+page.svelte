<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import { Separator } from "$lib/components/ui/separator";
	import SessionPicker from "$lib/components/SessionPicker.svelte";
	import type { PageData } from "./$types";
	import posthog from "posthog-js";
	import { latestYear, latestRound, latestSession } from "$lib/metadata-types";

	const { data }: { data: PageData } = $props();

	// Latest available session for the quick-jump card
	const latestYearEntry = $derived(latestYear(data.years));
	const latestRoundEntry = $derived(latestRound(latestYearEntry));
	const latestSessionEntry = $derived(latestSession(latestRoundEntry));
	const latestReplayUrl = $derived.by(() => {
		if (!latestYearEntry || !latestRoundEntry || !latestSessionEntry) return null;
		return `/replay/${latestYearEntry.year}/${latestRoundEntry.round}/${latestSessionEntry.code}`;
	});
	const latestLabel = $derived.by(() => {
		if (!latestRoundEntry || !latestSessionEntry) return null;
		return `${latestRoundEntry.name} · ${latestSessionEntry.label}`;
	});


	const features = [
		{
			tag: "LIVE",
			title: "Telemetry charts",
			desc: "Speed, throttle, brake, RPM, gear changes, and Lift & Coast (LiCO) synced as you scrub",
		},
		{
			tag: "LIVE",
			title: "Track map",
			desc: "Synced with the telemetry charts, the map shows where the car is on track",
		},
		{
			tag: "LIVE",
			title: "Session replay",
			desc: "Replay any F1 session (Race, Quali, FP) from any year, with leaderboards, track maps and telemetry playback.",
		},
		{
			tag: "LIVE",
			title: "Cross-session compare",
			desc: "Overlay any two drivers across sessions. Lap vs lap, compound vs compound, year vs year",
		},
		{
			tag: "LIVE",
			title: "Multi-driver compare",
			desc: "Compare laps on the same track across multiple drivers and sessions",
		},
		{
			tag: "Soon",
			title: "Corner analysis",
			desc: "Minimum speeds, lift and coast, and more stats per driver per lap. Still to come.",
		},
	] as const;

	const stack = [
		{ label: "Svelte 5", sub: "Reactive UI", href: "https://svelte.dev" },
		{ label: "d3.js", sub: "Visualizations", href: "https://d3js.org" },
		{
			label: "Parquet",
			sub: "Data Storage",
			href: "https://parquet.apache.org",
		},
		{
			label: "FastF1",
			sub: "Data Source",
			href: "https://github.com/theOehrly/Fast-F1",
		},
	] as const;
</script>

<svelte:head>
	<title>FullThrottle - F1 Telemetry</title>
	<meta
		name="description"
		content="F1 telemetry analysis in the browser using rich data from FastF1"
	/>
</svelte:head>

<main
	class="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center gap-12 md:gap-18 px-4 md:px-8 py-12 md:py-24 text-center"
>
	<!-- Hero -->
	<section
		class="flex min-h-[50vh] md:min-h-[60vh] flex-col items-center justify-center gap-6 md:gap-8"
	>
		<div class="flex flex-col items-center gap-4 select-none">
			<Badge
				variant="outline"
				class="border-green-600 px-4 py-1 font-mono tracking-widest text-green-600 uppercase border-2"
			>
				OPEN SOURCE BETA
			</Badge>
			<h1
				class="max-w-4xl text-5xl font-black tracking-tighter text-foreground md:text-8xl"
			>
				Full<span class="text-primary">Throttle</span>
			</h1>
			<p class="text-md font-mono text-muted-foreground uppercase">
				<span>F1 Telemetry</span>
				<span class="text-primary">in the browser</span>
			</p>
		</div>

		<p class="max-w-2xl text-xl leading-relaxed text-muted-foreground">
			<span class="font-bold text-foreground">Free and open-source</span>
			F1 telemetry charts and session replays. <br />
			Telemetry data sourced from
			<span class="text-foreground"
				><a
					href="https://github.com/theOehrly/Fast-F1"
					class="hover:underline"
					target="_blank"
					aria-label="FastF1">FastF1</a
				></span
			>
		</p>

		<div
			class="mt-4 flex w-full flex-col md:flex-row items-center justify-center gap-4 md:gap-6 md:w-auto"
		>
			<Button
				href="/telemetry"
				class="w-full md:w-auto border border-primary bg-primary px-10 py-7 text-sm font-black text-primary-foreground uppercase transition-all duration-200 hover:bg-transparent hover:text-primary"
			>
				Telemetry
			</Button>
			<Button
				variant="outline"
				onclick={() => {
					posthog.capture("session_replay", { scroll: true });
					const el = document.getElementById("session-picker");
					if (el) {
						el.scrollIntoView({ behavior: "smooth" });
					}
				}}
				class="w-full md:w-auto border-border bg-transparent px-10 py-7 text-sm font-bold tracking-widest text-foreground uppercase hover:bg-muted"
			>
				Session Replay
			</Button>
		</div>

		<!-- Latest session quick-jump -->
		{#if latestReplayUrl && latestLabel}
			<a
				href={latestReplayUrl}
				class="group flex items-center gap-3 rounded-xl border border-divider/60 bg-surface-raised/40 px-4 py-3 text-left transition-all hover:border-divider hover:bg-surface-raised"
			>
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<!-- play icon -->
					<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
				</div>
				<div class="min-w-0">
					<div class="font-mono text-[9px] font-bold tracking-widest text-on-surface-subtle uppercase">Latest session</div>
					<div class="truncate text-sm font-bold text-on-surface transition-colors group-hover:text-primary">{latestLabel}</div>
				</div>
				<svg class="ml-auto shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
			</a>
		{/if}

		<p class="font-mono text-xs tracking-wider text-muted-foreground lowercase">
			built by
			<a
				href="https://github.com/chiroyce1"
				target="_blank"
				class="text-foreground hover:underline">chiroyce</a
			>
		</p>
	</section>

	<Separator class="opacity-10" />

	<!-- Session Picker -->
	<section class="w-full mb-18">
		<SessionPicker years={data.years} />
	</section>

	<Separator class="opacity-10" />

	<!-- Feature grid -->
	<section class="w-full">
		<div class="mb-12 flex flex-col items-center gap-3">
			<h2 class="text-4xl font-black tracking-tighter text-primary uppercase">
				Features
			</h2>
			<p class="text-md text-on-surface-muted">
				Live features and future roadmap
			</p>
		</div>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each features as f}
				<div
					class="group rounded-xl border border-border/30 bg-surface-raised p-8 text-left transition-colors hover:bg-surface-overlay"
				>
					{#if f.tag == "LIVE"}
						<div class="mb-3 flex items-center gap-2">
							<span class="text-md font-mono font-bold text-primary uppercase">
								LIVE
							</span>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<span
								class="text-md font-mono font-bold text-on-surface-subtle uppercase"
							>
								<span class="text-2xl">◌</span> COMING SOON
							</span>
						</div>
					{/if}

					<div
						class="text-xl font-black tracking-tight text-on-surface uppercase"
					>
						{f.title}
					</div>
					<p class="mt-2 text-sm leading-relaxed text-on-surface-muted">
						{f.desc}
					</p>
				</div>
			{/each}
		</div>
	</section>

	<Separator class="opacity-10" />

	<!-- Stack -->
	<section class="w-full">
		<h1
			class="mb-12 text-4xl font-black tracking-tighter text-primary uppercase"
		>
			Built using
		</h1>
		<div
			class="mx-auto grid w-full max-w-2xl grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12"
		>
			{#each stack as s}
				<div class="flex flex-col items-center gap-2">
					<span class="text-2xl font-bold text-on-surface">
						<a
							href={s.href}
							target="_blank"
							class="transition-all duration-100 hover:scale-105 hover:underline"
							>{s.label}</a
						>
					</span>
					<span class="text-xl text-on-surface-muted">{s.sub}</span>
				</div>
			{/each}
		</div>
	</section>
</main>

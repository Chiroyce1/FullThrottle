<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import { Separator } from "$lib/components/ui/separator";
	import SessionPicker from "$lib/components/SessionPicker.svelte";
	import type { PageData } from "./$types";
	import posthog from "posthog-js";

	const { data }: { data: PageData } = $props();

	const features = [
		{
			tag: "LIVE",
			title: "Rich telemetry charts",
			desc: "Speed, throttle, brake, RPM, gear changes, and Lift & Coast (LiCO) synced as you scrub",
		},
		{
			tag: "LIVE",
			title: "Reactive Track Map",
			desc: "Synced with telemetry charts, the map shows exactly where the car is on track",
		},
		{
			tag: "LIVE",
			title: "Full Session Replay",
			desc: "Replay any F1 session (Race, Quali, FP) from any year. Includes live leaderboards, full track maps and telemetry playback.",
		},
		{
			tag: "LIVE",
			title: "Cross-Session Compare",
			desc: "Overlay any two drivers across any sessions. Lap vs lap, compound vs compound, year vs year",
		},
		{
			tag: "LIVE",
			title: "Multiple Driver Comparisons",
			desc: "Compare laps on the same track across multiple drivers and sessions",
		},
		{
			tag: "Soon",
			title: "Corner Analysis",
			desc: "Minimum speeds, lift and coast, and more stats per driver per lap, coming soon!",
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
				<span>The Ultimate</span>
				<span class="text-primary">F1 Telemetry</span> Experience
			</p>
		</div>

		<p class="max-w-2xl text-xl leading-relaxed text-muted-foreground">
			A <span class="font-bold text-foreground">Free</span>
			web platform for F1 insights. <br />
			All telemetry sourced from
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
	</section>

	<Separator class="opacity-10" />

	<!-- Session Picker -->
	<section class="w-full mb-18">
		<SessionPicker years={data.years} />
	</section>

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

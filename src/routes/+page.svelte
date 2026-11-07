<script lang="ts">
	import SEO from "$lib/components/SEO.svelte";
	import SessionPicker from "$lib/components/SessionPicker.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import type { PageData } from "./$types";
	import { latestYear, latestRound, latestSession } from "$lib/metadata/types";
	import { ArrowRight, ArrowUpRight, Play } from "phosphor-svelte";
	import { SITE_CONFIG } from "$lib/metadata/seo";
	import { reveal } from "$lib/actions/reveal";

	const { data }: { data: PageData } = $props();

	const latestYearEntry = $derived(latestYear(data.years));
	const latestRoundEntry = $derived(latestRound(latestYearEntry));
	const latestSessionEntry = $derived(latestSession(latestRoundEntry));
	const latestReplayUrl = $derived.by(() => {
		if (!latestYearEntry || !latestRoundEntry || !latestSessionEntry)
			return null;
		return `/replay/${latestYearEntry.year}/${latestRoundEntry.round}/${latestSessionEntry.code}`;
	});
	const latestLabel = $derived.by(() => {
		if (!latestRoundEntry || !latestSessionEntry) return null;
		return `${latestRoundEntry.name} · ${latestSessionEntry.label}`;
	});

	const features = [
		{
			title: "Telemetry charts",
			desc: "Speed, throttle, brake, RPM, gear and lift & coast, synced as you scrub.",
			live: true,
		},
		{
			title: "Session replay",
			desc: "Replay any race, qualifying or practice session with live timing and a track map.",
			live: true,
		},
		{
			title: "Track map",
			desc: "Follows the cursor across every chart, so you always know where the car is.",
			live: true,
		},
		{
			title: "Corner analysis",
			desc: "Minimum speeds and head-to-head deltas for every corner, per driver, per lap.",
			live: true,
		},
		{
			title: "Cross-session compare",
			desc: "Overlay laps across drivers, sessions and seasons: compound vs compound, year vs year.",
			live: true,
		},
		{
			title: "Race analysis",
			desc: "Lap-by-lap pace for the whole field, broken down by tyre stint.",
			live: false,
		},
	] as const;
</script>

<svelte:head>
	<link rel="preload" as="image" href="/dashboard_preview.png" />
</svelte:head>

<SEO route="home" />

<main class="flex w-full flex-1 flex-col">
	<!-- ─── Hero ─────────────────────────────────────────────────────────── -->
	<section class="relative overflow-hidden">
		<div class="hero-glow" aria-hidden="true"></div>
		<div
			class="relative mx-auto grid max-w-6xl gap-x-12 gap-y-5 px-4 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[auto_1fr] lg:items-end"
		>
			<div>
				<a
					href={SITE_CONFIG.author.url}
					target="_blank"
					rel="noreferrer"
					class="group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					Built by
					<span class="font-medium text-foreground group-hover:text-primary"
						>{SITE_CONFIG.author.name}</span
					>
					<ArrowUpRight size={14} />
				</a>
				<h1
					class="mt-3 text-[3.5rem] leading-[0.9] font-extrabold tracking-[-0.045em] text-foreground select-none sm:text-[5rem] lg:text-[6rem]"
				>
					Full<span class="text-primary">Throttle</span>
				</h1>
			</div>

			<div class="flex flex-col gap-4 lg:pb-1.5">
				<p class="max-w-md text-lg text-muted-foreground">
					F1 telemetry and session replays in your browser. Compare any two
					laps, or rewatch a race with live timing.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button href="/telemetry" size="lg">
						Open telemetry
						<ArrowRight size={16} />
					</Button>
					{#if latestReplayUrl && latestLabel}
						<Button href={latestReplayUrl} size="lg" variant="secondary">
							<Play size={14} weight="fill" />
							<span class="max-w-[16rem] truncate">Replay {latestLabel}</span>
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Product shot -->
		<div class="relative mx-auto mt-8 max-w-6xl px-4 sm:px-6">
			<a
				href="/telemetry"
				class="product-shot group block overflow-hidden rounded-xl border border-border-strong bg-card p-1.5"
				aria-label="Open the telemetry dashboard"
			>
				<img
					src="/dashboard_preview.png"
					alt="FullThrottle telemetry: speed and throttle traces for two drivers, corner speeds and a track map"
					class="block aspect-[16/9] w-full rounded-md object-cover object-top"
					loading="eager"
				/>
			</a>
		</div>
	</section>

	<!-- ─── Replay ───────────────────────────────────────────────────────── -->
	<section id="replay" class="scroll-mt-16 border-t border-border py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6" use:reveal>
			<div class="mb-6 flex flex-col gap-2">
				<p class="flex items-center gap-3">
					<span class="section-index">01</span>
					<span class="eyebrow">Session replay</span>
				</p>
				<h2 class="display text-display-sm text-foreground sm:text-display-md">
					Replay any session
				</h2>
				<p class="max-w-lg text-muted-foreground">
					Every race, qualifying and practice session since 2025 with a live
					leaderboard, sector times and the whole field on the track map.
				</p>
			</div>

			<SessionPicker years={data.years} />
		</div>
	</section>

	<!-- ─── Features ─────────────────────────────────────────────────────── -->
	<section class="border-t border-border py-12 sm:py-14">
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			<div class="mb-6 flex flex-col gap-2" use:reveal>
				<p class="flex items-center gap-3">
					<span class="section-index">02</span>
					<span class="eyebrow">Features</span>
				</p>
				<h2 class="display text-display-sm text-foreground sm:text-display-md">
					In-depth analysis
				</h2>
			</div>

			<ol class="grid border-t border-border md:grid-cols-2">
				{#each features as f, i (f.title)}
					<li
						class="flex gap-5 border-b border-border py-4 md:odd:border-r md:odd:pr-8 md:even:pl-8"
						use:reveal={(i % 2) * 80 + Math.floor(i / 2) * 60}
					>
						<span class="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums"
							>{String(i + 1).padStart(2, "0")}</span
						>
						<div class="flex-1">
							<div class="flex items-center gap-2">
								<h3 class="text-base font-medium text-foreground">{f.title}</h3>
								{#if !f.live}
									<Badge variant="neutral">Coming soon</Badge>
								{/if}
							</div>
							<p class="mt-1 text-muted-foreground">{f.desc}</p>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</section>
</main>

<style>
	/* Soft brand-tinted glow behind the hero — the one decorative use of red */
	.hero-glow {
		position: absolute;
		inset: -40% -10% auto;
		height: 120%;
		background: radial-gradient(
			ellipse 50% 40% at 70% 35%,
			color-mix(in srgb, var(--primary) 10%, transparent),
			transparent 70%
		);
		pointer-events: none;
	}

	.product-shot {
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--foreground) 3%, transparent),
			0 30px 80px -20px rgb(0 0 0 / 0.5);
		mask-image: linear-gradient(to bottom, black 85%, transparent);
		transition: border-color 0.2s ease;
	}
	.product-shot:hover {
		border-color: color-mix(in srgb, var(--foreground) 20%, transparent);
	}
	:global(:root:not(.dark)) .product-shot {
		box-shadow: 0 30px 80px -30px rgb(0 0 0 / 0.18);
	}
</style>

<script lang="ts">
	import "./layout.css";
	import { page } from "$app/state";
	import { ModeWatcher } from "mode-watcher";
	import ModeToggle from "$lib/components/ModeToggle.svelte";
	import { SettingsIcon, Menu, X } from "lucide-svelte";
	import { slide } from "svelte/transition";

	let { children } = $props();

	// Full-screen dashboard routes (no header/footer)
	let isDashboard = $derived(
		page.route.id === "/telemetry" ||
			page.route.id?.includes("[year]") ||
			page.route.id?.startsWith("/replay"),
	);

	let mobileMenuOpen = $state(false);

	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" type="image/png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="preconnect"
		href="https://fonts.gstatic.com"
		crossorigin="anonymous"
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap"
		rel="stylesheet"
	/>
	<script
		defer
		src="https://static.cloudflareinsights.com/beacon.min.js"
		data-cf-beacon={'{"token": "056e0eb98fcb41a9990c6a018fadd88a"}'}
	></script>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://fullthrottlef1.pages.dev/" />
	<meta property="og:title" content="FullThrottle - F1 Telemetry" />
	<meta
		property="og:description"
		content="A Free web platform for F1 insights."
	/>
	<meta
		property="og:image"
		content="https://fullthrottlef1.pages.dev/dashboard.png"
	/>

	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:title" content="FullThrottle - F1 Telemetry" />
	<meta
		property="twitter:description"
		content="A Free web platform for F1 insights."
	/>
	<meta
		property="twitter:image"
		content="https://fullthrottlef1.pages.dev/dashboard.png"
	/>
</svelte:head>

<ModeWatcher defaultMode="dark" />

<div class="flex min-h-screen flex-col bg-background text-foreground">
	{#if !isDashboard}
		<!-- HEADER -->
		<header
			class="sticky top-0 z-50 border-b border-border/50 bg-background/95 px-8 py-4 backdrop-blur"
		>
			<div class="mx-auto flex max-w-7xl items-center justify-between">
				<div class="flex items-center gap-4">
					<h1 class="text-2xl font-bold tracking-tight text-foreground">
						<a href="/">FullThrottle</a>
					</h1>
				</div>
				<div class="flex items-center gap-6">
					<nav
						class="hidden gap-6 text-sm font-medium text-muted-foreground md:flex"
					>
						<a href="/telemetry" class="transition-colors hover:text-foreground"
							>Telemetry</a
						>
						<a href="/faq" class="transition-colors hover:text-foreground"
							>FAQ</a
						>
						<a href="/settings" class="transition-colors hover:text-foreground"
							><SettingsIcon size={18} /></a
						>
					</nav>
					<ModeToggle />
					<button
						class="md:hidden"
						onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
						aria-label="Toggle Menu"
					>
						{#if mobileMenuOpen}
							<X size={24} />
						{:else}
							<Menu size={24} />
						{/if}
					</button>
				</div>
			</div>
			{#if mobileMenuOpen}
				<div
					transition:slide={{ duration: 200 }}
					class="md:hidden mt-4 pt-4 border-t border-border flex flex-col gap-2 text-sm font-medium text-muted-foreground"
				>
					<a
						href="/telemetry"
						class="transition-colors hover:text-foreground block py-2"
						>Telemetry</a
					>
					<a
						href="/faq"
						class="transition-colors hover:text-foreground block py-2">FAQ</a
					>
					<a
						href="/settings"
						class="transition-colors hover:text-foreground flex items-center gap-2 py-2"
					>
						<SettingsIcon size={18} />
						Settings
					</a>
				</div>
			{/if}
		</header>
	{/if}

	<!-- MAIN CONTENT -->
	{@render children()}

	{#if !isDashboard}
		<!-- FOOTER -->
		<footer
			class="mt-auto border-t border-border/50 bg-secondary/20 pt-12 pb-8"
		>
			<div
				class="mx-auto flex max-w-7xl flex-col justify-between gap-12 px-8 md:flex-row"
			>
				<div class="">
					<div class="mx-auto max-w-2xl">
						<p class="font-mono text-sm text-muted-foreground uppercase">
							FullThrottle is a <span class="text-foreground"
								>non-commercial</span
							>
							project.
							<br />
							this platform is unofficial and is not associated in any way with the
							Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD
							CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula
							One Licensing B.V.

							<br /><br />

							This site uses
							<a
								href="https://posthog.com/privacy"
								class="text-foreground underline">posthog</a
							>
							for web analytics and user feedback during the early testing, and
							<a
								href="https://www.cloudflare.com/privacypolicy/"
								class="text-foreground underline">cloudflare</a
							> for web hosting and analytics.
						</p>
					</div>
				</div>
				<div class="flex items-end justify-start md:justify-end">
					<p
						class="font-mono text-sm text-muted-foreground text-left md:text-right max-w-75"
					>
						Built and designed by
						<a
							href="https://github.com/chiroyce1"
							target="_blank"
							class="hover:underline font-bold text-[#498af9]">chiroyce</a
						>
						<br />
						Source code
						<a
							href="https://github.com/chiroyce1/fullthrottle"
							target="_blank"
							class="hover:underline text-[#f47f37]">on GitHub</a
						>
					</p>
				</div>
			</div>
		</footer>
	{/if}
</div>

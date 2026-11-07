<script lang="ts">
	import "./layout.css";
	import { page } from "$app/state";
	import { ModeWatcher } from "mode-watcher";
	import AppHeader from "$lib/components/AppHeader.svelte";
	import AppFooter from "$lib/components/AppFooter.svelte";

	let { children } = $props();

	// Full-screen dashboard routes (no header/footer)
	let isDashboard = $derived(
		page.route.id === "/telemetry" ||
			page.route.id?.includes("[year]") ||
			page.route.id?.startsWith("/replay"),
	);
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
		href="https://fonts.googleapis.com/css2?family=Geist:wght@300..900&family=Geist+Mono:wght@400..700&family=Saira+Condensed:wght@600;700&display=swap"
		rel="stylesheet"
	/>
	<script
		defer
		src="https://static.cloudflareinsights.com/beacon.min.js"
		data-cf-beacon={'{"token": "056e0eb98fcb41a9990c6a018fadd88a"}'}
	></script>
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#09090b" />
</svelte:head>

<ModeWatcher defaultMode="dark" />

<div class="flex min-h-screen flex-col bg-background text-foreground">
	{#if !isDashboard}
		<AppHeader />
	{/if}

	<!-- MAIN CONTENT -->
	{@render children()}

	{#if !isDashboard}
		<AppFooter />
	{/if}
</div>

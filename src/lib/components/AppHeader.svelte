<script lang="ts">
	import type { Snippet } from "svelte";
	import { page } from "$app/state";
	import { slide } from "svelte/transition";
	import { Gear, List, X } from "phosphor-svelte";
	import ModeToggle from "$lib/components/ModeToggle.svelte";
	import { cn } from "$lib/utils";
	import { Wordmark } from "$lib/components/app";

	let {
		variant = "default",
		breadcrumb,
		actions,
	}: {
		/** default: centred marketing header. compact: full-width app bar for dashboards. */
		variant?: "default" | "compact";
		breadcrumb?: Snippet;
		actions?: Snippet;
	} = $props();

	const links = [
		{ href: "/telemetry", label: "Telemetry" },
		{ href: "/#replay", label: "Replay" },
		{ href: "/faq", label: "FAQ" },
	];

	let mobileMenuOpen = $state(false);

	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	const isActive = (href: string) =>
		href === "/telemetry"
			? page.url.pathname.startsWith("/telemetry")
			: href === "/#replay"
				? page.url.pathname.startsWith("/replay")
				: page.url.pathname === href;
</script>

<header
	class={cn(
		"z-50 shrink-0 border-b border-border bg-background/80 backdrop-blur-md",
		variant === "default" && "sticky top-0",
	)}
>
	<div
		class={cn(
			"flex items-center justify-between gap-4",
			variant === "default"
				? "mx-auto h-14 max-w-6xl px-4 sm:px-6"
				: "h-12 px-3 sm:px-4",
		)}
	>
		<div class="flex min-w-0 items-center gap-3">
			<Wordmark class="text-sm" />

			{#if breadcrumb}
				<span class="text-border-strong" aria-hidden="true">/</span>
				<div class="min-w-0 truncate text-sm text-muted-foreground">
					{@render breadcrumb()}
				</div>
			{/if}

			{#if variant === "default" || !breadcrumb}
				<nav class="ml-4 hidden items-center gap-1 md:flex">
					{#each links as link (link.href)}
						<a
							href={link.href}
							class={cn(
								"rounded-md px-2.5 py-1.5 text-sm transition-colors",
								isActive(link.href)
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}>{link.label}</a
						>
					{/each}
				</nav>
			{/if}
		</div>

		<div class="flex items-center gap-1.5">
			{#if actions}
				<div class="hidden items-center gap-1.5 md:flex">
					{@render actions()}
				</div>
				<span class="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden="true"
				></span>
			{/if}
			<a
				href="/settings"
				class="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex"
				aria-label="Settings"
			>
				<Gear size={16} />
			</a>
			<ModeToggle class="border-0" />
			<button
				class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
				aria-label="Toggle menu"
				aria-expanded={mobileMenuOpen}
			>
				{#if mobileMenuOpen}
					<X size={16} />
				{:else}
					<List size={16} />
				{/if}
			</button>
		</div>
	</div>

	{#if mobileMenuOpen}
		<nav
			transition:slide={{ duration: 180 }}
			class="flex flex-col border-t border-border px-4 py-2 text-sm md:hidden"
		>
			{#each links as link (link.href)}
				<a href={link.href} class="py-2 text-muted-foreground hover:text-foreground"
					>{link.label}</a
				>
			{/each}
			<a href="/settings" class="py-2 text-muted-foreground hover:text-foreground"
				>Settings</a
			>
		</nav>
	{/if}
</header>

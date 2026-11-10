<script lang="ts">
	import { SITE_CONFIG } from "$lib/metadata/seo";
	import { Wordmark } from "$lib/components/app";
	import { GithubLogo, XLogo, YoutubeLogo } from "phosphor-svelte";

	const author = SITE_CONFIG.author;
	const socials = [
		{ href: author.sameAs[0], label: "GitHub", icon: GithubLogo },
		{ href: author.sameAs[1], label: "X", icon: XLogo },
		{ href: author.sameAs[2], label: "YouTube", icon: YoutubeLogo },
	];
</script>

<footer class="mt-auto border-t border-border">
	<div
		class="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:grid-cols-[1fr_auto]"
	>
		<div class="max-w-xl space-y-3">
			<Wordmark class="w-fit" />
			<p>
				A free, open-source, non-commercial project. Unofficial and not
				associated in any way with the Formula 1 companies. F1, Formula One,
				Formula 1, FIA Formula One World Championship, Grand Prix and related
				marks are trade marks of Formula One Licensing B.V.
			</p>
			<p>
				Uses <a
					href="https://posthog.com/privacy"
					class="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>PostHog</a
				>
				for analytics and feedback, and
				<a
					href="https://www.cloudflare.com/privacypolicy/"
					class="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>Cloudflare</a
				> for hosting. Data from
				<a
					href="https://openf1.org"
					class="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>OpenF1</a
				>
				(<a
					href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
					class="whitespace-nowrap text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>CC BY-NC-SA 4.0</a
				>) and
				<a
					href="https://github.com/theOehrly/Fast-F1"
					class="text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>FastF1</a
				>.
			</p>
		</div>
		<div class="flex flex-col gap-2 md:items-end md:justify-end">
			<a href="/telemetry" class="hover:text-foreground">Telemetry</a>
			<a href="/faq" class="hover:text-foreground">FAQ</a>
			<a
				href="https://github.com/chiroyce1/fullthrottle"
				target="_blank"
				rel="noreferrer"
				class="hover:text-foreground">Source on GitHub</a
			>
		</div>

		<div
			class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-5 md:col-span-2"
		>
			<span class="text-sm">
				Built by
				<a
					href={author.url}
					target="_blank"
					rel="noreferrer"
					class="font-medium text-foreground hover:text-primary">{author.name}</a
				>
			</span>
			<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
				{#each socials as social (social.label)}
					{@const Icon = social.icon}
					<a
						href={social.href}
						target="_blank"
						rel="noreferrer me"
						class="flex items-center gap-1.5 hover:text-foreground"
						><Icon size={16} />{social.label}</a
					>
				{/each}
			</div>
		</div>
	</div>
</footer>

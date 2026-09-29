<script lang="ts">
	import {
		SITE_CONFIG,
		SITE_NAME,
		DEFAULT_TITLE,
		DEFAULT_DESCRIPTION,
		DEFAULT_OG_IMAGE,
		getCanonicalUrl,
		getWebsiteSchema,
		getFaqSchema,
		getReplaySeo,
		type PageRouteKey,
	} from "$lib/metadata/seo";
	import type { ReplaySessionMeta } from "$lib/metadata";

	interface Props {
		route?: PageRouteKey;
		replay?: ReplaySessionMeta | null;
		// Optional manual overrides
		title?: string;
		description?: string;
		canonical?: string;
		path?: string;
		ogType?: "website" | "article";
		ogImage?: string;
		ogImageAlt?: string;
		noindex?: boolean;
		schema?: object | object[] | null;
	}

	let {
		route,
		replay,
		title,
		description,
		canonical,
		path,
		ogType = "website",
		ogImage = DEFAULT_OG_IMAGE,
		ogImageAlt = SITE_CONFIG.ogImageAlt,
		noindex,
		schema,
	}: Props = $props();

	// Auto-resolve route configs if a route preset is passed
	let resolvedConfig = $derived.by(() => {
		if (route && SITE_CONFIG.pages[route]) {
			return SITE_CONFIG.pages[route];
		}
		return null;
	});

	let resolvedReplay = $derived.by(() => {
		if (replay) {
			return getReplaySeo(replay);
		}
		return null;
	});

	let computedTitle = $derived.by(() => {
		if (title) {
			return title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
		}
		if (resolvedReplay) return resolvedReplay.title;
		if (resolvedConfig) return resolvedConfig.title;
		return DEFAULT_TITLE;
	});

	let computedDescription = $derived(
		description ||
			resolvedReplay?.description ||
			resolvedConfig?.description ||
			DEFAULT_DESCRIPTION,
	);

	let computedPath = $derived(
		path || resolvedReplay?.path || resolvedConfig?.path || "",
	);

	let computedCanonical = $derived(canonical || getCanonicalUrl(computedPath));

	let computedNoindex = $derived(
		noindex !== undefined
			? noindex
			: resolvedConfig && "noindex" in resolvedConfig
				? !!resolvedConfig.noindex
				: false,
	);

	let computedSchema = $derived.by(() => {
		if (schema !== undefined) return schema;
		if (resolvedReplay) return resolvedReplay.schema;
		if (route === "home") return getWebsiteSchema();
		if (route === "faq") return getFaqSchema();
		return null;
	});

	let serializedSchema = $derived(
		computedSchema ? JSON.stringify(computedSchema) : null,
	);
</script>

<svelte:head>
	<title>{computedTitle}</title>
	<meta name="description" content={computedDescription} />
	<link rel="canonical" href={computedCanonical} />

	{#if computedNoindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta
			name="robots"
			content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
		/>
	{/if}

	<!-- Open Graph -->
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content={ogType} />
	<meta property="og:url" content={computedCanonical} />
	<meta property="og:title" content={computedTitle} />
	<meta property="og:description" content={computedDescription} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1566" />
	<meta property="og:image:height" content="994" />
	<meta property="og:image:alt" content={ogImageAlt} />

	<!-- Twitter / X Cards -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={computedTitle} />
	<meta name="twitter:description" content={computedDescription} />
	<meta name="twitter:image" content={ogImage} />
	<meta name="twitter:image:alt" content={ogImageAlt} />

	<!-- JSON-LD Structured Data -->
	{#if serializedSchema}
		{@html `<script type="application/ld+json">${serializedSchema}</script>`}
	{/if}
</svelte:head>

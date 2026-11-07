<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";

	/** Inline status strip (warnings, errors) shown above content. */
	let {
		tone = "warning",
		class: className = "",
		children,
	}: { tone?: "warning" | "error"; class?: string; children: Snippet } = $props();
</script>

<p
	class={cn(
		"border-b px-3 py-1.5 text-xs",
		tone === "warning"
			? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
			: "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400",
		className,
	)}
>
	{@render children()}
</p>

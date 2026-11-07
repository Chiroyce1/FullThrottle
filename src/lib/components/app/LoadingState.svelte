<script lang="ts">
	import { cn } from "$lib/utils";

	let { label = "Loading…", class: className = "" }: { label?: string; class?: string } =
		$props();
</script>

<div class={cn("flex flex-1 flex-col items-center justify-center gap-3 py-24", className)} role="status">
	<span
		class="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-primary"
		aria-hidden="true"
	></span>
	<p class="text-sm text-muted-foreground">{label}</p>
</div>

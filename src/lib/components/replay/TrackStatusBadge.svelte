<script lang="ts">
	// F1 track status codes: 1 clear, 2 yellow, 4 safety car, 5 red flag,
	// 6 VSC deployed, 7 VSC ending.
	let { status = 1 }: { status: number | string } = $props();

	const info = $derived.by(() => {
		const code = typeof status === "string" ? parseInt(status, 10) : status;
		switch (code) {
			case 2:
				return { label: "Yellow flag", tone: "bg-yellow-400 text-black" };
			case 4:
				return { label: "Safety car", tone: "bg-orange-500 text-black" };
			case 5:
				return { label: "Red flag", tone: "bg-red-600 text-white" };
			case 6:
			case 7:
				return { label: "Virtual safety car", tone: "bg-yellow-400 text-black" };
			default:
				return null;
		}
	});
</script>

{#if info}
	<span
		class="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold {info.tone}"
		role="status"
	>
		<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
		{info.label}
	</span>
{:else}
	<span
		class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground"
		role="status"
	>
		<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
		Track clear
	</span>
{/if}

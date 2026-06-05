<script lang="ts">
	const { status = 1 } = $props<{
		status: number | string;
	}>();

	// F1 Track Status Map
	// 1: Green
	// 2: Yellow (Local/Double)
	// 4: Safety Car
	// 5: Red Flag
	// 6: VSC (Virtual Safety Car)
	// 7: VSC Ending

	const statusMap = $derived.by(() => {
		const code = typeof status === 'string' ? parseInt(status, 10) : status;
		switch (code) {
			case 2:
				return { label: 'YELLOW FLAG', color: 'bg-yellow-400 text-black', icon: 'bg-black' };
			case 4:
				return { label: 'SAFETY CAR', color: 'bg-orange-500 text-black', icon: 'bg-black' };
			case 5:
				return { label: 'RED FLAG', color: 'bg-red-600 text-white', icon: 'bg-white' };
			case 6:
			case 7:
				return { label: 'VIRTUAL SC', color: 'bg-yellow-400 text-black', icon: 'bg-black' };
			case 1:
			default:
				return { label: 'TRACK CLEAR', color: 'bg-green-600 text-white', icon: 'bg-black' };
		}
	});
</script>

<div class="flex shrink-0 flex-col items-center justify-center">
	<div
		class="rounded-sm px-2 py-1 {statusMap.color} flex items-center gap-2 font-mono text-sm font-black tracking-widest uppercase md:text-base"
	>
		{#if status !== 1 && status !== '1'}
			<div class="animate-pulse">
				{statusMap.label}
			</div>
		{:else}
			<div>
				{statusMap.label}
			</div>
		{/if}
	</div>
</div>

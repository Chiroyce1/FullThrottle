import type { TelemetryRow } from "$lib/types";

export function downsampleTraces(
	grouped: Record<string, TelemetryRow[]>,
	hz: number,
): {
	grouped: Record<string, TelemetryRow[]>;
	totalRows: number;
} {
	const step = hz === 2 ? 4 : hz === 4 ? 2 : 1;
	const driverIds = Object.keys(grouped);
	let totalRows = 0;

	if (step <= 1) {
		for (const did of driverIds) {
			totalRows += grouped[did].length;
		}
		return { grouped, totalRows };
	}

	for (const did of driverIds) {
		const trace = grouped[did];
		if (trace.length === 0) continue;
		if (trace.length <= step) {
			totalRows += trace.length;
			continue;
		}

		const out: TelemetryRow[] = [];
		let prevLap = trace[0].lap_number ?? 0;
		out.push(trace[0]);

		for (let j = 1; j < trace.length; j++) {
			const row = trace[j];
			const lap = row.lap_number ?? 0;

			if (lap !== prevLap) {
				if (out[out.length - 1] !== trace[j - 1]) {
					out.push(trace[j - 1]);
				}
				out.push(row);
				prevLap = lap;
				continue;
			}

			if (j % step === 0) {
				out.push(row);
			}
		}

		if (out[out.length - 1] !== trace[trace.length - 1]) {
			out.push(trace[trace.length - 1]);
		}

		grouped[did] = out;
		totalRows += out.length;
	}

	return { grouped, totalRows };
}

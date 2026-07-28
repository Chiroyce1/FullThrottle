export interface TelemetryIssue {
	year: string | number;
	round: string | number;
	session: string; // r/q/fp1/etc session key

	name?: string;
	message?: string;
}

// If telemetry issues become more common this list will grow
export const telemetryIssues: TelemetryIssue[] = [
	{
		year: "2026",
		round: "11",
		session: "r",
		name: "Hungarian GP 2026",
		message:
			"Telemetry data is known to have issues for the Hungarian GP 2026.",
	},
];

export function getTelemetryIssue(
	year?: string | number,
	round?: string | number,
	session?: string,
): TelemetryIssue | undefined {
	if (!year || !round || !session) return undefined;

	const y = String(year);
	const r = String(round);
	const s = String(session).toLowerCase();

	return telemetryIssues.find((issue) => {
		const matchYear = String(issue.year) === y;
		const matchRound = String(issue.round) === r;
		const matchSession =
			issue.session === "*" || String(issue.session).toLowerCase() === s;
		return matchYear && matchRound && matchSession;
	});
}

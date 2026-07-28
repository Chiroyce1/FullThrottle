import { dev, building } from "$app/environment";

// change this to false to load telemetry data from local filesystem
// todo: move data to cloudflare r2
const production = true;

export function generateParquetUrl(year: string, filename: string): string {
	if (production) {
		return `https://huggingface.co/datasets/fullthrottlef1/fullthrottle/resolve/main/${year}/${filename}.parquet?download=true`;
	} else {
		return `/data/${year}/${filename}.parquet`;
	}
}

export function generateJsonUrl(year: string, filename: string): string {
	if (production) {
		return `https://huggingface.co/datasets/fullthrottlef1/fullthrottle/resolve/main/${year}/${filename}.json?download=true`;
	} else {
		return `/data/${year}/${filename}.json`;
	}
}

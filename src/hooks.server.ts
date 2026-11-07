import type { Handle } from "@sveltejs/kit";

// https://posthog.com/docs/advanced/proxy/proxy-reference
const PROXY_PATH = "/r";

const ASSET_HOST = "eu-assets.i.posthog.com";
const API_HOST = "eu.i.posthog.com";

async function proxy(request: Request, url: URL, clientIp: string): Promise<Response> {
	const path = url.pathname.slice(PROXY_PATH.length) || "/";
	const host = path.startsWith("/static/") || path.startsWith("/array/") ? ASSET_HOST : API_HOST;

	const headers = new Headers(request.headers);
	headers.set("host", host);
	headers.set("x-forwarded-for", clientIp);
	headers.delete("cookie");
	headers.delete("accept-encoding");
	if (!/^Bearer ph[csx]_/.test(headers.get("authorization") ?? "")) headers.delete("authorization");

	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	const upstream = await fetch(`https://${host}${path}${url.search}`, {
		method: request.method,
		headers,
		body: hasBody ? await request.arrayBuffer() : undefined,
	});
	// fetch hands back a decoded body, so its encoding headers no longer apply.
	const responseHeaders = new Headers(upstream.headers);
	responseHeaders.delete("content-encoding");
	responseHeaders.delete("content-length");
	return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (pathname === PROXY_PATH || pathname.startsWith(`${PROXY_PATH}/`)) {
		const ip = event.request.headers.get("cf-connecting-ip") ?? event.getClientAddress();
		return proxy(event.request, event.url, ip);
	}
	return resolve(event);
};

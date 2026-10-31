// Relays read-only FPL Draft API calls for the browser, which can't call the
// API directly (it sends no CORS headers). Only the paths the app needs are
// forwarded, so this can't be used as an open proxy. Used by the Netlify
// Function in production and by the Vite dev/preview server locally.

export const UPSTREAM = "https://draft.premierleague.com/api/";
export const PREFIX = "/api/fpl/";
const USER_AGENT = "outdraft-relay/1 (+https://github.com/fmaggipinto/outdraft)";
const CACHE_SECONDS = 60;

const ALLOWED = [
  /^game$/,
  /^league\/\d{1,9}\/details$/,
  /^league\/\d{1,9}\/element-status$/,
  /^draft\/league\/\d{1,9}\/transactions$/,
  /^draft\/league\/\d{1,9}\/trades$/,
  /^entry\/\d{1,9}\/public$/,
  /^entry\/\d{1,9}\/history$/,
  /^entry\/\d{1,9}\/event\/\d{1,2}$/,
];

export function allowedPath(pathname: string): string | null {
  if (!pathname.startsWith(PREFIX)) return null;
  const path = pathname.slice(PREFIX.length).replace(/\/$/, "");
  return ALLOWED.some((re) => re.test(path)) ? path : null;
}

const json = (status: number, body: string, cache: boolean) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache ? `public, max-age=${CACHE_SECONDS}` : "no-store",
      ...(cache && { "Netlify-CDN-Cache-Control": `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=300` }),
    },
  });

export async function relay(req: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method !== "GET") return json(405, '{"error":"method not allowed"}', false);
  const path = allowedPath(new URL(req.url).pathname);
  if (!path) return json(404, '{"error":"not relayed"}', false);

  let upstream: Response;
  try {
    upstream = await fetchImpl(UPSTREAM + path, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  } catch {
    return json(502, '{"error":"FPL Draft is unreachable"}', false);
  }
  if (upstream.status === 404) return json(404, '{"error":"not found"}', true);
  if (!upstream.ok) return json(502, `{"error":"FPL Draft answered ${upstream.status}"}`, false);
  return json(200, await upstream.text(), true);
}

// Serves the Model job's deadlines.ics at /deadlines.ics with a calendar
// content type. GitHub serves raw files as text/plain, which some calendar
// apps won't subscribe to.

export const SOURCE = "https://raw.githubusercontent.com/fmaggipinto/outdraft/main/data/deadlines.ics";
export const FEED_PATH = "/deadlines.ics";

export async function calendarFeed(fetchImpl: typeof fetch = fetch): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetchImpl(SOURCE);
  } catch {
    return new Response("Calendar temporarily unavailable", { status: 502 });
  }
  const body = upstream.ok ? await upstream.text() : "";
  if (!body.startsWith("BEGIN:VCALENDAR")) return new Response("Calendar temporarily unavailable", { status: 502 });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="fpl-draft-deadlines.ics"',
      "Cache-Control": "public, max-age=3600",
      "Netlify-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

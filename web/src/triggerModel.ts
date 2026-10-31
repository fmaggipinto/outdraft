// Backup for GitHub's own schedule, which can delay or skip runs: a Netlify
// scheduled function asks GitHub to start the "Model job" workflow. The job
// only commits when something changed, so extra runs are harmless.

export const DISPATCH_URL =
  "https://api.github.com/repos/fmaggipinto/outdraft/actions/workflows/model.yml/dispatches";

/** The hourly run (:07) always does the full job; the runs in between only
 * do work when a Gameweek deadline is near, as with GitHub's schedule. */
export const onlyNearDeadline = (now: Date) => now.getUTCMinutes() >= 15;

export async function triggerModel(token: string | undefined, now: Date, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (!token) {
    console.error("GITHUB_DISPATCH_TOKEN is not set; can't start the Model job.");
    return new Response("missing token", { status: 500 });
  }
  const res = await fetchImpl(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "outdraft-netlify-trigger",
    },
    body: JSON.stringify({ ref: "main", inputs: { only_near_deadline: onlyNearDeadline(now) } }),
  });
  if (res.status !== 204) {
    console.error(`Starting the Model job failed: GitHub answered ${res.status} ${await res.text()}`);
    return new Response("dispatch failed", { status: 502 });
  }
  return new Response(null, { status: 204 });
}

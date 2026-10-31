import type { ElementStatus, LeagueDetails, Projections } from "./types";

// Published Model files are read straight from the repo (docs/data-format.md).
export const DATA_URL =
  import.meta.env.VITE_DATA_URL ?? "https://raw.githubusercontent.com/fmaggipinto/outdraft/main/data/";

export class NotFoundError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("network");
  }
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchProjections = () => getJson<Projections>(DATA_URL + "projections.json");

export const fetchLeague = (id: number) =>
  Promise.all([
    getJson<LeagueDetails>(`/api/fpl/league/${id}/details`),
    getJson<ElementStatus>(`/api/fpl/league/${id}/element-status`),
  ]);

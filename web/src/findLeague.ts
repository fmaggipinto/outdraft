import type { LeagueDetails } from "./types";

export interface EntryPublic {
  entry: { id: number; name: string; league_set: number[] };
}

export interface FoundLeague {
  id: number;
  name: string;
}

/** The Leagues a Draft team (entry) plays in, with their names. A League whose
 * details can't be loaded still appears, under its ID. */
export async function findLeagues(
  entryId: number,
  get: { entry: (id: number) => Promise<EntryPublic>; details: (id: number) => Promise<LeagueDetails> },
): Promise<{ teamName: string; leagues: FoundLeague[] }> {
  const { entry } = await get.entry(entryId);
  const leagues = await Promise.all(
    (entry.league_set ?? []).map(async (id) => {
      try {
        return { id, name: (await get.details(id)).league.name };
      } catch {
        return { id, name: `League ${id}` };
      }
    }),
  );
  return { teamName: entry.name, leagues };
}

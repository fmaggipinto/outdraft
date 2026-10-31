// Record League responses from the FPL Draft API as test data, with every
// Manager and League name replaced, since these are real people's Leagues.
//
//   node scripts/record-league.mjs <leagueId> <name> [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [leagueId, name, out = "tests/fixtures"] = process.argv.slice(2);
if (!leagueId || !name) {
  console.error("usage: record-league.mjs <leagueId> <name> [outDir]");
  process.exit(1);
}
const BASE = "https://draft.premierleague.com/api/";
const get = async (path) => {
  const res = await fetch(BASE + path, { headers: { "User-Agent": "outdraft-recorder/1" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
};

const details = await get(`league/${leagueId}/details`);
const status = await get(`league/${leagueId}/element-status`);

details.league.name = `Test ${name} League`;
details.league_entries.forEach((e, i) => {
  const letter = String.fromCharCode(65 + i);
  e.entry_name = `Team ${letter}`;
  e.player_first_name = "Manager";
  e.player_last_name = letter;
  e.short_name = `M${letter}`;
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name.toLowerCase()}-details.json`), JSON.stringify(details));
writeFileSync(join(out, `${name.toLowerCase()}-element-status.json`), JSON.stringify(status));
console.log(`Recorded League ${leagueId} as "${name}" (${details.league_entries.length} Managers)`);

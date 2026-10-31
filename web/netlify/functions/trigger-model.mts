import type { Config } from "@netlify/functions";
import { triggerModel } from "../../src/triggerModel";

// Runs on the published site only (not in deploy previews).
export default () => triggerModel(process.env.GITHUB_DISPATCH_TOKEN, new Date());

export const config: Config = { schedule: "7,22,37,52 * * * *" };

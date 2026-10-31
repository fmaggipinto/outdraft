import type { Config } from "@netlify/functions";
import { relay } from "../../src/relay";

export default (req: Request) => relay(req);

export const config: Config = { path: "/api/fpl/*" };

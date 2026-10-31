import type { Config } from "@netlify/functions";
import { calendarFeed, FEED_PATH } from "../../src/calendarFeed";

export default () => calendarFeed();

export const config: Config = { path: FEED_PATH };

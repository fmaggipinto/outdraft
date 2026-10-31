import { calendarFeed } from "../../src/calendarFeed";

// Served at /deadlines.ics by a rewrite in netlify.toml. A `path` in the
// function config doesn't win over the site's catch-all rule for a URL that
// looks like a file, so the route lives there instead.
export default () => calendarFeed();

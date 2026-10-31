# No backend and no stored user data

Outdraft is a static PWA (React + Vite on Netlify). The Model runs in Python as a scheduled GitHub Actions job that publishes Projections and Snapshots as JSON files in the repo; a small Netlify Function only relays and briefly caches FPL Draft API responses, because browsers cannot call that API directly. All League analysis (Squad strength, Matchups, Rival interest, Win-win trades) runs in the browser, and the Claimed Manager is remembered only in the Viewer's browser. We chose this to keep running costs near zero and avoid storing personal data (no accounts, no GDPR-heavy obligations).

## Consequences

- Features that need stored user data are deliberately out of scope until there is demand: push notifications were rejected in favour of a calendar subscription for deadlines, and cross-season history or accounts would require introducing a database (Supabase was the expected candidate).
- The Model stays in Python and is not ported to JavaScript; the browser only consumes its published output.

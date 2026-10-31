# Outdraft

A web app for [FPL Draft](https://draft.premierleague.com) that analyses the competition inside a League, alongside each Manager's own squad decisions: Squad strength, Head-to-head Win probability, Waiver targets with Rival interest, and Win-win trades.

Outdraft is a static PWA with no accounts and no stored user data. A scheduled Python job publishes Projections and frozen Snapshots as JSON; all League analysis runs in the browser.

## Docs

- [docs/CONTEXT.md](docs/CONTEXT.md): the domain glossary. Use these terms in code, issues and UI.
- [docs/adr/](docs/adr/): architecture decisions.
- [docs/fpl_draft.py](docs/fpl_draft.py): the original single-file Python model the app is built from.
- [docs/data-format.md](docs/data-format.md): the JSON files the Model job publishes to `data/`.

## Model job

`model/` holds the Model as a dependency-free Python package. The "Model job" GitHub Actions workflow runs it on a schedule and commits Projections and Snapshots to `data/`.

```bash
cd model
python -m outdraft_model --out ../data      # one run against the live FPL Draft API
pip install pytest && python -m pytest      # tests, on recorded API responses
```

## Web app

`web/` is the React + Vite app. It's deployed on Netlify (see `netlify.toml`), with a Netlify Function relaying the FPL Draft API. In development, Vite serves the same relay.

```bash
cd web
npm install
npm run dev        # http://localhost:5173, live FPL Draft data
npm test           # unit tests: League analysis and relay
npm run e2e        # Playwright smoke test on recorded data
```

## Status

Early planning. See the issues for the roadmap.

## Licence

[MIT](LICENSE). Not affiliated with the Premier League or Fantasy Premier League.

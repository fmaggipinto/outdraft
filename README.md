# Outdraft

A web app for [FPL Draft](https://draft.premierleague.com) that analyses the competition inside a League, alongside each Manager's own squad decisions: Squad strength, Head-to-head Win probability, Waiver targets with Rival interest, and Win-win trades.

Outdraft is a static PWA with no accounts and no stored user data. A scheduled Python job publishes Projections and frozen Snapshots as JSON; all League analysis runs in the browser.

## Docs

- [docs/CONTEXT.md](docs/CONTEXT.md): the domain glossary. Use these terms in code, issues and UI.
- [docs/adr/](docs/adr/): architecture decisions.
- [docs/fpl_draft.py](docs/fpl_draft.py): the original single-file Python model the app is built from.

## Status

Early planning. See the issues for the roadmap.

## Licence

[MIT](LICENSE). Not affiliated with the Premier League or Fantasy Premier League.

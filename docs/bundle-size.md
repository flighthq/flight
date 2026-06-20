# Bundle Size

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. `npm run size` builds matching examples and reports gzip output size against the committed baseline — it is the preferred size command for agents. Run it after changes to examples, package exports, barrels, renderer registration, dependencies, or anything that may affect tree-shaking.

## Command surface

- `npm run size` — report all examples.
- `npm run size piratepig` — filter by example name.
- `npm run size render=canvas` — filter by renderer. Filters combine: `npm run size piratepig render=webgl`.
- `npm run size piratepig report=json` — machine-readable JSON, for easier agent parsing.
- `npm run size piratepig output=size-report.json` — write a JSON report file; prints `SIZE_REPORT_PATH:<path>`.
- `npm run size:baseline` — rewrite the size baseline after an intentional, measured change.

## The discipline these numbers protect

- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger — unless the size tradeoff is intentional and measured.
- In examples, prefer small package imports when the example intentionally demonstrates low-level or tree-shaken usage. Use `@flighthq/sdk` only for examples meant to demonstrate application-level convenience.

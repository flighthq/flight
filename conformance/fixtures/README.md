# Fixture import conformance

This lane runs real, locally acquired `flight-oracles` files through Flight's public import methods. It is execution evidence, not a correctness oracle: fixture results produce a score and never determine the process exit code. Missing, stale, or locally changed corpora and invalid CLI configuration remain hard harness errors.

Acquire fixtures explicitly, then score them:

```sh
npm run fixtures -- --all
npm run conformance:fixtures
```

The generated, gitignored report separates three fractions:

- selection coverage — selected candidate runs over every matching run before `--limit`;
- implementation coverage — candidates that reached an available Flight implementation over selected candidates;
- accepted-import evidence — diagnostic-clean imports over candidates that reached an implementation.

Accepted import does not establish semantic correctness. The report says so directly and retains diagnostic kinds and populations without retaining fixture-derived messages or content.

## Wiring a fixture family

Every declared source family has one entry in `createImportFixtureAdapters`. Families without a Flight importer use an `unavailableAdapter` or `unavailablePackAdapter` entry, so their fixtures already become scored `not-run` cases. To wire support:

1. Import the public Flight method in `import-fixture-adapters.ts`.
2. Add a small `run*` function that reads the source, invokes that method, and returns structured diagnostics plus whether an import was produced.
3. Replace only that family's unavailable entry with `adapter` or `packAdapter`, passing the runner.
4. Add its routing and companion-file behavior to `import-fixture-adapters.test.ts`.

Discovery, current-tree verification, concurrency, limiting, outcome capture, scoring, and report serialization do not change when a family gains an implementation.

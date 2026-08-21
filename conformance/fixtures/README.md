# Fixture import conformance

This lane runs every selected, locally acquired `flight-fixtures` file through Flight's public import methods. One file rejecting or throwing never stops later files: outcomes produce a positive coverage score and never determine the process exit code. Missing or stale corpora, fixture-file population changes, and invalid CLI configuration remain hard harness errors.

Acquire fixtures explicitly, then score them:

```sh
npm run fixtures -- --all
npm run conformance:fixtures
```

The generated, gitignored report leads with three questions:

- files — over the complete selected corpus, how many matched, how many were attempted, how many completed without a throw/not-run, and how many imported without a diagnostic finding; unmatched files remain in every headline denominator;
- features tested — how many adapter-declared feature expectations produced at least one passed or failed outcome;
- working as expected — declared features whose every measured fixture outcome passed, over all tested features.

Selection, implementation, execution, accepted-import, and diagnostic populations remain supporting evidence. Accepted import does not establish semantic correctness and therefore never creates a feature outcome. A format adapter must explicitly declare a feature and emit `passed`, `failed`, or `not-run` evidence from its own probe/oracle. Until that is wired, the honest feature score is not measured rather than inferred from parser silence.

Diagnostic outcome precedence and every reviewed exact kind are recorded in [`diagnostic-kind-dispositions.md`](diagnostic-kind-dispositions.md). Only its ten explicitly approved choice kinds can produce an otherwise-clean `intentional-choice` outcome; a reviewed choice remains an orthogonal facet when a stronger primary finding is present. Unknown input-derived Skeleton2D kinds and every other `Skip` remain ordinary unsupported findings. `acceptedImport` counts only diagnostic-clean `imported` results.

## Wiring a fixture family

Every declared source family has one entry in `createImportFixtureAdapters`. Families without a Flight importer use an `unavailableAdapter` or `unavailablePackAdapter` entry, so their fixtures already become scored `not-run` cases. To wire support:

1. Import the public Flight method in `import-fixture-adapters.ts`.
2. Add a small `run*` function that reads the source, invokes that method, and returns structured diagnostics plus whether an import was produced.
3. Declare stable feature ids and labels on the adapter for properties its probe/oracle can actually decide.
4. Return one feature outcome per applicable declared feature: `passed`, `failed`, or `not-run` with a stable reason.
5. Replace only that family's unavailable entry with `adapter` or `packAdapter`, passing the runner and feature declarations.
6. Add its routing, companion-file behavior, and feature-outcome behavior to `import-fixture-adapters.test.ts`.

Discovery, current-tree verification, exhaustive continuation, concurrency, limiting, outcome capture, scoring, and report serialization do not change when a family gains an implementation or a feature oracle.

# Compiled Package Headers

`@flighthq/types` is the first and only compiled-header pilot. Its public and contract entry points
resolve to flat generated files in `packages/types/dist`, so TypeScript, Vitest, and Vite do not walk
roughly eight hundred `export *` edges whenever they resolve the shared type package.

## Commands

- `npm run headers` incrementally builds `packages/types` with TypeScript, then replaces the emitted
  `index` and `contract` entry points with flat `.d.ts` and `.js` files. The generated `dist` remains
  ignored; source files are still the authority.
- `npm run headers:check` incrementally builds the package, regenerates the four entry artifacts in
  memory, and fails when the files on disk are absent or stale. CI runs it after build preflight.
- `npm run headers:watch` performs an initial build and keeps the entry artifacts current while
  `packages/types/src` changes.

Root `build`, `check`, `test`, and `size` prepare the header before invoking tools that resolve the
package alias. The `@flighthq/types` package build also owns header generation, so `prepack` publishes
the same flat entry points. The aliases intentionally expose only `@flighthq/types` and
`@flighthq/types/contract`; the old source wildcard is not part of the package contract.

## Tradeoffs and rollout

The declaration bundle composes TypeScript's declaration maps back to the original
`packages/types/src` files. A basic language-service definition request lands in the flat generated
header; editors that follow declaration maps or expose “Go to Source Definition” can continue into the
source. This is a navigation tradeoff, not a claim that every editor command bypasses `dist`. The
JavaScript bundle has no imports or re-exports and the package remains `sideEffects: false`; size gates
must confirm that downstream bundlers retain the same tree shaking.

There is one quiet, compatible stale-output risk: a raw tool invocation that bypasses the root scripts
can consume an older ignored header after a source-only edit. It does not change the published API,
but editor or test results can lag until `npm run headers` runs. Use `headers:watch` during sustained
types work, and use `headers:check` in automation. Do not expand the pilot until repeated measurements
show worthwhile module-graph or descriptor savings for another package; migrate high-fanout core
packages first and leave `@flighthq/sdk` last (or source-based) because its aggregation is deliberate.

Named source barrels are not a substitute for compiled headers: they still retain one outgoing module
edge per declaration file. Keep the existing generated `export *` source contracts; do not require
hand-maintained named re-exports as a governance rule.

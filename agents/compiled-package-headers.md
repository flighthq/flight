# Compiled Package Headers

`@flighthq/types` is the first and only compiled-header pilot. Its contract entry point resolves to a
flat generated artifact in `packages/types/dist`; the public entry is a curated named-re-export view
with one edge to that contract. TypeScript, Vitest, and Vite therefore terminate the package walk
within two files instead of traversing roughly eight hundred source modules.

The contract is deliberately the one declaration and runtime definition site. Two independent flat
entries are incorrect: TypeScript gives duplicated `unique symbol` declarations distinct nominal
identities, JavaScript evaluates duplicated `Symbol()` initializers to different values, and package
barrels report ambiguous exports for the otherwise same names. The durable invariants are:

1. Each public or contract lane resolves within two files.
2. Every type/brand has one declaration site and every runtime symbol has one definition site across
   both lanes.
3. The public lane remains a strict curated subset of the contract surface, with unchanged tree
   shaking.

## Commands

- `npm run headers` incrementally builds `packages/types` with TypeScript, then replaces the emitted
  contract with flat `.d.ts` and `.js` files and the public entry with one-edge named views. A build-info
  signature skips bundling when all eight artifacts are current. Generated `dist` remains ignored;
  source files are still the authority.
- `npm run headers:check` incrementally builds the package, regenerates the eight entry artifacts in
  memory, and fails when the files on disk are absent or stale. CI runs it after build preflight.
- `npm run headers:watch` performs an initial build and keeps the entry artifacts current while
  `packages/types/src` changes.

Root `build`, `check`, `test`, and `size` prepare the header before invoking tools that resolve the
package alias. The `@flighthq/types` package build also owns header generation, so `prepack` publishes
the same flat entry points. The aliases intentionally expose only `@flighthq/types` and
`@flighthq/types/contract`; the old source wildcard is not part of the package contract.

## Tradeoffs and rollout

The canonical declaration bundle composes TypeScript's declaration maps back to the original
`packages/types/src` files. A basic language-service definition request lands in the flat generated
contract header (possibly through the public re-export); editors that follow declaration maps or expose
“Go to Source Definition” can continue into the source. This is a navigation tradeoff, not a claim that
every editor command bypasses `dist`. The canonical JavaScript bundle has no imports or re-exports,
the public JavaScript view has one named-re-export edge, and the package remains `sideEffects: false`;
size gates must confirm that downstream bundlers retain the same tree shaking.

There is one quiet, compatible stale-output risk: a raw tool invocation that bypasses the root scripts
can consume an older ignored header after a source-only edit. It does not change the published API,
but editor or test results can lag until `npm run headers` runs. Use `headers:watch` during sustained
types work, and use `headers:check` in automation. Do not expand the pilot until repeated measurements
show worthwhile module-graph or descriptor savings for another package; migrate high-fanout core
packages first and leave `@flighthq/sdk` last (or source-based) because its aggregation is deliberate.

The first follow-up measurement cohort, ranked by repository references multiplied by distinct local
entry edges, is: `geometry`, `render-gl`, `node`, `render-wgpu`, `render`, `materials`, `mesh`, `camera`,
`scene3d`, `effects`, `texture`, `path`, `bitmap`, `scene2d-canvas`, and `entity`. This is a candidate
list, not an automatic rollout: each package must independently demonstrate descriptor or wall-clock
leverage and pass the same identity, lane, navigation, and size gates. Leave `sdk` last or permanently
source-based: its aggregation is deliberate and it currently has no local entry walk to flatten.

Named-barrel governance recommendation: **no**. Named source barrels are not a performance substitute
for compiled headers because they retain one outgoing module edge per declaration file. Keep generated
source contracts as the API authority; require a generated named view only where it expresses the
public subset of one canonical compiled contract, as in this pilot.

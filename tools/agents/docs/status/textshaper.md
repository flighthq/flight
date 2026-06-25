# @flighthq/textshaper — status

## 2026-06-25 — builder R2-4 second-pass recovery

A parallel pass recovered the ~94 lost types into `@flighthq/types`, so `TextItem`, `TextShaperOptions`, and `TextShaperSignals` now exist as files in `packages/types/src/`. Both modules the first pass parked for "needs type X" are therefore recoverable, and were recovered this pass by the same merge of `dist/<m>.js` + `dist/<m>.d.ts` + `dist/<m>.test.js`.

### Recovered

- **textShaperItemize** — `itemizeText`, `shapeTextRuns`. Built-in Unicode-property fallback itemization (Latin/RTL detection, major-script splits) plus a convenience entry point that itemizes then shapes each sub-run via `shapeTextRun`. Local helpers `getCodePointBidiClass` and `getCodePointScript` placed at the bottom after the exported functions per source style. Types (`TextItem`, `ShapedRun`, `TextFormat`, `TextShaperOptions`) all resolve against the current header. The `runOptions` spread into `shapeTextRun` is structurally a `ShapeRunOptions`. Added to `index.ts`.
- **textShaperSignals** — `disposeTextShaperSignals`, `enableTextShaperSignals`, `getTextShaperSignals`. The opt-in signal group emitting `onBackendChanged` after every `setTextShaperBackend` call, wired through the existing `_textShaperHooks` seam (no circular import). The public `TextShaperSignals` type exposes only `onBackendChanged`; the internal listener list lives on a package-private `TextShaperSignalsImpl extends TextShaperSignals` (with `_listeners`), and `_signals`/the module-level state sits at the bottom of the file. Added to `index.ts`.

### Skipped fossils

- None. Both remaining recovery candidates were genuine lost source, not dropped concepts.

### Parked

- None. Every module proven by `dist/` now exists in `src/`.

### Tests

`npm run test --workspace=packages/textshaper`: 8 files, 102 tests, all passing.

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging `dist/<m>.js` (implementation + verbatim comments) with `dist/<m>.d.ts` (types) and `dist/<m>.test.js` (tests), the validated camera pattern. The integration curation had pruned `src/` down to `_textShaperHooks`, `index`, `textShaper`, and `textShaperRun`, while `dist/` proved five additional modules had existed and compiled.

### Recovered

- **textShaperCache** — `clearTextShaperCache`, `createTextShaperCache`, `disposeTextShaperCache`, `shapeTextRunCached` (+ local `TextShaperCache` interface, declared in-module per its `.d.ts`). Caches `ShapedRun`s keyed on text + shaping-relevant `TextFormat` fields + options. **Adaptation:** the `dist` `.d.ts` typed `options` as `TextShaperOptions` (a richer type that no longer exists in `@flighthq/types`), and `_makeCacheKey` referenced its `language`/`features`/`variations` fields. The current `shapeTextRun` takes `ShapeRunOptions` (`direction`/`script` only), so the recovered module uses `ShapeRunOptions` and the key encodes only `direction`/`script`. This matches the reconstructed test (which only exercises `direction`) and keeps the module valid against the current header. Added to `index.ts`.
- **textShaperCluster** — `getCaretPositionsForRun`, `getClusterForIndex`, `getIndexRangeForCluster`. Caret/cluster geometry over a `ShapedRun`. Dead `return found ? null : null;` collapsed to `return null;` (mechanically identical). Added to `index.ts`.
- **textShaperPool** — `acquireShapedRun`, `releaseShapedRun` (bounded `ShapedRun` pool, max 64). Module-level pool/const moved to the bottom per source style. Added to `index.ts`.

### Parked

- **textShaperItemize** (`itemizeText`, `shapeTextRuns`) — needs types `TextItem` and `TextShaperOptions` in `@flighthq/types`. Neither filename exists in `packages/types/src/`. `itemizeText` returns `readonly TextItem[]` and both functions type `options` as `TextShaperOptions`. The HARD BOUNDARY forbids editing `@flighthq/types`, so the module cannot be typed against the current header. Implementation is intact in `dist/textShaperItemize.js` for a future pass that introduces those types.
- **textShaperSignals** (`disposeTextShaperSignals`, `enableTextShaperSignals`, `getTextShaperSignals`) — needs type `TextShaperSignals` in `@flighthq/types` (no such filename). Implementation intact in `dist/textShaperSignals.js`; wires into the existing `_textShaperHooks` seam, so it can be recovered once the type is added.

### Fossils skipped

- None. No recovery candidate implemented a deliberately-dropped/deprecated concept.

### Tests

`npm run test --workspace=packages/textshaper`: 6 files, 80 tests, all passing.

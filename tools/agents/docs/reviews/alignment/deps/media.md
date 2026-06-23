# Dependency Alignment: @flighthq/media

**Verdict:** Clean — three declared deps (`@flighthq/resources`, `@flighthq/signals`, `@flighthq/types`), all used, all pinned `"*"`, no phantom or unused edges, no `@flighthq/sdk` import, and every cross-package type lives in `@flighthq/types`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | — | `npm run packages:check` passes (86 packages valid). All three dependencies are imported and resolvable; no boundary violations; `"sideEffects": false` is correct (no module-top-level side effects, signals are created lazily inside `play*Resource`). | — |
| Info | `@flighthq/signals` | Value import (`createSignal`, `emitSignal`) carries runtime weight. This is correct and unavoidable per the SDK convention: the package owns the `onComplete` signal and must construct/emit it; the `Signal<>` type itself is correctly sourced from `@flighthq/types`. Tree-shakable; no concern. | None — documented pattern. |
| Info | `@flighthq/resources` | Used only by `audioChannel.ts` for `getAudioContext()` (the shared `AudioContext` accessor). `videoChannel.ts` needs nothing from it. Edge is predictable from the package's role (audio playback over decoded `AudioResource.buffer`); the dependency reads cleanly. | None. |

## Declared vs used

- **Unused declared:** none. `@flighthq/resources` (getAudioContext), `@flighthq/signals` (createSignal/emitSignal), and `@flighthq/types` (AudioChannel, AudioPlayOptions, AudioResource, VideoChannel, VideoPlayOptions, VideoResource — all `import type`) are each imported in `src/`.
- **Phantom (used but undeclared):** none. The only `@flighthq/*` specifiers in `src/` (incl. tests) are the three declared deps; test files import only `@flighthq/resources`. No other workspace or external runtime import.
- **Pinning:** all three workspace deps pinned `"*"` per convention; `typescript` is the sole devDependency.
- **Inline types:** the only inline interfaces (`AudioChannelRuntime`, `VideoChannelRuntime`) are package-private runtime/state types and are correctly NOT in `@flighthq/types` (entity/runtime split — runtime state stays package-local). No cross-package type is redefined.

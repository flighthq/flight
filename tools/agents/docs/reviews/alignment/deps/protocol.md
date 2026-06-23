# Dependency Alignment: @flighthq/protocol

**Verdict:** Clean — deps are minimal, correct, and predictable from the package's role; no issues found beyond `npm run packages:check` (which passes).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals` | Runtime use (`createSignal`, `emitSignal`) for the `ProtocolHandler` event entity; declared and pinned `*`. Expected for an event-style platform capability. | — |
| None | `@flighthq/types` | Cross-package types (`ProtocolBackend`, `ProtocolHandler`) imported via `import type` from `packages/types/src/Protocol.ts`; not redefined inline. Declared and pinned `*`. | — |
| None | `@flighthq/sdk` | Not imported. | — |
| None | `sideEffects` / tree-shaking | `"sideEffects": false`; no top-level registration or mutable shared state — backend is lazily created in `getProtocolBackend`, module vars (`_backend`, `_subscriptions`) sit at file bottom. | — |

Observations adding judgment beyond `packages:check`:

- The dependency mapping reads cleanly. As a command+event platform-suite capability (`register*`/`get*Backend`/`set*Backend`/`createWeb*Backend` plus an `onOpenURL`-style signal entity), the only two edges a reader would predict are exactly the two present: `@flighthq/types` for the backend/handler contracts and `@flighthq/signals` for the event entity. No surprising edges.
- Layering is respected: the package depends only on the header (`types`) and shared infra (`signals`); it reaches across no package boundary and up no layer.
- Type-only dep is correctly `import type` and pulls no runtime weight; runtime dep is value-imported only where it must be.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/signals` and `@flighthq/types` are both used in `src/protocol.ts`; `typescript` (devDep) is the build toolchain.
- **Phantom (used-but-undeclared) deps:** none. Every `@flighthq/*` import resolves to a declared dependency. Test-only import `connectSignal` is also from the already-declared `@flighthq/signals`.
- **Pinning:** both workspace deps pinned `"*"` per convention.

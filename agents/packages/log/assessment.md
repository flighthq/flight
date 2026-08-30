---
package: '@flighthq/log'
updated: 2026-07-31
basedOn: ./review.md
---

# log — Assessment

Verified against the live tree through the 2026-08-30 explicit-transport slice. The package compiles; the earlier missing-types conclusion was stale. File transport ownership is now explicit and assertion-backed.

## Recommended

_None open._ Re-verified against live source on 2026-07-31 (3 source files, 1 test file, 115 tests,
59 exports): all three items landed.

## Landed

1. ~~**Rebuild missing types in `@flighthq/types`.**~~ Landed. All seven exist — `LogContext`,
   `LogDataProvider`, `LogFormatter`, `LogSpan`, `LogTimer` and the current `LogTransport` contract in
   `packages/types/src/Log.ts`, with `LogSignals` in its own file. The original item asked for "one concept
   per file"; grouping the six related log types in one file is the sanctioned
   [types-layout](../../conventions/types-layout.md) grouping pattern, not a shortfall, so the item is
   satisfied rather than partially done.
2. ~~**Remove 3 structural divider comments.**~~ Landed; no `// ----` or `// ====` dividers remain in
   `packages/log/src`.
3. ~~**Package Map description update.**~~ Landed; the catalog entry now describes the leveled structured
   logging surface rather than a one-liner.
4. ~~**Replace the zero-provider ambient Log transport seam.**~~ Landed 2026-08-30. The orphan Host slot,
   `HasAppLogTransport`, ambient getter/setter/explain/operation surface, optional operations, and global
   transport slot are deleted. `createFileLogSink(transport, options)` pins an owned `LogTransport`
   Entity. Synchronous FIFO admission, awaited pre-call flush delivery, terminal idempotent destroy, two
   destination isolation, stale-handle isolation, and flush-failure cleanup are covered by focused tests
   and a structural capability gate. No Web or other Host provider replaces the deleted slot.

## Backlog

- **Decompose log.ts.** _Parked as a separate design slice._ Charter Decision #2 / Open direction #1.
- **Rust `flighthq-log` crate.** _Parked — global posture._

## Approved

- [2026-07-02 · picked] Sweep items 1–3: rebuild missing types, remove divider comments, Package Map description

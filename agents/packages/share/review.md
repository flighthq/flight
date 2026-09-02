---
package: '@flighthq/share'
status: solid
score: 90
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - host-capacitor
  - host-web
  - types surface
---

# share — Review

## Verdict

**Solid -- 90/100.** A thin, well-bounded invoker of the system share sheet through explicit Host
slots (`Host.share.content`, `Host.share.files`). Content is realized by Web and Capacitor providers;
portable data-URL files are Web-only. Capability absence is a missing slot (compile-time type error),
while `canShareContent` and `canShareFiles` validate payload completeness inside a present slot. All
exported types live in `@flighthq/types`. Core result signals and both provider implementations are
Entity-composed. The package declares `"sideEffects": false` and exposes the standard two export
lanes (`.` and `./contract`).

## Present capabilities

- **Content sharing** (`shareContent`, `shareText`, `shareUrl`): Delegates to `HasShareContent`
  provider after validating that at least one of title/text/URL is non-empty. Returns `boolean`
  sentinel for expected failure; never throws.
- **Detailed results** (`shareContentWithResult`): Returns `ShareResult` with `completed`,
  `activityType`, and `dismissed` fields. Emits the result to explicitly attached `ShareSignals`
  entities via the `onShareResult` signal.
- **File sharing** (`shareFiles`, `canShareFiles`): Converts a `ShareFile[]` to the non-empty-tuple
  `ShareFilesContent` type at runtime, rejecting empty arrays before dispatch. Operates through
  the `HasShareFiles` slot, which only Web claims.
- **Payload validation** (`hasShareContentFields`, `canShareContent`, `canShareFiles`): Rejects
  declared-but-empty strings (title/text/URL all empty or absent) before any provider call. The
  compile-time `ShareContent` union already requires at least one field, so runtime validation
  catches the empty-string edge.
- **Signal lifecycle** (`enableShareSignals`, `attachShareSignals`, `detachShareSignals`,
  `disposeShareSignals`): Opt-in signal group creation via `enableShareSignals`, explicit attach to
  a module-level `Set`, and teardown that detaches and clears listeners. Matches the platform
  integration suite's `create*` / `attach*` / `detach*` / `dispose*` signal convention.
- **Host isolation**: Two simultaneous Host values route through their own provider; the test suite
  (`shareExplicit.test.ts`) verifies independent routing.

## Gaps

- **No `shareFilesWithResult`** (charter open direction 2). `shareText` and `shareUrl` have boolean
  convenience results; files have the same via `shareFiles`. None of the three have a `*WithResult`
  twin -- only the full `shareContentWithResult` emits signals and returns `ShareResult`. Whether the
  boolean path is the golden one or every convenience entry point earns a detailed variant is an open
  design decision.
- **Capacitor has no files slot.** `ShareFilesContent` uses data-URL descriptors; Capacitor's native
  plugin accepts platform file URIs. No staging/cleanup bridge exists, so portable file sharing is
  Web-only. The charter names this as open direction 1 (payload construction helpers /
  `share-formats` neighbor).
- **Outcome fidelity asymmetry.** Web identifies `AbortError` as a dismissed share; Capacitor maps
  any rejected native command to `dismissed: true`, making cancellation indistinguishable from a
  platform error on that host.
- **Malformed `ShareFile` descriptor produces an opaque `false`.** A data URL without a comma throws
  inside the Web provider's `shareFileToDomFile`, caught by the backend's `try`/`catch` and resolved
  to the boolean `false` sentinel -- indistinguishable from user cancellation. No diagnostics seam
  or `explain*` query exists to surface the cause (assessment recommended item 2).
- **Duplicated validation logic.** `hasShareContentFields` (exported from share core) and
  `hasShareableContent` (private in host-web and host-capacitor) implement identical field-presence
  checks. The host backends cannot import from `@flighthq/share/contract` (host packages do not
  depend on core capability packages), so the duplication is structurally correct but the identical
  logic in three places is a maintenance surface. Moving the check into a types-level utility or
  accepting the duplication as a host-boundary cost are both reasonable.

## Charter contradictions

None. The charter's "What it is" accurately describes the shipped package: explicit top-level Host
slots, content and file separation, portable data-URL descriptors converted at the provider boundary,
`onShareResult` signal emitted by the detailed core command. The stale `isShareContentValid` naming
was corrected in the charter (2026-07-30 decision). Open directions 1 and 2 are acknowledged gaps,
not contradictions.

## Contract & docs fit

- **Export lanes**: `index.ts` re-exports from `./contract`; `contract.ts` re-exports from
  `./share`. Both lanes present and structurally correct.
- **Types in `@flighthq/types`**: All exported types (`ShareContent`, `ShareFile`, `ShareFilesContent`,
  `ShareResult`, `ShareContentBackend`, `ShareFilesBackend`, `ShareSignals`, `HasShareContent`,
  `HasShareFiles`, `CapacitorShareContentBackend`, `CapacitorShareContentOptions`) live in
  `@flighthq/types`. The implementation package exports functions only.
- **Entity composition**: `enableShareSignals` returns `createEntity(...)`, both web and capacitor
  backends are `createEntity(...)`.
- **Readonly usage**: Parameters use `Readonly<ShareContent>`, `readonly ShareFile[]`, and
  `ShareFilesContent.files` is `readonly [ShareFile, ...ShareFile[]]`. `ShareContent` fields are
  themselves `readonly` in the type definition.
- **Naming**: Boolean-returning functions use `has*` / `can*` prefixes. Teardown uses `dispose*`
  (detach-and-GC, not resource-freeing). Function names include the full subject name (`ShareContent`,
  `ShareFiles`, `ShareSignals`).
- **Sentinel returns**: `shareContent` returns `false`, `shareContentWithResult` returns a synthetic
  `ShareResult` with `completed: false` -- no throws for expected failure cases.
- **`sideEffects: false`**: Declared. No top-level registration, no globals mutation, no listeners
  started at import.
- **Dependencies**: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` -- minimal and
  correct. No dependency on `@flighthq/sdk`.
- **Testing**: `share.test.ts` colocated with `share.ts`, alphabetized `describe` blocks mirroring
  exported names, plus a contract-surface snapshot test. `shareExplicit.test.ts` is a supplementary
  isolation test (no corresponding source file -- covers a cross-cutting property of the share
  functions). Tests use `createEntity(...)` for backend stubs and `satisfies` for type safety.
- **Module variable placement**: `_attachedSignals` and the private `filesContent` helper are at the
  bottom of the file, after all exported functions.
- **Module-scoped `_attachedSignals` `Set`**: Technically module-scoped mutable state, which is a
  tension with the explicit-dependency design constraint. However, this is the standard signal
  attach/detach mechanism across the platform integration suite (the same pattern appears in
  `@flighthq/shortcut`). The `attach*`/`detach*` verbs make the mutation explicit and opt-in rather
  than ambient.

## Candidate open directions

1. **Diagnostics seam for malformed file descriptors.** A `ShareFile`-level probe or an `explain*`
   query would separate "your descriptor is malformed" from "the share did not happen" -- currently
   both produce the same `false` sentinel from the caller's perspective.
2. **Result-variant symmetry** (charter open direction 2). Decide whether `shareTextWithResult`,
   `shareUrlWithResult`, and `shareFilesWithResult` earn their place, or whether the single
   `shareContentWithResult` entry point is the golden path for detailed outcomes.
3. **Payload construction helpers** (charter open direction 1). A `createShareFileFromImageSource`-
   style helper would serve the screenshot-sharing use case but pulls `@flighthq/bitmap` into the
   dependency tree. Whether a `share-formats` neighbor package earns its place is open.
4. **Capacitor file sharing.** Bridging data-URL descriptors to platform file URIs requires a
   staging/cleanup path or an evolved descriptor shape. Blocked on deciding whether the complexity
   is justified by real demand.

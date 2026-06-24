---
package: '@flighthq/share'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/share.md
  - source
---

# Review: @flighthq/share

## Verdict

`solid — 88/100`. The 2026-06-24 worker pass closed every gap the prior depth review (72/100) named — files, presentation options, result detail, a validity precondition, and an availability probe — and added a signals seam and the convenience wrappers. The surface is now a complete, canonical Web-Share-Level-2 command capability with native fields forward-declared. It falls short of `authoritative` only because the suite's _delivery_ (native host backends, the Rust crate) is deferred by design, the signals-subscription scaffolding is admitted dead code, and one stub helper name (`shareFileTodomFile`) slipped the casing rule. Charter is a stub, so most of the bar below is the codebase-map fallback — flagged as candidate Open directions.

## Present capabilities

Grounded in `67dc46d6:packages/share/src/share.ts` and `packages/types/src/Share.ts`/`ShareSignals.ts`.

Command seam (the Package Map command-capability trio, complete):

- `shareContent(content, options?)` — validates via `isShareContentValid` first (empty payload → `false` without touching the backend, avoiding the engine throw), then delegates. Sentinel-not-throw.
- `shareContentWithResult(content, options?)` — full `ShareResult` variant; fans `onShareResult` out to all attached signal groups before returning.
- `canShareContent(content)` — sync probe, delegates to `backend.canShare`.
- `isShareAvailable()` — capability-level probe (`backend.isAvailable`), correctly distinct from `canShareContent` (content-level). The doc comments on both spell out the distinction.
- `isShareContentValid(content)` — documents and enforces the "at least one populated field" Web Share precondition (non-empty title/text/url or non-empty files).
- `getShareBackend` / `setShareBackend(backend | null)` — lazy web default; `null` resets.
- `createWebShareBackend()` — implements all four trait methods: `isAvailable` (navigator.share presence), `canShare`/`share`/`shareWithResult`, all guarded for jsdom/absent-API, with AbortError → `dismissed=true` vs other errors → `dismissed=false`. Files are converted from the portable `ShareFile` data URL to a DOM `File` at the boundary (`shareContentToNavigatorData` + the data-URL decoder), keeping the header layer browser-File-agnostic.
- `shareText(text, options?)` / `shareUrl(url, options?)` — thin convenience wrappers.

Signals seam (the event-capability shape, opt-in): `enableShareSignals()` allocates an inert `ShareSignals { onShareResult }`; `attachShareSignals` (idempotent — detaches first), `detachShareSignals` (safe when unattached), `disposeShareSignals` (detach → GC-eligible). Correct `enable*`/`attach*`/`detach*`/`dispose*` verb set and `dispose*` semantics (release-to-GC, nothing to free). This is a sound hybrid: a command capability that also surfaces async completion, which the type comment justifies (native sheets that fire completion on a later runloop tick).

Types are correctly homed in `@flighthq/types` (`Share.ts`, new `ShareSignals.ts`), with the full field set: `ShareFile` (portable data-URL descriptor), `ShareContent.files`, `ShareResult` (`completed`/`activityType`/`dismissed`), `ShareOptions` (`parentWindow`/`sourceRect`/`chooserTitle`/ `excludedActivityTypes`). `Readonly<>` is applied on every content/options parameter and the `onShareResult` payload.

Tests: 44 cases (up from 5), colocated, `describe` blocks alphabetized and mirroring exports. They cover the file path, the cancel-vs-failure split, attach idempotency, detach silence, options plumbing through all four entry points, `activityType` reporting, and the empty-payload short-circuit (asserting the backend is _not_ called). `exports:check` will bind cleanly — every export has a matching `describe`.

Status-doc claims verified against the diff: all nine new functions, the `ShareFile`/`ShareResult`/ `ShareOptions`/`ShareSignals` type additions, the `@flighthq/signals` dependency + tsconfig reference, and the 44-test count are all present and accurate. The status doc is faithful.

## Gaps

- **`shareFileTodomFile` casing.** The private helper is named `shareFileTodomFile` — "dom" is not capitalized, so it reads as `...Todom...` rather than `shareFileToDomFile`. A naming slip in an internal function, but the SDK holds full unabbreviated, correctly-cased type words even internally. Minor, in-package.
- **Dead subscription scaffolding.** `_signalSubscriptions` (map of signals → unsubscribe) is wired through `detachShareSignals` but never populated — the web backend is call-based, not stream-based. The status doc admits it is a forward stub left for "pattern consistency." It is genuinely dead code today; per the pre-release "remove it when it's wrong" rule, carrying speculative machinery is a smell, not a feature. Keep or cut is a small call, but it should be a call.
- **No `*WithResult` convenience wrappers.** `shareText`/`shareUrl` return `boolean` only; there is no `shareTextWithResult`/`shareUrlWithResult`. The status doc flags this as trivial-if-demanded. Mild asymmetry, not a true gap.
- **URL not validated.** `isShareContentValid` accepts any non-empty `url` string; a malformed URL reaches `navigator.share` and is swallowed to `false`. Consistent with the expected-failure contract (a bad URL is not a programmer error worth throwing), so this is a documented choice rather than a defect — noted for completeness.
- **Delivery deferred (by design).** No native host backend realizes the forward-declared `ShareOptions` fields (`parentWindow`/`sourceRect`/`activityType`/`excludedActivityTypes`), and there is no `flighthq-share` Rust crate yet. These are correctly out-of-package (they live in `host-electron`/`host-tauri`/`host-capacitor` and the Rust worktree), so they are not held against the package — but they are why "share works natively" is not yet demonstrable end-to-end.

## Charter contradictions

None — the charter is a stub (only the seeded "What it is" line; North star / Boundaries / Decisions / Open directions are all `TODO`). There is nothing blessed to contradict. Everything above is judged against the codebase-map fallback, not a stated rubric.

## Contract & docs fit

Lives up to the contract well:

- Types-first: every cross-package type is in `@flighthq/types`; the package defines nothing inline.
- Full unabbreviated names (`shareContent`, `canShareContent`, `isShareContentValid`, `getShareBackend`) — the one exception is the private `shareFileTodomFile` casing above.
- Sentinels-not-throws throughout; the web backend guards every API and never throws.
- Single root `.` export (`index.ts` is `export * from './share'`); `sideEffects: false`; module-level mutable state (`_backend`, `_signalListeners`, `_signalSubscriptions`) is lazy/const-allocated, no top-level side effects.
- Command + event seam shapes both match the platform-suite pattern exactly (`get*/set*/createWeb*`; `enable*/attach*/detach*/dispose*`).
- Rust mirror is named and deferred in the status doc (`flighthq-share`, charter `crate:` set).

Candidate doc revisions (the user's gate, not mine):

- **Package Map line is now stale.** `@flighthq/index.md` still lists `@flighthq/share` as just "native share sheet." The realized surface is files + result + options + signals; `package.json`'s own description ("Native share sheet (title, text, url, files) over a swappable web/native backend") is already ahead of the map. The map line should be widened, and the new event-seam (`onShareResult`) noted alongside the command shape.
- **`ShareSignals.ts` is a new types file** not yet reflected anywhere in the admin docs; worth a mention in the types-layout inventory if one is maintained.

## Candidate open directions

The charter is silent on all of these — each is something this review had to assume:

1. **Is `share` blessed as a thin command capability, or does it want a `-formats` neighbor?** The obvious graphics-SDK use case is "share a rendered screenshot." A `createShareFileFromImageSource` helper would pull `@flighthq/surface`/`@flighthq/resources` into the cell's dep tree — a cross-package design decision (structural-fork B/triad territory) the worker correctly declined to make. The charter should rule: thin `share`, or a `@flighthq/share-formats` sibling.
2. **Keep or cut the `_signalSubscriptions` stub?** A North-star line on "no speculative scaffolding vs. forward-compatible event-capability template" would settle this for `share` and every sibling event capability that copied the pattern.
3. **Result-variant symmetry.** Should every convenience entry point (`shareText`/`shareUrl`) have a `*WithResult` twin, or is the boolean path the golden one and `shareContentWithResult` the escape hatch? A Boundaries note would fix the surface size deliberately.
4. **Availability vs. content probes as the canonical pair.** `isShareAvailable` + `canShareContent` is the right two-probe model; worth recording as a Decision so future capabilities in the suite copy it rather than re-deriving it.

---
package: '@flighthq/loader'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/loader

The orchestration core is solid (80/100). The actionable work splits cleanly: a small set of sweep-safe correctness/docs fixes within the package, and a larger backlog gated on the byte-tier fork, the Rust mirror, and cross-package boundary calls. The byte/bandwidth tier is the one real fault line — it is half-wired and its resolution is a blessed design choice, so almost everything touching it routes out of Recommended.

The structural forks barely bite here, and the review confirms it: a loader holds no graph node and parses nothing, so **fork A (source-data vs graph participation)** and the **subject triad** do not apply — there is no `loader-formats` neighbor and none should be created. **Fork B (registry vs union)** is also moot: the loader dispatches `() => Promise<T>` thunks, not `kind`-switched primitives. **Fork F (thin-by-design vs under-built):** loader has moved out of the under-built stub column into solid — recorded below as an Open direction for the charter, not as work.

## Recommended

Sweep-safe: within `@flighthq/loader` (incl. its own type files in `@flighthq/types`), no cross-package coupling, no breaking change to a shipped signature, no open design decision.

- **Remove the false "tracking shim" comment (lines 490-493).** `resourceLoader.ts` claims `entry.onBytesProgress` "is a tracking shim (set up in queueResourceLoad) that also writes `entry.bytesLoaded`." No such shim exists — it is the raw descriptor callback. Correct or delete the comment so it stops asserting wiring that isn't there. Pure in-source doc hygiene. (review.md › Gaps / Candidate doc revisions)
- **Strike the `bytesHintDefault` docstrings.** Both the `ResourceLoaderOptions.maxBytesPerSecond` docstring and the package-facing docs tell callers to "set `bytesHintDefault` to enforce throttling for all items," but the field does not exist and is read nowhere. Removing a reference to a non-existent option is non-breaking docs cleanup. (_Implementing_ the option is the byte-tier fork — Backlog / Open direction; only the false reference is removed here.) (review.md › Gaps / Candidate doc revisions)
- **Add a rate-bound throttle test.** The single throttle test only checks the second item is delayed within 50 ms; nothing asserts the _rate_ is actually bounded. Add a test that pins the present advisory behavior (and documents its limits). Test-only, within-package. Does not commit to the hard-cap-vs-advisory decision (that stays an Open direction). (review.md › Gaps)
- **Add a regression test for present fail-fast scope.** `cancelRemainingEntries` aborts only pending entries; in-flight peers run to completion. Pin that current behavior with a test so it is not changed by accident. (The _semantics_ — should fail-fast abort in-flight peers? — is an Open direction, not changed here; this test only records today's behavior.) (review.md › Gaps)

## Backlog

Parked: gated on an Open direction (charter), cross-package coordination, or a breaking change.

- **Resolve the byte/bandwidth tier (Open direction).** `report.bytes` is dead (always `0`): `entry.bytesLoaded` is set to `0` and never rewritten, and `entry.onBytesProgress` is stored but never invoked. The fork is **finish vs cut** (review's candidate open direction): (a) extend `load` to `(signal, ctx)` so the loader injects a `reportBytes` writer — a **source-breaking factory-signature change** — or (b) cut the dead `bytes`/`onBytesProgress`/`bytesHint`/ `maxBytesPerSecond` surface until it can be done right. Either path also needs a blessed stance on the throttle's "advisory, not a budget" semantics. Breaking and design-gated → not sweep-safe.
- **Unknown-key sentinel for `getResourceLoadItemStatus`.** Returns `'pending'` for an unknown key, conflating "queued, not started" with "no such item" — a partial violation of the sentinel rule. The fix (add an `'unknown'`/`'missing'` member to `ResourceLoadItemStatus`, or return `null`) changes the return type / the status union — a small API-shape decision. Surface to the charter, then act.
- **Aggregated error surface.** Silver asked for a first-class `ResourceLoadError[]` / failure summary on `onComplete`. Today a caller filters `reports[]` by `status === 'failed'` themselves. Adding a new accessor/payload is an API-surface addition worth a deliberate call, not a blanket sweep.
- **Fail-fast in-flight semantics (Open direction).** Whether `'fail-fast'` should abort in-flight peers (not just stop dispatch) needs a blessed decision and a documenting type note. The Recommended test only pins _current_ behavior; changing it is parked here.
- **Rust crate `flighthq-loader`.** Not in this bundle; the deterministic, GPU-free orchestration is the ideal early conformance target named by the roadmap. Cross-worktree (Rust port) work, and its cancel-token seam is coupled to the `AbortSignal`/`CancellationToken` Open direction below.
- **`AbortSignal` / `DOMException` vs a Flight-neutral `CancellationToken` (Open direction).** The `load` seam takes a web/DOM `AbortSignal` and cancellation/timeout use `DOMException`. Whether `@flighthq/types` should define a neutral `CancellationToken` (web → `AbortSignal`, Rust → cancel token) per the Rust-port async/`Send` guidance is a `types`-level decision that blocks the Rust mirror. Surfaced, not acted on.
- **Loader example in the gallery.** The Gold "docs + examples" obligation (a bounded-concurrency preload of a `@flighthq/resources` batch with a determinate progress bar) is unverifiable in this bundle and, on the evidence, absent. An example that loads a real resource batch crosses into `@flighthq/resources`/`examples` — cross-package, parked.

## Approved

_None. Approval is the user's verbal gate._

---

### Surfaced to the charter's Open directions (not edited here)

The charter is a stub (North star / Boundaries / Decisions / Open directions all TODO). These questions the review and this assessment had to assume past belong in the charter, not in Recommended:

- **Byte/bandwidth tier — finish vs cut**, and the throttle's advisory-vs-hard-cap stance.
- **`AbortSignal`/`DOMException` vs a neutral `CancellationToken`** in the `@flighthq/types` seam (blocks the Rust mirror).
- **Fail-fast scope** — stop-dispatch only, or abort in-flight peers too.
- **Boundary with `@flighthq/resources`** — bless "loader stays type-agnostic; typed conveniences like `createImageResourceLoadItem(url)` live in `resources`, consuming the loader" as a non-goal.
- **No `loader-formats` neighbor** — record that the loader parses nothing, so the triad does not apply.
- **Status: no longer a stub** — fork F: loader has graduated from under-built to solid; the charter should stop treating it as a stub to push on.

### Roadmap absorption

This assessment absorbs `tools/agents/docs/reviews/maturation/depth/loader.md` (Bronze/Silver/Gold). Per the migration table in `packages/index.md`, that one-time seed is spent — Bronze and most of Silver/Gold landed (the review verifies the orchestration core); the residual Gold items (byte tier, report-model edges, Rust parity, example) are captured above. The maturation doc can be removed.

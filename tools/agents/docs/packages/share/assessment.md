---
package: '@flighthq/share'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/share

The 2026-06-24 worker pass already executed the entire Bronze and Silver tiers of the prior maturation roadmap (`reviews/maturation/depth/share.md`) — files, `ShareOptions`, `ShareResult`, `isShareContentValid`, `isShareAvailable`, the signals seam, and the convenience wrappers all landed. The review confirms the surface is now `solid — 88/100`, a complete Web-Share-Level-2 command capability. So almost nothing remains as actionable in-package work: one casing fix is the whole sweep-safe set. Everything else is either deferred _delivery_ (Rust crate + host adapters, cross-worktree/cross-package) or a _decision_ the stub charter must make first, routed below to the charter's Open directions rather than recommended.

## Recommended

Sweep-safe: within `@flighthq/share`, no cross-package coupling, no breaking change, no open design decision.

- **Fix `shareFileTodomFile` casing → `shareFileToDomFile`.** The private helper drops the `D` in `Dom`, reading as `...Todom...` and violating the SDK's full-unabbreviated, correctly-cased type-word rule (which the codebase map applies even to internal names). Pure mechanical rename of one private function and its callsite; no public surface, no behavior change. (`review.md#gaps`, item 1.)

## Backlog

Parked — each waits on an Open direction, crosses a package/worktree boundary, or is larger than a sweep.

- **Keep-or-cut the `_signalSubscriptions` stub.** The map of signals→unsubscribe is wired through `detachShareSignals` but never populated (the web backend is call-based, not stream-based), so it is dead code today. The cut is small and in-package, but the review frames it as a _call_ tied to a North-star question — speculative scaffolding vs. a forward-compatible event-capability template copied across the whole platform suite. Parked behind Open direction 2: settle the principle in the charter, then the keep/cut follows for `share` and every sibling at once. (`review.md#gaps`, item 2.)
- **`shareTextWithResult` / `shareUrlWithResult` twins.** The convenience wrappers return `boolean` only; there is no result-variant twin. Trivial to add, but it sets the deliberate _surface size_ of the package — whether every convenience entry point gets a `*WithResult` mirror or the boolean path stays golden with `shareContentWithResult` as the lone escape hatch. Parked behind Open direction 3 (result-variant symmetry); adding it pre-decision would prejudge the surface shape. (`review.md#gaps`, item 3; roadmap Silver.)
- **`flighthq-share` Rust crate (Gold).** 1:1 mirror of the now-frozen TS field set in `flighthq-types` + free functions + `ShareBackend` trait, with a no-op native default and a conformance-map entry. Lives in the Rust worktree, not this package; the roadmap explicitly sequences it _after_ the TS surface freezes (which it now has), but it is cross-worktree work, not an in-package sweep. (`review.md#gaps`, item 5; roadmap Gold + Sequencing 3.)
- **Native host share backends — `host-electron` / future `host-tauri` / `host-capacitor` (Gold).** The forward-declared `ShareOptions` fields (`parentWindow`/`sourceRect`/`activityType`/ `excludedActivityTypes`) are web-ignored stubs until a native adapter realizes them. These live in the host packages, not `share` — cross-package, so parked and surfaced as a suggestion, not recommended. This is why "share works natively" is not yet demonstrable end-to-end. (`review.md#gaps`, item 5; roadmap Gold.)
- **URL validation in `isShareContentValid`.** Currently any non-empty `url` string passes and a malformed URL is swallowed to `false` at `navigator.share`. The review judges this a _documented choice_ (a bad URL is expected failure, not a programmer error worth throwing), consistent with the sentinel-not-throw contract — so it is parked as a deliberate non-change, recorded only for completeness. (`review.md#gaps`, item 4.)

### Doc revisions (the user's gate — noted, not actioned here)

- **Package Map line is stale.** `tools/agents/docs/index.md` still lists `@flighthq/share` as just "native share sheet." The realized surface is files + result + options + signals; widen the line and note the new `onShareResult` event seam alongside the command shape. The package's own `package.json` description is already ahead of the map.
- **`ShareSignals.ts` is a new types file** not yet reflected in the types-layout inventory; worth a mention if that inventory is maintained.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## Open directions surfaced to the charter

Per the structural forks and the assessment gate, these are routed to `charter.md › Open directions` for an explicit conversation — **not** placed in Recommended. (Noted here; the charter itself is the user's to edit.)

1. **Thin `share` vs. a `@flighthq/share-formats` neighbor (structural fork B / the subject triad).** The obvious graphics-SDK use is "share a rendered screenshot." A `createShareFileFromImageSource(image, name): ShareFile` helper would pull `@flighthq/surface`/`@flighthq/resources` into the cell's dep tree. Per the triad's plurality guard, a `-formats` split is premature for a single helper — but this is a real design fork the charter must rule on: keep `share` thin, or factor a `share-formats` sibling. The worker correctly declined to make this cross-package call. (`review.md#candidate-open-directions`, item 1; roadmap Silver + Sequencing.)
2. **No-speculative-scaffolding vs. forward event-capability template.** Settling whether `_signalSubscriptions`-style forward stubs are welcome would resolve the Backlog keep/cut above and standardize every sibling event capability that copied the pattern. A North-star line. (`review.md#candidate-open-directions`, item 2.)
3. **Result-variant symmetry.** Should every convenience entry point (`shareText`/`shareUrl`) have a `*WithResult` twin, or is the boolean path the golden one with `shareContentWithResult` as the escape hatch? A Boundaries note would fix the surface size deliberately and unblock the Backlog item. (`review.md#candidate-open-directions`, item 3.)
4. **Availability vs. content probes as the canonical pair.** `isShareAvailable` (capability-level) + `canShareContent` (content-level) is the right two-probe model; worth recording as a Decision so future suite capabilities copy it rather than re-derive it. (`review.md#candidate-open-directions`, item 4.)

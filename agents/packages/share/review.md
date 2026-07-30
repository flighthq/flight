---
package: '@flighthq/share'
status: solid
score: 82
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - host-capacitor
---

# share — Review

## Verdict

**Solid — 82/100.** The live package is a complete Web-Share-Level-2-shaped command cell, not the
unbuildable intermediate delta described by the old merge-gate review. Eleven public functions plus
three contract-only backend functions cover content/capability probes, boolean and detailed-result
sharing, text/URL conveniences, and opt-in result signals. Shared types are present, the web backend
supports portable data-URL files, Capacitor supplies a native mobile adapter, and all 44 package tests
plus five focused host tests pass. Remaining depth concerns portable host truth: Capacitor projects an
async capability into a cached synchronous probe and cannot carry the package's data-URL file model.

## What is solid

- `ShareContent`, `ShareFile`, `ShareOptions`, `ShareResult`, `ShareBackend`, and `ShareSignals` live
  in `@flighthq/types`; package code consumes the contract lane and keeps backend setters out of the
  ordinary public lane.
- `hasShareContentFields` rejects empty payloads before they reach a host. Expected unavailability,
  invalid content, cancellation, and platform failures resolve to boolean/result sentinels rather than
  escaping as exceptions.
- The web backend maps title/text/URL directly to `navigator.share`, converts portable data-URL
  descriptors into DOM `File` objects at the boundary, distinguishes `AbortError` dismissal from other
  failure, and guards both absent APIs and conversion errors.
- `shareContentWithResult` preserves host activity information and fans the result out only to
  explicitly attached signal groups. Attachment, detachment, disposal, idempotency, and detached
  non-delivery all have behavioral coverage.
- The dead `_signalSubscriptions` scaffolding is gone. `_signalListeners` is the single attachment
  registry, so disposal no longer performs a read against a map no backend populated.
- The Capacitor adapter realizes title/text/URL, chooser title, activity results, cancellation
  sentinels, and backend installation through `host-capacitor`; it does not leak Capacitor imports into
  this package.
- Package import performs no browser or host action, `sideEffects` is false, every exported function
  has a colocated test, and the focused structural gate passes.

## Remaining depth

- **Async capability truth.** Capacitor's `canShare()` is asynchronous while `ShareBackend.isAvailable`
  and `canShare` are synchronous. The adapter prefetches once and reports false until the promise
  settles, with no readiness or change signal; an early caller can therefore observe a false negative.
- **Portable native files.** `ShareFile` is a data URL, which the web backend can materialize directly,
  while Capacitor accepts file URIs and currently rejects files-only content. A native staging/cleanup
  contract or a multi-representation file descriptor is needed before file sharing is portable.
- **Outcome consistency.** The web backend marks only `AbortError` as dismissal; Capacitor maps every
  rejection to dismissal. The backend contract needs a shared rule for distinguishing cancellation,
  invalid content, permission denial, and host failure if `ShareResult.dismissed` is to be portable.
- **Convenience/result symmetry.** `shareText` and `shareUrl` expose only the boolean path, and boolean
  sharing intentionally does not emit result signals. The charter leaves open whether detailed-result
  twins and consistent completion observation earn their surface.

## Boundary conclusion

The invoker and web behavior are mature, and the completed dead-map cleanup needs no further source
change. The next meaningful work is an honest asynchronous/native file contract; screenshot payload
construction belongs in a neighbor only when a real consumer justifies that dependency.

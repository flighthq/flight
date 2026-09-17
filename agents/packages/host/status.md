---
package: "@flighthq/host"
updated: 2026-09-15
by: null
---

# host — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

**The accessor set is a measured subset, not the whole Host.** `hostQuery.ts` covers 30 of roughly 180
optional provider slots: a slot earned an accessor when a Flight package takes that provider as a
function parameter at 10+ sites, plus the three `set*Backend` migration targets (`graphics.pathBoolean`,
`graphics.wgpuHost`, `text.bidiClass`). `explainHost` reports the same subset, so a slot outside it is
reported neither present nor missing. Widening the set means adding an accessor pair AND a `_COVERAGE`
row; `hostExplain.test.ts` fails when the two disagree.

**`host.window` has no accessor on purpose.** It is a provider at group position and `createHost` fills
it with `{}`, so an accessor could not distinguish "absent" from "present but empty". `explainHost`
reports it with `isProvider: true` and no slots rather than reporting its operations as capabilities.

**Three public accessors return contract-only types.** `getHostAudioDevice`, `getHostVideo`, and
`getHostFontLoading` name `HostAudioDeviceProvider` / `HostVideoProvider` / `HostFontLoadingProvider`,
which `@flighthq/types` keeps on the contract lane. No gate flags this and it matches the
`Renderer`/`RenderProxy` precedent (an app passes the provider on without naming it), but if an app is
meant to name them they belong on the public types lane. Unresolved.

**Nothing fills `text.shaper` or `text.segmenter` on any host.** `webHostText` supplies only
`fontLoading` and `glyphRasterizer`; the providers are built by `createCanvasTextShaperBackend`
(`@flighthq/textshaper-canvas`) and `createWebTextSegmenterBackend` (`@flighthq/textsegment`) and must be
composed into `createHost`'s `text` group by the caller. `explainHostTextShaper` /
`explainHostTextSegmenter` say so; the accessors return null for every host in this repo today.

**The backend breadcrumbs are hand-maintained.** `_REMEDIES` in `hostExplain.ts` names which package
supplies each of the seven guarded providers. A new host backend filling one of those slots must gain a
`HostCapabilityBackend` entry or the explanation keeps pointing only at the old source. The sentence and
the structured `backends` list cannot drift from each other — a test asserts every `fix` names every
`entryPoint` and `packageName` it returns — but neither can notice a backend that was never added.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- 2026-09-15 — package created: `createHost`/`initializeHost` moved here from `@flighthq/entity`
  (contract lane only), plus `hostQuery.ts` accessors, `hostExplain.ts` pull queries, and
  `enableHostGuards.ts`; four host backends repointed to `@flighthq/host/contract`.

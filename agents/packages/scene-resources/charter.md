---
package: '@flighthq/scene-resources'
crate: flighthq-scene-resources
draft: false
lastDirection: 2026-07-17
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# scene-resources — Charter

## What it is

`@flighthq/scene-resources` is the **resource-resolution seam** for the scene layer: it turns the
lightweight resource *references* a scene/mesh parser emits (embedded byte-handles and external URIs on
material texture slots) into live, decoded `ImageResource`/`Texture` bindings — **separately from the
parse, on the caller's schedule, driven by policy (visibility/priority), and with an availability event
the caller can hook to transition an object in.**

It is a scene-domain neighbor that **composes existing primitives**, owning none of their machinery:
`@flighthq/loader` (bounded-concurrency, priority, cancellation), `@flighthq/assets` (ref-counted
acquire/release, in-flight dedup, per-type adapters), `@flighthq/image-codec` (byte→pixel decode),
`@flighthq/image` (the `ImageResource` lifecycle + deferred-fill precedent), `@flighthq/signals` (the
opt-in availability notifications), and `@flighthq/tween` + `@flighthq/easing` (the optional reveal
transition). It stands *on* `assets` rather than living inside it, so `assets` stays a clean, general,
manifest-driven primitive and the scene-graph-embedded-reference + material-slot-wiring + visibility
policy live in their own cell.

## The model: parse is synchronous, resolution is a separate async pass

This generalizes what glTF/GLB already is — a structural document plus references resolved separately —
to **all six** scene-formats (glTF, AWD, OBJ/MTL, 3DS, MD2, MD5), and retro-fits AWD's fire-and-forget
deferred-fill onto one shared, controllable path.

```
createSceneFrom*(bytes) ── sync ──▶ Scene graph + unresolved SceneResourceRef on each texture slot
                                                  │
                                    resolveSceneResources(scene, resolver, policy)  ── async, caller-driven
                                                  │
        loader (concurrency/priority/cancel) → assets (refcount/dedup) → image-codec (decode)
                                                  │
                                    fills Texture.image; fires onResourceResolved
                                                  │
                                    caller/reveal-policy drives the fade (tween + easing)
```

Why the split beats a single async "load it all":
- **Bytes.** Geometry is kilobytes; textures are megabytes. Parse the structure instantly; defer the
  heavy payloads. Even an in-memory GLB still needs async *decode* (PNG/JPEG→RGBA), so the split wins
  for embedded-in-hand as well as external-fetch.
- **Visibility.** References let resolution be policy-driven: resolve only what passes frustum/distance/
  LOD culling, prioritize the hero object, ref-count so a texture unloads when unreferenced, show
  geometry on frame one with a placeholder while textures stream in. "Load everything up front" becomes
  one policy (resolve-all) rather than the only option.
- **Explicitness.** The caller invokes resolution and chooses the policy — Flight's "explicit over
  magic" posture, not a parser doing hidden IO.

## Build posture — v1 (mature seam, progressive rung deferred)

We are building the mature architecture, not a stopgap. v1 establishes the full seam and the policy
engine; only the most advanced progressive path (mip/low-res→full cross-fade) is a charted phase 2.

### v1 scope

1. **`SceneResourceRef` descriptor** in `@flighthq/types` (header layer): plain data, one of
   *embedded* (byte payload/handle + mime) or *external* (uri + basePath). Parsers in
   `@flighthq/scene-formats` **emit** it on material texture slots instead of resolving inline (AWD
   moves onto this; glTF/OBJ/3DS/MD2/MD5 populate it as they wire textures). The descriptor + a
   per-ref resolution **state** (`unresolved | loading | resolved | failed`) are queryable plain data.
2. **A resolver** that maps a `SceneResourceRef` → `ImageResource`/`Texture` through
   `image-codec` (embedded) or a caller-supplied fetch (external), orchestrated by `loader` and
   ref-counted/deduped by `assets`. Swappable seam so a native host supplies its own fetch.
3. **A resolution policy** — the visibility/priority engine: `resolveSceneResources(scene, resolver,
   policy)` where policy selects *what* resolves *when* (all-eager; visible-only via a caller-provided
   visibility/culling signal; prioritized). **Cancellation** when an object leaves the working set
   before its load completes; re-request on re-entry (over `loader` cancel + `assets` refcount).
4. **The availability + transition seam** (see below).
5. **An eager convenience wrapper** — `loadSceneFrom*` (async) = parse + resolve-all-through-the-policy,
   for "just give me the finished scene" and for deterministic test/visual-capture. Built *on* the
   primitive (the screw and the lawnmower).

### The availability + transition seam

The resolver **reports availability; it never animates.**
- **Opt-in signal group** `enableSceneResourceSignals(...)` → `onResourceResolved` / `onResourceFailed`,
  each carrying the ref id + owning material/object, so multiple loose listeners (a fade controller, a
  loading HUD, analytics) react. Signals per the convention (multiple listeners, opt-in cost); lives in
  the entity's owning package (here), not in `@flighthq/signals`.
- **Transition is composed, not built-in.** On the signal the app drives a reveal factor 0→1 with
  `tween` + `easing`. A convenience **reveal policy** — `reveal: 'pop' | { fadeMs, easing }` — wires the
  standard fade for the caller using those same primitives. The resolver stays decomposed: it says
  "ready"; the animation primitives do the fade.
- Motivating case (blessed): an invisible/culled object becomes visible, its texture streams in, and it
  **fades from placeholder to full instead of popping**, cancelable if it re-hides mid-load.

### Cross-package dependency this surfaces (surface, don't own here)

To fade in, the renderer needs a **reveal/opacity input it honors per object/material**. Display
objects have `alpha`; 3D materials need an opacity / per-instance reveal factor the fade drives — a
small `@flighthq/materials` + `@flighthq/scene-gl` (+ `scene-wgpu`) addition. This charter names it as a
required companion, not something `scene-resources` owns.

## Boundaries

- **Composes, never forks.** No second loader, refcount, decode, or animation engine — reuse
  `loader`/`assets`/`image-codec`/`tween`. If a primitive is missing, extract it there, not here.
- **References are plain data in `@flighthq/types`;** parsers emit them; this package resolves them.
  The parse stays synchronous and format-symmetric across all scene-formats.
- **Reports availability; does not animate or render.** Transitions are composed from `tween`/`easing`;
  the reveal factor is honored by the renderers, not stored here.
- **Scene-domain resolution.** General 2D bitmap streaming may reuse the descriptor/resolver later
  (see Open directions), but v1 targets scene/material textures.
- **No manifest ownership.** Id-keyed manifests, groups, and generic asset types stay in
  `@flighthq/assets`; this package bridges parsed-graph references onto that machinery.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-17] Chartered: a resource-resolution seam as a scene-domain neighbor package composing `@flighthq/assets` (option B), NOT resolution folded into `assets`.** Keeps `assets` a clean general primitive; scene-graph reference resolution, visibility policy, and material wiring live in their own cell.
- **[2026-07-17] Sync parse / async separate resolve is the model** — parsers emit plain-data `SceneResourceRef`s; the caller resolves on its schedule under a visibility/priority policy. Chosen over making parsers async / loading everything up front, because textures dwarf geometry and visibility should gate load. AWD's deferred-fill retro-fits onto this shared path.
- **[2026-07-17] The resolver reports availability via an opt-in signal; transitions are composed from `tween`/`easing`, with an optional reveal policy convenience.** The resolver never animates. Motivating case (fade-in on stream, cancel on re-hide) is blessed as the progressive target's first rung.
- **[2026-07-17] Building the mature architecture, not a stopgap** — v1 delivers the full seam + policy engine + availability/transition; only mip/low-res→full progressive cross-fade is deferred to phase 2.
- **[2026-07-17] DELIVERED v1 Phases 1–3 (parcel builder-2afc1234), reviewed & approved.** `SceneResourceRef` (closed `Embedded|External`) + `ResourceResolutionState` (closed const-union) + additive `Texture.resource?` in types; AWD emits refs (drops the fire-and-forget decode + the `@flighthq/image` dep); the package = resolver (loader + image-codec + per-texture AbortController) + `resolveSceneResources(scene, resolver, {select?, priority?})` policy engine (all/visible/prioritized + cancel-on-drop + stale-settle identity guard) + `enableSceneResourceSignals` + eager `loadSceneFromAwd`/`resolveSceneResourcesAndWait`; texture discovery via an OPEN `SceneMaterialTextureRegistry` (touches neither `scene` nor `materials`). `npm run check` green, 43 tests.
- **[2026-07-17] `@flighthq/assets` DEFERRED to the streaming phase (revises the option-B "composing assets" wording).** assets is id/manifest-centric (`acquireAsset(library, id)`); embedded byte-refs have no ids, so v1 dedups by `Texture` identity at the walk and assets' refcount/unload belongs to the progressive/streaming phase where external URIs carry natural ids. Well-justified worker call.
- **[2026-07-17] glTF texture import DEFERRED (STOP-AND-ASK hit).** glTF has zero texture/material-texture wiring today, so it's net-new glTF material modeling, not a ref retrofit. AWD is the v1 embedded-path proof; glTF is a focused follow-up.
- **[2026-07-17] The reveal hook is a MISSING PRIMITIVE, not a material field — reframed as "3D node opacity" and split out (being built separately).** 3D `SceneNode` has no alpha/opacity at all (only `HasTransform3D`); a reveal factor needs per-object opacity across the material shaders + blend phase. So: charter/build **3D node opacity** (alpha on the node + `prepareSceneRender` propagation + shaders honoring it) as its own primitive; reveal-fade = `tween`/`easing` driving `node.alpha` on availability, layered on top. Resolves Open direction #2. Coordinate its shader changes with the in-flight skinning track.

## Open directions

1. **Name / scope** — confirm `@flighthq/scene-resources`; decide whether the descriptor + resolver are
   deliberately general enough that 2D display-bitmap streaming reuses them (then a more neutral name),
   or stay scene-scoped.
2. ~~The reveal-factor renderer hook~~ — **resolved 2026-07-17:** it is the missing **3D node opacity**
   primitive (built separately, coordinated with skinning), not a material field. Reveal-fade layers on
   top via `tween`→`node.alpha`. See Decisions.
3. **Progressive / mip streaming (phase 2)** — placeholder → low-res/mip → full with cross-fade; the
   fully mature streaming path. Depends on `texture-formats` mip parsing + a low-res source. This is
   where `@flighthq/assets` refcount/unload lands (external URIs have natural ids).
4. **External-fetch seam** — whether the fetch side rides `@flighthq/net` or a caller-supplied resolver
   only; native hosts replace it.
5. **glTF as the proving ground** — glTF external `.bin` + images are the highest-value consumer; use it
   to validate the descriptor + resolver, with AWD as the embedded-path proof.
6. **Determinism** — the resolve-all wrapper is the capture/test mode; confirm the streaming path is
   excluded from fingerprint baselines.

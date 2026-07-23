# scene-resources — Status

Continuity log for `@flighthq/scene-resources`. See [charter](charter.md).

## 2026-07-22 — explicit document and resource load boundaries

Replaced ambiguous format-only URL names with `loadSceneDocumentFrom*Url` returning
`SceneDocument | null`; removed in-hand parse+implicit-built-in-resolver `loadSceneFrom*` wrappers and
renamed eager resource realization to `loadSceneResources`. URL acquisition supports abort and
source-identified byte progress. glTF closes required external `.bin` geometry and every format carries
the model base path onto relative image refs. `loadSceneResources` reports operation-scoped unique-ref
progress. No loader imports or populates backend renderer/GPU state. Package tests cover URL source type,
null failures, malformed JSON, external-buffer closure/base path, cancellation/progress, and eager resource
completion/progress.

## 2026-07-17 — DELIVERED v1 Phases 1–3 (builder, parcel builder-2afc1234) — reviewed & approved

Built on the integrated color+shading HEAD; `npm run check` green (130 pkgs), 43 tests. Types
(`SceneResourceRef` closed union + `ResourceResolutionState` closed const-union + additive
`Texture.resource?`), AWD emits refs (drops decode + `@flighthq/image` dep), and the package
(resolver + `resolveSceneResources` policy engine w/ cancel-on-drop + stale-settle guard +
`enableSceneResourceSignals` + eager `loadSceneFromAwd` + open `SceneMaterialTextureRegistry`).
Reviewer verified the cancellation semantics (identity guard, abort-vs-fail, revert-on-drop) correct.

Delivered decisions (see charter › Decisions 2026-07-17): **assets deferred** to the streaming phase
(id-centric vs embedded byte-refs); **glTF texture import deferred** (net-new modeling, STOP-AND-ASK);
**reveal hook = the missing "3D node opacity" primitive**, split out and built separately (coordinate
its shader changes with skinning). Not verified: browser visual capture (needs host run).

## State (superseded — original plan below is historical)

Original (2026-07-17):

Chartered in a direction session with the user, out of the AWD-texture design call (#1): the
deferred-fill builder shipped for AWD is the right tactic but the wrong thing to repeat per parser —
**all six scene-formats** (glTF, AWD, OBJ/MTL, 3DS, MD2, MD5) reference embedded or external
textures/materials that need async load. The user chose the **mature architecture**: parse stays
synchronous and emits plain-data resource references; a separate, policy-driven, cancelable async pass
resolves them; and an **opt-in availability signal lets the caller transition an object in** (fade from
placeholder instead of popping) rather than the resolver animating.

### Blessed decisions (see charter › Decisions)

- **Option B:** a scene-domain neighbor package **composing** `@flighthq/assets` (+ `loader`,
  `image-codec`, `image`, `signals`, `tween`, `easing`) — NOT resolution folded into `assets`.
- Sync parse / separate async resolve; parsers emit `SceneResourceRef` (embedded byte-handle | external
  uri) in `@flighthq/types`; AWD's deferred-fill retro-fits onto the shared path.
- Resolver reports availability via an opt-in signal; transitions composed from `tween`/`easing` +
  an optional `reveal: 'pop' | { fadeMs, easing }` policy. Resolver never animates.
- Mature v1 (full seam + visibility/priority policy + availability/transition); mip/low-res→full
  progressive cross-fade is phase 2.

### v1 deliverables (from the charter)

1. `SceneResourceRef` descriptor + per-ref state in `@flighthq/types`; scene-formats parsers emit it
   (AWD first, then glTF texture route).
2. Resolver: `SceneResourceRef` → `ImageResource`/`Texture` via `image-codec` + a swappable fetch,
   over `loader` + `assets`.
3. `resolveSceneResources(scene, resolver, policy)` — visibility/priority policy engine + cancellation.
4. `enableSceneResourceSignals` availability seam + reveal-policy convenience.
5. Eager `loadSceneFrom*` wrapper (parse + resolve-all) — the convenience + deterministic capture mode.
6. Companion (cross-package): a reveal/opacity input on `materials` + `scene-gl`/`scene-wgpu`.

### Sequencing / dependencies

- Highest-value proving consumer: **glTF** external `.bin` + images; **AWD** is the embedded-path proof.
- The one hard cross-package dependency is the renderer reveal-factor hook (open direction #2) — build
  with v1.
- Touches `@flighthq/types` and `scene-formats` — coordinate with the in-flight shading (types) and
  color (materials/scene-gl) tracks at merge time.

## No code exists yet. Types (`SceneResourceRef`) + the parser emit-side land first; resolver + policy + signals follow.

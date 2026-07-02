# Package Direction Progress

Track which packages have had a direction session, what was dispatched, and what's landed. Updated by the review agent after each session.

## States

| State        | Meaning                                             |
| ------------ | --------------------------------------------------- |
| `—`          | Untouched — no direction session yet                |
| `direction`  | Had a direction session, decisions blessed verbally |
| `dispatched` | Work sent to a builder agent                        |
| `landed`     | Builder work committed                              |

## Core

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| types | direction | 2026-07-02 | 6 decisions blessed: header-layer identity, assertion tests welcome not mandated, Rectangle-shaped types consolidate, ParticleForce/Collider intentionally closed, Signal<T> divergence intentional, notification id model. 2 items already landed (notification id, Dom casing). Builder parcel: 3 tasks (particle notes, TextDirection alias, glyphCount doc). |
| entity | direction | 2026-07-02 | 4 decisions blessed: never-an-ECS, getEntityRuntime asserting fast path, unchecked binding cast intentional, drop "node" from pkg description. Open: guard mode alignment review. Package is feature-complete (92/100). |
| geometry | dispatched | 2026-07-01 | Blessed all 5 open directions: collision math stays, OBB/Capsule in scope, `is*Intersecting*` naming, standard quaternion convention, TS advances independently of Rust. Builder2 parcel: renames + quaternion fix + OBB/Capsule. |
| math | direction | 2026-07-02 | 6 decisions blessed: noise in math, randomColor in math, saturate GPU NaN semantics, particles adopt math exports, as-needed growth model, pkg description update. Approved: 6 sweep items (doc fixes + saturate NaN impl + description + order check). |
| node | landed | 2026-07-02 | 7 decisions blessed: trait boundary, 3D raw-matrix, 3D bounds on node, signals hierarchy-only, skewX/skewY, reparentNode = world-preserving, serialization = new package. Skew + reparentNode code landed. |
| signals | direction | 2026-07-02 | 4 decisions blessed: sync-only boundary, void slot contract, no weak connections, hard-rename policy. Approved: delete 2 deprecated aliases. Open: throttle/debounce home (time pkg?), dispatch-during-dispatch safety (tombstone). |

## Scene graph — display objects

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| displayobject | dispatched | 2026-07-01 | Reversed prior drop of `sourceRectangle` on Bitmap. Blessed charter decisions: drop cacheAsBitmap/scrollRect/opaqueBackground, Loader, lifecycle signals, traversal wrappers, pixelSnapping. Builder2 parcel: stale-reference cleanup + textlayout dep removal. |
| text | direction | 2026-07-02 | 4 decisions blessed: entity layer identity, programmatic mutation on text / interactive on textinput, \*Value suffix dropped, pre-release no-backward-compat rule. Builder landed most depth-review work (setters, read accessors, signals, insert/replace). Open: signal ownership (text vs textinput), text-formats neighbor, package rename. 1 approved item (textlayout \_text param removal). |
| sprite | direction | 2026-07-02 | 5 decisions blessed: compact sentinel is user-facing API, ParticleEmitter signals intentionally absent, transformType no-guard for perf, Vector2Like for all {x,y} out-params, Int32Array for tile flags. Builder parcel: 3 items (signals dep, Vector2Like swap, named sentinel constant). |
| clip | direction | 2026-07-02 | 4 decisions blessed: two API paths (conservative default / `*Exact` suffix), Float32Array contours in scope, winding conversion belongs in path, boundaries confirmed. No sweep-safe items — all remaining work cross-package (Float32Array migration, exact polygon kernel, functional test, Rust crate). |
| interaction | — |  |  |
| shape | — |  |  |

## Scene graph — 3D

| Package   | State | Last visited | Note                      |
| --------- | ----- | ------------ | ------------------------- |
| scene     | —     |              | 52/100, early stage       |
| mesh      | —     |              |                           |
| lighting  | —     |              |                           |
| texture   | —     |              |                           |
| camera    | —     |              |                           |
| skeleton  | —     |              | Thin, undocumented in map |
| picking   | —     |              | Thin, undocumented in map |
| animation | —     |              | Undocumented in map       |
| materials | —     |              |                           |

## Rendering — core + backends

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| render | direction | 2026-07-02 | 6 decisions blessed: shared draw driver, render-graph in scope, font-string → text, 3D prepare boundary (render composes / lighting defines), viewport culling = real world bounds, housekeeping sweep. Builder parcel: delete no-op + alias, per-state adapt hook, fix viewport culling, move computeTextFormatFontString. |
| render-gl | — |  |  |
| render-wgpu | — |  |  |
| displayobject-canvas | — |  |  |
| displayobject-dom | — |  |  |
| displayobject-gl | — |  |  |
| displayobject-wgpu | — |  |  |
| scene-gl | — |  |  |
| scene-wgpu | — |  |  |

## Filters / effects

| Package         | State | Last visited | Note |
| --------------- | ----- | ------------ | ---- |
| filters         | —     |              |      |
| filters-canvas  | —     |              |      |
| filters-css     | —     |              |      |
| filters-gl      | —     |              |      |
| filters-math    | —     |              |      |
| filters-surface | —     |              |      |
| filters-wgpu    | —     |              |      |
| effects         | —     |              |      |
| effects-canvas  | —     |              |      |
| effects-gl      | —     |              |      |
| effects-wgpu    | —     |              |      |

## Resources

| Package              | State | Last visited | Note                                      |
| -------------------- | ----- | ------------ | ----------------------------------------- |
| image                | —     |              |                                           |
| font                 | —     |              |                                           |
| video                | —     |              |                                           |
| audio                | —     |              |                                           |
| textureatlas         | —     |              |                                           |
| textureatlas-formats | —     |              |                                           |
| tileset              | —     |              |                                           |
| loader               | —     |              |                                           |
| scene-formats        | —     |              |                                           |
| spritesheet-formats  | —     |              |                                           |
| particles-formats    | —     |              |                                           |
| surface              | —     |              |                                           |
| surface-rs           | —     |              |                                           |
| resource-formats     | —     |              | Redirect verdict → `textureatlas-formats` |

## Animation / simulation

| Package     | State | Last visited | Note |
| ----------- | ----- | ------------ | ---- |
| spritesheet | —     |              |      |
| particles   | —     |              |      |
| timeline    | —     |              |      |
| tween       | —     |              |      |
| easing      | —     |              |      |
| velocity    | —     |              |      |
| path        | —     |              |      |

## Input / text

| Package           | State | Last visited | Note |
| ----------------- | ----- | ------------ | ---- |
| input             | —     |              |      |
| textinput         | —     |              |      |
| textlayout        | —     |              |      |
| textshaper        | —     |              |      |
| textshaper-canvas | —     |              |      |

## Application

| Package     | State | Last visited | Note |
| ----------- | ----- | ------------ | ---- |
| application | —     |              |      |
| log         | —     |              |      |
| media       | —     |              |      |
| sdk         | —     |              |      |

## Platform integration suite

| Package      | State | Last visited | Note |
| ------------ | ----- | ------------ | ---- |
| platform     | —     |              |      |
| screen       | —     |              |      |
| device       | —     |              |      |
| storage      | —     |              |      |
| network      | —     |              |      |
| power        | —     |              |      |
| lifecycle    | —     |              |      |
| keyboard     | —     |              |      |
| sensors      | —     |              |      |
| clipboard    | —     |              |      |
| dialog       | —     |              |      |
| filesystem   | —     |              |      |
| notification | —     |              |      |
| shell        | —     |              |      |
| menu         | —     |              |      |
| tray         | —     |              |      |
| shortcut     | —     |              |      |
| share        | —     |              |      |
| haptics      | —     |              |      |
| geolocation  | —     |              |      |
| webcam       | —     |              |      |
| statusbar    | —     |              |      |
| useragent    | —     |              |      |

## App / process

| Package  | State | Last visited | Note |
| -------- | ----- | ------------ | ---- |
| app      | —     |              |      |
| protocol | —     |              |      |
| updater  | —     |              |      |
| ipc      | —     |              |      |

## Host backends

| Package       | State | Last visited | Note |
| ------------- | ----- | ------------ | ---- |
| host-electron | —     |              |      |

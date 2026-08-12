---
package: '@flighthq/scene2d-formats'
updated: 2026-08-08
by: principal
---

# scene2d-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/scene2d-formats/src/` (and `packages/types/src/`) on
2026-08-08, Rive again on 2026-08-09. Each claim is about this tree, not a session. Prefer a SYMBOL
NAME over a line number: a line is invalidated by any edit above it, and the one here rotted twice in
a day — both times by the same author's later commits, silently, with nothing to catch it.

- **Rive skins are read but never wired.** `createRiveSkin2D` (`riveSkin.ts:39`) is exported through
  `contract.ts:7` and has **zero callers** anywhere in `packages/`. `createRiveScene2D` builds the rig
  (`riveScene2D.ts:132`) but no imported path is deformed by it.
- **Rive animation reads only `KeyFrameDouble` and `KeyFrameColor`** (`riveAnimation.ts`, the
  `RIVE_KEYFRAME_*` constants). `Bool` / `Id` / `String` / `Uint` are registered unread; each drops its
  channel behind `rive.keyframe-kind-unsupported`.
- **Rive constraints/IK, data binding, and feather are type-registry entries only** —
  `riveCoreTypes.ts:116-122`, `:227`, `:294`; no importer touches them. They are runtime *systems*,
  so scope is a ruling before it is effort.
- **Rive `Mesh` / vertex art is unimported.** `MeshVertex` is registered (`riveCoreTypes.ts:143`);
  a mesh path falls to the `rive.path-kind-unsupported` crumb (`riveShapePath.ts:45`).
- **Rive layout covers flex/grid/stack but no box model.** `riveLayout.ts` reads no margin, absolute
  offset, percentage, min/max, or wrapped-line packing field, and does not refresh a bound descriptor.
- **Lottie track mattes are typed and silently dropped.** `tt` / `td` / `tp`
  (`packages/types/src/LottieDocument.ts:356-359`) have no reader in `lottieDocument.ts`.
  `CompositeEffect` supplies Porter-Duff operators but no source/target isolation attachment, so this
  cannot be lowered by picking an operator.
- **Lottie shape-style `bm` and radial highlight `a`/`h` are typed and unread** —
  `LottieDocument.ts:150`, `:169`, `:193` and `:198-199`.
- **Lottie's render stack is not implemented.** `renderLottieShapeState`
  restates every local path for every local paint in file order; styles should scope over *preceding*
  shapes (including nested groups) and repeated styles render in reverse. Needs a scoped stack, not
  another field — the constraint is stated at `lottieDocument.ts:1304`.
- **Animated dash is a declared exclusion**, crumbed at `lottieDocument.ts:800`.
- **SVG exclusions are live**: `filter`, `pattern`, `foreignObject`, `script`, and the
  `animate*`/`set` family (`svgDocument.ts:1568`); soft/luminance masks recover as a hard clip
  (`:319`); a later `tspan` with its own position flattens (`:835`).
## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two headline gaps checked out **false**:
  the blend-mode shortfall ("Rive states sixteen, Flight carries six; 93 of 144 non-default uses have
  nowhere to land") is gone — all sixteen map, five fixed plus eleven advanced, at
  `riveScene2D.ts:356-377` — and the rigging gap ("Flight lacks a weighted vector path") is closed by
  `riveSkin.ts` / `riveSkeleton.ts`, though the skin is still unwired above. Variable-font axes
  (`riveText.ts:133`) and Rive rich text (`riveText.ts:35`) also landed and were dropped.
- **2026-08-06** — Lottie position `to`/`ti` lower onto `AnimationTrack` Hermite values with an
  arc-length lookup; layer `ao` gets a format-owned auto-orientation playback target.
- **2026-08-06** — Second Lottie/SVG schema-to-consumer pass: layer `hd`, direction `d`, gradient
  winding `r`, and animatable `ml2` gained consumers; SVG `fill="none"`, `display`, visibility
  override, and nested `tspan` opacity repaired.
- **2026-08-05** — Documentation pins must be checked with `git merge-base --is-ancestor`, not
  `git cat-file -e`; pre-rebase local SHAs are not durable Flight identities.
- **2026-08-05** — Silent-drop sweep across the Lottie typed boundary and every SVG parse/style path:
  nested group names, solid-stroke dash data, HSL/HSLA, `currentColor`, gradient-stroke line fields.
- **2026-08-04** — Lottie gradient opacity stops and SVG `preserveAspectRatio` on images repaired;
  both were silent drops inside stated coverage.
- **2026-08-04** — Rive colour tracks carry four ARGB components (`KeyFrameColor` stores at property
  88, not the generic 70); mutable-content composition proved end to end.
- **2026-08-04** — Rive artboard import returns `RiveLayoutImport` descriptors (`riveLayout.ts`); the
  caller owns measurement and resolution.
- **2026-08-03** — Rive `Solo` shows one child (`riveSolo.ts`); draw rules import onto `NodeOrderList`
  (`riveDrawOrder.ts`); the "83 of 96 cross a parent" figure was measured in the component tree, and
  the display tree gives 33 honored / 13 cross-parent / 15 unresolved.
- **2026-08-03** — SVG internal DTD entities fixed in `@flighthq/xml` as a source-level pre-pass with
  an expansion budget; external and parameter entities deliberately unsupported.
- **2026-08-03** — SVG `inherit` was resolving to no paint and deleting the element's geometry; fixed
  at the single `resolveSvgStyle` seam.

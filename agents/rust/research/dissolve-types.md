# Dissolving `@flighthq/types`: can every type live in its owning package?

Source: `refs/flight/packages` (TS, 162 implementation packages, 1024 type files in `types/src` with 3399 exported
names; the remaining files in `types/src` are tests, `index.ts`, and `contract.ts`).
Scripts are in the scratchpad next to this file:

- `dissolve.py`: per-declaration reference extraction and the ownership rules. Writes `dissolve_owners.json`.
- `graph.py` / `fas.py`: the naive graph, SCCs, and feedback edges. Write `fas.json`.
- `refine.py`: re-homes each rule-(b) type to its dominating user. Writes `refine.json`.
- `cyc2.py` / `sim.py`: the type-edge graph after fixes.
- `full.py`: the type edges plus the source-usage edges after fixes. Writes `final_full.json`. This is the final check.
- `fixes.json`: every proposed fix in machine-readable form, the input to `sim.py` and `full.py`.

**Verdict: feasible.** Starting state: under the naive "owner = uses it most" rule, 72 packages fall into cycles. The
largest strongly connected component (SCC) has 67 packages. After **90 fix entries** the package graph is acyclic.
That includes the extra edges from package source files importing types, which the brief did not ask for but which
are needed. About 85% of the fixes are pure moves (types or modules) and change no public shape. The remaining
fixes change public fields, about 17 of them, almost all runtime/registry-tier fields:
- 13 fields become erased slots.
- 3 fields move to backend state.
- 1 field is removed (with an inversion).

---

## 1. Ownership assignment

The rules were applied in this order, per file, using the primary export:
- (a) a package with the same name, a source file with the same name, or an export of `create|initialize|allocate<Name>`;
- (b) otherwise the package whose non-test source imports the file's names most, with ties going to the lowest DAG level;
- (c) otherwise the owner of the type files that reference it;
- (d) otherwise a package-name prefix of the type name.

| Rule | Files |
|---|---|
| a: package name (Node→node, Texture→texture, Host→host, Entity→entity, Path→path, Scene2D→scene2d) | 80 |
| a: same-named source file (Signal→signals/signal.ts, RenderState→render, GlRenderState→render-gl, Vector2→geometry, ColorScaleBias→materials, ClipRegion→clip, Mesh→mesh*, HasTransform2D→node) | 306 |
| a: create/initialize/allocate (Node2D→scene2d, Node3D→scene3d, Camera3D→camera, NodeSignals→node, InteractionSignals→interaction) | 79 |
| b: most-used-by | 488 |
| c: owner of referencing type | 28 |
| d: name prefix (Scene2DAlign→scene2d, TextureKind→texture, RenderDrawContext→render, …) | 22 |
| **orphan**: no consumer, no referrer, no prefix | 21 |

\* `Mesh` is assigned to mesh by its source file, but `Mesh extends Node3D`, so it has to move (see section 3).

Checks:
- For every rule-(a) file, the chosen package actually uses the type. Zero mismatches.
- 25 exported names have their own rule-(a) owner that differs from their file's owner. These are file-split candidates:
  - `Collision.ts`: the Collision*2D shapes → physics2d and the Collision*3D shapes → physics3d.
  - `Host.ts`: the `Web*Capabilities` → host-web.
  - `GlRenderState.ts`: `GlColorAdjustmentMaterialFeature` → scene2d-gl.
  - `AudioResource.ts`: `AudioChannel` → media.
  - and others like these.

**Orphans (21).** Nothing in non-test source and no type file uses these, so they are likely dead or reserved:
- `BackendExplanation`, `BatchBarrier`, `CanvasEffectSupport`, `CdlValues`, `Group`, `LodMesh`, `MouseButton`, `PlayMode`.
- The Gl* family: `GlCapabilities`, `GlContextLoss`, `GlCullFaceKind`, `GlDepthFuncKind`, `GlFramebufferStatusKind`,
  `GlRenderStats`, `GlTextureDescriptor`, `GlTextureFilterKind`, `GlTextureWrapKind`. Obvious home: render-gl.
- Particles: `CurlNoiseForce`, `PointGravityWellForce`, `ParticleBurstSchedule`, `ParticleFormatWarning`. Home: particles.

Placing them creates no edges. Separately, one prefix-rule result is wrong: `AppearanceFlags` → app. It belongs in node.

**Rule (b) is the weak point.** "Uses it most" often picks the heaviest consumer, which is usually a high-level
backend. Examples:
- `BlendMode` → scene3d-wgpu
- `GlContext` → scene3d-gl
- `RendererData` → scene2d-dom
- `TextureSourceKind` → render-gl
- `KeyboardEventData` → gui
- `Light` → scene3d-formats
- `RequirementFacet` → scene3d-formats

These misassignments cause most of the naive cycles. A better rule is the **dominator rule**: own the type in the
lowest user that every other user (and every referencing type's owner) already depends on.
- 58 files are re-homed this way (Appendix B).
- 84 files have no dominator and are genuinely **ambiguous shared vocabulary** (Appendix C). Main groups:
  - the ~30 `Host*` capability files used by host + host-web + a feature package;
  - BlendMode, TextureSource/TextureSourceKind, GlContext, NonEntityCreateResult, RequirementFacet, ShapeCommand;
  - input and pointer payloads, StrokeStyle/PathMesh, ResourceResolutionState.

## 2. Required dependencies and SCCs

Required dependencies = function-level dependencies ∪ {owner(T) → owner(U) for each reference from declaration T
to U}. References were extracted per declaration and include `extends`, fields, signatures, and aliases.

| Stage | Type edges | Cross-package pairs | SCCs |
|---|---|---|---|
| Naive rules (a)–(d) | 1841 | 596 (228 not already implied by function deps) | **67** {adjustments, animation, app, audio, bitmap, clip, dialog, effects(+canvas/gl/wgpu), filesystem, font, glyphatlas, gui, host, host-electron, host-web, image, input, interaction, lighting, materials, media, menu, mesh, node, path(+boolean/formats), power, render(+gl/wgpu), requirement, scene-document, scene2d(+canvas/dom/formats/gl/resources/wgpu), scene3d(+formats/gl/resources/wgpu), screen, shading, shape(+formats), skeleton2d(+formats), skeleton3d, surface, text, textinput, textlayout, textshaper, texture, textureatlas, tilemap, tokens, tray, velocity, video}; **3** {movieclip, swf, timeline}; **3** {particleemitter, particles, particles-formats}; **2** {capture, tool-capture} |
| After dominator re-homing | 1804 | 580 | **57** (same core, minus the animation/skeleton2d/timeline/particles/capture clusters); **2** {scene2d-formats, scene2d-resources} |
| After the type-reference fixes (Appendix A, type part) | 1725 | 529 | **0** |
| Adding source-usage edges (package P imports type U → P → owner(U)): 842 pairs, 231 not otherwise present | — | 915 | before the usage fixes: **54 + 3 + 2** {geometry, math}; after: **0** |

Feedback edges in the naive graph: 76 package pairs / 208 references.
- 47 are back-edges against the function DAG.
- 29 are new edges that close loops among the new type edges.

After dominator re-homing: 60 pairs / 128 references.

**Important extra finding (beyond the brief).** Removing type-to-type cycles is not enough. Today every package
imports *types* from `@flighthq/types`, so the function DAG never sees type-only dependencies. Once types live in
their owners, those imports become real package edges. 231 of them are new, and 31 of those point backwards. Examples:
- `texture/src/videoTexture.ts` uses `VideoResource`.
- `texture/src/renderTexture.ts` uses `RenderTarget`.
- `math/src/randomDistributions.ts` uses `Vector2Like`.
- `mesh/src/updateMeshMorph.ts` uses `Mesh`.
- `textlayout/src/richTextContent.ts` uses `RichTextData`.

These are fixed by moving modules (class MODULE below) or with a few more type relocations.

## 3. Cycle-closing references and fixes

Totals: 61 RELOCATE, 7 SLOT, 2 BACKEND, 4 INVERT, 16 MODULE. The full list is in Appendix A; the key items are below.

### (i) RELOCATE: no shape change, import path only (61 entries, 38 whole files + 23 single names, 107 names)

- **Wrong-layer vocabulary:**
  - `BlendMode` → materials (`Material3D.ts:29`, `HasBlendMode.ts:9`, `RenderState.ts:37`).
  - `RendererData` → node (`RenderProxy.ts:41`, `SpriteIdentityRendererData.ts:4`).
  - `GlContext` → render-gl (13 references, e.g. `GlRenderState.ts:34`).
  - `Scene3DLightBlock` → lighting (`Scene3DRenderList.ts:22`, `GlMeshMaterialRenderer.ts:33`).
  - `Scene3DRenderProxy` → render.
  - `TintMaterialData` → materials (`GlRenderState.ts:114`).
  - `ImageChannel` → bitmap (`BitmapDisplacementEffect.ts:18`).
  - `RequirementFacet` → requirement (`Requirement.ts:8`).
  - `ResourceResolutionState` → entity (`ImageResourceReference.ts:59`).
  - `NonEntityCreateResult` → entity (27 user packages).
- **Plug-in interfaces move to the consumer that holds the registry** (dependency inversion by relocation):
  - `GlEffectRegistration`/`GlEffectRunner` → render-gl (`GlRenderState.ts:55`).
  - `WgpuEffectRegistration` → render-wgpu.
  - `GlScene3DPass` → render-gl (`GlRenderState.ts:56`).
  - `WgpuScene3DPass` → render-wgpu.
  - `CanvasEffectRunner`/`CanvasRenderTargetPool` → scene2d-canvas (`CanvasRenderState.ts:38`).
  - `CanvasRenderTarget.ts` → scene2d-canvas (`CanvasRenderPass.ts:18`).
- **Kind constants split to sit beside their types.** `TextureSourceKind.ts` splits:
  - the type → texture;
  - Bitmap*Kind → bitmap;
  - Image*/CompressedImage*Kind → image;
  - RenderTarget*/External*Kind → render.

  `AlphaType` and `PixelFormat` → texture.
- **Event payloads move to the signal owner:**
  - `KeyboardEventData` and `PointerEventData` → interaction (`InteractionSignals.ts:8,13`).
  - `PointerType`, `InputKeyboardData`, `InputTextData`, `MouseWheelMode`, `KeyCode` → input.
  - `Cursor.ts` → interaction (`NodeInteractionState.ts:35`).
- **Capability groups beside their members:**
  - `HostPowerCapabilities` → power (`Power.ts:125-134` uses `Pick<HostPowerCapabilities,…>`).
  - `HostMenuCapabilities` → menu (`Menu.ts:78-80`).
  - `HostImageDecode`/`ImageDecodeOptions` → image-codec.
  - `HostAudioDevice` and the audio handles → media.
  - `HostMidiPermissionCapability`, `HostPreferencesPersistence*Capability`, `StoragePersistenceOutcome` → permissions.
- **Other:**
  - `PathWinding` → path (`Path.ts:27`; it is declared in `ShapeCommand.ts`).
  - `Mesh.ts` → scene3d (`Mesh.ts:26 Mesh extends Node3D`).
  - `Skin` → skeleton3d.
  - `HasClip` → clip.
  - `TextFormat` + `TextMeasureFunction` → textshaper (`TextShaper.ts:34,45`; textshaper's own `textShaperCache.ts:53` consumes TextFormat).
  - `RenderTexture` and `CreateRenderTextureOptions` → render.
  - `HostCanvas` → surface.
  - `HostGl`/`GlSurface` → render-gl; `WgpuSurface` → render-wgpu.
  - `Node3DVisitor` → scene3d; `Node2DInteractionSignals` → interaction.
  - `Scene2DSlotReference` → scene2d.
  - `EffectPadding` → render (consumed by `render/src/renderTarget.ts:35`).
  - `RenderTargetColorSpace` → texture.

### (ii) SLOT: lower-level object holds higher-level plug-in state (7 entries, 13 fields)

Each field below is replaced by an erased keyed slot plus an accessor in the higher package. The existing pattern
for this is `registerNodeRenderer` / `getGlRenderStateRuntime`.

| Field(s) | Plug-in owner |
|---|---|
| `NodeRuntime.interactionSignals` and `NodeRuntime.interactionState` (`Node.ts:33,43`) | interaction |
| `Mesh.skin` (`Mesh.ts:30`) | skeleton3d |
| `GlRenderRegistries.colorAdjustmentFeature/Guard` (`GlRenderState.ts:42,45`) and `GlRenderStateOptions` (`:24,25`) | scene2d-gl |
| The same four fields on Wgpu (`WgpuRenderState.ts:59,62`, options `:19,20`) | scene2d-wgpu |
| `RenderRegistries.effectPaddingResolvers` (`RenderState.ts:52`, `RenderStateOptions.ts:17`) | effects |

### (iii) BACKEND: generic state holding backend-specific state (2 entries)

- `RenderState.canvasHost` (`RenderState.ts:34`), `RenderRegistries.canvasShapeCommands` (`:45`), and
  `RenderStateOptions.canvasShapeCommands` (`:14`) move to `CanvasRenderState` / `CanvasRenderStateOptions`. These are
  3 public field moves.
- `GlAppRenderView`, `GlAppRenderViewOptions`, and `GlRenderViewResources` (`AppRenderView.ts:30-44`) move from app
  to render-gl. This is an import-path change only.

### (iv) INVERT / OTHER (4 INVERT + 16 MODULE)

**INVERT:**
- **Texture ↔ image.** The cycle: `ImageResource extends TextureSource`, `ImageResourceReference.textures: Texture[]`,
  and also `CreateTextureOptions.resource` (`CreateTextureOptions.ts:10`) plus `texture.ts:485 attachTextureToResource`.
  Texture must sit below image, so resource attachment moves to image (e.g. `createTextureFromImageResource`). This
  is **1 public field removed**.
- **interaction ↔ scene-document.** `NodeInteractiveStateBinding.ts` and `interaction/src/nodeInteractiveStateBinding.ts`
  consume `FlightDocumentFields`. The binding moves to scene-document, so interaction stays document-agnostic.
- **scene2d → shape.** `scene2d/src/sceneKindUsage.ts` scans `ShapeCommandToken`. Shape should register that scan
  instead (a small hook).

**MODULE moves** (function code moves; import path only):

| Module | From → to |
|---|---|
| `appRenderView.ts` | app → render |
| `attachWindowRenderContext` | app → render-gl |
| `attachWindowRenderState` | app → surface |
| vector variants in `randomDistributions.ts` | math → geometry |
| `bitmapFrom.ts captureBitmapFromImageResource` | bitmap → image |
| `updateMeshMorph.ts` (the file notes it "lives here, not in scene3d") | mesh → scene3d, or narrow the parameter |
| `hasClip.ts` | node → clip |
| emitter variants of particle forces/collisions | particles → particleemitter |
| `imageSurface.ts` | render → surface |
| skin code in `mesh.ts` / `sceneDocument.ts` | scene3d → skeleton3d |
| `glSurface.ts` / `wgpuSurface.ts` | surface → render-gl / render-wgpu |
| `richTextContent.ts`, `richTextMetrics.ts`, `textLayoutRuntime.ts` | textlayout → text |
| `videoTexture.ts` | texture → video |
| `renderTexture.ts` | texture → render |
| `createSpriteRendererData` | scene2d `sprite.ts` → render |

## 4. Hub deep-dive

**Node / NodeRuntime / Node2D / Node3D**
- Owners: `Node`/`NodeRuntime` → node (L4 → L7 after the dissolve); `Node2D` → scene2d; `Node3D` → scene3d.
- Upward references: `NodeRuntime.interactionSignals: InteractionSignals` (`Node.ts:33`) and
  `interactionState: NodeInteractionState` (`Node.ts:43`). Both point to interaction (L7), which depends on node, so
  they are true back-edges. Fix: **SLOT**.
- `NodeRuntime extends EntityRuntime, ColorAdjustmentRuntime` (`Node.ts:23`) is **not** a cycle:
  - ColorAdjustmentRuntime's references (Adjustment, ColorScaleBias) are owned by adjustments and materials, which
    node already depends on.
  - Its natural home is adjustments, and putting it there is also acyclic.
  - Converting it to a slot is optional hygiene, not required.
- `Node2D` and `Node3D` reference only node traits, plus `HasClip` for Node2D (which moves to clip).
- `Node3DVisitor` (orphaned into node) moves to scene3d. `Mesh extends Node3D` forces `Mesh` into scene3d.

**Texture**
- `Texture.ts` references only Entity, so `Texture` sits cleanly in texture.
- The friction is the `TextureSource` family:
  - Bitmap, ImageResource, RenderTarget, and VoxelGrid all `extends TextureSource`.
  - `TextureSource.kind: TextureSourceKind` (`TextureSource.ts:39`) and its `AlphaType` come from files whose
    usage-owners were render-gl and bitmap.
- Fix:
  - TextureSource, TextureSourceKind, AlphaType, and PixelFormat go to texture.
  - The per-kind constants go to their owners.
  - Texture → image is cut with INVERT (`CreateTextureOptions.ts:10`).
  - `videoTexture.ts` and `renderTexture.ts` move out (MODULE).
- Result: texture stays at L4. bitmap (L6), image (L7), video, and render all sit above it.

**Host / capabilities**
- `Host.ts` has 50 exports, including 48 `Host*Capabilities` group types, and references 185 capability types owned
  by 47 packages:
  - app, dialog, audio, clipboard, power, menu, tray, notification, screen, …
  - also surface (HostCanvas), render-gl (HostGl), render-wgpu (HostWgpu), textshaper, glyphatlas, image-codec.
- Only host-* adapters and sdk depend on host, so a host aggregate above all of them is acyclic. host rises from L3
  to **L15**.
- The only real cycles involved:
  - **Group types** used by feature packages (`Power.ts:125-134`, `Menu.ts:78-80`). Fix: RELOCATE each group to its
    feature package. Recommended for all 48, for consistency.
  - **Capabilities whose usage-owner was host-web** (`Host.ts:239` HostImageDecodeCapabilities, `:306`
    HostAudioDeviceCapability). Fix: RELOCATE to image-codec and media.

**RenderState**
- Owner: render.
- Upward or misplaced references:
  - `displayObjectClipHooks: Scene2DClipHooks` (`:32`). Settles in render after re-homing.
  - `canvasHost` (`:34`), `canvasShapeCommands` (`:45`). Fix: **BACKEND**.
  - `imageHost: HostImageCapability` (`:35`). Fine: render → image.
  - `renderBlendMode: BlendMode` (`:37`). Fix: RELOCATE BlendMode to materials.
  - `effectPaddingResolvers` (`:52`). Fix: **SLOT**.
  - `strokeTessellator: StrokeTessellator` (`:61`, Path). Acyclic once Path is in path; optional BACKEND hygiene.
- Note: render's types reference `Node2D` (`RenderProxy2D.ts:17`, `Scene2DRenderer.ts:8`), so render ends up above
  scene2d (render L11, scene2d L9).

**Entity**
- entity, L0. Types `Entity`, `EntityRuntime`, `EntityRuntimeKey`, and `Kind` reference nothing. It also gains
  `NonEntityCreateResult` and `ResourceResolutionState`.

**Signal**
- signals, L1. It references only Entity, so no issues.

## 5. After the fixes: zero cycles, resulting levels

`full.py` uses function deps + type references + source-usage edges, with all 90 fixes applied: **0 SCCs**. Max
depth goes from 10 to **21**. Key packages, old level → new level:

| Package | Was | Now | Longest chain (why it rose) |
|---|---|---|---|
| entity | 0 | 0 | — |
| math | 0 | 0 | — |
| color | 0 | 0 | — |
| signals | 1 | 1 | — |
| geometry | 3 | 3 | — |
| path | 1 | 4 | Path uses `RectangleLike` → geometry |
| texture | 4 | 4 | — |
| materials | 3 | 5 | `AnisotropyPbrExtension.ts:7` references Texture |
| node | 4 | 7 | → adjustments → materials → texture |
| scene3d | 5 | 8 | `Scene3D.ts:22` references ImageResourceReference → image |
| scene2d | 5 | 9 | Node2D → HasClip (clip) → node |
| render | 5 | 11 | `ShapeRasterizer.ts:17` → shape → scene2d |
| effects | 6 | 12 | → render |
| render-gl | 6 | 13 | `GlEffectRunner` → Effect (effects) |
| interaction | 7 | 13 | → scene-document → shape-formats |
| host | 3 | 15 | aggregate over render-wgpu, render-gl, … |

Optional extra: moving `ColorScaleBias` to color (L0) cuts the bitmap → materials → texture chain. That reduces max
depth to 20.

## 6. Verdict

**Feasible.** Size of the change:
- 61 type/name relocations (107 names, import path only).
- 16 module moves (~20 source files, import path only).
- 7 SLOT changes (13 fields).
- 2 BACKEND changes (3 fields moved; 3 type names re-homed).
- 4 INVERT changes (1 field removed, 1 binding module moved, 1 registration hook, and the matching usage drop).

**TS public shape changes: ~17 fields.** Nearly all are runtime or registry tier:
- `NodeRuntime` ×2
- `Mesh.skin`
- Gl/Wgpu render registries and options ×8
- `RenderRegistries` and options ×2 (SLOT) plus ×3 (BACKEND)
- `CreateTextureOptions.resource`

Everything else is a path change, which happens anyway once types are dissolved. 84 ambiguous shared types still
need a deliberate owner decision. The dominator rule plus Appendix A covers the ones that matter for cycles; the
rest are acyclic wherever they are put among their users' common dependencies.

**Places where "no surprises" is compromised:**
1. `Mesh` lives in **scene3d**, not mesh, because `Mesh extends Node3D` and the mesh package is really
   MeshGeometry. Its functions are already in `scene3d/src/mesh.ts`. Alternative: rename the mesh package to `mesh-geometry`.
2. `TextFormat` lives in **textshaper**, not text/textlayout, because textshaper consumes it.
3. `BlendMode` lives in **materials**. Readers will look for it in render. An alternative is color.
4. `RendererData` (marker) lives in **node**; `Viewport` lives in node (usage-owner).
5. `ResourceResolutionState` and `NonEntityCreateResult` live in **entity**, as generic vocabulary with no natural owner.
6. `KeyCode`, `PointerType`, and `Input*Data` live in **input**. `Keyboard/PointerEventData` live in interaction, not gui.
7. `AlphaType`/`PixelFormat` live in texture even though Bitmap uses them. Cause: `Bitmap extends TextureSource`
   forces bitmap above texture.
8. Plug-in interfaces live in the *consumer*, which is the inversion principle but can surprise readers:
   - `GlEffectRegistration` in render-gl, not effects-gl;
   - `CanvasEffectRunner` in scene2d-canvas;
   - `GlScene3DPass` in render-gl.
9. host becomes a high aggregate (L15) that depends on render-gl, render-wgpu, surface, and textshaper. That is
   expected for a capability bag, but it is a 47-package fan-out.
10. The DAG gets deeper (10 → 21), which lengthens serial crate build chains in Rust.

Most of these follow one consistent rule: *a type lives with the lowest package that must name it*. Stated up
front, that rule makes them predictable. Mesh-in-scene3d is the one that is likely to surprise readers.

## Appendix A — Full fix list (`fixes.json`, simulated by `full.py`)

### RELOCATE (61 entries)

| What | To | Evidence / reason |
|---|---|---|
| file `ImageChannel.ts` (2 exports) | bitmap | pixel-channel enum; lowest common home of effects/effects-gl/effects-wgpu/interaction users |
| file `CanvasRenderTarget.ts` (4 exports) | scene2d-canvas | render targets are canvas-backend state, consumed by CanvasRenderState/CanvasRenderPass |
| `CanvasEffectState.ts: CanvasEffectRunner`, `CanvasEffectState.ts: CanvasEffectContext`, `CanvasEffectState.ts: CanvasRenderTargetPool` | scene2d-canvas | plugin interface owned by the consumer (CanvasRenderRegistries.effects) |
| file `GlContext.ts` (2 exports) | render-gl | WebGL context shape; render-gl is the lowest GL package |
| file `GlSurface.ts` (1 exports) | render-gl | GL surface binding |
| file `HostGl.ts` (1 exports) | render-gl | HostGlCapability returns GlContext |
| file `WgpuSurface.ts` (1 exports) | render-wgpu | wgpu surface binding |
| file `Scene3DLightBlock.ts` (13 exports) | lighting | packed light data; lowest common home for render/render-gl/render-wgpu/scene3d-* |
| file `Scene3DRenderProxy.ts` (1 exports) | render | render proxy family lives in render |
| `GlScene3DRuntime.ts: GlScene3DPass` | render-gl | plugin interface owned by consumer (GlRenderRegistries.passes) |
| `WgpuScene3DRuntime.ts: WgpuScene3DPass` | render-wgpu | plugin interface owned by consumer |
| `GlEffectState.ts: GlEffectRegistration`, `GlEffectState.ts: GlEffectRunner`, `GlEffectState.ts: GlEffectResolver`, `GlEffectState.ts: GlEffectContext` | render-gl | plugin interface owned by consumer (GlRenderRegistries.effects) |
| `WgpuEffectState.ts: WgpuEffectRegistration`, `WgpuEffectState.ts: WgpuEffectRunner`, `WgpuEffectState.ts: WgpuEffectResolver`, `WgpuEffectState.ts: WgpuEffectContext` | render-wgpu | plugin interface owned by consumer |
| file `TintMaterialData.ts` (1 exports) | materials | MaterialData subtype; users quadbatch/tilemap/render-gl/render-wgpu/scene2d-gl/scene2d-wgpu |
| `GlRenderState.ts: GlColorAdjustmentMaterialFeature`, `GlRenderState.ts: GlColorAdjustmentMaterialFeatureGuard` | scene2d-gl | feature contract implemented by scene2d-gl; GlRenderState.colorAdjustmentFeature becomes erased slot |
| `WgpuRenderState.ts: WgpuColorAdjustmentMaterialFeature`, `WgpuRenderState.ts: WgpuColorAdjustmentMaterialFeatureGuard` | scene2d-wgpu | same as GL |
| file `BlendMode.ts` (2 exports) | materials | blend vocabulary used by Material3D, HasBlendMode (node), RenderProxy (render); materials is below all of them |
| file `RendererData.ts` (1 exports) | node | empty per-node renderer-data marker (extends Entity); node is the lowest package below render and scene2d |
| file `HostImageDecode.ts` (2 exports) | image-codec | decode capability; image-codec (L0) already owns HostImageEncode |
| file `HostAudioDevice.ts` (2 exports) | media | alongside HostAudioMixer |
| file `ResourceResolutionState.ts` (2 exports) | entity | 4-value lifecycle enum shared by audio/image/scene2d-resources/scene3d-resources with no common owner |
| file `KeyboardEventData.ts` (1 exports) | interaction | payload of InteractionSignals |
| file `PointerEventData.ts` (2 exports) | interaction | payload of InteractionSignals |
| `PointerEventData.ts: PointerType` | input | InputPointerData.pointerType |
| file `InputKeyboardData.ts` (1 exports) | input | payload of InputSignals |
| `ShapeCommand.ts: PathWinding` | path | Path.winding (Path.ts:27) |
| file `Mesh.ts` (4 exports) | scene3d | Mesh extends Node3D (Mesh.ts:26); scene-graph node, not geometry |
| file `Skin.ts` (1 exports) | skeleton3d | Skin references Skeleton3D |
| file `Node3DVisitor.ts` (1 exports) | scene3d | callback over Node3D |
| file `Node2DInteractionSignals.ts` (1 exports) | interaction | alias of InteractionSignals |
| `TextureSourceKind.ts: TextureSourceKind`, `TextureSourceKind.ts: VoxelGridTextureSourceKind` | texture | kind tag of TextureSource |
| `TextureSourceKind.ts: BitmapTextureSourceKind` | bitmap | kind constant beside Bitmap |
| `TextureSourceKind.ts: ImageTextureSourceKind`, `TextureSourceKind.ts: CompressedImageTextureSourceKind` | image | kind constants beside ImageResource/CompressedImageResource |
| `TextureSourceKind.ts: RenderTargetTextureSourceKind` | render | beside RenderTarget |
| `TextureSourceKind.ts: ExternalTextureSourceKind` | render | beside ExternalTexture |
| file `ExternalTexture.ts` (1 exports) | render | shared by render-gl/render-wgpu |
| file `AlphaType.ts` (1 exports) | texture | TextureSource.alphaType |
| file `PixelFormat.ts` (1 exports) | texture | shared by bitmap/texture |
| file `RenderTexture.ts` (1 exports) | render | RenderTexture.source: RenderTarget |
| file `CreateRenderTextureOptions.ts` (1 exports) | render | options of RenderTexture |
| file `RequirementFacet.ts` (2 exports) | requirement | Requirement.facet |
| file `TextFormat.ts` (3 exports) | textshaper | textshaper itself consumes TextFormat (textShaperCache.ts:53) |
| `TextLayout.ts: TextMeasureFunction` | textshaper | HostTextShaperCapability.measureText |
| file `HasClip.ts` (2 exports) | clip | trait holding ClipRegion; Node2D extends it from scene2d |
| `Host.ts: HostPowerCapabilities` | power | capability group beside its members |
| `Host.ts: HostMenuCapabilities` | menu | capability group beside its members |
| file `ShapeRasterizer.ts` (1 exports) | render | shared by render-gl/render-wgpu/scene2d-* |
| file `HostCanvas.ts` (1 exports) | surface | HostCanvasCapability over Surface/CanvasSurface (HostCanvas.ts); consumed by surface/src/canvasSurface.ts |
| file `ImageDecodeOptions.ts` (1 exports) | image-codec | options of HostImageDecodeFormatCapability |
| `Scene2DDocument.ts: Scene2DSlotReference` | scene2d | referenced by RiveDocument (scene2d-formats) and Scene2DDocument (scene2d-resources) |
| file `AudioDeviceHandle.ts` (3 exports) | media | handles consumed by HostAudioDevice/HostAudioMixer capabilities |
| file `InputTextData.ts` (1 exports) | input | payload of InputSignals/InputIngressSink |
| file `MouseWheelMode.ts` (1 exports) | input | InputPointerData.deltaMode |
| file `NonEntityCreateResult.ts` (1 exports) | entity | generic create-result helper used by 27 packages (owner by usage was host-web) |
| `Midi.ts: HostMidiPermissionCapability` | permissions | permissions/src/permission.ts consumes it; midi depends on permissions |
| `Storage.ts: HostPreferencesPersistenceQueryCapability`, `Storage.ts: HostPreferencesPersistenceRequestCapability` | permissions | consumed by permissions/src/permission.ts |
| `EffectPadding.ts: EffectPadding` | render | value type consumed by render/src/renderTarget.ts:35 |
| `RenderTarget.ts: RenderTargetColorSpace` | texture | consumed by texture/src/textureColorSpace.ts |
| `Storage.ts: StoragePersistenceOutcome` | permissions | consumed by permissions/src/permission.ts |
| file `Cursor.ts` (2 exports) | interaction | NodeInteractionState.cursor / InteractionManager.cursorBackend; owner-by-usage was host-web |
| file `KeyCode.ts` (2 exports) | input | key-code vocabulary shared by host-web/textinput |

### SLOT (7 entries)

| What | To | Evidence / reason |
|---|---|---|
| refs `GlRenderState.GlRenderRegistries->GlColorAdjustmentMaterialFeature`, `GlRenderState.GlRenderRegistries->GlColorAdjustmentMaterialFeatureGuard`, `GlRenderStateOptions.GlRenderStateOptions->GlColorAdjustmentMaterialFeature`, `GlRenderStateOptions.GlRenderStateOptions->GlColorAdjustmentMaterialFeatureGuard` | — | GlRenderRegistries.colorAdjustmentFeature/colorAdjustmentGuard (GlRenderState.ts:42,45) + GlRenderStateOptions (:24-25) -> erased slot + accessor in scene2d-gl |
| refs `WgpuRenderState.WgpuRenderRegistries->WgpuColorAdjustmentMaterialFeature`, `WgpuRenderState.WgpuRenderRegistries->WgpuColorAdjustmentMaterialFeatureGuard`, `WgpuRenderStateOptions.WgpuRenderStateOptions->WgpuColorAdjustmentMaterialFeature`, `WgpuRenderStateOptions.WgpuRenderStateOptions->WgpuColorAdjustmentMaterialFeatureGuard` | — | WgpuRenderRegistries.colorAdjustmentFeature/Guard (WgpuRenderState.ts:59,62) + options (:19-20) -> erased slot + accessor in scene2d-wgpu |
| refs `Mesh.Mesh->Skin` | — | Mesh.skin (Mesh.ts:30) is skeleton3d plug-in state on a scene3d node -> erased slot + getMeshSkin(mesh) in skeleton3d |
| refs `Node.NodeRuntime->InteractionSignals`, `Node.NodeRuntime->NodeInteractionState` | — | NodeRuntime.interactionSignals/interactionState (Node.ts:33,43) -> erased slots owned by interaction |
| refs `RenderState.RenderRegistries->EffectPaddingResolver`, `RenderStateOptions.RenderStateOptions->EffectPaddingResolver` | — | RenderRegistries.effectPaddingResolvers (RenderState.ts:52, RenderStateOptions.ts:17) -> effects-owned keyed slot on RenderState (registerEffectPaddingResolver/getEffectPaddingResolvers in effects) |
| `render-gl` src use of `GlColorAdjustmentMaterialFeature`, `GlColorAdjustmentMaterialFeatureGuard` | — | consequence of the colorAdjustmentFeature slot |
| `render-wgpu` src use of `WgpuColorAdjustmentMaterialFeature`, `WgpuColorAdjustmentMaterialFeatureGuard` | — | consequence of the colorAdjustmentFeature slot |

### BACKEND (2 entries)

| What | To | Evidence / reason |
|---|---|---|
| refs `RenderState.RenderState->HostCanvasCapability`, `RenderState.RenderRegistries->CanvasShapeCommand`, `RenderStateOptions.RenderStateOptions->CanvasShapeCommand` | — | RenderState.canvasHost (RenderState.ts:34), RenderRegistries.canvasShapeCommands (:45), RenderStateOptions.canvasShapeCommands (:14) -> CanvasRenderState / CanvasRenderStateOptions |
| `AppRenderView.ts: GlAppRenderView`, `AppRenderView.ts: GlAppRenderViewOptions`, `AppRenderView.ts: GlRenderViewResources` | render-gl | GL-specific app render view types (AppRenderView.ts:30-44) leave the generic app package for render-gl |

### INVERT (4 entries)

| What | To | Evidence / reason |
|---|---|---|
| refs `CreateTextureOptions.CreateTextureOptions->ImageResourceReference` | — | CreateTextureOptions.resource (CreateTextureOptions.ts:10) + texture.ts attachTextureToResource: texture sits below image (ImageResource extends TextureSource), so resource attachment moves to image (createTextureFromImageResource) |
| file `NodeInteractiveStateBinding.ts` (11 exports) | scene-document | interaction<->scene-document: the interactive-state binding (interaction/src/nodeInteractiveStateBinding.ts, types NodeInteractiveStateBinding.ts:37-42) consumes FlightDocumentFields; move the binding module + its types to scene-document (or a bridge package) so interaction stays document-agnostic |
| `scene2d` src use of `ShapeCommandToken` | scene2d/src/sceneKindUsage.ts shape-command scan -> registered by shape | shape depends on scene2d |
| `texture` src use of `ImageResourceReference` | — | same fix as CreateTextureOptions.resource (texture.ts:485 attachTextureToResource -> image) |

### MODULE (16 entries)

| What | To | Evidence / reason |
|---|---|---|
| file `AppRenderView.ts` (6 exports) | render | AppRenderView<State extends RenderState> (AppRenderView.ts:11-19) binds a RenderState to an AppWindow; with it in app, app->render->image->surface->app cycles — move: app/src/appRenderView.ts -> render |
| `math` src use of `Vector2Like`, `Vector3Like` | math/src/randomDistributions.ts vector variants -> geometry | math (L0) cannot see geometry types |
| `app` src use of `HostGlCapability` | app/src/appWindow.ts attachWindowRenderContext -> render-gl | GL context-loss wiring |
| `bitmap` src use of `ImageResource` | bitmap/src/bitmapFrom.ts captureBitmapFromImageResource -> image | image depends on bitmap |
| `mesh` src use of `Mesh` | mesh/src/updateMeshMorph.ts -> scene3d (or narrow param to MeshGeometry+weights) | Mesh is a scene3d node |
| `node` src use of `HasClip` | node/src/hasClip.ts -> clip | follows HasClip trait |
| `particles` src use of `ParticleEmitter2D` | particles/src/applyParticleForces.ts, applyParticleCollisions.ts emitter-taking variants -> particleemitter | particleemitter depends on particles |
| `render` src use of `HostCanvasCapability` | render/src/imageSurface.ts -> surface | canvas-surface helper |
| `scene3d` src use of `Skeleton3D`, `Skin` | skin handling in scene3d/src/mesh.ts + sceneDocument.ts -> skeleton3d | consequence of Mesh.skin slot; skeleton3d sits above scene3d (Skeleton3D references Node3D) |
| `surface` src use of `GlContextOptions`, `GlSurface`, `HostGlCapability`, `HostWgpuCapability`, `WgpuHostAcquisition`, `WgpuHostAcquisitionOptions`, `WgpuSurface` | surface/src/glSurface.ts -> render-gl, wgpuSurface.ts -> render-wgpu | backend surfaces follow their backend |
| `textlayout` src use of `RichTextData`, `RichTextRuntime`, `TextLabelRuntime` | textlayout/src/richTextContent.ts, richTextMetrics.ts, textLayoutRuntime.ts -> text | text depends on textlayout |
| `texture` src use of `HostImageSource`, `VideoResource`, `HostVideoCapability`, `ImageResource`, `ImageTextureSourceKind` | texture/src/videoTexture.ts -> video | video/image sources sit above texture |
| `texture` src use of `CreateRenderTextureOptions`, `RenderTarget`, `RenderTargetTextureSourceKind`, `RenderTexture` | texture/src/renderTexture.ts -> render | RenderTexture is a render type |
| `scene2d` src use of `RenderState` | scene2d/src/sprite.ts createSpriteRendererData/... -> render (renderer hook) | render types reference Node2D (RenderProxy2D.ts:17, Scene2DRenderer.ts:8) so render sits above scene2d |
| `app` src use of `RenderState`, `AppRenderView`, `AppRenderViewResize`, `RenderTargetDimensions`, `AppRenderViewTargetOptions` | (same move) app/src/appRenderView.ts -> render | usage side of the AppRenderView move |
| `app` src use of `HostSurfaceResizeCapability`, `Surface` | app/src/appWindow.ts attachWindowRenderState -> surface | surface sits above app (HostCanvasCapability.create takes an AppWindow, HostCanvas.ts:17) |

## Appendix B — Rule-(b) types re-homed to their dominating lowest user (automatic RELOCATE, 58 files)

| File | naive owner (most uses) | dominator owner |
|---|---|---|
| AnimationInterpolation | skeleton2d-formats | animation |
| Attachment2D | skeleton2d-formats | skeleton2d |
| AttachmentSkin2D | skeleton2d-formats | skeleton2d |
| BatchFormat | scene2d-gl | render |
| Bone2D | skeleton2d-formats | skeleton2d |
| CaptureBaselineProvenance | tool-capture | capture |
| FlightDocumentToken | tokens | scene-document |
| FontVariation | scene2d-formats | textshaper |
| FrameScript | swf | timeline |
| GlColorAdjustmentResources | scene2d-gl | render-gl |
| GlCustomMaterialShaderSource | scene3d-gl | render-gl |
| GlFullscreenProgram | effects-gl | render-gl |
| GlMeshMaterialRenderer | scene3d-gl | render-gl |
| GlModifierSnippet | scene3d-gl | render-gl |
| GlPbrExtensionBindContext | scene3d-gl | render-gl |
| GlPbrExtensionRegistration | scene3d-gl | render-gl |
| GlPbrExtensionShaderContext | scene3d-gl | render-gl |
| GlPbrExtensionShaderContribution | scene3d-gl | render-gl |
| GlQuadMaterialRenderer | scene2d-gl | render-gl |
| GlShapeMeshBinding | scene2d-gl | render-gl |
| GlVelocityWriter | scene2d-gl | render-gl |
| ImageDecodeOptions | host-web | image |
| ImportDiagnostic | scene3d-formats | importdiagnostics |
| Light | scene3d-formats | lighting |
| MeshAttachment2D | skeleton2d-formats | skeleton2d |
| MorphTarget | scene3d-formats | mesh |
| Node2DAnimationPath | scene2d-formats | scene2d |
| Node2DAnimationTarget | scene2d-formats | scene2d |
| PartialNode | scene2d | node |
| ParticleCurve | particles-formats | particles |
| ParticleEmitterCallbacks | particleemitter | particles |
| Scene2DRenderer | scene2d-gl | render |
| Scene3DAnimationPath | scene3d-formats | scene3d |
| Scene3DDocument | scene3d-formats | scene3d |
| ScreenChangeEvent | host-electron | screen |
| ScreenColorSpace | host-electron | screen |
| ScreenOrientation | host-electron | screen |
| Skeleton2DAnimationPath | skeleton2d-formats | skeleton2d |
| Skeleton2DDrawOrderTimeline | skeleton2d-formats | skeleton2d |
| Skin | scene3d | mesh |
| Slot2D | skeleton2d-formats | skeleton2d |
| TextAutoSize | text | textlayout |
| TextDirection | textlayout | textshaper |
| TextInputState | textinput | text |
| TextSelectionRectangle | scene2d-canvas | textlayout |
| TextVerticalAlign | text | textlayout |
| TimelineCue | swf | timeline |
| TimelineLabel | swf | timeline |
| TransformInherit2D | skeleton2d-formats | skeleton2d |
| WgpuCustomMaterialShaderSource | scene3d-wgpu | render-wgpu |
| WgpuMeshMaterialRenderer | scene3d-wgpu | render-wgpu |
| WgpuModifierSnippet | scene3d-wgpu | render-wgpu |
| WgpuParticleResources | scene2d-wgpu | render-wgpu |
| WgpuQuadBatchResources | scene2d-wgpu | render-wgpu |
| WgpuQuadMaterialRenderer | scene2d-wgpu | render-wgpu |
| WgpuSkinningAdapter | scene3d-wgpu | render-wgpu |
| WgpuVelocityWriter | scene2d-wgpu | render-wgpu |
| XmlElement | scene2d-formats | xml |

## Appendix C — Ambiguous shared types (no user dominates all others; 84 files)

Owner kept = most-use package unless a fix in Appendix A moved it. "common" = highest packages every user already depends on.

| File | users | common lower packages |
|---|---|---|
| Accelerator | host-electron, host-tauri, shortcut | signals, entity |
| AdvancedBlendMode | effects, effects-canvas, effects-gl, effects-wgpu, scene2d-canvas, scene2d-dom, scene2d-formats, swf | node, geometry, materials |
| AlphaType | bitmap, image, texture | entity |
| AudioDeviceHandle | host-web, media | log, signals, entity |
| BackendOperationExplanation | lifecycle, textshaper | signals, entity |
| BlendMode | materials, node, render, render-gl, render-wgpu, scene2d, scene2d-canvas, scene2d-dom, scene2d-formats, scene2d-gl, scene2d-wgpu, scene3d-gl, scene3d-wgpu, shading, swf | entity |
| CanvasRenderTarget | effects-canvas, scene2d-canvas, scene2d-dom, tool-capture | text, render, scene2d |
| ClipboardFormat | clipboard, host-web | signals, entity |
| CreateExternalTextureOptions | render-gl, render-wgpu | render, node, mesh |
| Cursor | host-web, interaction | text, scene2d, textlayout |
| DeviceFormFactor | device, host-capacitor, useragent | (none) |
| EasingFunction | animation, easing, scene2d-formats, scene3d-resources, skeleton2d-formats, tween | signals, entity |
| ExternalTexture | render-gl, render-wgpu | render, node, mesh |
| FlightDocumentFieldSchema | interaction, scene-document, tokens | scene2d, node, texture |
| FlightDocumentInteractiveState | interaction, scene-document | scene2d, node, texture |
| FlightDocumentSchemaRegistry | interaction, scene-document | scene2d, node, texture |
| GlContext | app, effects-gl, host-web, render-gl, scene2d-gl, scene3d-gl, surface | entity |
| GlRenderStateOptions | app, render-gl, scene2d-gl, scene3d-gl | signals, entity |
| HasColorScaleBias | particles, render-wgpu | geometry, log, signals |
| HostAppExit | app, host, host-web | signals, entity |
| HostAppLoop | app, host, host-web | signals, entity |
| HostAudioCodec | audio, host, host-web | log, signals, entity |
| HostAudioDecode | audio, host, host-capacitor, host-electron, host-tauri, host-web, scene2d-resources | log, signals, entity |
| HostAudioDevice | host, host-web, media | log, signals, entity |
| HostAudioMixer | host, host-web, media | log, signals, entity |
| HostBitmapEncode | bitmap, host, host-web | entity |
| HostBitmapReadback | bitmap, host, host-web, interaction | entity |
| HostCanvas | effects-canvas, host, host-web, render, render-gl, render-wgpu, scene2d-canvas, scene2d-dom, scene2d-gl, scene2d-wgpu, surface | entity |
| HostFileDialog | dialog, host, host-electron, host-tauri, host-web | entity |
| HostFontLoading | font, host, host-web | entity |
| HostFullscreen | app, host, host-web | signals, entity |
| HostGl | app, host, host-web, surface | entity |
| HostImageDecode | host, host-capacitor, host-electron, host-tauri, host-web, image, image-codec, scene2d-resources, scene3d-resources | (none) |
| HostImageEncode | host, host-capacitor, host-electron, host-tauri, host-web, image-codec | (none) |
| HostImageOpenDialog | dialog, host, host-web | entity |
| HostImageSource | bitmap, host-web, image, media, texture, video | entity |
| HostInput | app, host, host-web | signals, entity |
| HostInputIngress | host, host-web, input | signals, entity |
| HostInputTarget | app, host, host-web | signals, entity |
| HostMessageDialog | dialog, host, host-capacitor, host-electron, host-tauri, host-web | entity |
| HostPhotoCaptureDialog | dialog, host, host-web | entity |
| HostPromptDialog | dialog, host, host-capacitor, host-web | entity |
| HostSurface | app, host, host-web, surface | entity |
| HostVideo | host, host-web, media, texture, video | entity |
| HostVideoCaptureDialog | dialog, host, host-web | entity |
| ImageChannel | effects, effects-gl, effects-wgpu, interaction | node, geometry, materials |
| InputGamepadData | host-web, input | signals, entity |
| InputKeyboardData | gui, host-web, input, interaction, textinput | signals, entity |
| InputPointerData | host-web, input, interaction | signals, entity |
| InputTextData | host-web, input, textinput | signals, entity |
| KeyCode | host-web, textinput | text, scene2d, textlayout |
| KeyboardEventData | gui, interaction, textinput | text, scene2d, textlayout |
| Material3DOptions | materials, shading | entity |
| ModifierDefinition | render-gl, render-wgpu, shading | entity |
| MouseWheelMode | host-web, input | signals, entity |
| NonEntityCreateResult | bitmap, capture, command, device, effects-canvas, effects-gl, effects-wgpu, gizmo, host-web, materials, menu, particles, physics2d, physics3d, registry, requirement-catalog, scene2d-canvas, scene2d-formats, scene2d-resources, scene3d-resources, shading, shortcut, skeleton2d-formats, spring, text-markup, texture-formats, vite-plugin-manifest | (none) |
| PathMesh | path, render | entity, math |
| PixelFormat | bitmap, texture | entity |
| PointerEventData | gizmo, gui, input, interaction | signals, entity |
| PowerBatteryHealth | host-electron, power | signals, entity |
| RenderCacheRefreshOptions | scene2d-canvas, scene2d-gl, scene2d-wgpu | textinput, text, shape |
| RenderTargetClear | effects-canvas, effects-gl, effects-wgpu, render-gl, render-wgpu, scene2d-canvas | render, node, mesh |
| RendererData | render, scene2d, scene2d-canvas, scene2d-dom, scene2d-gl, scene2d-wgpu | node, geometry, materials |
| RequirementFacet | render, requirement, requirement-catalog, scene2d-canvas, scene2d-formats, scene2d-gl, scene3d-formats, scene3d-gl, scene3d-resources, scene3d-wgpu, skeleton2d-formats, swf, tool-manifest, vite-plugin-manifest | (none) |
| ResourceResolutionState | audio, image, scene2d-resources, scene3d-resources | entity |
| Scene3DForwardLightSelectionExplanation | scene3d-gl, scene3d-wgpu | textinput, text, shape |
| Scene3DLightBlock | lighting, render, render-gl, render-wgpu, scene3d-gl, scene3d-wgpu | geometry, log, signals |
| Scene3DRenderProxy | render-gl, render-wgpu, scene3d-gl, scene3d-wgpu | render, node, mesh |
| SceneCoverageCatalog | render, scene2d-canvas, scene2d-gl, scene3d-gl, scene3d-resources, scene3d-wgpu | node, mesh, camera |
| SceneCoverageEntry | render, scene2d-canvas, scene2d-gl, scene3d-gl, scene3d-resources, scene3d-wgpu | node, mesh, camera |
| ShapeCommand | clip, path, path-boolean, scene2d, scene2d-canvas, scene2d-dom, scene2d-formats, scene2d-gl, scene2d-wgpu, shape, shape-formats, skeleton2d, swf | entity, math |
| ShapeCommandSchema | scene-document, shape-formats | scene2d, node, texture |
| ShapeRasterizer | render-gl, render-wgpu, scene2d-canvas, scene2d-dom, scene2d-gl, scene2d-wgpu | render, node, mesh |
| ShareFile | host-web, share | signals, entity |
| SpriteRenderer | scene2d-canvas, scene2d-gl, scene2d-wgpu | textinput, text, shape |
| StrokeStyle | path, render, shape | entity, math |
| TextureContainer | image, render-gl, render-wgpu, texture-formats | (none) |
| TextureContainerFormat | render-gl, render-wgpu, texture-formats | (none) |
| TextureResolutionExplanation | render-gl, render-wgpu, scene2d-canvas, scene2d-dom | render, node, mesh |
| TextureSource | bitmap, glyphatlas, image, interaction, render, render-gl, render-wgpu, scene2d-resources, scene3d-gl, scene3d-resources, scene3d-wgpu, texture | entity |
| TextureSourceKind | bitmap, effects-gl, host-web, image, interaction, render, render-gl, render-wgpu, scene2d-canvas, scene2d-dom, scene2d-formats, scene2d-gl, scene3d, scene3d-gl, scene3d-wgpu, texture, textureatlas | entity |
| TintMaterialData | quadbatch, render-gl, render-wgpu, scene2d-gl, scene2d-wgpu, tilemap | node, texture, geometry |
| TransformMode2D | scene2d-formats, skeleton2d-formats | skeleton2d, node, easing |
| ViewportAlign | layout, node, scene2d | entity |

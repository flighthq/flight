# Dissolving `@flighthq/types`: the text and host subsystems, and the 84 ambiguous types

Source: `refs/flight/packages` (TS). This report builds on `dissolve-types-report.md` and reuses its data
(`data.json`, `dissolve_owners.json`, `refine.json`, `fixes.json`, `final_full.json`).

New scripts and inputs in the scratchpad:
- `sim_text.py`: `full.py` plus support for new packages, dependency edits, and extra fixes.
- `text_extra.json`: section A alone.
- `host_extra.json`: sections A and B.
- `all_extra.json`: sections A, B, and C.
- `amb_analysis.json`: per-type users, referrers, needs, and common packages for the 84 ambiguous types.
- `c_rows.json`: the section C decisions.

Rule used throughout: **a type lives in the lowest package that must name it.** Where that answer is surprising,
look first for a missing crate.

**Simulation result** (fixes.json plus `all_extra.json`, using function, type, and source-usage edges):
- **0 SCCs.**
- Max DAG depth falls from **21 to 17**.
- The text stack drops about 3 levels.

---

## A. Text subsystem

### A1. Current state

Package function dependencies, from `package.json` and the level in `data.json`:

| Package | L | Depends on (flight) | What it is |
|---|---|---|---|
| textsegment | 3 | log | grapheme/word segmentation, standalone (only sdk uses it) |
| textbidi | 3 | entity, log | UAX#9 bidi, standalone (only sdk uses it) |
| font | 2 | entity, path | FontResource, loading, `GlyphOutlineSource` → rasterizer adapter |
| font-formats | 3 | font, importdiagnostics | OpenType/CFF/WOFF parsers |
| textshaper | 3 | entity, log, signals | `HostTextShaperCapability` seam, run itemize, cache |
| textlayout | 4 | entity, textshaper | line breaking and layout; **also owns the TextFormat functions** (`textFormat.ts`: `mergeTextFormat`, `getTextFormatAscent/Descent/Height/Leading`; `textFormatRange.ts`) |
| text-markup | 5 | color, log, textlayout | HTML-ish markup → format ranges |
| text | 6 | **scene2d, node**, textlayout, … | the **TextLabel / RichText / NativeText display objects**, plus `computeTextFormatFontString` (`text/src/textFormatFont.ts:3`) |
| textinput | 7 | text, textlayout, node | editable text |
| glyphatlas | 4 | bitmap, geometry | dynamic glyph atlas; owns the glyph-rasterizer contract |
| bitmapfont / bitmaptext | 6 | texture, textureatlas (+scene2d for bitmaptext) | BMFont data / BitmapText node |

Who imports which text package (non-test src):
- text ← gui, **host-web** (only `computeTextFormatFontString`, `host-web/src/webTextShaper.ts:1`), interaction,
  scene2d-canvas/dom/gl/wgpu, scene2d-formats, swf, textinput.
- textlayout ← text, text-markup, textinput, interaction, scene2d-*.
- textshaper ← textlayout only.

### A2. The text types and their users (`dissolve_owners.json` usage, plus type references)

| Type | Defined in types/src | Named by (src) | Referenced by types | Prior owner |
|---|---|---|---|---|
| `TextFormat`, `TextFormatAlign`, `TextFormatListMarker` | TextFormat.ts:3-35 | textshaper(4), textlayout(5), text(3), text-markup(3), scene2d-canvas/dom/gl/wgpu, scene2d-formats, swf, host-web | HostTextShaperCapability (TextShaper.ts:34,49), TextMeasureFunction (TextLayout.ts:9), TextLayoutGroup, TextFormatRange, RichTextData, TextLabelData, Markup*; NativeTextStyle uses TextFormatAlign | **textshaper** |
| `FontVariation` (+axis constants) | FontVariation.ts | scene2d-formats | TextFormat.ts:34, TextShaperOptions.ts:9 | textshaper |
| `TextFormatRange` | TextFormatRange.ts | textlayout, text, text-markup, textinput, scene2d-formats | RichTextData, RichTextContent, TextLayoutParams | textlayout |
| `TextMeasureFunction` | TextLayout.ts:9 | textlayout, text, scene2d-canvas | HostTextShaperCapability.measureText (TextShaper.ts:45), TextLabelRuntime, TextLayoutParams | textshaper |
| `TextDirection`, `TextFeature`, `TextItem`, `ShapedRun/ShapedGlyph`, `ShapeRunOptions`, `TextShaperOptions`, `GlyphExtents`, `HostTextShaperCapability` | various | textshaper (+textlayout for TextDirection) | ShapedRun.font: FontResource (ShapedRun.ts:16) | textshaper |
| `FontMetrics` | FontMetrics.ts | textshaper, host-web | HostTextShaperCapability.getFontMetrics | textshaper |
| `FontResource`, `FontUrl`, `GlyphOutlineSource/Metrics`, `HostFontLoadingCapability`, `FontVariationAxis` | | font, font-formats, swf, scene2d-dom | ShapedRun | font |
| `GlyphMetrics`, `GlyphRasterizeOptions`, `GlyphRasterizedBitmap`, `HostGlyphRasterizerCapability` | GlyphSource.ts:~40-110 | glyphatlas, **font** (`font/src/glyphOutlineSource.ts:28`), bitmapfont, host-web | BitmapFont, GlyphAtlasRuntime | glyphatlas (file rule) |
| `TextLayoutParams/Result/Group`, `TextLineMetrics`, `TextMetrics`, `TextJustification`, `TextBoundsSpec`, `RichTextContent`, `TextSelectionRectangle`, `TextAutoSize`, `TextVerticalAlign` | | textlayout, text, textinput, scene2d-* | | textlayout |
| `TextLabel*`, `RichText*`, `NativeText*`, `TextFieldSignals`, `TextInputState` | | text, scene2d-*, textinput | | text |
| `TextListMarker`, `TextSelectionRange` | | **nothing** (dead; TextListMarker duplicates TextFormatListMarker) | | — |

Why the rule put `TextFormat` in textshaper:
- textshaper is the lowest package that names it: `HostTextShaperCapability.measureText(text, format)` and
  `shapeRun(text, format)`.
- textshaper's cache keys off `format.font/size/bold/italic/kerning/letterSpacing`
  (`textshaper/src/textShaperCache.ts:90-98`).

But `TextFormat` is not a shaping type:
- It is the Flash-style **character + paragraph + hyperlink** record: align, indent, margins, bullet, tabStops,
  leading, url, target, color.
- The shaper reads only about 6 of its 21 fields.
- Its functions live in textlayout, and its CSS shorthand lives in text, which is a scene2d node package. That
  forces **host-web → text → scene2d** for a 5-line helper.

That combination is the "surprising lowest user" symptom. There is a second symptom: **font is pulled up to L8**
because `font/src/glyphOutlineSource.ts` names glyphatlas's rasterizer contract. The chain is font → glyphatlas →
bitmap → texture, and textshaper inherits it through `ShapedRun.font: FontResource` (textshaper ends at L9).

### A3. Proposal: a missing foundation crate, `textformat`

**Name.** The existing text crates concatenate the noun: textbidi, textinput, textlayout, textsegment,
textshaper. A hyphenated `text-format` would read like the `*-formats` file-importer convention (font-formats,
bitmapfont-formats), so the name is **`textformat`**.

**Deps:** entity only (for `TextFormatRange extends Entity`). Level 1.

**Types owned:**
- `TextFormat`, `TextFormatAlign`, `TextFormatListMarker`
- `TextFormatRange`
- `FontVariation` and its axis constants (`FontVariationItalic`, `…Weight`, `…Width`, `…Slant`, `…OpticalSize`).
  TextFormat names it, so textformat is the lowest package that must name it.
- Delete the dead `TextListMarker` and `TextSelectionRange`, or park them here.

**Functions owned (module moves):**
- `textlayout/src/textFormat.ts` → textformat: `mergeTextFormat`, `getTextFormatAscent/Descent/Height/Leading`.
- `textlayout/src/textFormatRange.ts` → textformat: `createTextFormatRange`, `initializeTextFormatRange`.
- `text/src/textFormatFont.ts` → textformat: `computeTextFormatFontString`. This cuts the host-web → text edge.

**Stays where the rule puts it (deliberately not in textformat):**
- `TextMeasureFunction`, `TextDirection`, `TextFeature`, `TextItem`, `ShapedRun`, `ShapeRunOptions`,
  `TextShaperOptions`, `GlyphExtents`, `HostTextShaperCapability` → **textshaper**. These are the shaping seam.
  `TextDirection` is the only borderline one: textlayout also names it. textbidi has its own `BidiDirection`
  ('ltr' | 'rtl' | 'auto'). If you ever unify the two, the unified type belongs in textformat.
- Layout parameters and results (`TextAutoSize`, `TextVerticalAlign`, `TextJustification`, `TextLayout*`,
  `TextLineMetrics`, `TextMetrics`, `RichTextContent`, `TextSelectionRectangle`) → **textlayout**.
- Display objects → **text**.

**Font-side companion fix.** No new crate is needed, but this split is required to get the depth win:
- Split `GlyphSource.ts`. The rasterizer contract moves to **font**:
  - `HostGlyphRasterizerCapability`
  - `GlyphRasterizeOptions`
  - `GlyphRasterizedBitmap`
  - `GlyphMetrics`
  - `GlyphRasterizerOperation`

  font already names all of them (`font/src/glyphOutlineSource.ts`). This makes glyphatlas → font. The edge font →
  glyphatlas disappears, so font stays at L5 (entity, path) and no longer drags bitmap/texture under textshaper.
- The atlas side (`GlyphSource`, `GlyphEntry`, `GlyphAtlas*`) stays in glyphatlas.
- Optional consolidation: font would then hold three overlapping metric records, `GlyphMetrics`
  (ascent/descent/lineGap), `GlyphOutlineMetrics` (+unitsPerEm), and textshaper's `FontMetrics` (+cap/x-height,
  underline). Merging `FontMetrics` into font is justified only if font names it after the merge. Under the strict
  rule `FontMetrics` and `GlyphExtents` stay in textshaper.
- `BackendOperationExplanation` leaves lifecycle (see C/X), so textshaper no longer depends on lifecycle.

### A4. Why not make `text` the foundation?

`text` would have to shed TextLabel / RichText / NativeText / TextFieldSignals / guards into a new node package,
and the roughly 26 importing files would be re-pointed.

The bigger problem is naming. Every display-object package is named after its node: `shape`, `bitmaptext`,
`tilemap`, `movieclip`, `particleemitter`. `text` *is* the TextLabel/RichText package by that convention. Turning it
into the foundation would break the convention and need a new name for the node package. Adding `textformat` is
smaller, keeps every existing import of the node types stable, and matches the textX naming.

### A5. Text dependency graph after the proposal (simulated, `text_extra.json`)

```
entity ─┬─ textformat (L1)
        ├─ textbidi (L3)    textsegment (L3)          [unchanged, standalone]
path ── font (L5)  ◄── font-formats (L6)
textformat, font ── textshaper (L6, was 9)
textshaper, textformat ── textlayout (L7, was 10)
textlayout ── text-markup (L8, was 11)
font, bitmap ── glyphatlas (L7)  ◄── bitmapfont (L9)
scene2d, textlayout, textformat ── text (L10, was 11)  ◄── textinput (L14)
host-web → textformat   (instead of → text → scene2d)
```

The result is acyclic. Text-stack levels drop by 1 to 3. host no longer depends on glyphatlas, because the
rasterizer capability is now in font.

---

## B. Host subsystem

### B1. How capabilities are defined, implemented, and consumed today

**Defined.** Each capability interface already sits in its *feature's* type file:
- `Clipboard.ts`: HostClipboard*Capability
- `Tray.ts`, `Power.ts`, `Notification.ts`, …
- separate `Host*.ts` files (HostCanvas, HostFileDialog, …)

`Host.ts` (601 lines) only aggregates:
- `Host` has 50 group slots.
- There are 48 `Host<Group>Capabilities` records of optional slots.
- It references about 185 capability interfaces from 47 packages.

**Consumed.** Feature packages never take `Host`. They take the *individual* capability as an explicit
parameter, for example `clearClipboard(hostClipboardText: HostClipboardTextCapability)`
(`clipboard/src/clipboard.ts:31`). Only `host` itself names `Host`, in createHost, explainHost, the
`getHost*` queries in `host/src/hostQuery.ts`, and enableHostGuards.

Only a few groups are taken by feature APIs:
- `HostAudioDecodeCapabilities` (audio, 34 uses)
- `HostImageDecode/EncodeCapabilities` (image-codec, image)
- `HostCompress/DecompressCapabilities` (sdk)

**Implemented.** host-web, host-electron, host-tauri, and host-capacitor build the record:
- host-web via `createHost` (`host-web/src/webHost.ts:1`).
- The others depend on host, host-web, and several features (app, clipboard, dialog, notification, screen).
- They are the *only* dependents of host, together with sdk.

**Cross-feature consumers** (21 capabilities are named by a non-owner, non-host package). All already point
downward. Examples:
- render and the scene2d-* backends → `HostCanvasCapability` (surface)
- *-formats → `HostDecompressDeflateCapability` (compression)
- textlayout → `HostTextShaperCapability`
- permissions → `HostGeolocationCapability`, `HostNotificationPermissionCapability`

### B2. Options

**Option 1: each feature owns its contract; host aggregates (recommended).**
- The capability interfaces *and* their `Host<Group>Capabilities` record live in the feature package.
- `host` owns only `Host`, `HostExplanation`/`HostCapability*Explanation`, and the create/query/explain functions.
- host sits high (L14 after all fixes), but nothing except the adapters and sdk depends on it.
- Feature packages **never** depend on host. Adapters depend on host plus the features they implement, which they
  already do.

This is ports-and-adapters with the port owned by the domain. It is also what the code already does at the call
sites.

**Option 2: a low "host contract" crate** (e.g. `host-contract`/`capability`) holding all capability interfaces.
Rejected on evidence:
- The 185 capability interfaces transitively reference **310 non-capability domain types from about 48 packages**
  (AppWindow, Surface, Bitmap, MenuItemTemplate, Signal, TextFormat, GlContext, ImageResource, …).
- A low crate would either have to absorb those types, which rebuilds `types` under a new name, or depend on 48
  packages, which makes it the highest crate rather than the lowest.
- Either way every feature package would then depend on it, adding a hub edge to all of them for no gain, because
  features consume single capabilities rather than the bag.

**Option 3: host as an open registry** (feature-declared keys, `getHostCapability(host, ClipboardTextKey)`).
- This would make host L0.
- It is a public-shape change to all 50 slots and loses the static `Host` record type.
- Not needed, since Option 1 is already acyclic. Keep it in mind if host's 47-package fan-out becomes a Rust
  build-time problem.

### B3. Recommendation (Option 1) and concrete moves (simulated, `host_extra.json`)

**1. Group records move to their feature** (46 more, joining HostPowerCapabilities → power and HostMenuCapabilities
→ menu, which the prior fixes already made):
- **app:** Accessibility→accessibility, App/Fullscreen/Window→app.
- **media and images:** Audio→**media** (members span audio and media; media is above audio), Bitmap→bitmap,
  Image→image, Video→video.
- **rendering surfaces:** Canvas/Surface→surface, Gl→render-gl, Wgpu→render-wgpu.
- **data and devices:** Clipboard, Compress/Decompress→compression, Connectivity, Device, Dialog,
  FileSystem→filesystem, Geolocation, Haptics, Ipc, Lifecycle, MediaSession, Net.
- **system and permissions:** Midi→midi (midi is above permissions), Notification, Permissions, Platform,
  Preferences→preferences, Protocol, Screen, Sensors, Share, Shell, Shortcut, Socket, SoftKeyboard→keyboard,
  StatusBar, Tray, Updater.
- **fonts and text:** Font→font, Glyph→**font** (after A3), TextSegment→textsegment, TextShaper→textshaper.
- **input:** Input→**input**.

Strictly, the rule would leave a group that no feature names in host, because only host and the adapters name it.
Placing it in the feature costs no edge, since host already depends on every feature. It also follows the reading
"the group is the feature's published port". Do it uniformly so a reader finds `HostClipboardCapabilities` next
to `HostClipboardTextCapability`.

**2. Input capabilities consolidate in input.**
- `HostInput.ts` (DropFile, Focus, PointerLock, Input* outcomes) and `HostInputTarget.ts` (InputTargetHandle,
  HostInputTargetCapability) move from app to **input**, and app gains a dependency on input (input is L2).
- Without this move, `HostInputCapabilities` has members in two unrelated packages (app, input), and no feature
  can own it.

**3. Adapter-profile types leave the feature packages.** There are 25 names. They are named only by their
adapter, and they are an upward leak: a feature describing what Electron provides. Move them to the adapter:

| Adapter | Names |
|---|---|
| **host-web** (16) | `WebScreenCapabilities` (Host.ts), `WebPageNotification*`, `WebServiceWorkerNotification*`, `WebNotificationOptions`, `WebPower(Reading)Capabilities`, `WebWindow/WorkerStoragePersistence*` |
| **host-electron** (4) | `ElectronMenuCapabilities`, `ElectronNotificationCapabilities`, `ElectronMacosNotificationCapabilities`, `ElectronPowerCapabilities` |
| **host-tauri** (2) | `TauriMenuCapabilities`, `TauriNotificationCapabilities` |
| **host-capacitor** (3) | `CapacitorNotificationCapabilities`, `CapacitorShareContentOptions`, `HostCapacitorShareContentCapability` (Share.ts:41-50; it must move with its options type, or share ↔ host-capacitor cycles) |

**4.** `HostCapability{Explanation,Backend,Coverage}` and `HostExplanation` stay in host.

**Result:**
- Feature packages stay at their natural low levels (power L2, menu L2, notification L2, input L2, app L5).
- host is at L14–15 and the adapters at L15–17.
- Zero cycles. No feature depends on host. host does not depend on any adapter.

**Surprise check.** A reader looking for any capability, or the capability group of a feature, finds it in that
feature. A reader looking for "the whole host" finds `Host` in host. Electron-, Tauri-, Capacitor-, and
web-specific shapes are in their adapter. The one wrinkle is GPU and canvas: `HostGlCapabilities` lives in
render-gl and `HostCanvasCapabilities` in surface, which is where their member capabilities and return types live.

---

## C. The 84 ambiguous types (Appendix C of the prior report)

### C1. Method

For each type I collected four things:
- users (non-test src imports);
- type referrers;
- what the type itself needs;
- the packages common to all users, recomputed **with that type's own induced edges removed** (`amb_analysis.json`).

The last step matters. Computed naively on the prior final graph, the "dominator" of several types is
self-fulfilling: the prior owner choice created the very edge that makes it look dominant.

### C2. Key finding: 11 bogus cross-backend edges in the prior final graph

The prior owner choices made sibling backends depend on each other. None of these edges exist in function deps:

| Edge | Caused by |
|---|---|
| effects-canvas → effects-gl | `EffectStateOptions` (declared in GlEffectState.ts:114) |
| effects-wgpu → effects-gl | `EffectStateOptions` |
| effects-canvas → render-gl | `RenderTargetClear` |
| effects-wgpu → render-gl | `RenderTargetClear` |
| render-wgpu → render-gl | `RenderTargetClear`, `TextureResolutionExplanation`, `CreateExternalTextureOptions` |
| scene2d-canvas → render-gl | `RenderTargetClear`, `TextureResolutionExplanation` |
| scene2d-dom → render-gl | `TextureResolutionExplanation` |
| scene2d-gl → scene2d-canvas | `RenderCacheRefreshOptions`, `SpriteRenderer` |
| scene2d-wgpu → scene2d-canvas | `RenderCacheRefreshOptions`, `SpriteRenderer` |
| scene3d-wgpu → scene3d-gl | `Scene3DForwardLightSelectionExplanation` |
| particles → render-wgpu | `HasColorScaleBias` (ParticleObject.ts:5) |

Fix: backend-neutral vocabulary goes to the neutral parent.
- render: RenderTargetClear, TextureResolutionExplanation, CreateExternalTextureOptions, RenderCacheRefreshOptions,
  SpriteRenderer.
- effects: `EffectStateOptions`. This is not in the 84, but it is the same defect.
- lighting: Scene3DForwardLightSelectionExplanation. `selectScene3DForwardLights` is in
  `lighting/src/sceneForwardLights.ts:20`.
- node: HasColorScaleBias, a Has* node trait like HasBlendMode.

All 11 edges disappear, and max depth falls from 21 to 17 in the combined simulation.

### C3. Missing-crate signals

1. **`resource`** (new, deps: entity, L1). Owns `ResourceResolutionState`. The prior report parked it in entity.
   audio and image implement the same resource-reference shape in parallel:
   - Embedded/External reference variants, `*ResourceFailure`, and `*ResolutionExplanation`
     (`ImageResourceReference.ts:44-106`, `AudioResourceReference.ts:42+`);
   - the same create/explain/initialize/resolve functions (`image/src/imageResourceReference.ts`,
     `audio/src/audioResourceReference.ts`).

   A shared `resource` crate is the honest home for the state enum and, later, a shared reference base. Strength:
   medium.
2. **`capability`** (new, no deps, L0). Owns `BackendOperationExplanation` and the orphan `BackendExplanation`.
   - Today it forces textshaper → lifecycle.
   - `lifecycle/src/lifecycle.ts:85` and `textshaper/src/textShaper.ts:8` duplicate the same
     "is this operation provided" logic, and they disagree: one reports `'sentinel'`, the other `'none'`.
   - A shared `explainCapabilityOperation` / `hasCapabilityOperation` would live here too.
   - Strength: small. Fallback: entity.

   This is **not** the rejected Option 2 from section B: it holds the generic capability protocol, not concrete
   capability interfaces.
3. Also noted, not acted on:
   - `NonEntityCreateResult` stays in entity. It is an entity-construction typing helper, so not surprising.
   - `BlendMode` stays in materials. color is a valid lower alternative.

### C4. Counts

| Group | Count |
|---|---|
| H: host capability contracts (owner = feature; covered by B) | 32 |
| I: input/pointer vocabulary | 9 |
| R: backend-neutral render vocabulary | 17 (7 changed) |
| M: materials/blend/texture/image | 12 |
| S: shape/path/document/animation/layout | 11 |
| X: generic, pointing to missing crates | 3 (2 new crates) |
| **Total** | **84** |

**Owner changes versus the prior report: 11.**
- 7 render-neutral moves in R.
- 2 input moves in H (HostInput, HostInputTarget → input).
- 2 new-crate moves in X (ResourceResolutionState → resource, BackendOperationExplanation → capability).

Plus `EffectStateOptions` → effects, which is outside the 84. The other 73 keep their prior owner, which is now
confirmed by the clean-graph check.

### C5. Full list

### H. Host capability contracts (covered by section B; owner = the feature package)

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| Accelerator | 1 | shortcut | shortcut | host-electron/tauri are adapters |
| AudioDeviceHandle | 3 | media | media | with HostAudioDevice/Mixer |
| ClipboardFormat | 6 | clipboard | clipboard |  |
| DeviceFormFactor | 8 | useragent | useragent | device depends on useragent; useragent derives it |
| HostAppExit | 1 | app | app |  |
| HostAppLoop | 1 | app | app |  |
| HostAudioCodec | 1 | audio | audio |  |
| HostAudioDecode | 2 | audio | audio | scene2d-resources consumes; audio is below it |
| HostAudioDevice | 2 | media | media |  |
| HostAudioMixer | 3 | media | media |  |
| HostBitmapEncode | 2 | bitmap | bitmap |  |
| HostBitmapReadback | 4 | bitmap | bitmap | interaction consumes |
| HostCanvas | 1 | surface | surface | render and scene2d-* backends consume |
| HostFileDialog | 3 | dialog | dialog |  |
| HostFontLoading | 1 | font | font |  |
| HostFullscreen | 2 | app | app |  |
| HostGl | 1 | render-gl | render-gl | after the app/surface GL modules move to render-gl |
| HostImageDecode | 2 | image-codec | image-codec |  |
| HostImageEncode | 2 | image-codec | image-codec |  |
| HostImageOpenDialog | 1 | dialog | dialog |  |
| HostImageSource | 1 | bitmap | bitmap | alias of CanvasImageSource; texture no longer names it once videoTexture.ts moves to video |
| HostInput | 5 | app | input **(change)** | CHANGE from app: all HostInput* in input, add edge app->input (input is L2) |
| HostInputIngress | 3 | input | input |  |
| HostInputTarget | 2 | app | input **(change)** | CHANGE from app: same; InputTargetHandle with it |
| HostMessageDialog | 1 | dialog | dialog |  |
| HostPhotoCaptureDialog | 1 | dialog | dialog |  |
| HostPromptDialog | 1 | dialog | dialog |  |
| HostSurface | 2 | surface | surface | after attachWindowRenderState moves to surface |
| HostVideo | 1 | video | video |  |
| HostVideoCaptureDialog | 1 | dialog | dialog |  |
| PowerBatteryHealth | 2 | power | power |  |
| ShareFile | 1 | share | share |  |

### I. Input and pointer vocabulary

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| Cursor | 2 | interaction | interaction |  |
| InputGamepadData | 4 | input | input |  |
| InputKeyboardData | 1 | input | input |  |
| InputPointerData | 1 | input | input |  |
| InputTextData | 1 | input | input |  |
| KeyCode | 2 | input | input | textinput is the only non-adapter user; input is lower and is the semantic owner |
| KeyboardEventData | 1 | interaction | interaction | payload of InteractionSignals |
| MouseWheelMode | 1 | input | input |  |
| PointerEventData | 2 | interaction | interaction | payload of InteractionSignals; PointerType goes to input |

### M. Materials, blend, texture, image

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| AdvancedBlendMode | 2 | effects | effects | BlendEffect names it; swf/scene2d-formats/scene2d-canvas/dom already sit above effects |
| AlphaType | 1 | texture | texture |  |
| BlendMode | 2 | materials | materials | alternative color (L0) if you want it below materials; not needed |
| ImageChannel | 2 | bitmap | bitmap |  |
| Material3DOptions | 1 | materials | materials |  |
| ModifierDefinition | 1 | shading | shading |  |
| PixelFormat | 1 | texture | texture |  |
| TextureContainer | 1 | texture-formats | texture-formats |  |
| TextureContainerFormat | 1 | texture-formats | texture-formats |  |
| TextureSource | 1 | texture | texture |  |
| TextureSourceKind | 7 | render-gl | texture | split per prior report: per-kind constants beside their owners |
| TintMaterialData | 1 | materials | materials |  |

### R. Backend-neutral render vocabulary (FIXES the prior report: its owners created cross-backend edges)

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| CanvasRenderTarget | 4 | scene2d-canvas | scene2d-canvas |  |
| CreateExternalTextureOptions | 1 | render-gl | render **(change)** | CHANGE from render-gl: beside ExternalTexture |
| ExternalTexture | 1 | render | render |  |
| GlContext | 2 | render-gl | render-gl |  |
| GlRenderStateOptions | 1 | render-gl | render-gl | after the SLOT fix |
| HasColorScaleBias | 2 | render-wgpu | node **(change)** | CHANGE from render-wgpu: it created particles->render-wgpu; a Has* node trait like HasBlendMode |
| RenderCacheRefreshOptions | 1 | scene2d-canvas | render **(change)** | CHANGE from scene2d-canvas: it created scene2d-gl/wgpu->scene2d-canvas |
| RenderTargetClear | 1 | render-gl | render **(change)** | CHANGE from render-gl: it created effects-canvas->render-gl, scene2d-canvas->render-gl, render-wgpu->render-gl |
| RendererData | 1 | node | node |  |
| Scene3DForwardLightSelectionExplanation | 1 | scene3d-gl | lighting **(change)** | CHANGE from scene3d-gl: it created scene3d-wgpu->scene3d-gl; lighting owns selectScene3DForwardLights (lighting/src/sceneForwardLights.ts:20) |
| Scene3DLightBlock | 13 | lighting | lighting |  |
| Scene3DRenderProxy | 1 | render | render |  |
| SceneCoverageCatalog | 3 | render | render |  |
| SceneCoverageEntry | 8 | render | render |  |
| ShapeRasterizer | 1 | render | render |  |
| SpriteRenderer | 1 | scene2d-canvas | render **(change)** | CHANGE from scene2d-canvas: a NodeRenderer over RenderState; same bad edge |
| TextureResolutionExplanation | 2 | render-gl | render **(change)** | CHANGE from render-gl: it created scene2d-canvas/scene2d-dom/render-wgpu->render-gl |

### S. Shape, path, document, animation, layout

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| EasingFunction | 1 | easing | easing |  |
| FlightDocumentFieldSchema | 5 | scene-document | scene-document |  |
| FlightDocumentInteractiveState | 7 | scene-document | scene-document |  |
| FlightDocumentSchemaRegistry | 1 | scene-document | scene-document |  |
| PathMesh | 1 | path | path |  |
| RequirementFacet | 2 | requirement | requirement |  |
| ShapeCommand | 10 | shape | shape | PathWinding split to path (already in fixes); remaining stroke/fill enums are Flash-graphics vocabulary |
| ShapeCommandSchema | 3 | shape-formats | shape-formats |  |
| StrokeStyle | 1 | path | path |  |
| TransformMode2D | 1 | skeleton2d-formats | skeleton2d-formats | Spine transform-mode table; skeleton2d would also be acyclic |
| ViewportAlign | 1 | layout | layout |  |

### X. Generic vocabulary (missing-crate signals)

| File | Exports | Prior owner | Proposed owner | Note |
|---|---|---|---|---|
| BackendOperationExplanation | 1 | lifecycle | capability (NEW, no deps) **(change)** | MISSING CRATE (small): today forces textshaper->lifecycle; lifecycle/src/lifecycle.ts:85 and textshaper/src/textShaper.ts:8 duplicate the same explain-operation logic and disagree (sentinel vs none). Fallback: entity |
| NonEntityCreateResult | 1 | entity | entity | entity-construction typing helper; entity is not surprising |
| ResourceResolutionState | 2 | entity | resource (NEW, deps entity) **(change)** | MISSING CRATE (medium): audio and image both implement the same resource-reference shape (Embedded/External reference, Failure, explain/resolve); entity would be a junk drawer |

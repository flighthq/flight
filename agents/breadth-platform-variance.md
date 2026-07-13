# Breadth Review: Platform & Execution Variance

_2026-07-13. Raw breadth analysis — which execution environments Flight needs to support authoritatively, what is already built, and which primitives are genuinely missing._

## Environment Coverage

### Server / Headless

The DOM-free chain (`image-codec` → `surface` → `capture` → `tool-capture`) is real and functional, BUT `surface` leaks DOM in two files (`surfaceFrom.ts`, `surfaceEncode.ts` — 4x `document.createElement('canvas')`). These need routing through `image-codec`'s seam.

Missing: a headless app-layer host (`host-node`).

### Workers / OffscreenCanvas

Flight's house style is accidentally excellent for workers: plain data clones cleanly, `requestAnimationFrame` exists in workers, `render-gl`/`render-wgpu` accept contexts directly.

Missing: typed transferable-aware channel primitive, and a codified "entity crosses, runtime rebuilds" serialization contract.

### WebXR

The 3D substrate is well-positioned (explicit view/projection is XR-shaped). Nothing XR-specific exists. `LoopBackend` fits `XRSession.requestAnimationFrame`. Gated on 3D maturity.

### Smart TV

Web backends run as-is. Hard miss: **spatial dpad focus navigation** — nothing in `input`/`textinput`/`accessibility` handles LRUD focus. No overscan/safe-area support in `screen`/`statusbar`.

### Watch / Embedded

Tree-shaking is the entire story. No dedicated package needed.

### Cloud Gaming

Pure composition: `socket` + `media` + `input` + `snapshot`. Document as a recipe, not a package.

### Consoles (C/C++ Port)

The `*Backend` seam inventory IS the porting surface. Audit seams for web-type leakage.

### PWA

Mostly covered by existing platform suite. Service Worker registration is marginal.

## Candidate Primitives

| Candidate | Priority | Notes |
|-----------|----------|-------|
| **`focus`** | **now** | Spatial dpad/LRUD focus navigation over plain-data `{id, bounds}` regions. Oracle: BBC LRUD / Norigin. TV + console + gamepad + keyboard-a11y all converge on this one missing primitive |
| **`host-node`** | soon | Node/Deno/Bun host: timer `LoopBackend`, fs storage/filesystem, file log sink. Unlocks the headless chain |
| **`worker`** | soon (after) | Typed cross-context channel with explicit transferables. comlink-minus-proxy-magic. Lean distinct from `ipc`: transferables don't exist in process IPC |
| `xr` | later | Session/reference-space/input-source data + `XrBackend`. Gated on 3D maturity |
| `host-tizen` / `host-webos` | reserve | |
| `serviceworker` / `host-pwa` | reserve | Marginal |

## Stressed Packages

- **`input`** — no focus concept; snapshot serialization; TV remote keys.
- **`accessibility`** — must share one focus model with the `focus` candidate.
- **`surface`** — the 2 DOM-leak files need routing through `image-codec`'s seam.
- **`image-codec`** — needs Node registrars for headless.
- **`ipc`** — worker boundary call; its unbuilt `IpcSerializer` seam should BE `serialize`, not a second codec.
- **`entity` / `node`** — serialization contract ("entity crosses, runtime rebuilds") needs documenting + guard.
- **`application`** — worker sentinel story.
- **`screen` / `statusbar`** — safe-area insets.
- **`media`** — worker/Node absence needs sentinels or seams.
- **`textshaper-harfbuzz`** — priority rises for server-side text rendering.
- **`camera` / `scene-gl` / `scene-wgpu`** — stereo per-eye stress from XR.

## Strategic Notes

- The architecture already paid the porting tax — only **two genuinely missing primitives** for new environments: `focus` (spatial nav) and `worker` (typed channel).
- Headless is 90% built, 0% assembled — a `host-node` cell + the surface DOM-leak fix makes it work.
- Codify "entity crosses, runtime rebuilds" now as a documented contract.
- A generated backend-seam matrix would make console/native portability auditable like `packages:check`.

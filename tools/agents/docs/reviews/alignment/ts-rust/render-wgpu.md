# TS↔Rust Alignment: @flighthq/render-wgpu

**Verdict:** Strong structural and filename alignment; the one substantive issue is an undocumented `*TextureEntry` → `*Texture` rename (function + type) that is asymmetric with TS upstream and should be recorded or reverted — everything else is either an identity map, a documented Rust-only host seam, or expected GPU-visual-only exclusions.

`render-wgpu` is a **GPU backend core**, listed in the name-match exclusion set in both `tools/agents/docs/rust/conformance.md` (the GPU-excluded list, "their conformance is visual — the parity matrix at the `gl`/`wgpu` cells") and `scripts/rust-conformance.ts` (excluded list at line ~166). The summary line `| render-wgpu | 47 | 3 | 29 | 44 |` is therefore **not a hard-gate failure**: the 44 "gap" is reported, not failing, because conformance for this crate is decided by the functional parity matrix, not function-name matching. This review covers the naming/filename judgment the script does not encode.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWgpuTextureEntry` (`wgpuDraw.ts`) | `create_wgpu_texture` (`draw.rs`) | Undocumented rename: TS keeps the `Entry` type word, Rust drops it. Not in the divergence map. |
| `updateWgpuTextureEntry` (`wgpuDraw.ts`) | `update_wgpu_texture` (`draw.rs`) | Same `Entry`-drop rename, undocumented. |
| `WgpuTextureEntry` (type, `@flighthq/types`) | `WgpuTextureInfo` (`draw.rs`) | Backing type renamed `Entry`→`Info`. Asymmetric with TS; should be recorded. See note below. |
| `getWgpuRenderProxyColorTransform` (`wgpuDraw.ts`) | — (inlined, not exported) | TS exports it (and tests it); Rust folds color-transform extraction inline in `draw.rs` with no `pub fn`. Acceptable for a visual-only core, but it is an export that silently has no Rust counterpart. |
| `setWgpuMatrixFromTransform` (`wgpuShader.ts`) | `set_wgpu_matrix_from_transform` (shader) | In sync (identity). |
| `createWgpuRenderStateForTest`, `installWgpuMock` (`wgpuTestHelper.ts`) | — | TS test-only helpers (jsdom/webgpu mock). No Rust analogue expected — Rust tests use native/headless wgpu. Not drift. |
| `createWgpuCanvasElement` (`wgpuElement.ts`) | `resolve_wgpu_canvas_element_size` + `WgpuCanvasElementSize` (`element.rs`) | Expected substrate divergence: no `HTMLCanvasElement` in the box, so Rust exposes the size-resolution math only. Fits the value-type seam pattern; worth a one-line divergence-map note since the export name differs. |
| `createSurfaceFromWgpuRenderState` (`wgpuSurface.ts`) | — (readback via `flighthq-capture`) | Already covered by divergence map entry `render-wgpu->surface` ("readback is via flighthq-capture, not a surface dep"). In sync with the recorded rationale. |
| `bindWgpuTexture`, `acquireWgpuFrameCaptureTexture`, `enableWgpuFrameCapture`, `encodeWgpuFrameCapture` | `bind_wgpu_texture`, `acquire_wgpu_frame_capture_texture`, `enable_wgpu_frame_capture`, `encode_wgpu_frame_capture` | In sync (identity, full type words preserved). |
| — | `set_wgpu_frame_target_view` (`background.rs`) | Rust-only, **documented**: the render present seam in `rust/index.md` line 86. Expected host-seam addition, not drift. |
| — | `composite_wgpu_cached_texture`, `build_wgpu_stencil_face_state`, `wgpu_blend_state`, `normal_wgpu_blend_state`, `wgpu_pipeline_cache_key`, `get_wgpu_render_state_runtime_mut`, `create_wgpu_texture` | Rust-only internals exposed as `pub fn`. For a GPU core whose conformance is visual these are implementation plumbing (blend/stencil state builders, pipeline cache key, the `&mut` runtime accessor). Not upstream-divergent in behavior, but they are extra public surface with no TS counterpart and no map entry. |

### `*TextureEntry` → `*Texture` — the one real flag

This is the only finding that touches the **full-type-word** rule. TS `render-wgpu` deliberately names these `createWgpuTextureEntry` / `updateWgpuTextureEntry` over a `WgpuTextureEntry` type; Rust renamed both the functions (dropping `Entry`) and the type (`Entry`→`Info`). The wrinkle is that this makes Rust `render-wgpu` _internally_ symmetric with Rust `render-gl` (`create_gl_texture` / `update_gl_texture`, matching TS `createGlTexture` / `updateGlTexture`, which genuinely have no `Entry`) — but it does so by diverging from its own TS upstream, which _does_ carry `Entry`. So the rename trades TS↔Rust fidelity for gl/wgpu cross-backend symmetry. Either is defensible; the problem is it is **silent**. Resolve one way:

- Preferred: rename Rust back to `create_wgpu_texture_entry` / `update_wgpu_texture_entry` and the type to `WgpuTextureEntry`, matching upstream exactly; or
- If the cross-backend symmetry is intentional, **add a divergence-map entry** under "Intentional value-type seam divergences" recording the `Entry`-drop and the `WgpuTextureEntry`→`WgpuTextureInfo` type rename with the gl-symmetry rationale.

## In sync

- **Crate name:** `flighthq-render-wgpu` is identity with `@flighthq/render-wgpu`; the former `-webgpu`→`-wgpu` divergence is gone (conformance.md line 30). Correct.
- **Filenames track cleanly:** `wgpuBackground.ts`↔`background.rs`, `wgpuDraw.ts`↔`draw.rs`, `wgpuElement.ts`↔`element.rs`, `wgpuMaterialRegistry.ts`↔`material_registry.rs`, `wgpuRenderState.ts`↔`render_state.rs`, `wgpuRenderTarget.ts`↔`render_target.rs`, `wgpuRenderTargetPool.ts`↔`render_target_pool.rs`, `wgpuShader.ts`↔`shader.rs`, `wgpuShaderBinding.ts`↔`shader_binding.rs`, `wgpuSurface.ts`↔`surface.rs`. Every TS `wgpu*`-prefixed source basename maps to its de-prefixed snake_case Rust file. Rust `runtime_types.rs` has no TS file counterpart but holds the runtime/type split (`create_wgpu_render_state_runtime`, etc.) that TS keeps inside `wgpuRenderState.ts`/`@flighthq/types` — a reasonable Rust factoring, not a basename mismatch.
- **Teardown/pool verbs preserved:** `destroyWgpu*`→`destroy_wgpu_*`, `acquireWgpuRenderTarget`/`releaseWgpuRenderTarget`→`acquire_*`/`release_*`. Verb semantics carry across exactly.
- **Out-param / sentinel conventions:** TS `Readonly<>` → Rust `&` borrows, mutating paths → `&mut`; `acquireWgpuFrameCaptureTexture: GPUTexture | null` → `-> Option<&wgpu::Texture>`; `getWgpuMaterialRenderer: … | null` → `Option`. Correct.
- **Material registry, blend, pipeline, render-target, shader-binding, background present/submit** all map 1:1 with full type words (`registerWgpuMaterialRenderer`→`register_wgpu_material_renderer`, `getWgpuPipeline`→`get_wgpu_pipeline`, `renderWgpuBackground`→`render_wgpu_background`, `submitWgpuRenderPass`→`submit_wgpu_render_pass`, `resolveWgpuShader`/`setWgpuShader`/`getWgpuShader` identity).
- **Manifest:** `rust/conformance.md` line 62 already records the removed dead `render-wgpu → node`/`path` deps; Rust `Cargo.toml` depends only on `flighthq-types`, `flighthq-render`, `wgpu`. Consistent.

### Suggested divergence-map additions

1. `WgpuTextureEntry`/`createWgpuTextureEntry`/`updateWgpuTextureEntry` → `WgpuTextureInfo`/`create_wgpu_texture`/`update_wgpu_texture` (or revert the Rust rename) — currently the only **unrecorded** name divergence.
2. `createWgpuCanvasElement` → `resolve_wgpu_canvas_element_size` (`WgpuCanvasElementSize`) — one line under the substrate-absence rationale (no `HTMLCanvasElement` in the box), since the export name, not just the body, differs.

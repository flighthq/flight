# `addLogSink` cleanup audit

Generated from every tracked JavaScript and TypeScript file by:

```sh
npx tsx scripts/audit-log-sink-cleanup.ts --write
npx tsx scripts/audit-log-sink-cleanup.ts --check
```

The current tree contains **83 registrations across 42 files**: 50 locally bracketed by `finally`, 31 cleared by failure-safe test hooks, 0 immediately removed/replaced, 1 owned by an explicit API lifetime, and 1 without a shorter-lifetime cleanup.

The check fails for every new unbracketed registration. The one named exception is the size fixture:
its console sink deliberately lives for the document lifetime and becomes unreachable at page teardown.

## Consequences

| Classification | Consequence |
| --- | --- |
| `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `direct-cleanup` | Guaranteed on the straight-line path: the registration is immediately removed, cleared, or replaced before assertions can abort the owner. |
| `lifecycle-owned` | Owned by an explicit API lifetime: `disableDebug` removes the sink installed by `enableDebug`. It remains reachable for the intended debug session. |
| `missing-cleanup` | Missing an exception-safe shorter-lifetime teardown. The sink and anything its closure captures remain reachable and can receive later log entries. |

The `lifecycle-owned` debug registration has one unresolved exception path: `enableDebug` installs
the sink before running subsystem `enableGuards` callbacks, but sets its enabled flag only after all
callbacks return. If one callback throws, `disableDebug` is a no-op and cannot close the partially
opened lifetime. Rolling back already-enabled subsystem guards is a lifetime-policy decision, so this
audit records and escalates it rather than choosing teardown semantics locally.

## Every registration

| File | Lines | Count | Classification | Consequence |
| --- | --- | ---: | --- | --- |
| `packages/assets/src/enableAssetGuards.test.ts` | 9 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/clip/src/enableClipGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/collision/src/enableCollisionGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/debug/src/debug.ts` | 111 | 1 | `lifecycle-owned` | Owned by an explicit API lifetime: `disableDebug` removes the sink installed by `enableDebug`. It remains reachable for the intended debug session. |
| `packages/debug/src/debugTiming.test.ts` | 67, 97 | 2 | `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `packages/easing/src/enableEasingGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/effects-gl/src/enableGlRenderEffectGuards.test.ts` | 206 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/effects-wgpu/src/enableWgpuRenderEffectGuards.test.ts` | 192 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/entity/src/enableEntityRuntimeGuards.test.ts` | 12 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/geometry/src/enableGeometryPoolGuards.test.ts` | 20 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/interaction/src/enableInteractionGuards.test.ts` | 24, 43, 57, 73 | 4 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/log/src/log.test.ts` | 76, 100, 110, 111, 207, 217, 276, 286, 295, 421, 433, 442, 451, 464, 538, 547, 559, 570, 584, 601, 619, 627, 791, 998, 999, 1214, 1354 | 27 | `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `packages/media/src/enableAudioMixerGuards.test.ts` | 30 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/movieclip/src/enableMovieClipGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/permissions/src/enablePermissionGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render-gl/src/enableGlTextureResolverGuards.test.ts` | 32 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render-gl/src/glRenderState.test.ts` | 521 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render-gl/src/glRenderTexture.test.ts` | 75 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render-wgpu/src/enableWgpuTextureResolverGuards.test.ts` | 41, 71 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render-wgpu/src/wgpuMaterialRegistry.test.ts` | 79 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render/src/enableColorAdjustmentGuards.test.ts` | 41, 60 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/render/src/renderRegistryGuards.test.ts` | 36, 60 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene2d-canvas/src/enableCanvasTextureResolverGuards.test.ts` | 36 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene2d-dom/src/enableDomTextureResolverGuards.test.ts` | 32 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene2d-gl/src/enableGlColorAdjustmentGuards.test.ts` | 46, 62, 75 | 3 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene2d-wgpu/src/enableWgpuColorAdjustmentGuards.test.ts` | 53, 69, 82 | 3 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-gl/src/enableGlPbrExtensionGuards.test.ts` | 33, 83 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-gl/src/enableGlScene3DColorSpaceGuards.test.ts` | 51 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-gl/src/enableGlScene3DCustomShaderGuards.test.ts` | 44 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-gl/src/enableGlScene3DDeformGuards.test.ts` | 71 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-gl/src/enableGlScene3DForwardLightSelectionGuards.test.ts` | 55, 76 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-resources/src/enableScene3DResourceFailureGuards.test.ts` | 63, 102 | 2 | `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `packages/scene3d-wgpu/src/enableWgpuScene3DCustomShaderGuards.test.ts` | 42, 65 | 2 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/scene3d-wgpu/src/enableWgpuScene3DForwardLightSelectionGuards.test.ts` | 25 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/shape/src/enableShapeBoundsGuards.test.ts` | 52 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/shortcut/src/enableShortcutGuards.test.ts` | 39 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/socket/src/enableSocketGuards.test.ts` | 16 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/statechart/src/enableStatechartGuards.test.ts` | 71 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/swf/src/enableSwfGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/textshaper/src/enableTextShaperGuards.test.ts` | 10 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `packages/textureatlas/src/enableTextureAtlasGuards.test.ts` | 44 | 1 | `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `tools/size/fixtures/log-console/src/render.canvas.ts` | 3 | 1 | `missing-cleanup` | Missing an exception-safe shorter-lifetime teardown. The sink and anything its closure captures remain reachable and can receive later log entries. |


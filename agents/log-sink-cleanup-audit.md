# `addLogSink` cleanup audit

Generated from every tracked JavaScript and TypeScript file by:

```sh
npx tsx scripts/audit-log-sink-cleanup.ts --write
npx tsx scripts/audit-log-sink-cleanup.ts --check
```

The current tree contains **91 registrations across 49 files**: 0 locally bracketed by `finally`, 2 cleared by failure-safe test hooks, 0 immediately removed/replaced, 1 owned by an explicit API lifetime, 87 bounded by a locally created LogState, and 1 without a shorter-lifetime cleanup.

The check fails for every new unbracketed registration. The one named exception is the size fixture:
its console sink deliberately lives for the document lifetime and becomes unreachable at page teardown.

## Consequences

| Classification | Consequence |
| --- | --- |
| `finally-cleanup` | Guaranteed on success and failure: a local `finally` removes the same sink registration. |
| `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `direct-cleanup` | Guaranteed on the straight-line path: the registration is immediately removed, cleared, or replaced before assertions can abort the owner. |
| `lifecycle-owned` | Owned by an explicit API lifetime: a failed `enableDebug` rolls back the sink, while `disableDebug` removes it after a successful enable. |
| `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `missing-cleanup` | Missing an exception-safe shorter-lifetime teardown. The sink and anything its closure captures remain reachable and can receive later log entries. |

The `lifecycle-owned` debug registration is checked on both sides of its lifetime. A failed
`enableDebug` unwinds the throwing and earlier subsystem hooks, removes the sink, restores levels,
and rethrows the original enable error. After a successful enable, `disableDebug` owns teardown.

## Every registration

| File | Lines | Count | Classification | Consequence |
| --- | --- | ---: | --- | --- |
| `packages/assets/src/enableAssetGuards.test.ts` | 16 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/clip/src/enableClipGuards.test.ts` | 22 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/collision/src/enableCollisionGuards.test.ts` | 19 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/debug/src/debug.ts` | 178 | 1 | `lifecycle-owned` | Owned by an explicit API lifetime: a failed `enableDebug` rolls back the sink, while `disableDebug` removes it after a successful enable. |
| `packages/debug/src/debugTiming.test.ts` | 85, 115 | 2 | `test-hook-cleanup` | Guaranteed after every test, including failures, by an `afterEach` hook that removes or clears registered sinks. |
| `packages/easing/src/enableEasingGuards.test.ts` | 12 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/effects-gl/src/enableGlEffectGuards.test.ts` | 236 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/effects-wgpu/src/enableWgpuEffectGuards.test.ts` | 214 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/flow/src/flowGuards.test.ts` | 112 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/geometry/src/enableGeometryPoolGuards.test.ts` | 28 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/host/src/enableHostGuards.test.ts` | 96 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/interaction/src/enableInteractionGuards.test.ts` | 46, 65, 79, 95 | 4 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/log/src/fileLogSink.test.ts` | 58, 81, 239 | 3 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/log/src/log.test.ts` | 107, 129, 139, 140, 299, 309, 317, 368, 378, 399, 436, 461, 560, 569, 581, 599, 613, 628, 642, 650, 788, 1024, 1114, 1115, 1347, 1494 | 26 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/materials/src/enableMaterialConversionGuards.test.ts` | 31 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/media/src/enableAudioMixerGuards.test.ts` | 50 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/movieclip/src/enableMovieClipGuards.test.ts` | 24 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/net/src/enableNetGuards.test.ts` | 24 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/physics2d/src/enablePhysics2DGuards.test.ts` | 38 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/physics3d/src/enablePhysics3DGuards.test.ts` | 34 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render-gl/src/enableGlTextureResolverGuards.test.ts` | 46 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render-gl/src/glRenderState.test.ts` | 559 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render-gl/src/glRenderTexture.test.ts` | 89 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render-wgpu/src/enableWgpuTextureResolverGuards.test.ts` | 55, 85 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render-wgpu/src/wgpuQuadMaterialRegistry.test.ts` | 105 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render/src/enableColorAdjustmentGuards.test.ts` | 51, 70 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/render/src/renderRegistryGuards.test.ts` | 51, 75 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene2d-canvas/src/enableCanvasTextureResolverGuards.test.ts` | 50 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene2d-dom/src/enableDomTextureResolverGuards.test.ts` | 49 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene2d-gl/src/enableGlColorAdjustmentGuards.test.ts` | 54, 70, 83 | 3 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene2d-resources/src/enableScene2DResourceFailureGuards.test.ts` | 16 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene2d-wgpu/src/enableWgpuColorAdjustmentGuards.test.ts` | 54, 71, 85 | 3 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-gl/src/enableGlPbrExtensionGuards.test.ts` | 44, 97 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-gl/src/enableGlScene3DColorSpaceGuards.test.ts` | 70 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-gl/src/enableGlScene3DCustomShaderGuards.test.ts` | 55 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-gl/src/enableGlScene3DDeformGuards.test.ts` | 80 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-gl/src/enableGlScene3DForwardLightSelectionGuards.test.ts` | 73, 96 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-resources/src/enableScene3DResourceFailureGuards.test.ts` | 72, 111 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-wgpu/src/enableWgpuScene3DCustomShaderGuards.test.ts` | 50, 74 | 2 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/scene3d-wgpu/src/enableWgpuScene3DForwardLightSelectionGuards.test.ts` | 33 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/shape/src/enableShapeBoundsGuards.test.ts` | 59 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/socket/src/enableSocketGuards.test.ts` | 10 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/statechart/src/enableStatechartGuards.test.ts` | 82 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/swf/src/enableSwfGuards.test.ts` | 11 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/textshaper/src/enableTextShaperGuards.test.ts` | 17 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/textureatlas/src/enableTextureAtlasGuards.test.ts` | 46 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/tilemap-formats/src/enableTilemapFormatsGuards.test.ts` | 23 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `packages/vite-plugin-manifest/src/manifestPlugin.test.ts` | 103 | 1 | `state-owned` | Bounded by a caller-owned `LogState` created in the same file: the sink is reachable only through that state, so it is collected with it and cannot receive entries emitted into any other state. |
| `tools/size/fixtures/log-console/src/render.canvas.ts` | 4 | 1 | `missing-cleanup` | Missing an exception-safe shorter-lifetime teardown. The sink and anything its closure captures remain reachable and can receive later log entries. |

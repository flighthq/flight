# SDK Issues Blocking AwayJS Example Parity

Discovered during side-by-side comparison of the Flight and AwayJS examples. Re-audited against the
current repository on 2026-08-31.

## Open blockers

None of the eight originally recorded SDK blockers remains open.

## Closure audit

1. **AWD texture and material import:** closed. The active API is
   `createScene3DFromAwd2` in `packages/scene3d-formats/src/awd2Parse.ts`; it imports embedded and
   external textures, material blocks, and shaded-material assignments. The former references to
   `awdParse.ts` and `createScene3DFromAwd` were stale names.
2. **GL ParticleEmitter3D traversal:** closed. `drawGlScene3D` includes
   `drawGlScene3DParticleEmitter3Ds`; callers no longer need a second draw call for ordinary scene
   traversal.
3. **Per-particle 3D color:** closed. Particle state and configuration carry color buffers, curves,
   start/end values, and variance, with setters and tinted-burst coverage.
4. **Globe shading composition:** closed. The Modifier tier composes animated normals,
   facing-gated masked emissive lighting, Fresnel rim, and environment reflection. The WebGL and
   WebGPU `shading-globe` functional scenes provide end-to-end evidence.
5. **GL tessellated-shape color adjustment:** closed. `glShapeMesh.ts` consumes the registered GL
   color-adjustment material feature for solid-fill meshes.
6. **OBJ/3DS root discoverability:** closed. The scene assemblers expose imported meshes directly
   under the scene root; parser tests assert the direct-root projection.
7. **Lighting intensity portability:** closed. `packages/lighting/src/lightIntensity.ts` provides
   exposure scaling, photometric-unit conversion, and conversion to the renderer's linear intensity
   scale, with tests.
8. **Headless BitmapText output:** closed for the reported blank-output defect. Committed Canvas,
   WebGL, and WebGPU `bitmapfont-generate` captures are nonblank. Real host-font fidelity remains a
   separate portability concern; it is not the former SDK blocker.

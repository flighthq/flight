# scene2d-resources status

Built 2026-07-29.

- `Scene2DDocument` carries an unattached `Node2D` root plus an enumerable asset/slot manifest.
- Bounds nodes support authored extents; `Node2D` supports linkage identity and managed content swap.
- `resolveScene2DResources` synchronously reconciles caller-ready assets and application slots.
- `loadScene2DResources` owns the operation-scoped Promise, cancellation, and progress boundary.
- URL acquisition is caller-supplied, and source dispatch uses an empty-by-default open registry.
- SVG and Lottie adapters are opt-in. Rive, SWF, and custom codecs can register without changing this package.
- Hand-authored tests cover slot/linkage behavior, reference-owned replacement, synchronous reconciliation,
  deterministic async results, cancellation, registry replacement, URL acquisition, SVG, and Lottie.
- Scoped package checks/tests and bundle-size verification pass. Bare repository checks/tests remain the final
  handoff gate.

Design follow-up: building this package exposed that the 3D twin's progressive capability had a
synchronous-looking name. The subsequent 3D migration preserved it as `updateScene3DResourceStreaming`
and made its resolve stage strictly synchronous too.

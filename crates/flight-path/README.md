# flight-path

Vector paths: construction, measurement, flattening, curve fitting, dashing, morphing, stroking and tessellation.

## Precision

Path coordinates, distances, tolerances, angles, transforms, measurements, predicates, meshes and
morph/stroke values stay `f64` end to end, matching TS `number`. The only `f32` boundary is the
explicit final `PathMeshTyped.vertices: Float32Array` GPU upload. `tessellate_path_typed` and
`tessellate_path_typed_into` perform that one narrowing store; the plain `PathMesh` remains `f64`.

`tests/f64_bridge_test.rs` freezes this exact boundary inventory and rejects any unclassified `f32`
syntax added to production source.

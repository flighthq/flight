// The one fragment tail every built-in Wgpu mesh prelude returns through, and the single place the
// output contract is stated: a mesh fragment shader hands the blend unit PREMULTIPLIED color. Every
// blend state in render-wgpu's table is a premultiplied one, so a tail that returned straight coverage
// would composite correctly under Normal alone and wrongly under Add/Multiply/Screen/Darken/Lighten —
// the alpha would simply never reach the composite. Mirrors scene-gl's GL_MESH_FRAGMENT_TAIL.
//
// ORDER IS THE WHOLE CONTRACT. Every term that can still change alpha — the alpha-mask discard, the
// material's own coverage, the color-matrix/adjustment modifiers, and node alpha (`in.objectAlpha`) —
// must already be folded into the value handed to this function. Anything that touches alpha after it
// silently breaks the invariant, because the rgb it was multiplied against is already stale.
//
// `flightMeshCoverage` is what keeps the premultiply from corrupting a draw nothing is compositing.
// Only glTF's `alphaMode: 'blend'` declares its alpha to BE coverage — 'opaque' ignores the material's
// alpha outright and a fragment surviving a 'mask' cutoff is fully opaque — so scaling rgb by a sub-1
// alpha in those cases just darkens the surface. `alphaIsCoverage` arrives per draw in `draw.params.y`;
// callers read it at the callsite rather than here, because the tail is injected above the `draw`
// binding's own declaration. Node alpha applies either way, so a faded opaque object still fades.
export const WGPU_MESH_FRAGMENT_TAIL = `
fn flightMeshCoverage(coverage : f32, objectAlpha : f32, alphaIsCoverage : f32) -> f32 {
  return mix(1.0, coverage, alphaIsCoverage) * objectAlpha;
}

fn flightPremultipliedOutput(color : vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}
`;

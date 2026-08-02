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
export const WGPU_MESH_FRAGMENT_TAIL = `
fn flightPremultipliedOutput(color : vec4f) -> vec4f {
  return vec4f(color.rgb * color.a, color.a);
}
`;

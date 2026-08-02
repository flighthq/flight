// The one fragment tail every built-in Gl mesh prelude ends with, and the single place the output
// contract is stated: a mesh fragment shader hands the blend unit PREMULTIPLIED color. Every blend
// equation in render-gl's table is a premultiplied one, so a tail that emitted straight coverage would
// composite correctly under Normal alone and wrongly under Add/Multiply/Screen/Darken/Lighten — the
// alpha would simply never reach the composite.
//
// ORDER IS THE WHOLE CONTRACT. The premultiply is LAST, after every term that can still change alpha:
// the alpha-mask discard, the material's own coverage, the color-matrix/adjustment modifiers, and node
// alpha (`u_objectAlpha`). Anything that touches alpha after this line silently breaks the invariant,
// because the rgb it was multiplied against is already stale. New alpha contributions belong ABOVE it.
//
// `u_alphaIsCoverage` is what keeps the premultiply from corrupting a draw that is not being composited.
// Only `alphaMode: 'blend'` means "this fragment's alpha IS coverage" — glTF has 'opaque' ignore the
// material's alpha outright, and a fragment surviving a 'mask' cutoff is fully opaque. Scaling rgb by a
// sub-1 alpha in those cases darkens a surface nothing is blending, which is what turned the wireframe
// scene's white lines grey. Node alpha applies either way, so a faded opaque object still fades — and
// premultiplies correctly, because fading is exactly what routes it through the blended pass.
//
// Declared as a pair with the statements that read them: a prelude that took one without the other would
// compile and then be wrong, so neither is spelled out at a callsite.
export const GL_MESH_FRAGMENT_TAIL_UNIFORMS = `uniform float u_objectAlpha;
uniform float u_alphaIsCoverage;`;

export const GL_MESH_FRAGMENT_TAIL = `  fragColor.a = mix(1.0, fragColor.a, u_alphaIsCoverage) * u_objectAlpha;
  fragColor.rgb *= fragColor.a;`;

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
export const GL_MESH_FRAGMENT_TAIL = `  fragColor.a *= u_objectAlpha;
  fragColor.rgb *= fragColor.a;`;

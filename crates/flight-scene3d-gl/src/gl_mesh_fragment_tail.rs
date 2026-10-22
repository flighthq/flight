// The one fragment tail every built-in GL mesh prelude ends with, and the single place the output
// contract is stated: a mesh fragment shader hands the blend unit PREMULTIPLIED color. Every blend
// equation in render-gl's table is a premultiplied one.
//
// ORDER IS THE WHOLE CONTRACT. The premultiply is LAST, after every term that can still change alpha:
// the alpha-mask discard, the material's own coverage, the color-matrix/adjustment modifiers, and node
// alpha (`u_objectAlpha`). New alpha contributions belong ABOVE it.
//
// `u_alphaIsCoverage` keeps the premultiply from corrupting a draw that is not being composited: only
// `alphaMode: 'blend'` means "this fragment's alpha IS coverage". Node alpha applies either way.
//
// Declared as a pair with the statements that read them, so neither is spelled out at a callsite.

macro_rules! gl_mesh_fragment_tail_uniforms_glsl {
    () => {
        concat!(r#"uniform float u_objectAlpha;
uniform float u_alphaIsCoverage;"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_mesh_fragment_tail_uniforms_glsl;

pub const GL_MESH_FRAGMENT_TAIL_UNIFORMS: &str = gl_mesh_fragment_tail_uniforms_glsl!();

macro_rules! gl_mesh_fragment_tail_glsl {
    () => {
        concat!(r#"  fragColor.a = mix(1.0, fragColor.a, u_alphaIsCoverage) * u_objectAlpha;
  fragColor.rgb *= fragColor.a;"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_mesh_fragment_tail_glsl;

pub const GL_MESH_FRAGMENT_TAIL: &str = gl_mesh_fragment_tail_glsl!();


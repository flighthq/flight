use flight_render_gl::GlRenderState;

use crate::gl_scene3d_runtime::{get_gl_scene3d_runtime, get_gl_scene3d_runtime_mut};
use crate::types::GlMeshSkinFeature;

pub fn get_gl_mesh_skin_feature(state: &GlRenderState) -> Option<GlMeshSkinFeature> {
    return get_gl_scene3d_runtime(state, |rt| rt.mesh_skin_feature.clone());
}

pub fn register_gl_mesh_skinning(state: &GlRenderState) {
    get_gl_scene3d_runtime_mut(state, |rt| {
        if rt.mesh_skin_feature.is_some() {
            return;
        }
        rt.mesh_skin_feature = Some(GlMeshSkinFeature {
            skin_declarations_glsl: GL_SKIN_VERTEX_DECLARATIONS_GLSL.to_string(),
        });
    });
}

pub const GL_SKIN_VERTEX_DECLARATIONS_GLSL: &str = r#"
layout(location = 6) in vec4 a_joints0;
layout(location = 7) in vec4 a_weights0;
uniform highp sampler2D u_jointTexture;
uniform highp sampler2D u_jointNormalTexture;

mat4 fetchJointMatrix(int joint) {
  int x = joint * 4;
  int w = textureSize(u_jointTexture, 0).x;
  return mat4(
    texelFetch(u_jointTexture, ivec2(x % w, x / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 1) % w, (x + 1) / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 2) % w, (x + 2) / w), 0),
    texelFetch(u_jointTexture, ivec2((x + 3) % w, (x + 3) / w), 0)
  );
}

mat4 skinMatrix() {
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat4(1.0);
  return a_weights0.x * fetchJointMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointMatrix(int(a_joints0.w));
}

mat3 fetchJointNormalMatrix(int joint) {
  int x = joint * 3;
  int w = textureSize(u_jointNormalTexture, 0).x;
  return mat3(
    texelFetch(u_jointNormalTexture, ivec2(x % w, x / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 1) % w, (x + 1) / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 2) % w, (x + 2) / w), 0).xyz
  );
}

mat3 skinNormalMatrix() {
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat3(1.0);
  return a_weights0.x * fetchJointNormalMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointNormalMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointNormalMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointNormalMatrix(int(a_joints0.w));
}
"#;

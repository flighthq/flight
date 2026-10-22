// flight-lint: allow-file(contract-vocabulary) D17 the skinning capability binds glow palette textures over thread-bound render-gl state

//! The opt-in GPU mesh-skinning capability: the palette binding AND the vertex GLSL the HAS_SKIN
//! program variant splices in. Registering installs the capability on GlScene3DRuntime; every skin
//! consumer (family preludes, the forward draw, the shadow depth variant) reaches skinning only through
//! that slot, so an unregistered state references no skin binder and no skin GLSL.

use flight_entity::throw_error;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlRenderState, upload_gl_skin_palette_texture};
use glow::HasContext;

use crate::gl_mesh_program::{SKIN_NORMAL_PALETTE_TEXTURE_UNIT, SKIN_PALETTE_TEXTURE_UNIT};
use crate::gl_scene3d_runtime::{
    ensure_gl_skin_normal_palette, ensure_gl_skin_palette, get_gl_scene3d_runtime,
};
use crate::types::{GlMeshProgram, GlMeshSkinFeature};

static GL_MESH_SKIN_FEATURE: GlMeshSkinFeature = GlMeshSkinFeature {
    bind_mesh_skin_palette: bind_gl_mesh_skin_palette,
    bind_shadow_skin_palette: bind_gl_shadow_skin_palette,
    vertex_declarations_glsl: GL_SKIN_VERTEX_DECLARATIONS_GLSL,
};

// Vertex-stage GLSL the HAS_SKIN variant prepends before the family's vertex body: the joints0/weights0
// influence attributes (locations 6/7, wired by ensure_gl_mesh_upload), the bone-palette DATA TEXTURE,
// and the linear-blend `skinMatrix()` the body applies to position/normal/tangent. The palette is an
// RGBA32F texture read with texelFetch, one mat4 packed as four consecutive texels, wrapping into
// multiple rows past MAX_TEXTURE_SIZE. Vertex-only — never added to a fragment source.
macro_rules! gl_skin_vertex_declarations_glsl {
    () => {
        concat!(r#"
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

// A vertex with NO influence stays at its bind pose, which the weighted sum cannot express: with every
// weight zero the sum is the ZERO matrix, so the vertex would land on the origin with w = 0. Identity is
// the bind pose. packSkinInfluences documents this case as legal — it zero-fills unused slots and says
// such a vertex "stays at its bind position" — and the CPU skinVertices path falls back the same way.
mat4 skinMatrix() {
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat4(1.0);
  return a_weights0.x * fetchJointMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointMatrix(int(a_joints0.w));
}

// Three texels per joint, one per padded vec4 column; the fourth component of each is unused.
mat3 fetchJointNormalMatrix(int joint) {
  int x = joint * 3;
  int w = textureSize(u_jointNormalTexture, 0).x;
  return mat3(
    texelFetch(u_jointNormalTexture, ivec2(x % w, x / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 1) % w, (x + 1) / w), 0).xyz,
    texelFetch(u_jointNormalTexture, ivec2((x + 2) % w, (x + 2) / w), 0).xyz
  );
}

// A normal is a covector: under non-uniform joint scale it follows the inverse-transpose, not the pose
// matrix a position and a tangent follow. Blending the per-joint inverse-transposes is an APPROXIMATION
// — the inverse-transpose of the blend is a different matrix — and it is the affordable one, since the
// exact answer needs a 3x3 inverse per vertex. The CPU path blends the same way, so the two agree.
mat3 skinNormalMatrix() {
  // Same no-influence fallback as skinMatrix: a zero blend would hand the shader a zero normal, which
  // every lighting term then normalizes into an undefined direction.
  float totalWeight = a_weights0.x + a_weights0.y + a_weights0.z + a_weights0.w;
  if (totalWeight == 0.0) return mat3(1.0);
  return a_weights0.x * fetchJointNormalMatrix(int(a_joints0.x))
       + a_weights0.y * fetchJointNormalMatrix(int(a_joints0.y))
       + a_weights0.z * fetchJointNormalMatrix(int(a_joints0.z))
       + a_weights0.w * fetchJointNormalMatrix(int(a_joints0.w));
}
"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_skin_vertex_declarations_glsl;

pub const GL_SKIN_VERTEX_DECLARATIONS_GLSL: &str = gl_skin_vertex_declarations_glsl!();

// Uploads and binds the pose + normal palettes consumed by a HAS_SKIN mesh program. Returns true only
// when both the selected program and the draw proxy carry the pose data, which is also the signal that
// upload consumers must source the static bind-pose vertices. The joint count comes from the POSE
// palette on purpose: the normal array is 12 floats per joint, not 16.
pub fn bind_gl_mesh_skin_palette(
    state: &mut GlRenderState,
    program: &GlMeshProgram,
    proxy: &Scene3DRenderProxy,
) -> bool {
    let joint_texture = program.loc_joint_texture.get().flatten();
    let (Some(joint_texture), Some(joint_matrices)) = (joint_texture, &proxy.joint_matrices) else {
        return false;
    };

    let gl = state.gl.clone();
    let joint_matrices = joint_matrices.read().unwrap();
    let joint_count = joint_matrices.len() / 16;
    {
        let mut palette = ensure_gl_skin_palette(state);
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT) };
        upload_gl_skin_palette_texture(state, &mut palette, &joint_matrices, joint_count, None)
            .unwrap_or_else(|error| throw_error(&error));
    }
    // SAFETY: the program is bound on the owning GL thread.
    unsafe { gl.uniform_1_i32(Some(&joint_texture), SKIN_PALETTE_TEXTURE_UNIT as i32) };

    // The normal palette rides its own unit and its own texture: three texels per joint, not four.
    let joint_normal_texture = program.loc_joint_normal_texture.get().flatten();
    if let (Some(joint_normal_texture), Some(normal_matrices)) =
        (joint_normal_texture, &proxy.normal_matrices)
    {
        let normal_matrices = normal_matrices.read().unwrap();
        let mut normal_palette = ensure_gl_skin_normal_palette(state);
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + SKIN_NORMAL_PALETTE_TEXTURE_UNIT) };
        upload_gl_skin_palette_texture(state, &mut normal_palette, &normal_matrices, joint_count, Some(3))
            .unwrap_or_else(|error| throw_error(&error));
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            gl.uniform_1_i32(Some(&joint_normal_texture), SKIN_NORMAL_PALETTE_TEXTURE_UNIT as i32);
        }
    }
    return true;
}

// Uploads and binds the pose palette for the shadow depth variant. The depth pass deforms position
// only, so it needs no normal palette.
// flight-lint: allow(conform-array) D17 a borrowed f32 slice is the native zero-copy analogue of the source Float32Array palette
pub fn bind_gl_shadow_skin_palette(state: &mut GlRenderState, joint_matrices: &[f32]) {
    let gl = state.gl.clone();
    // SAFETY: texture-unit selection runs on the owning GL thread.
    unsafe { gl.active_texture(glow::TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT) };
    let mut palette = ensure_gl_skin_palette(state);
    upload_gl_skin_palette_texture(state, &mut palette, joint_matrices, joint_matrices.len() / 16, None)
        .unwrap_or_else(|error| throw_error(&error));
}

// Returns the GPU skinning capability registered on this state, or None. Every skin consumer reads
// skinning ONLY through here.
pub fn get_gl_mesh_skin_feature(state: &GlRenderState) -> Option<&'static GlMeshSkinFeature> {
    return get_gl_scene3d_runtime(state).mesh_skin_feature;
}

// Opts this state into GPU mesh skinning. Until it is called, render_gl_scene3d leaves
// active_skinned_run false, so no family compiles a HAS_SKIN variant and no palette is bound: a skinned
// mesh draws at its bind pose. Idempotent.
pub fn register_gl_mesh_skinning(state: &GlRenderState) {
    get_gl_scene3d_runtime(state).mesh_skin_feature = Some(&GL_MESH_SKIN_FEATURE);
}

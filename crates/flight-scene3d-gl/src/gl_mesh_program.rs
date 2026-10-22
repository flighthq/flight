// flight-lint: allow-file(contract-vocabulary) D17 mesh program helpers drive glow native handles over thread-bound render-gl state

use std::any::Any;
use std::rc::Rc;

use flight_camera::{Camera3D, get_camera_3d_position, get_camera_3d_view_projection_matrix4};
use flight_entity::throw_error;
use flight_geometry::{create_matrix3, create_matrix4, create_vector3};
use flight_materials::{Material3D, MaterialAlphaMode};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlRenderState, create_gl_program, upload_gl_skin_palette_texture};
use flight_texture::{
    TextureVariant, get_texture_uv_matrix, has_texture_source, has_texture_uv_transform,
};
use glow::{HasContext, NativeProgram, NativeUniformLocation};

use crate::gl_mesh_upload::ensure_gl_mesh_upload;
use crate::gl_scene3d_runtime::{
    ensure_gl_instance_color_palette, ensure_gl_instance_palette, get_gl_scene3d_runtime,
};
use crate::gl_viewport_aspect::get_gl_scene3d_viewport_aspect;
use crate::types::{GlLazyUniformLocation, GlMeshProgram, GlMeshProgramFamily, GlMeshProgramRef};

// Vertex-stage GLSL every map-sampling family interpolates into its vertex body ahead of `main`: the
// guarded u_uvTransform uniform and an applyUvTransform() the body calls on a_uv0. HAS_UV_TRANSFORM
// gates both, so an untiled surface compiles the identity branch. u_uvTransform is column-major.
macro_rules! gl_uv_transform_vertex_glsl {
    () => {
        concat!(
            r#"
#ifdef HAS_UV_TRANSFORM
uniform mat3 u_uvTransform;
vec2 applyUvTransform(vec2 uv) { return (u_uvTransform * vec3(uv, 1.0)).xy; }
#else
vec2 applyUvTransform(vec2 uv) { return uv; }
#endif
"#
        )
    };
}
#[allow(unused_imports)]
pub(crate) use gl_uv_transform_vertex_glsl;

pub const GL_UV_TRANSFORM_VERTEX_GLSL: &str = gl_uv_transform_vertex_glsl!();

// The GPU skin-palette bone texture is read from this texture unit — above the material maps (0–4),
// the directional shadow map (8), and the IBL set (9/10/11).
pub const SKIN_PALETTE_TEXTURE_UNIT: u32 = 12;
// The normal palette's own unit, separate from the pose palette so a padded 3x3 uploads directly.
pub const SKIN_NORMAL_PALETTE_TEXTURE_UNIT: u32 = 13;
pub const INSTANCE_PALETTE_TEXTURE_UNIT: u32 = 14;

// The per-instance colour palette rides its own unit beside the matrix palette; both are vertex-stage
// fetches, and WebGL2 guarantees at least 16 vertex texture image units.
pub const INSTANCE_COLOR_PALETTE_TEXTURE_UNIT: u32 = 15;

macro_rules! gl_instance_vertex_declarations_glsl {
    () => {
        concat!(r#"
uniform highp sampler2D u_instancePalette;
uniform highp sampler2D u_instanceColorPalette;

// One linear RGBA texel per instance. A batch carrying no per-instance colours uploads opaque white, so
// this is an identity multiply there and the families need no second program variant for the tinted case.
vec4 instanceColor() {
  int id = gl_InstanceID;
  int w = textureSize(u_instanceColorPalette, 0).x;
  return texelFetch(u_instanceColorPalette, ivec2(id % w, id / w), 0);
}

mat4 instanceModelMatrix() {
  int x = gl_InstanceID * 4;
  int w = textureSize(u_instancePalette, 0).x;
  return mat4(
    texelFetch(u_instancePalette, ivec2(x % w, x / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 1) % w, (x + 1) / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 2) % w, (x + 2) / w), 0),
    texelFetch(u_instancePalette, ivec2((x + 3) % w, (x + 3) / w), 0)
  );
}
"#)
    };
}
#[allow(unused_imports)]
pub(crate) use gl_instance_vertex_declarations_glsl;

pub const GL_INSTANCE_VERTEX_DECLARATIONS_GLSL: &str = gl_instance_vertex_declarations_glsl!();

// The shared mesh-program record for a freshly linked program: every lazily resolved location is
// unresolved, every eagerly resolved one absent until the family fills it.
pub(crate) fn create_gl_mesh_program_record(program: NativeProgram) -> GlMeshProgram {
    return GlMeshProgram {
        loc_color_scale: GlLazyUniformLocation::default(),
        loc_color_bias: GlLazyUniformLocation::default(),
        loc_color_matrix0: GlLazyUniformLocation::default(),
        loc_color_matrix1: GlLazyUniformLocation::default(),
        loc_color_matrix2: GlLazyUniformLocation::default(),
        loc_color_matrix3: GlLazyUniformLocation::default(),
        loc_color_matrix_offset: GlLazyUniformLocation::default(),
        loc_object_alpha: GlLazyUniformLocation::default(),
        loc_alpha_is_coverage: GlLazyUniformLocation::default(),
        loc_joint_texture: GlLazyUniformLocation::default(),
        loc_instance_palette: GlLazyUniformLocation::default(),
        loc_instance_color_palette: GlLazyUniformLocation::default(),
        loc_joint_normal_texture: GlLazyUniformLocation::default(),
        loc_model: None,
        loc_normal_matrix: None,
        loc_uv_transform: GlLazyUniformLocation::default(),
        loc_view_projection: None,
        program,
    };
}

// The shared per-bind head for every mesh-material family: stores the family's program as the active
// bind→draw handoff, selects it, and sets the depth + face-cull state a forward 3D draw needs (depth
// test LESS; depth write off for blended runs and on otherwise; back-face cull unless the material is
// double-sided).
pub fn begin_gl_mesh_draw(state: &GlRenderState, program: &GlMeshProgramRef, double_sided: bool) {
    let gl = &state.gl;
    let blended = {
        let mut runtime = get_gl_scene3d_runtime(state);
        runtime.active_mesh_program = Some(program.clone());
        runtime.active_blended_run
    };
    // SAFETY: fixed-function state changes run on the owning GL thread.
    unsafe {
        gl.use_program(Some(program.mesh_program().program));
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LESS);
        gl.depth_mask(!blended);
        if double_sided {
            gl.disable(glow::CULL_FACE);
        } else {
            gl.enable(glow::CULL_FACE);
            gl.cull_face(glow::BACK);
        }
    }
}

// Uploads and binds the per-instance linear RGBA colours consumed by a HAS_INSTANCES program. One
// texel per instance.
// flight-lint: allow(conform-array) D17 a borrowed f32 slice is the native zero-copy analogue of the source Float32Array colours
pub fn bind_gl_instance_color_palette(
    state: &GlRenderState,
    program: &GlMeshProgram,
    instance_colors: &[f32],
    instance_count: usize,
) {
    let gl = &state.gl;
    {
        let mut palette = ensure_gl_instance_color_palette(state);
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + INSTANCE_COLOR_PALETTE_TEXTURE_UNIT) };
        upload_gl_skin_palette_texture(
            state,
            &mut palette,
            instance_colors,
            instance_count,
            Some(1),
        )
        .unwrap_or_else(|error| throw_error(&error));
    }
    let location = resolve_gl_lazy_uniform_location(
        gl,
        program.program,
        &program.loc_instance_color_palette,
        "u_instanceColorPalette",
    );
    if location.is_some() {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            gl.uniform_1_i32(
                location.as_ref(),
                INSTANCE_COLOR_PALETTE_TEXTURE_UNIT as i32,
            )
        };
    }
}

// Uploads and binds the per-instance model matrices consumed by a HAS_INSTANCES program (four texels
// per instance).
// flight-lint: allow(conform-array) D17 a borrowed f32 slice is the native zero-copy analogue of the source Float32Array matrices
pub fn bind_gl_instance_palette(
    state: &GlRenderState,
    program: &GlMeshProgram,
    instance_matrices: &[f32],
    instance_count: usize,
) {
    let gl = &state.gl;
    {
        let mut palette = ensure_gl_instance_palette(state);
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + INSTANCE_PALETTE_TEXTURE_UNIT) };
        upload_gl_skin_palette_texture(
            state,
            &mut palette,
            instance_matrices,
            instance_count,
            None,
        )
        .unwrap_or_else(|error| throw_error(&error));
    }
    let location = resolve_gl_lazy_uniform_location(
        gl,
        program.program,
        &program.loc_instance_palette,
        "u_instancePalette",
    );
    if location.is_some() {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { gl.uniform_1_i32(location.as_ref(), INSTANCE_PALETTE_TEXTURE_UNIT as i32) };
    }
}

// Uploads a material's primary-texture uv transform to the HAS_UV_TRANSFORM vertex variant. Resolves
// u_uvTransform lazily and caches it on the program: a missing location means the compiled variant
// omits the uniform (the identity path), and a missing texture likewise skips. The matrix is
// column-major, so it uploads with transpose=false.
pub fn bind_gl_uv_transform(
    gl: &glow::Context,
    program: &GlMeshProgram,
    texture: Option<&dyn TextureVariant>,
) {
    let location = resolve_gl_lazy_uniform_location(
        gl,
        program.program,
        &program.loc_uv_transform,
        "u_uvTransform",
    );
    let (Some(location), Some(texture)) = (location, texture) else {
        return;
    };
    let mut uv_matrix = create_matrix3();
    get_texture_uv_matrix(&mut uv_matrix, texture);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe { gl.uniform_matrix_3_f32_slice(Some(&location), false, &uv_matrix.m) };
}

// Compiles a vertex + fragment source pair into a linked GL program, shared by every family's compile.
// Panics (TS throws) on a compile or link failure, which is a programmer error (a malformed prelude).
pub fn compile_gl_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
) -> NativeProgram {
    return create_gl_program(gl, vertex_source, fragment_source, Some("Mesh"))
        .unwrap_or_else(|error| throw_error(&error));
}

// Frees the linked GL program backing a mesh-material family program. Frees only the shader program;
// the caller drops it from its cache separately. The per-program upload records are dropped here,
// because the driver may recycle the program's name for a later program.
pub fn destroy_gl_mesh_program(state: &GlRenderState, program: &GlMeshProgram) {
    // SAFETY: the program belongs to this state's context.
    unsafe { state.gl.delete_program(program.program) };
    let mut scene = get_gl_scene3d_runtime(state);
    scene.uploaded_light_blocks.remove(&program.program);
    scene
        .custom_shader_checked_programs
        .remove(&program.program);
}

// The shared per-draw tail for every mesh-material family: uploads the model + normal matrices from the
// proxy, the per-object alpha and color adjustment, binds the skin or instance palettes, lazily uploads
// the geometry's GPU buffers (cached by geometry.version), and issues the indexed (or array) draw over
// the proxy's subset range.
pub fn draw_gl_mesh_subset(
    state: &mut GlRenderState,
    program: &GlMeshProgram,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let gl = state.gl.clone();
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &proxy.world_matrix.m);
        if program.loc_normal_matrix.is_some() {
            gl.uniform_matrix_3_f32_slice(
                program.loc_normal_matrix.as_ref(),
                false,
                &proxy.normal_matrix.m,
            );
        }
        // A world matrix that MIRRORS (negative determinant) flips the triangle winding on the way to
        // clip space; flip the front-face convention for this draw (restored to CCW after the draw).
        gl.front_face(if is_mirroring_world_matrix(&proxy.world_matrix.m) {
            glow::CW
        } else {
            glow::CCW
        });
    }

    {
        let material = proxy.material.read().unwrap();
        upload_gl_mesh_draw_alpha(&gl, program, proxy.alpha.unwrap_or(1.0), Some(&*material));
    }

    // A resolved per-object transform promotes only this draw run to the registered material-feature
    // variant; locations are resolved lazily so a base program performs no lookups or uploads.
    if let Some(color_matrix) = &proxy.color_matrix {
        let program_handle = program.program;
        let location0 = match program.loc_color_matrix0.get() {
            Some(location) => location,
            None => {
                // SAFETY: lookups run on the owning GL thread.
                unsafe {
                    let location0 = gl.get_uniform_location(program_handle, "u_flightColorMatrix0");
                    program.loc_color_matrix0.set(Some(location0));
                    program.loc_color_matrix1.set(Some(
                        gl.get_uniform_location(program_handle, "u_flightColorMatrix1"),
                    ));
                    program.loc_color_matrix2.set(Some(
                        gl.get_uniform_location(program_handle, "u_flightColorMatrix2"),
                    ));
                    program.loc_color_matrix3.set(Some(
                        gl.get_uniform_location(program_handle, "u_flightColorMatrix3"),
                    ));
                    program.loc_color_matrix_offset.set(Some(
                        gl.get_uniform_location(program_handle, "u_flightColorMatrixOffset"),
                    ));
                    location0
                }
            }
        };
        if location0.is_some() {
            let m = color_matrix;
            let location1 = program.loc_color_matrix1.get().flatten();
            let location2 = program.loc_color_matrix2.get().flatten();
            let location3 = program.loc_color_matrix3.get().flatten();
            let offset = program.loc_color_matrix_offset.get().flatten();
            // SAFETY: the program is bound on the owning GL thread.
            unsafe {
                gl.uniform_4_f32(location0.as_ref(), m[0], m[1], m[2], m[3]);
                gl.uniform_4_f32(location1.as_ref(), m[5], m[6], m[7], m[8]);
                gl.uniform_4_f32(location2.as_ref(), m[10], m[11], m[12], m[13]);
                gl.uniform_4_f32(location3.as_ref(), m[15], m[16], m[17], m[18]);
                gl.uniform_4_f32(offset.as_ref(), m[4], m[9], m[14], m[19]);
            }
        }
    } else if let Some(color_scale_bias) = &proxy.color_scale_bias {
        let (location_scale, location_bias) = match program.loc_color_scale.get() {
            Some(location) => (location, program.loc_color_bias.get().flatten()),
            None => {
                // SAFETY: lookups run on the owning GL thread.
                let (scale, bias) = unsafe {
                    (
                        gl.get_uniform_location(program.program, "u_flightColorScale"),
                        gl.get_uniform_location(program.program, "u_flightColorBias"),
                    )
                };
                program.loc_color_scale.set(Some(scale));
                program.loc_color_bias.set(Some(bias));
                (scale, bias)
            }
        };
        if location_scale.is_some() && location_bias.is_some() {
            // SAFETY: the program is bound on the owning GL thread.
            unsafe {
                gl.uniform_4_f32(
                    location_scale.as_ref(),
                    color_scale_bias.red_scale,
                    color_scale_bias.green_scale,
                    color_scale_bias.blue_scale,
                    color_scale_bias.alpha_scale,
                );
                gl.uniform_4_f32(
                    location_bias.as_ref(),
                    color_scale_bias.red_bias,
                    color_scale_bias.green_bias,
                    color_scale_bias.blue_bias,
                    color_scale_bias.alpha_bias,
                );
            }
        }
    }

    let instance_count = proxy.instance_count.unwrap_or(0);
    let gpu_instanced = instance_count > 0 && proxy.instance_matrices.is_some();
    // Skinning is opt-in: with no capability registered there is no binder to call.
    let skin_feature = get_gl_scene3d_runtime(state).mesh_skin_feature;
    let gpu_skinned = match skin_feature {
        Some(feature) if !gpu_instanced => (feature.bind_mesh_skin_palette)(state, program, proxy),
        _ => false,
    };

    if gpu_instanced {
        if let Some(matrices) = &proxy.instance_matrices {
            bind_gl_instance_palette(state, program, matrices, instance_count);
        }
        if let Some(colors) = &proxy.instance_colors {
            bind_gl_instance_color_palette(state, program, colors, instance_count);
        }
    }

    // A GPU-skinned draw uploads the static bind pose (the shader deforms it via the palette).
    let upload = ensure_gl_mesh_upload(state, geometry, Some(gpu_skinned));
    let subset = proxy.subset;

    // SAFETY: the draw runs on the owning GL thread against the VAO the upload left bound.
    unsafe {
        if upload.index_buffer.is_some() {
            let element_size = if upload.index_type == glow::UNSIGNED_INT {
                4
            } else {
                2
            };
            let offset = (subset.index_offset * element_size) as i32;
            if gpu_instanced {
                gl.draw_elements_instanced(
                    upload.primitive_mode,
                    subset.index_count as i32,
                    upload.index_type,
                    offset,
                    instance_count as i32,
                );
            } else {
                gl.draw_elements(
                    upload.primitive_mode,
                    subset.index_count as i32,
                    upload.index_type,
                    offset,
                );
            }
            gl.front_face(glow::CCW);
        } else {
            if gpu_instanced {
                gl.draw_arrays_instanced(
                    upload.primitive_mode,
                    subset.index_offset as i32,
                    subset.index_count as i32,
                    instance_count as i32,
                );
            } else {
                gl.draw_arrays(
                    upload.primitive_mode,
                    subset.index_offset as i32,
                    subset.index_count as i32,
                );
            }
            gl.front_face(glow::CCW);
        }
    }
}

// Resolves a compiled program for a string cache key, compiling it via the factory on first use and
// caching it on the scene runtime's per-state program_cache. The key is namespaced by family + define
// key (for example `unlit:b-`), so distinct families and variants compile at most once per state and
// never collide; the namespace also guarantees a key always maps to the same family record type.
pub fn ensure_gl_scene3d_program<T: GlMeshProgramFamily>(
    state: &GlRenderState,
    key: &str,
    compile: impl FnOnce(&glow::Context) -> T,
) -> Rc<T> {
    let cached = get_gl_scene3d_runtime(state)
        .program_cache
        .get(key)
        .cloned();
    let program: GlMeshProgramRef = match cached {
        Some(program) => program,
        None => {
            let program: GlMeshProgramRef = Rc::new(compile(&state.gl));
            get_gl_scene3d_runtime(state)
                .program_cache
                .insert(key.to_string(), program.clone());
            program
        }
    };
    let program: Rc<dyn Any> = program;
    return program.downcast::<T>().unwrap_or_else(|_| {
        throw_error(&format!(
            "ensureGlScene3DProgram: key `{key}` holds another family's program"
        ))
    });
}

// The HAS_UV_TRANSFORM define-key predicate every map-sampling family shares: true only when the
// material's primary map is bound (it has a source) AND carries a non-identity uv transform.
pub fn has_gl_uv_transform(texture: Option<&dyn TextureVariant>) -> bool {
    return texture
        .is_some_and(|texture| has_texture_source(texture) && has_texture_uv_transform(texture));
}

// Whether a draw's fragment alpha is COVERAGE the compositor should honor: only alphaMode 'blend'.
fn is_gl_mesh_alpha_coverage(material: Option<&dyn Material3D>) -> bool {
    return material.is_some_and(|material| {
        material.material3d_fields().alpha_mode == MaterialAlphaMode::Blend
    });
}

// Whether a world matrix flips orientation — the determinant of its upper 3x3 is negative.
fn is_mirroring_world_matrix(m: &[f32; 16]) -> bool {
    return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9])
        + m[8] * (m[1] * m[6] - m[2] * m[5])
        < 0.0;
}

// Resolves a lazily cached uniform location: looks it up once and caches the result (present or
// absent) on the program.
pub(crate) fn resolve_gl_lazy_uniform_location(
    gl: &glow::Context,
    program: NativeProgram,
    cache: &GlLazyUniformLocation,
    name: &str,
) -> Option<NativeUniformLocation> {
    if let Some(location) = cache.get() {
        return location;
    }
    // SAFETY: the lookup runs on the owning GL thread.
    let location = unsafe { gl.get_uniform_location(program, name) };
    cache.set(Some(location));
    return location;
}

// Uploads the camera world position (the translation of the inverse view matrix) to a lit family's
// u_cameraPosition, through the canonical eye-position primitive.
pub fn set_gl_mesh_camera_position(
    gl: &glow::Context,
    loc_camera_position: Option<NativeUniformLocation>,
    camera: &Camera3D,
) {
    let mut position = create_vector3(0.0, 0.0, 0.0);
    get_camera_3d_position(&mut position, camera);
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        gl.uniform_3_f32(
            loc_camera_position.as_ref(),
            position.x,
            position.y,
            position.z,
        );
    }
}

// Uploads the camera view-projection matrix to a program's u_viewProjection. An active pass viewport
// is authoritative over the camera's stored perspective aspect; degenerate dimensions fall back to 1.
pub fn set_gl_mesh_view_projection(
    state: &GlRenderState,
    loc_view_projection: Option<NativeUniformLocation>,
    camera: &Camera3D,
) {
    let mut view_projection = create_matrix4();
    get_camera_3d_view_projection_matrix4(
        &mut view_projection,
        camera,
        get_gl_scene3d_viewport_aspect(state),
    );
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state.gl.uniform_matrix_4_f32_slice(
            loc_view_projection.as_ref(),
            false,
            &view_projection.m,
        );
    }
}

// Uploads a draw's resolved per-object opacity into `u_objectAlpha` and whether that alpha is coverage
// into `u_alphaIsCoverage`, resolving each location once per program and caching it. A program whose
// fragment shader lacks a uniform caches its absence and skips silently.
pub fn upload_gl_mesh_draw_alpha(
    gl: &glow::Context,
    program: &GlMeshProgram,
    alpha: f32,
    material: Option<&dyn Material3D>,
) {
    let location = resolve_gl_lazy_uniform_location(
        gl,
        program.program,
        &program.loc_object_alpha,
        "u_objectAlpha",
    );
    if location.is_some() {
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { gl.uniform_1_f32(location.as_ref(), alpha) };
    }
    let coverage_location = resolve_gl_lazy_uniform_location(
        gl,
        program.program,
        &program.loc_alpha_is_coverage,
        "u_alphaIsCoverage",
    );
    if coverage_location.is_some() {
        let coverage = if is_gl_mesh_alpha_coverage(material) {
            1.0
        } else {
            0.0
        };
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { gl.uniform_1_f32(coverage_location.as_ref(), coverage) };
    }
}

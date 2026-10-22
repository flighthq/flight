// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use std::rc::Rc;
use std::sync::Arc;

use flight_camera::Camera3D;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{CUSTOM_SHADER_MATERIAL_KIND, CustomShaderMaterial, Material3D, UniformValue};
use flight_meshgeometry::MeshGeometry;
use flight_registry::with_kind_map_entry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{
    GlCustomMaterialShaderSource, GlMeshMaterialRenderer, GlRenderState, resolve_gl_texture,
};
use glow::{HasContext, NativeProgram, NativeUniformLocation};

use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, compile_gl_program, create_gl_mesh_program_record, draw_gl_mesh_subset,
    ensure_gl_scene3d_program, set_gl_mesh_camera_position, set_gl_mesh_view_projection,
};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMeshProgram, GlMeshProgramFamily, GlMeshProgramRef};

// A compiled custom-shader program plus its resolved built-in uniform locations. The user's custom
// uniform locations are resolved lazily (get_uniform_location on first use per name) and not cached
// here, because the set of names varies per material instance.
struct GlCustomShaderProgram {
    mesh: GlMeshProgram,
    loc_camera_position: Option<NativeUniformLocation>,
}

// The built-in CustomShaderMaterial forward renderer (GlMeshMaterialRenderer for
// CustomShaderMaterialKind). Looks up the user-registered vertex+fragment source by shader_key,
// compiles on first use, uploads the four built-in uniforms (u_viewProjection, u_model, u_normalMatrix,
// u_cameraPosition), then iterates the material's custom uniforms and textures. A missing shader_key
// silently skips (the active_mesh_program stays None and draw is a no-op), matching the sentinel
// convention used elsewhere in the material registry.
pub static GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_gl_custom_shader_mesh_material,
    draw: draw_gl_custom_shader_mesh_material,
};

// Returns the vertex+fragment source pair registered under `shader_key` for this state, or None when no
// source is registered. The None sentinel drives the skip-draw path in bind.
pub fn get_gl_custom_material_shader_source<'a>(
    state: &'a GlRenderState,
    shader_key: &str,
) -> Option<&'a GlCustomMaterialShaderSource> {
    return state.gl_registries.custom_material_shaders.entries.get(shader_key);
}

// Registers a vertex + fragment shader source pair under `shader_key` for this state, so a
// CustomShaderMaterial naming that key compiles and runs it. The vertex stage receives the standard
// mesh attributes (a_position loc 0, a_normal loc 1, a_tangent loc 2, a_uv0 loc 3) and must declare the
// four built-in uniforms with these exact types: `mat4 u_viewProjection`, `mat4 u_model`, `mat3
// u_normalMatrix` (NOT mat4 — the renderer uploads it with uniformMatrix3fv, so a mat4 declaration
// raises a silent GL_INVALID_OPERATION and the mesh draws nothing; enable_gl_scene3d_custom_shader_guards
// catches this), and `vec3 u_cameraPosition`. When the material's alphaMode is 'blend', the fragment
// shader must output PREMULTIPLIED linear scene color (rgb already scaled by the coverage it writes to
// a) — every blend equation is premultiplied, and Flight compiles caller-authored source verbatim, so
// it cannot append the fixup the built-in tails get from GL_MESH_FRAGMENT_TAIL. End your main with
// `fragColor.rgb *= fragColor.a;`. Texture uniforms sample according to each Texture.colorSpace GPU
// realization; do not decode an sRGB texture again in caller-authored GLSL. For alphaMode 'mask', the
// native shader owns the cutoff discard (pass alphaCutoff through the custom uniforms bag when needed);
// the fixed ABI cannot inject a discard into caller-authored source. Last write wins for the source
// lookup, but the compiled program is cached by shader_key, so re-registering a different source under
// the same key keeps running the already-compiled program. Register edited source under a new key to
// force a recompile.
pub fn register_gl_custom_material_shader(
    state: &mut GlRenderState,
    shader_key: &str,
    source: &GlCustomMaterialShaderSource,
) {
    state.gl_registries.custom_material_shaders = Arc::new(with_kind_map_entry(
        &state.gl_registries.custom_material_shaders,
        shader_key.to_string(),
        source.clone(),
    ));
}

// Registers the built-in CustomShaderMaterial renderer for CustomShaderMaterialKind on this state.
// Opt-in (no top-level side effect); call once per GlRenderState before drawScene3D so meshes carrying
// CustomShaderMaterials draw.
pub fn register_gl_custom_shader_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        CUSTOM_SHADER_MATERIAL_KIND.to_string(),
        &GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER,
    );
}

fn bind_gl_custom_shader_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    _lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    let custom = material.and_then(|material| material.as_any().downcast_ref::<CustomShaderMaterial>());
    let Some(custom) = custom.filter(|custom| !custom.shader_key.is_empty()) else {
        get_gl_scene3d_runtime(state).active_mesh_program = None;
        return;
    };

    let Some(source) = get_gl_custom_material_shader_source(state, &custom.shader_key).cloned() else {
        get_gl_scene3d_runtime(state).active_mesh_program = None;
        return;
    };

    let program = ensure_gl_custom_shader_program(state, &custom.shader_key, &source);
    let guard = get_gl_scene3d_runtime(state).custom_shader_guard;
    if let Some(guard) = guard {
        guard(state, program.mesh.program, &custom.shader_key);
    }
    let family: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(state, &family, custom.double_sided);
    set_gl_mesh_view_projection(state, program.mesh.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);

    upload_custom_shader_material_uniforms(&state.gl.clone(), program.mesh.program, custom);
    upload_custom_shader_material_textures(state, program.mesh.program, custom);
}

fn compile_gl_custom_shader_program(
    gl: &glow::Context,
    source: &GlCustomMaterialShaderSource,
) -> GlCustomShaderProgram {
    let linked = compile_gl_program(gl, &source.vertex, &source.fragment);
    let mut mesh = create_gl_mesh_program_record(linked);
    // SAFETY: lookups run on the owning GL thread.
    unsafe {
        let loc_camera_position = gl.get_uniform_location(linked, "u_cameraPosition");
        mesh.loc_model = gl.get_uniform_location(linked, "u_model");
        mesh.loc_normal_matrix = gl.get_uniform_location(linked, "u_normalMatrix");
        mesh.loc_view_projection = gl.get_uniform_location(linked, "u_viewProjection");
        return GlCustomShaderProgram {
            mesh,
            loc_camera_position,
        };
    }
}

fn draw_gl_custom_shader_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let program = get_gl_scene3d_runtime(state).active_mesh_program.clone();
    let Some(program) = program else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

fn ensure_gl_custom_shader_program(
    state: &GlRenderState,
    shader_key: &str,
    source: &GlCustomMaterialShaderSource,
) -> Rc<GlCustomShaderProgram> {
    return ensure_gl_scene3d_program(state, &format!("custom:{shader_key}"), |gl| {
        return compile_gl_custom_shader_program(gl, source);
    });
}

// The material's named bindings in a stable order. TS walks an object's insertion order; a Rust
// HashMap has none, so names are visited sorted to keep texture-unit assignment deterministic.
// flight-lint: allow(hashmap-iteration) the keys are collected and sorted before any observable use
fn sorted_names<T>(bag: &std::collections::HashMap<String, T>) -> Vec<&String> {
    let mut names: Vec<&String> = bag.keys().collect();
    names.sort();
    return names;
}

fn upload_custom_shader_material_textures(
    state: &mut GlRenderState,
    program: NativeProgram,
    material: &CustomShaderMaterial,
) {
    let Some(textures) = &material.textures else {
        return;
    };
    let gl = state.gl.clone();
    let mut unit: u32 = 0;
    for name in sorted_names(textures) {
        let texture = textures[name].read().unwrap();
        // SAFETY: the lookup runs on the owning GL thread.
        let Some(location) = (unsafe { gl.get_uniform_location(program, name) }) else {
            continue;
        };
        // SAFETY: texture-unit selection runs on the owning GL thread.
        unsafe { gl.active_texture(glow::TEXTURE0 + unit) };
        if resolve_gl_texture(state, &*texture, None, None).is_none() {
            continue;
        }
        // SAFETY: the program is bound on the owning GL thread.
        unsafe { gl.uniform_1_i32(Some(&location), unit as i32) };
        unit += 1;
    }
}

fn upload_custom_shader_material_uniforms(
    gl: &glow::Context,
    program: NativeProgram,
    material: &CustomShaderMaterial,
) {
    let Some(uniforms) = &material.uniforms else {
        return;
    };
    for name in sorted_names(uniforms) {
        // SAFETY: the lookup runs on the owning GL thread.
        let Some(location) = (unsafe { gl.get_uniform_location(program, name) }) else {
            continue;
        };
        let location = Some(&location);
        // SAFETY: the program is bound on the owning GL thread.
        unsafe {
            match &uniforms[name] {
                UniformValue::Scalar(value) => gl.uniform_1_f32(location, *value),
                UniformValue::Array(value) => match value.len() {
                    1 => gl.uniform_1_f32(location, value[0]),
                    2 => gl.uniform_2_f32_slice(location, value),
                    3 => gl.uniform_3_f32_slice(location, value),
                    4 => gl.uniform_4_f32_slice(location, value),
                    _ => gl.uniform_1_f32_slice(location, value),
                },
            }
        }
    }
}

// flight-lint: allow(sugar-delegates) D17 the family seam hands back the composed base record; there is no free-function contract to delegate to
impl GlMeshProgramFamily for GlCustomShaderProgram {
    fn mesh_program(&self) -> &GlMeshProgram {
        return &self.mesh;
    }
}

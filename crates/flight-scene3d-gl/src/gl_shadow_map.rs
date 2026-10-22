// flight-lint: allow-file(contract-vocabulary) D17 the depth pass renders through native glow handles on thread-bound render-gl state

use std::rc::Rc;

use flight_camera::{
    Camera3D, Projection, get_camera_3d_view_projection_matrix4,
    get_orthographic_projection_texel_size,
};
use flight_entity::throw_error;
use flight_geometry::create_matrix4;
use flight_lighting::{
    DIRECTIONAL_SHADOW_MAP_SIZE, DirectionalLight, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS,
};
use flight_meshgeometry::has_mesh_geometry_skin;
use flight_node::NodeRef;
use flight_node::contract::{for_each_node_descendant, get_node_world_matrix4};
use flight_render::{RenderTargetDepth, RenderTargetDescriptor};
use flight_render_gl::{GlRenderState, create_gl_texture_render_target};
use flight_scene3d::{InstancedMesh, Mesh};
use glow::HasContext;

use crate::gl_mesh_program::{
    SKIN_PALETTE_TEXTURE_UNIT, bind_gl_instance_palette, compile_gl_program,
    create_gl_mesh_program_record, ensure_gl_scene3d_program, gl_instance_vertex_declarations_glsl,
};
use crate::gl_mesh_upload::ensure_gl_mesh_upload;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlMeshProgram, GlScene3DShadow};

// The skin declarations (joints0/weights0 attributes, the palette texture, and skinMatrix()) are spliced
// ahead of the body exactly as the family vertex shaders splice them; model * skinMatrix() matches the
// forward path's `worldPosition = u_model * (skin * position)`.
fn build_shadow_depth_skinned_vertex(skin_declarations_glsl: &str) -> String {
    return format!(
        "#version 300 es
{skin_declarations_glsl}
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {{
  gl_Position = u_viewProjection * u_model * skinMatrix() * vec4(a_position, 1.0);
}}
"
    );
}

// The HAS_INSTANCES depth variant: the same depth pass with the instance palette declarations spliced
// in, so `u_model * instanceModelMatrix()` reproduces the forward pass's per-instance placement exactly
// and a batch records one depth silhouette per live instance.
fn compile_shadow_depth_instanced_program(gl: &glow::Context) -> GlMeshProgram {
    let program = compile_gl_program(gl, SHADOW_DEPTH_INSTANCED_VERTEX, SHADOW_DEPTH_FRAGMENT);
    let mut record = create_gl_mesh_program_record(program);
    // SAFETY: location queries on the freshly linked program.
    unsafe {
        record
            .loc_instance_palette
            .set(Some(gl.get_uniform_location(program, "u_instancePalette")));
        record.loc_model = gl.get_uniform_location(program, "u_model");
        record.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
    }
    return record;
}

fn compile_shadow_depth_program(gl: &glow::Context) -> GlMeshProgram {
    let program = compile_gl_program(gl, SHADOW_DEPTH_VERTEX, SHADOW_DEPTH_FRAGMENT);
    let mut record = create_gl_mesh_program_record(program);
    // SAFETY: location queries on the freshly linked program.
    unsafe {
        record.loc_model = gl.get_uniform_location(program, "u_model");
        record.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
    }
    return record;
}

// The HAS_SKIN depth variant: the same depth pass, but the vertex is deformed by the bone palette via
// skinMatrix() before the model/view-projection transform — the exact deformation the forward HAS_SKIN
// vertex shader applies, so a skinned caster's recorded depth matches its shaded silhouette.
fn compile_shadow_depth_skinned_program(
    gl: &glow::Context,
    skin_declarations_glsl: &str,
) -> GlMeshProgram {
    let program = compile_gl_program(
        gl,
        &build_shadow_depth_skinned_vertex(skin_declarations_glsl),
        SHADOW_DEPTH_FRAGMENT,
    );
    let mut record = create_gl_mesh_program_record(program);
    // SAFETY: location queries on the freshly linked program.
    unsafe {
        record.loc_joint_normal_texture.set(Some(
            gl.get_uniform_location(program, "u_jointNormalTexture"),
        ));
        record
            .loc_joint_texture
            .set(Some(gl.get_uniform_location(program, "u_jointTexture")));
        record.loc_model = gl.get_uniform_location(program, "u_model");
        record.loc_view_projection = gl.get_uniform_location(program, "u_viewProjection");
    }
    return record;
}

// Packs the live instance matrices into the flat array bind_gl_instance_palette uploads. The depth pass
// keeps its own scratch buffer rather than sharing the forward pass's: the two passes run at different
// points in a frame and a shared buffer would couple their growth.
fn flatten_shadow_instance_matrices(out: &mut Vec<f32>, mesh: &InstancedMesh) {
    let count = mesh.instance_count.max(0) as usize;
    let needed = count * 16;
    if out.len() < needed {
        out.resize(needed, 0.0);
    }
    for i in 0..count {
        out[i * 16..i * 16 + 16].copy_from_slice(&mesh.instance_matrices[i].read().unwrap().m);
    }
}

// Structural, matching prepare_scene_3d_render's own instanced test, so the depth pass and the forward
// pass agree on what an instanced caster is (TS `'instanceMatrices' in mesh`): only an InstancedMesh
// carries an instance count.
fn is_shadow_instanced_mesh(instance_count: Option<i32>) -> bool {
    return instance_count.is_some();
}

fn normalize_directional_shadow_pcf_radius(radius: f32) -> f32 {
    if !radius.is_finite() {
        return 0.0;
    }
    return (MAX_DIRECTIONAL_SHADOW_PCF_RADIUS as f32).min(radius.floor().max(0.0));
}

// The directional shadow recipe's first pass: render scene depth from the light's point of view into a
// sampleable depth render target (the shadow map), and record it + the light view-projection on the
// scene runtime. The subsequent render_gl_scene3d's lit binds (bind_gl_mesh_light_block) read that to
// PCF-sample the shadow during shading. Shadows are opt-in: an app that never calls this leaves
// runtime.shadow None, so existing scenes render unchanged.
//
// `shadow_camera` is the orthographic light camera (see camera's configure_directional_shadow_camera_3d).
// `directional_light` owns the enable/filter/bias policy. Calling with casts_shadow=false actively
// disables a previously rendered map without destroying its reusable target. All meshes are drawn (no
// frustum cull — an off-screen caster can still shadow the visible scene).
pub fn render_gl_scene3d_shadow_map(
    state: &mut GlRenderState,
    scene: &NodeRef,
    shadow_camera: &Camera3D,
    directional_light: Option<&DirectionalLight>,
) {
    let gl = state.gl.clone();
    let previous_matrix = {
        let mut runtime = get_gl_scene3d_runtime(state);
        if let Some(previous_shadow) = runtime.shadow.as_mut() {
            previous_shadow.enabled = false;
        }
        runtime.shadow.as_ref().map(|shadow| shadow.matrix.clone())
    };
    let Some(directional_light) = directional_light.filter(|light| light.casts_shadow) else {
        return;
    };
    let Projection::Orthographic(orthographic) = &shadow_camera.projection else {
        throw_error("renderGlScene3DShadowMap requires an orthographic shadow camera");
    };
    if get_gl_scene3d_runtime(state).shadow_target.is_none() {
        let target = create_gl_texture_render_target(
            state,
            &RenderTargetDescriptor {
                width: DIRECTIONAL_SHADOW_MAP_SIZE as f32,
                height: DIRECTIONAL_SHADOW_MAP_SIZE as f32,
                format: None,
                color_attachments: None,
                color_formats: None,
                sample_count: None,
                depth: Some(RenderTargetDepth::DepthStencilSampled),
                color_space: None,
            },
            None,
        )
        .unwrap_or_else(|error| throw_error(&error))
        .unwrap_or_else(|| {
            throw_error("renderGlScene3DShadowMap could not allocate the shadow target")
        });
        get_gl_scene3d_runtime(state).shadow_target = Some(target);
    }
    let (target_framebuffer, target_width, target_height, target_depth_texture) = {
        let runtime = get_gl_scene3d_runtime(state);
        let target = runtime
            .shadow_target
            .as_ref()
            .expect("shadow target allocated above");
        (
            target.framebuffer,
            target.axes.width,
            target.axes.height,
            target.depth_texture,
        )
    };
    let normal_bias_world = directional_light.normal_bias
        * get_orthographic_projection_texel_size(
            &orthographic.read().unwrap(),
            target_width as f32,
            target_height as f32,
        );
    let mut matrix = previous_matrix.unwrap_or_else(create_matrix4);
    get_camera_3d_view_projection_matrix4(&mut matrix, shadow_camera, 1.0);

    // Skinned casters exist only when the scene opted into skinning; without it there is no depth skin
    // variant to compile and no palette to bind, matching the forward pass.
    let skin_feature = get_gl_scene3d_runtime(state).mesh_skin_feature;

    let rigid_program =
        ensure_gl_scene3d_program(state, "shadow:depth", compile_shadow_depth_program);
    // Compiled lazily on the first GPU-skinned caster so a scene without skinned meshes never pays for it.
    let mut skinned_program: Option<Rc<GlMeshProgram>> = None;
    // Likewise compiled lazily, so a scene with no instanced casters never pays for the variant.
    let mut instanced_program: Option<Rc<GlMeshProgram>> = None;

    let mut prev_viewport = [0_i32; 4];
    // SAFETY: state queries and depth-pass setup on the state's owning GL thread.
    let prev_framebuffer = unsafe {
        let prev_framebuffer = gl.get_parameter_framebuffer(glow::FRAMEBUFFER_BINDING);
        gl.get_parameter_i32_slice(glow::VIEWPORT, &mut prev_viewport);

        gl.bind_framebuffer(glow::FRAMEBUFFER, Some(target_framebuffer));
        gl.viewport(0, 0, target_width as i32, target_height as i32);
        gl.enable(glow::DEPTH_TEST);
        gl.depth_func(glow::LESS);
        gl.depth_mask(true);
        // Render back faces into the depth map (cull front). On a closed caster the recorded depth is
        // the surface's far side, so the lit front faces compare against it and self-shadow acne
        // disappears without a large depth bias. Open receivers (the ground plane) simply contribute
        // nothing here, which is harmless — nothing lies beneath them to receive their cast.
        gl.enable(glow::CULL_FACE);
        gl.cull_face(glow::FRONT);
        gl.clear(glow::DEPTH_BUFFER_BIT | glow::COLOR_BUFFER_BIT);
        prev_framebuffer
    };

    // u_viewProjection is per program (default uniforms persist per program object), so it is set on
    // each program switch; u_model is per caster. bound_program tracks the last program bound to avoid
    // redundant use_program + view-projection uploads across a run of same-kind casters.
    let mut bound_program: Option<Rc<GlMeshProgram>> = None;
    let mut scratch_shadow_instance_data: Vec<f32> = Vec::new();
    for_each_node_descendant(scene, &mut |node| {
        // A drawable node carries geometry (structural, like prepare_scene_3d_render's mesh test). The
        // caster's fields are copied out so no node lock is held while its world matrix resolves.
        let (geometry, skeleton, instance_count) = {
            let node_guard = node.read().unwrap();
            let any = node_guard.as_any();
            let instanced_mesh = any.downcast_ref::<InstancedMesh>();
            let Some(mesh) = instanced_mesh
                .map(|mesh| &**mesh)
                .or_else(|| any.downcast_ref::<Mesh>())
            else {
                return;
            };
            if let Some(instanced_mesh) = instanced_mesh {
                flatten_shadow_instance_matrices(&mut scratch_shadow_instance_data, instanced_mesh);
            }
            (
                mesh.geometry.clone(),
                mesh.skin
                    .as_ref()
                    .map(|skin| skin.read().unwrap().skeleton.clone()),
                instanced_mesh.map(|instanced_mesh| instanced_mesh.instance_count),
            )
        };

        // The caster is already at its CURRENT pose when this pass runs: the app drives the morph and
        // skinning prepares before prepare_scene_3d_render, so morph is blended into geometry.vertices
        // and the skin palette is current before either depth or forward draw. This pass just reads
        // that pose. GPU skinning still deforms in the vertex shader from the bone palette, so a skinned
        // caster needs the HAS_SKIN depth variant + the palette bound.
        // An InstancedMesh draws its geometry once per instance at `u_model * instanceModelMatrix()`, so
        // the depth pass must instance it exactly as the forward pass does. Drawing it as a single rigid
        // caster records ONE copy at the node origin — and because the per-instance matrix routinely
        // carries the model's authoring scale, that copy can be orders of magnitude the wrong size and
        // flood the map. A batch with no live instances casts nothing.
        let instanced = is_shadow_instanced_mesh(instance_count);
        if instanced && instance_count == Some(0) {
            return;
        }

        let geometry = geometry.read().unwrap();
        let skinned = skin_feature.is_some()
            && !instanced
            && skeleton.is_some()
            && has_mesh_geometry_skin(&geometry);
        let program = if instanced {
            instanced_program
                .get_or_insert_with(|| {
                    ensure_gl_scene3d_program(
                        state,
                        "shadow:depth:instanced",
                        compile_shadow_depth_instanced_program,
                    )
                })
                .clone()
        } else if skinned {
            let feature = skin_feature.expect("skinned implies a skin feature");
            skinned_program
                .get_or_insert_with(|| {
                    ensure_gl_scene3d_program(state, "shadow:depth:skin", |gl| {
                        return compile_shadow_depth_skinned_program(
                            gl,
                            feature.vertex_declarations_glsl,
                        );
                    })
                })
                .clone()
        } else {
            rigid_program.clone()
        };
        if bound_program
            .as_ref()
            .is_none_or(|bound| !Rc::ptr_eq(bound, &program))
        {
            // SAFETY: the program belongs to this context.
            unsafe {
                gl.use_program(Some(program.program));
                gl.uniform_matrix_4_f32_slice(
                    program.loc_view_projection.as_ref(),
                    false,
                    &matrix.m,
                );
            }
            bound_program = Some(program.clone());
        }
        let world_matrix = get_node_world_matrix4(node, &mut state.runtime.node_revisions);
        // SAFETY: the bound program belongs to this context.
        unsafe {
            gl.uniform_matrix_4_f32_slice(program.loc_model.as_ref(), false, &world_matrix.m)
        };

        if skinned {
            // Upload the mesh's bone palette into the shared RGBA32F skin texture and bind it, exactly
            // as draw_gl_mesh_subset does for the forward pass, so the depth deformation matches.
            let feature = skin_feature.expect("skinned implies a skin feature");
            let skeleton = skeleton.as_ref().expect("skinned implies a skin");
            let joint_matrices = skeleton.read().unwrap().joint_matrices.clone();
            (feature.bind_shadow_skin_palette)(state, &joint_matrices.read().unwrap());
            let joint_texture = program.loc_joint_texture.get().flatten();
            // SAFETY: the bound program belongs to this context.
            unsafe { gl.uniform_1_i32(joint_texture.as_ref(), SKIN_PALETTE_TEXTURE_UNIT as i32) };
        }

        // gpu_skinned = skinned: a skinned draw uploads the static bind pose (the shader deforms it via
        // the palette) and wires the joints0/weights0 attributes; a rigid draw uploads vertices as-is.
        let upload = ensure_gl_mesh_upload(state, &geometry, Some(skinned));
        // SAFETY: the upload's VAO belongs to this context.
        unsafe { gl.bind_vertex_array(Some(upload.vao)) };
        if let Some(count) = instance_count {
            bind_gl_instance_palette(
                state,
                &program,
                &scratch_shadow_instance_data,
                count as usize,
            );
            // SAFETY: drawing the bound VAO on its context.
            unsafe {
                if upload.index_buffer.is_some() {
                    gl.draw_elements_instanced(
                        upload.primitive_mode,
                        upload.index_count as i32,
                        upload.index_type,
                        0,
                        count,
                    );
                } else {
                    gl.draw_arrays_instanced(
                        upload.primitive_mode,
                        0,
                        upload.index_count as i32,
                        count,
                    );
                }
            }
        } else if upload.index_buffer.is_some() {
            // SAFETY: drawing the bound VAO on its context.
            unsafe {
                gl.draw_elements(
                    upload.primitive_mode,
                    upload.index_count as i32,
                    upload.index_type,
                    0,
                );
            }
        } else {
            // SAFETY: drawing the bound VAO on its context.
            unsafe { gl.draw_arrays(upload.primitive_mode, 0, upload.index_count as i32) };
        }
    });

    // SAFETY: restoring the state captured above on the same context.
    unsafe {
        // Restore the active texture unit the forward pass assumes (0); a skinned caster left it on the
        // palette unit.
        gl.active_texture(glow::TEXTURE0);
        gl.bind_framebuffer(glow::FRAMEBUFFER, prev_framebuffer);
        gl.viewport(
            prev_viewport[0],
            prev_viewport[1],
            prev_viewport[2],
            prev_viewport[3],
        );
        // Restore the default cull state the forward scene pass renders under (culling off, back-face).
        gl.disable(glow::CULL_FACE);
        gl.cull_face(glow::BACK);
    }

    get_gl_scene3d_runtime(state).shadow = Some(GlScene3DShadow {
        enabled: true,
        matrix,
        normal_bias_world,
        pcf_radius: normalize_directional_shadow_pcf_radius(directional_light.pcf_radius),
        shadow_bias: directional_light.shadow_bias,
        texture: target_depth_texture
            .expect("a depth-stencil-sampled target carries a depth texture"),
    });
}

macro_rules! shadow_depth_instanced_vertex_glsl {
    () => {
        concat!(
            r#"#version 300 es
"#,
            gl_instance_vertex_declarations_glsl!(),
            r#"
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * instanceModelMatrix() * vec4(a_position, 1.0);
}
"#
        )
    };
}

const SHADOW_DEPTH_INSTANCED_VERTEX: &str = shadow_depth_instanced_vertex_glsl!();

macro_rules! shadow_depth_vertex_glsl {
    () => {
        concat!(
            r#"#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}
"#
        )
    };
}

const SHADOW_DEPTH_VERTEX: &str = shadow_depth_vertex_glsl!();

macro_rules! shadow_depth_fragment_glsl {
    () => {
        concat!(
            r#"#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
"#
        )
    };
}

const SHADOW_DEPTH_FRAGMENT: &str = shadow_depth_fragment_glsl!();

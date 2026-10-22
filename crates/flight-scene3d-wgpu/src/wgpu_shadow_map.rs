// flight-lint: allow-file(contract-vocabulary) D17: the shadow pass records native wgpu values
//! The directional shadow map (TS `wgpuShadowMap.ts`), the WGSL mirror of scene3d-gl's shadow map:
//! a depth-only pass from the light's orthographic camera into a sampleable depth32float map, which
//! the lit families then PCF-sample.

use flight_camera::{
    Camera3D, Projection, get_camera_3d_view_projection_matrix4,
    get_orthographic_projection_texel_size,
};
use flight_entity::throw_error;
use flight_geometry::{create_matrix3, create_matrix4, multiply_matrix4};
use flight_lighting::{DIRECTIONAL_SHADOW_MAP_SIZE, DirectionalLight, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS};
use flight_meshgeometry::MeshSubset;
use flight_node::NodeRef;
use flight_node::contract::{for_each_node_descendant, get_node_world_matrix4};
use flight_render::{RenderState, Scene3DRenderProxy};
use flight_render_wgpu::{
    WgpuCommandRecord, WgpuDepthRenderPassBeginRecord, WgpuRenderState,
    create_wgpu_pipeline_layout_recorded, create_wgpu_render_pipeline, create_wgpu_shader_module,
    create_wgpu_texture, draw_wgpu_render_pass, draw_wgpu_render_pass_indexed,
    get_wgpu_render_state_native_device, get_wgpu_render_state_runtime_mut, record_wgpu_command,
    set_wgpu_render_pass_bind_group, set_wgpu_render_pass_index_buffer,
    set_wgpu_render_pass_pipeline, set_wgpu_render_pass_vertex_buffer,
};
use flight_scene3d::{InstancedMesh, Mesh};

use crate::types::*;
use crate::wgpu_mesh_pipeline::{
    INSTANCE_RECORD_FLOATS, SHADOW_DEPTH_FORMAT, ensure_wgpu_instance_buffer,
    ensure_wgpu_scene3d_layouts, write_wgpu_draw_uniform,
};
use crate::wgpu_mesh_upload::ensure_wgpu_mesh_upload;
use crate::wgpu_scene3d_runtime::{
    get_wgpu_scene3d_default_material, get_wgpu_scene3d_runtime, get_wgpu_skinning_adapter,
};

const SHADOW_POSITION_ATTRIBUTES: [wgpu::VertexAttribute; 1] = [wgpu::VertexAttribute {
    shader_location: 0,
    offset: 0,
    format: wgpu::VertexFormat::Float32x3,
}];

const SHADOW_INSTANCE_ATTRIBUTES: [wgpu::VertexAttribute; 4] = [
    wgpu::VertexAttribute {
        shader_location: 6,
        offset: 0,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 7,
        offset: 16,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 8,
        offset: 32,
        format: wgpu::VertexFormat::Float32x4,
    },
    wgpu::VertexAttribute {
        shader_location: 9,
        offset: 48,
        format: wgpu::VertexFormat::Float32x4,
    },
];

// The shadow VS binds only position (@location 0) from the shared 48-byte interleaved vertex.
const SHADOW_VERTEX_BUFFER_LAYOUTS: [wgpu::VertexBufferLayout<'static>; 1] =
    [wgpu::VertexBufferLayout {
        array_stride: 48,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &SHADOW_POSITION_ATTRIBUTES,
    }];

// Position from the shared vertex plus the instance-step matrix at slot 1, matching the forward
// pass's instance layout so the two paths place an instance identically.
const SHADOW_INSTANCED_VERTEX_BUFFER_LAYOUTS: [wgpu::VertexBufferLayout<'static>; 2] = [
    wgpu::VertexBufferLayout {
        array_stride: 48,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &SHADOW_POSITION_ATTRIBUTES,
    },
    wgpu::VertexBufferLayout {
        array_stride: (INSTANCE_RECORD_FLOATS * 4) as u64,
        step_mode: wgpu::VertexStepMode::Instance,
        attributes: &SHADOW_INSTANCE_ATTRIBUTES,
    },
];

fn create_wgpu_shadow_depth_pipeline(
    native: &flight_render_wgpu::WgpuNativeDevice,
    layout: &wgpu::PipelineLayout,
    module: &wgpu::ShaderModule,
    buffers: &[Option<wgpu::VertexBufferLayout<'static>>],
) -> wgpu::RenderPipeline {
    return create_wgpu_render_pipeline(
        native,
        &wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(layout),
            vertex: wgpu::VertexState {
                module,
                entry_point: Some("vs_main"),
                compilation_options: wgpu::PipelineCompilationOptions::default(),
                buffers,
            },
            fragment: None,
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Front),
                ..wgpu::PrimitiveState::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: SHADOW_DEPTH_FORMAT,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        },
    );
}

/// Frees the directional shadow's GPU resources for `state` (the depth map, the 1x1 dummy and the
/// shadow uniform) and clears the derived slots (TS `destroyWgpuScene3DShadow`). Safe to call more
/// than once and when no shadow was ever drawn.
pub fn destroy_wgpu_scene3d_shadow(state: &mut WgpuRenderState) {
    let scene = get_wgpu_scene3d_runtime(state);
    if let Some(shadow) = scene.shadow.take() {
        shadow.depth_texture.destroy();
    }
    if let Some(texture) = scene.shadow_dummy_texture.take() {
        texture.destroy();
        scene.shadow_dummy_view = None;
    }
    if let Some(buffer) = scene.shadow_uniform_buffer.take() {
        buffer.destroy();
    }
    scene.shadow_comparison_sampler = None;
    scene.shadow_depth_pipeline = None;
    scene.shadow_depth_instanced_pipeline = None;
    scene.shadow_depth_skinned_pipeline = None;
    scene.shadow_sample_bind_group = None;
    scene.shadow_sample_layout = None;
    scene.shadow_sample_view = None;
    scene.pbr_sample_bind_group = None;
    scene.pbr_sample_shadow_view = None;
}

// The instanced depth pipeline: the rigid depth pass plus the instance-step matrix buffer, so a batch
// records one silhouette per live instance.
fn ensure_wgpu_shadow_depth_instanced_pipeline(state: &mut WgpuRenderState) -> wgpu::RenderPipeline {
    if let Some(pipeline) = &get_wgpu_scene3d_runtime(state).shadow_depth_instanced_pipeline {
        return pipeline.clone();
    }
    let native = get_wgpu_render_state_native_device(state);
    let draw_layout = ensure_wgpu_scene3d_layouts(state).draw_bind_group_layout;
    let layout = create_wgpu_pipeline_layout_recorded(&native, &[draw_layout]);
    let module = create_wgpu_shader_module(&native, SHADOW_DEPTH_INSTANCED_WGSL);
    let buffers: Vec<Option<wgpu::VertexBufferLayout<'static>>> = SHADOW_INSTANCED_VERTEX_BUFFER_LAYOUTS
        .iter()
        .map(|layout| Some(layout.clone()))
        .collect();
    let pipeline = create_wgpu_shadow_depth_pipeline(&native, &layout, &module, &buffers);
    get_wgpu_scene3d_runtime(state).shadow_depth_instanced_pipeline = Some(pipeline.clone());
    return pipeline;
}

// Resolves (once per state) the depth-only shadow pipeline: a vertex-only module (position to light
// clip with the GL-to-WebGPU depth remap), depth32float, front-face culling, the shared Draw layout
// (or the skinning adapter's palette layout) at group(0).
fn ensure_wgpu_shadow_depth_pipeline(state: &mut WgpuRenderState, skinned: bool) -> wgpu::RenderPipeline {
    let cached = {
        let scene = get_wgpu_scene3d_runtime(state);
        if skinned {
            scene.shadow_depth_skinned_pipeline.clone()
        } else {
            scene.shadow_depth_pipeline.clone()
        }
    };
    if let Some(pipeline) = cached {
        return pipeline;
    }
    let native = get_wgpu_render_state_native_device(state);
    let skinning = get_wgpu_skinning_adapter(state).filter(|_| skinned);
    let source = match skinning {
        Some(skinning) => (skinning.extend_shadow_depth_prelude)(SHADOW_DEPTH_WGSL),
        None => SHADOW_DEPTH_WGSL.to_string(),
    };
    let module = create_wgpu_shader_module(&native, &source);
    let draw_layout = match skinning {
        Some(skinning) => (skinning.get_draw_layout)(state),
        None => ensure_wgpu_scene3d_layouts(state).draw_bind_group_layout,
    };
    let layout = create_wgpu_pipeline_layout_recorded(&native, &[draw_layout]);
    let buffers: Vec<Option<wgpu::VertexBufferLayout<'static>>> = match skinning {
        Some(skinning) => skinning
            .vertex_buffer_layouts
            .iter()
            .map(|layout| Some(layout.clone()))
            .collect(),
        None => SHADOW_VERTEX_BUFFER_LAYOUTS.iter().map(|layout| Some(layout.clone())).collect(),
    };
    let pipeline = create_wgpu_shadow_depth_pipeline(&native, &layout, &module, &buffers);
    let scene = get_wgpu_scene3d_runtime(state);
    if skinned {
        scene.shadow_depth_skinned_pipeline = Some(pipeline.clone());
    } else {
        scene.shadow_depth_pipeline = Some(pipeline.clone());
    }
    return pipeline;
}

// Packs the live instance matrices into the shared 20-float instance stride (only the matrix half is
// read by the depth shader). The depth pass keeps its own scratch rather than sharing the forward
// pass's.
fn flatten_shadow_instance_matrices(mesh: &InstancedMesh) -> Vec<f32> {
    let count = mesh.instance_count.max(0) as usize;
    let mut records = vec![0.0_f32; count * INSTANCE_RECORD_FLOATS];
    for index in 0..count {
        let offset = index * INSTANCE_RECORD_FLOATS;
        records[offset..offset + 16].copy_from_slice(&mesh.instance_matrices[index].read().unwrap().m);
    }
    return records;
}

fn normalize_directional_shadow_pcf_radius(radius: f32) -> f32 {
    if !radius.is_finite() {
        return 0.0;
    }
    return (MAX_DIRECTIONAL_SHADOW_PCF_RADIUS as f32).min(radius.floor().max(0.0));
}

/// The directional shadow recipe's first pass (TS `renderWgpuScene3DShadowMap`): renders every
/// mesh's depth from the light's orthographic camera into a sampleable depth32float map and records
/// the map and light view-projection on the scene runtime, which the lit binds then PCF-sample.
/// Shadows are opt-in; a light with `casts_shadow` false (or none) disables a retained map. Must run
/// before the main scene pass opens: it drives its own depth-only pass on the frame's encoder, and
/// is a no-op with no encoder. Front faces are culled to suppress self-shadow acne.
pub fn render_wgpu_scene3d_shadow_map(
    state: &mut WgpuRenderState,
    scene: &NodeRef,
    shadow_camera: &Camera3D,
    directional_light: Option<&DirectionalLight>,
) {
    if let Some(shadow) = &mut get_wgpu_scene3d_runtime(state).shadow {
        shadow.enabled = false;
    }
    let Some(directional_light) = directional_light.filter(|light| light.casts_shadow) else {
        return;
    };
    if get_wgpu_render_state_runtime_mut(state).command_encoder.is_none() {
        return;
    }
    let Projection::Orthographic(orthographic) = &shadow_camera.projection else {
        throw_error("renderWgpuScene3DShadowMap requires an orthographic shadow camera");
    };
    let native = get_wgpu_render_state_native_device(state);
    if get_wgpu_scene3d_runtime(state).shadow.is_none() {
        let depth_texture = create_wgpu_texture(
            &native,
            &wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d {
                    width: DIRECTIONAL_SHADOW_MAP_SIZE,
                    height: DIRECTIONAL_SHADOW_MAP_SIZE,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: SHADOW_DEPTH_FORMAT,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            },
        );
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());
        get_wgpu_scene3d_runtime(state).shadow = Some(WgpuScene3DShadow {
            depth_texture,
            depth_view,
            enabled: false,
            map_height: DIRECTIONAL_SHADOW_MAP_SIZE,
            map_width: DIRECTIONAL_SHADOW_MAP_SIZE,
            matrix: create_matrix4(),
            normal_bias_world: 0.0,
            pcf_radius: 0.0,
            shadow_bias: 0.0,
        });
    }
    let (depth_view, map_width, map_height) = {
        let shadow = get_wgpu_scene3d_runtime(state).shadow.as_ref().unwrap();
        (shadow.depth_view.clone(), shadow.map_width, shadow.map_height)
    };
    let normal_bias_world = directional_light.normal_bias
        * get_orthographic_projection_texel_size(
            &orthographic.read().unwrap(),
            map_width as f32,
            map_height as f32,
        );
    let mut light_matrix = create_matrix4();
    get_camera_3d_view_projection_matrix4(&mut light_matrix, shadow_camera, 1.0);
    get_wgpu_scene3d_runtime(state)
        .shadow
        .as_mut()
        .unwrap()
        .matrix = light_matrix.clone();

    let skinning = get_wgpu_skinning_adapter(state);
    let rigid_pipeline = ensure_wgpu_shadow_depth_pipeline(state, false);

    // The depth pass is recorded on the frame's encoder and parked in the runtime's pass slot while
    // the casters record, so the shared pass helpers (and their command records) apply to it.
    let runtime = get_wgpu_render_state_runtime_mut(state);
    let mut encoder = runtime.command_encoder.take().unwrap();
    let depth_pass = encoder
        .begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        })
        .forget_lifetime();
    runtime.command_encoder = Some(encoder);
    let enclosing_pass = runtime.render_pass.replace(depth_pass);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::BeginDepthRenderPass(WgpuDepthRenderPassBeginRecord {
            depth_clear: Some(1.0),
            depth_view: depth_view.clone(),
        });
    });
    if let Some(pass) = get_wgpu_render_state_runtime_mut(state).render_pass.as_mut() {
        pass.set_viewport(0.0, 0.0, map_width as f32, map_height as f32, 0.0, 1.0);
    }

    let mut casters: Vec<NodeRef> = Vec::new();
    for_each_node_descendant(scene, &mut |node: &NodeRef| casters.push(node.clone()));
    let mut bound_pipeline: Option<wgpu::RenderPipeline> = None;
    let material = get_wgpu_scene3d_default_material(state);
    for node in casters {
        let guard = node.read().unwrap();
        // A drawable node carries geometry (structural, like the forward pass's mesh test).
        let instanced = guard.as_any().downcast_ref::<InstancedMesh>();
        let mesh: &Mesh = match instanced {
            Some(instanced) => instanced,
            None => match guard.as_any().downcast_ref::<Mesh>() {
                Some(mesh) => mesh,
                None => continue,
            },
        };
        // An instanced caster draws once per live instance, exactly as the forward pass does.
        if instanced.is_some_and(|instanced| instanced.instance_count == 0) {
            continue;
        }
        let skinned = instanced.is_none()
            && skinning.is_some_and(|skinning| (skinning.is_gpu_skinned)(mesh));
        let pipeline = if instanced.is_some() {
            ensure_wgpu_shadow_depth_instanced_pipeline(state)
        } else if skinned {
            ensure_wgpu_shadow_depth_pipeline(state, true)
        } else {
            rigid_pipeline.clone()
        };
        let upload = {
            let geometry = mesh.geometry.read().unwrap();
            ensure_wgpu_mesh_upload(state, &geometry, Some(skinned))
        };
        if bound_pipeline.as_ref() != Some(&pipeline) {
            set_wgpu_render_pass_pipeline(state, &pipeline);
            bound_pipeline = Some(pipeline);
        }

        // The depth VS multiplies position by draw.world alone, so the light view-projection is baked
        // into the per-mesh world matrix (lightMatrix * nodeWorld).
        let world = get_node_world_matrix4(&node, &mut state.render_runtime_mut().node_revisions);
        let mut world_matrix = create_matrix4();
        multiply_matrix4(&mut world_matrix, &light_matrix, &world);
        let skeleton = if skinned {
            mesh.skin
                .as_ref()
                .map(|skin| skin.read().unwrap().skeleton.clone())
        } else {
            None
        };
        let joint_matrices = skeleton
            .as_ref()
            .map(|skeleton| skeleton.read().unwrap().joint_matrices.clone());
        // The palette is claimed before the Draw uniform is written: its arena base rides in it.
        let skin_draw_bind_group = match (&joint_matrices, skinning) {
            (Some(joint_matrices), Some(skinning)) => {
                let joint_matrices = joint_matrices.read().unwrap();
                Some((skinning.get_draw_bind_group)(state, &joint_matrices))
            }
            _ => None,
        };
        let proxy = Scene3DRenderProxy {
            alpha: None,
            color_scale_bias: None,
            color_matrix: None,
            instance_count: None,
            instance_matrices: None,
            instance_colors: None,
            joint_matrices,
            normal_matrices: None,
            material: material.clone(),
            normal_matrix: create_matrix3(),
            subset: MeshSubset {
                index_count: 0,
                index_offset: 0,
            },
            world_matrix,
        };
        let rigid_draw_bind_group = write_wgpu_draw_uniform(state, &proxy);
        let draw_bind_group = skin_draw_bind_group.unwrap_or(rigid_draw_bind_group);
        let pending_draw_offset = get_wgpu_scene3d_runtime(state).pending_draw_offset;

        set_wgpu_render_pass_bind_group(state, 0, &draw_bind_group, &[pending_draw_offset]);
        set_wgpu_render_pass_vertex_buffer(state, 0, &upload.vertex_buffer);
        let instance_count = match instanced {
            Some(instanced) => instanced.instance_count.max(0) as u32,
            None => 1,
        };
        if let Some(instanced) = instanced {
            let records = flatten_shadow_instance_matrices(instanced);
            let buffer = ensure_wgpu_instance_buffer(state, Some(&records), instance_count);
            set_wgpu_render_pass_vertex_buffer(state, 1, &buffer);
        }
        // The same indexed/non-indexed split as the forward pass: a non-indexed caster still casts.
        match (&upload.index_buffer, upload.index_format) {
            (Some(index_buffer), Some(index_format)) => {
                set_wgpu_render_pass_index_buffer(state, index_buffer, index_format);
                draw_wgpu_render_pass_indexed(state, upload.index_count, instance_count, 0, 0, 0);
            }
            _ => draw_wgpu_render_pass(state, upload.index_count, instance_count, 0, 0),
        }
    }

    let runtime = get_wgpu_render_state_runtime_mut(state);
    let depth_pass = std::mem::replace(&mut runtime.render_pass, enclosing_pass);
    drop(depth_pass);
    record_wgpu_command(&native, || {
        return WgpuCommandRecord::EndRenderPass;
    });
    let shadow = get_wgpu_scene3d_runtime(state).shadow.as_mut().unwrap();
    shadow.enabled = true;
    shadow.normal_bias_world = normal_bias_world;
    shadow.pcf_radius = normalize_directional_shadow_pcf_radius(directional_light.pcf_radius);
    shadow.shadow_bias = directional_light.shadow_bias;
}

// draw.world already carries lightMatrix * nodeWorld, so the per-instance matrix slots between it
// and the vertex — the same `world * instanceMatrix * position` order the forward instanced path uses.
const SHADOW_DEPTH_INSTANCED_WGSL: &str = r#"
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(6) instance0 : vec4f,
  @location(7) instance1 : vec4f,
  @location(8) instance2 : vec4f,
  @location(9) instance3 : vec4f,
) -> @builtin(position) vec4f {
  let instanceModel = mat4x4f(instance0, instance1, instance2, instance3);
  var clip = draw.world * instanceModel * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
"#;

// The depth-only shadow vertex module: reads only position, and remaps the GL-convention clip z into
// WebGPU's 0..1 depth range, the identical remap the lit sampler's depthRef applies.
const SHADOW_DEPTH_WGSL: &str = r#"
// The Draw record is the SAME 256-byte slot the mesh path writes, so the depth shader must declare the
// fields ahead of the one it wants or params would land at the wrong offset. It reads only params.z, the
// skin arena base — writeWgpuDrawUniform already writes every field below.
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,
  params : vec4f,
};
@group(0) @binding(0) var<uniform> draw : Draw;

@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {
  var clip = draw.world * vec4f(position, 1.0);
  clip.z = (clip.z + clip.w) * 0.5;
  return clip;
}
"#;

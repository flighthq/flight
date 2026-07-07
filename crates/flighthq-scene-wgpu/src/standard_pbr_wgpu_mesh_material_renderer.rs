//! The built-in StandardPbr forward-lit mesh-material renderer
//! (`WgpuMeshMaterialRenderer` for `StandardPbrMaterialKind`) — the WGSL mirror of
//! `standard_pbr_gl_mesh_material_renderer`.
//!
//! Ports `@flighthq/scene-wgpu` `standardPbrWgpuMeshMaterialRenderer.ts`. `bind`
//! selects the pipeline variant for the material's alpha mode / double-sidedness +
//! the current color-attachment format, writes the shared Frame uniform (camera
//! view-projection + position, the packed light block) and binds it, then writes +
//! binds the material's uniform/texture bind group. `draw` looks up the geometry's
//! cached GPU upload, writes the per-draw model + normal matrices into the
//! render-state's uniform ring buffer, and issues the indexed draw over the
//! proxy's subset. Depth-test LESS + depth-write on and back-face culling (unless
//! double-sided) are baked on the pipeline.
//!
//! Maps are NOT sampled on wgpu yet — a 1x1 opaque-white placeholder fills every
//! map slot so the bind-group layout matches the textured variant; the scalar
//! factors drive the lobes. The concrete `StandardPbrMaterial` factors (base
//! color / metallic / roughness / emissive / alpha cutoff) ARE read and packed
//! into the MaterialBlock (sRGB→linear at pack time).
//!
//! Uniform packing constants (`FRAME_UNIFORM_BYTES`, `DRAW_UNIFORM_BYTES`,
//! `MATERIAL_UNIFORM_BYTES`) are ported faithfully and unit-tested below.
//!
//! Cannot be visually captured without a GPU adapter; the GPU bind/draw path is
//! validated functionally (the parity matrix at the `wgpu` cell), matching the
//! sibling `flighthq-scene-gl` and `flighthq-render-wgpu` no-device test posture.

use flighthq_camera::get_camera_view_projection_matrix4;
use flighthq_geometry::{get_matrix4_position, inverse_matrix4};
use flighthq_render_wgpu::WgpuRenderState;
use flighthq_types::camera::{Camera, Projection};
use flighthq_types::geometry::{Matrix4Like, Vector3Like};
use flighthq_types::kind::KindId;
use flighthq_types::material::Material;
use flighthq_types::pbr_material::{
    MaterialAlphaMode, StandardPbrMaterial, StandardPbrMaterialProperties,
    standard_pbr_material_kind,
};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::wgpu_mesh_material_registry::WgpuMeshMaterialRenderer;
use crate::wgpu_pbr_pipeline_cache::{build_wgpu_pbr_pipeline_cache_key, ensure_wgpu_pbr_pipeline};
use crate::wgpu_pbr_prelude::WgpuPbrDefineKey;
use crate::wgpu_scene_runtime::{WgpuMaterialBinding, WgpuMeshUpload, WgpuSceneRuntime};

/// The built-in StandardPbr forward-lit mesh-material renderer.
pub struct StandardPbrWgpuMeshMaterialRenderer;

impl WgpuMeshMaterialRenderer for StandardPbrWgpuMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        material: Option<&dyn Material>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        // Downcast the bound material to the concrete StandardPbr type. The
        // default-kind fallback (`None`) packs the neutral untextured defaults.
        let pbr = material.and_then(downcast_standard_pbr);

        let format = state.runtime.current_color_format.unwrap_or(state.format);
        let define_key = build_wgpu_pbr_standard_define_key(pbr);

        // Compile/cache the pipeline variant and remember it by key (the pipeline
        // is not `Clone`, so `draw` re-resolves it from the cache).
        let cache_key = build_wgpu_pbr_pipeline_cache_key(format, &define_key);
        ensure_wgpu_pbr_pipeline(state, scene, &define_key, format);
        scene.active_pipeline_key = Some(cache_key.clone());

        ensure_wgpu_placeholder_texture_view(state, scene);
        write_wgpu_frame_uniform(state, scene, &cache_key, camera, lights);

        let alpha_cutoff = pbr.map_or(0.5, |m| m.alpha_cutoff);
        let mut scratch = [0.0f32; MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(&mut scratch, pbr.map(|m| &m.standard), alpha_cutoff);

        let key = material.map_or_else(standard_pbr_material_kind, |m| m.kind());
        ensure_wgpu_pbr_material_bind_group(state, scene, &cache_key, key);
        scene.active_material_key = Some(key);
        let binding = &scene.material_bind_groups[&key];
        state
            .queue
            .write_buffer(&binding.buffer, 0, f32_slice_bytes(&scratch));
    }

    fn draw(
        &self,
        state: &mut WgpuRenderState,
        scene: &mut WgpuSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &WgpuMeshUpload,
    ) {
        draw_standard_pbr_wgpu_mesh(state, scene, proxy, upload);
    }
}

/// Returns the singleton StandardPbr forward-lit renderer instance.
pub fn standard_pbr_wgpu_mesh_material_renderer() -> StandardPbrWgpuMeshMaterialRenderer {
    StandardPbrWgpuMeshMaterialRenderer
}

/// The shared define key for a StandardPbr material: the alpha-mask cutoff +
/// double-sidedness from the surface trailer, with every map flag false (maps
/// deferred on wgpu). Keeps the one place that decides the standard flags so the
/// compiled variant and the bound resources never disagree. Mirrors TS
/// `buildWgpuPbrStandardDefineKey`.
pub fn build_wgpu_pbr_standard_define_key(
    material: Option<&StandardPbrMaterial>,
) -> WgpuPbrDefineKey {
    WgpuPbrDefineKey {
        alpha_mask_enabled: material.is_some_and(|m| m.alpha_mode == MaterialAlphaMode::Mask),
        double_sided: material.is_some_and(|m| m.double_sided),
        has_base_color_map: false,
        has_normal_map: false,
    }
}

/// Writes the per-draw model + normal matrices into the render-state's uniform
/// ring buffer and issues the indexed draw over `proxy.subset`. Left as an
/// explicit named seam so the GPU body can be filled in place.
///
/// Records into the render-state's open render pass. The Draw bind group binds the
/// ring buffer at a dynamic offset; this advances the offset per draw.
pub fn draw_standard_pbr_wgpu_mesh(
    state: &mut WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    proxy: &SceneRenderProxy,
    upload: &WgpuMeshUpload,
) {
    let Some(cache_key) = scene.active_pipeline_key.clone() else {
        return;
    };
    if !scene.pipeline_cache.contains_key(&cache_key) {
        return;
    }

    // Pack the Draw uniform (world mat4 + normal mat3 as 3 padded vec4) into the
    // ring buffer at the current offset.
    let byte_offset = state.runtime.uniform_offset;
    let float_base = (byte_offset >> 2) as usize;
    {
        let data = &mut state.runtime.uniform_data;
        let world = &proxy.world_matrix.m;
        for (i, value) in world.iter().enumerate() {
            data[float_base + i] = *value;
        }
        let normal = &proxy.normal_matrix.m;
        // mat3x3 as 3 padded vec4 columns: 9 floats → 12, column-major.
        for column in 0..3 {
            for row in 0..3 {
                data[float_base + 16 + column * 4 + row] = normal[column * 3 + row];
            }
            data[float_base + 16 + column * 4 + 3] = 0.0;
        }
    }
    state.runtime.uniform_offset += state.runtime.uniform_stride;
    scene.pending_draw_offset = byte_offset;

    {
        let slice = f32_slice_bytes(
            &state.runtime.uniform_data[float_base..float_base + (DRAW_UNIFORM_BYTES / 4) as usize],
        );
        state
            .queue
            .write_buffer(&state.runtime.uniform_buffer, byte_offset, slice);
    }

    ensure_wgpu_draw_bind_group(state, scene, &cache_key);

    let active_material_key = scene.active_material_key;
    let pipeline = &scene.pipeline_cache[&cache_key];
    let subset = proxy.subset;

    let Some(pass) = state.runtime.render_pass.as_mut() else {
        return;
    };
    pass.set_pipeline(&pipeline.pipeline);
    if let Some(frame_bind_group) = scene.frame_bind_group.as_ref() {
        pass.set_bind_group(0, frame_bind_group, &[]);
    }
    if let Some(draw_bind_group) = scene.draw_bind_group.as_ref() {
        pass.set_bind_group(1, draw_bind_group, &[byte_offset as u32]);
    }
    if let Some(material_bind_group) = active_material_key
        .and_then(|key| scene.material_bind_groups.get(&key))
        .map(|binding| &binding.bind_group)
    {
        pass.set_bind_group(2, material_bind_group, &[]);
    }

    if let Some(index_buffer) = upload.index_buffer.as_ref() {
        pass.set_vertex_buffer(0, upload.vertex_buffer.slice(..));
        pass.set_index_buffer(index_buffer.slice(..), upload.index_format);
        let end = subset.index_offset + subset.index_count;
        pass.draw_indexed(subset.index_offset..end, 0, 0..1);
    }
}

/// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraPosition (16) + vec4f
/// lightDirection (16) + vec4f directionalRadiance (16) + vec4f ambientRadiance
/// (16) = 128 bytes / 32 floats.
pub const FRAME_UNIFORM_BYTES: u64 = 128;

/// Draw uniform: mat4x4f world (64) + mat3x3f normalMatrix as 3 padded vec4 (48)
/// = 112; the ring buffer rounds the per-slot stride up to the device's
/// `minUniformBufferOffsetAlignment`.
pub const DRAW_UNIFORM_BYTES: u64 = 112;

/// Material uniform: baseColor vec4f (16) + emissive vec4f (16) + factors vec4f
/// (16) + flags vec4f (16) = 64 bytes / 16 floats.
pub const MATERIAL_UNIFORM_BYTES: u64 = 64;

/// Opaque-white 1x1 RGBA pixel for the placeholder map texture (untextured path).
pub const WHITE_PIXEL: [u8; 4] = [255, 255, 255, 255];

const MATERIAL_UNIFORM_FLOATS: usize = (MATERIAL_UNIFORM_BYTES / 4) as usize;
const FRAME_UNIFORM_FLOATS: usize = (FRAME_UNIFORM_BYTES / 4) as usize;

/// Packs the StandardPbr base block (16 floats) into `out`: baseColor.rgba
/// (linear), emissive.rgb*strength, factors (metallic, roughness, normalScale,
/// occlusionStrength), flags (alphaCutoff, _, _, _). baseColor/emissive are
/// sRGB-packed and decoded to linear here so the shader stays in linear space. A
/// `None` block uses neutral defaults (white, dielectric, fully rough). Mirrors TS
/// `writeWgpuPbrStandardBlock`.
fn write_wgpu_pbr_standard_block(
    out: &mut [f32],
    standard: Option<&StandardPbrMaterialProperties>,
    alpha_cutoff: f32,
) {
    let Some(standard) = standard else {
        out[0] = 1.0;
        out[1] = 1.0;
        out[2] = 1.0;
        out[3] = 1.0;
        out[4] = 0.0;
        out[5] = 0.0;
        out[6] = 0.0;
        out[7] = 0.0;
        out[8] = 0.0;
        out[9] = 1.0;
        out[10] = 1.0;
        out[11] = 1.0;
        out[12] = alpha_cutoff;
        out[13] = 0.0;
        out[14] = 0.0;
        out[15] = 0.0;
        return;
    };

    let base = unpack_color_to_linear(standard.base_color);
    out[0] = base[0];
    out[1] = base[1];
    out[2] = base[2];
    out[3] = base[3];

    let emissive = unpack_color_to_linear(standard.emissive);
    let strength = standard.emissive_strength;
    out[4] = emissive[0] * strength;
    out[5] = emissive[1] * strength;
    out[6] = emissive[2] * strength;
    out[7] = 0.0;

    out[8] = standard.metallic;
    out[9] = standard.roughness;
    out[10] = standard.normal_scale;
    out[11] = standard.occlusion_strength;

    out[12] = alpha_cutoff;
    out[13] = 0.0;
    out[14] = 0.0;
    out[15] = 0.0;
}

/// Downcasts a bound `&dyn Material` to the concrete `StandardPbrMaterial` by kind.
/// Returns `None` for any other material (or the default-kind fallback).
///
/// Resolves the concrete `StandardPbrMaterial` from a stored `&dyn Material` via
/// the `Material: Any` seam — the Rust form of TS's `material as StandardPbrMaterial`
/// cast. Returns `None` (renderer packs neutral defaults) for any other material.
fn downcast_standard_pbr(material: &dyn Material) -> Option<&StandardPbrMaterial> {
    (material as &dyn core::any::Any).downcast_ref::<StandardPbrMaterial>()
}

/// Allocates (once per material kind) the Material uniform buffer + bind group and
/// binds the shared placeholder texture in every map slot. Mirrors TS
/// `ensureWgpuPbrMaterialBindGroup` (keyed by kind rather than the WeakMap ref).
fn ensure_wgpu_pbr_material_bind_group(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    key: KindId,
) {
    if scene.material_bind_groups.contains_key(&key) {
        return;
    }
    let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("flight-wgpu-pbr-material-uniform"),
        size: MATERIAL_UNIFORM_BYTES,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    // Build into a local so the immutable borrows of `scene` (the cached pipeline
    // layout + the placeholder view) end before the mutable `insert` below.
    let bind_group = {
        let layout = &scene.pipeline_cache[cache_key].material_bind_group_layout;
        let placeholder = scene
            .placeholder_view
            .as_ref()
            .expect("placeholder view ensured before material bind group");
        state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-pbr-material-bind-group"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&state.runtime.linear_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(placeholder),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(placeholder),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(placeholder),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(placeholder),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: wgpu::BindingResource::TextureView(placeholder),
                },
            ],
        })
    };
    scene
        .material_bind_groups
        .insert(key, WgpuMaterialBinding { bind_group, buffer });
}

/// Allocates (once per active pipeline) the Draw bind group wiring the
/// render-state's uniform ring buffer at a dynamic offset.
fn ensure_wgpu_draw_bind_group(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
) {
    if scene.draw_bind_group.is_some() {
        return;
    }
    let bind_group = {
        let layout = &scene.pipeline_cache[cache_key].draw_bind_group_layout;
        state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-pbr-draw-bind-group"),
            layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: &state.runtime.uniform_buffer,
                    offset: 0,
                    size: wgpu::BufferSize::new(DRAW_UNIFORM_BYTES),
                }),
            }],
        })
    };
    scene.draw_bind_group = Some(bind_group);
}

/// Lazily creates the 1x1 opaque-white placeholder map texture + view. Mirrors TS
/// `ensureWgpuPlaceholderTextureView`.
fn ensure_wgpu_placeholder_texture_view(state: &WgpuRenderState, scene: &mut WgpuSceneRuntime) {
    if scene.placeholder_view.is_some() {
        return;
    }
    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-pbr-placeholder"),
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    state.queue.write_texture(
        wgpu::ImageCopyTexture {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &WHITE_PIXEL,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    scene.placeholder_view = Some(view);
    scene.placeholder_texture = Some(texture);
}

/// Writes the shared Frame uniform (camera view-projection + position, the packed
/// light block) into the scene runtime's Frame buffer and (re)builds the Frame
/// bind group. Mirrors TS `writeWgpuFrameUniform`.
fn write_wgpu_frame_uniform(
    state: &WgpuRenderState,
    scene: &mut WgpuSceneRuntime,
    cache_key: &str,
    camera: &Camera,
    lights: &SceneLightBlock,
) {
    let mut frame = [0.0f32; FRAME_UNIFORM_FLOATS];

    let aspect = match &camera.projection {
        Projection::Perspective(p) => {
            if p.aspect != 0.0 {
                p.aspect
            } else {
                1.0
            }
        }
        Projection::Orthographic(_) => 1.0,
    };
    let mut view_projection = Matrix4Like::default();
    get_camera_view_projection_matrix4(&mut view_projection, camera, aspect);
    frame[..16].copy_from_slice(&view_projection.m);

    // Camera world position = translation of the inverse view matrix.
    let mut inverse_view = Matrix4Like::default();
    let view_like = Matrix4Like { m: camera.view.m };
    inverse_matrix4(&mut inverse_view, &view_like);
    let mut camera_position = Vector3Like::default();
    get_matrix4_position(&mut camera_position, &inverse_view);
    frame[16] = camera_position.x;
    frame[17] = camera_position.y;
    frame[18] = camera_position.z;
    frame[19] = 0.0;

    // Packed light block: directional `{ direction.xyz @0, _pad, radiance.rgb @4,
    // _pad }` then ambient `{ radiance.rgb @8, _pad }`. Radiance is already linear,
    // premultiplied by intensity.
    let data = &lights.data;
    frame[20] = data[0];
    frame[21] = data[1];
    frame[22] = data[2];
    frame[23] = lights.directional_count as f32;
    frame[24] = data[4];
    frame[25] = data[5];
    frame[26] = data[6];
    frame[27] = 0.0;
    frame[28] = data[8];
    frame[29] = data[9];
    frame[30] = data[10];
    frame[31] = lights.ambient_count as f32;

    if scene.frame_buffer.is_none() {
        let buffer = state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("flight-wgpu-pbr-frame-uniform"),
            size: FRAME_UNIFORM_BYTES,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        scene.frame_buffer = Some(buffer);
    }
    state.queue.write_buffer(
        scene.frame_buffer.as_ref().unwrap(),
        0,
        f32_slice_bytes(&frame),
    );

    if scene.frame_bind_group.is_none() {
        let bind_group = state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("flight-wgpu-pbr-frame-bind-group"),
            layout: &scene.pipeline_cache[cache_key].frame_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: scene.frame_buffer.as_ref().unwrap().as_entire_binding(),
            }],
        });
        scene.frame_bind_group = Some(bind_group);
    }
}

/// Decodes a packed `0xRRGGBBAA` sRGB-albedo color to linear RGBA. RGB is
/// gamma-decoded (IEC 61966-2-1); alpha passes through. The Rust mirror of
/// `@flighthq/materials` `unpackColorToLinear`.
///
/// TS↔Rust divergence: `unpack_color_to_linear` is not yet ported to the Rust
/// `flighthq-materials` crate (only `compute_rgb_hex_string` is), so the renderer
/// carries this private decode inline. // TODO(align): switch to
/// `flighthq_materials::unpack_color_to_linear` once it lands there.
fn unpack_color_to_linear(color: u32) -> [f32; 4] {
    [
        srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 255.0),
        srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 255.0),
        srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 255.0),
        (color & 0xff) as f32 / 255.0,
    ]
}

fn srgb_channel_to_linear(value: f32) -> f32 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn f32_slice_bytes(data: &[f32]) -> &[u8] {
    let ptr = data.as_ptr() as *const u8;
    // SAFETY: f32 is plain-old-data; the slice covers len*4 in-bounds bytes.
    unsafe { std::slice::from_raw_parts(ptr, std::mem::size_of_val(data)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod build_wgpu_pbr_standard_define_key {
        use super::*;

        #[test]
        fn defaults_to_no_maps_no_alpha_mask_for_a_null_material() {
            let key = build_wgpu_pbr_standard_define_key(None);
            assert_eq!(key, WgpuPbrDefineKey::default());
        }

        #[test]
        fn reads_alpha_mask_and_double_sided_from_the_surface_trailer() {
            let material = StandardPbrMaterial {
                alpha_mode: MaterialAlphaMode::Mask,
                double_sided: true,
                ..Default::default()
            };
            let key = build_wgpu_pbr_standard_define_key(Some(&material));
            assert!(key.alpha_mask_enabled);
            assert!(key.double_sided);
            assert!(!key.has_base_color_map);
            assert!(!key.has_normal_map);
        }

        #[test]
        fn opaque_single_sided_material_selects_the_base_variant() {
            let material = StandardPbrMaterial::default();
            let key = build_wgpu_pbr_standard_define_key(Some(&material));
            assert!(!key.alpha_mask_enabled);
            assert!(!key.double_sided);
        }
    }

    mod standard_pbr_wgpu_mesh_material_renderer {
        use super::*;

        #[test]
        fn returns_a_renderer_value() {
            let _renderer = standard_pbr_wgpu_mesh_material_renderer();
        }
    }

    mod uniform_layout_constants {
        use super::*;

        #[test]
        fn match_the_wgsl_std140_block_sizes() {
            // Frame = viewProjection(64) + cameraPosition(16) + 3 light vec4 (48).
            assert_eq!(FRAME_UNIFORM_BYTES, 64 + 16 + 16 * 3);
            assert_eq!(FRAME_UNIFORM_BYTES / 4, 32);
            // Draw = world mat4 (64) + normal mat3 as 3 padded vec4 (48).
            assert_eq!(DRAW_UNIFORM_BYTES, 64 + 48);
            // Material = 4 vec4 (baseColor, emissive, factors, flags).
            assert_eq!(MATERIAL_UNIFORM_BYTES, 16 * 4);
            assert_eq!(MATERIAL_UNIFORM_BYTES / 4, 16);
        }

        #[test]
        fn white_pixel_is_opaque_white() {
            assert_eq!(WHITE_PIXEL, [255, 255, 255, 255]);
        }
    }

    mod write_wgpu_pbr_standard_block {
        use super::*;

        #[test]
        fn null_block_packs_neutral_white_dielectric_rough_defaults() {
            let mut out = [0.0f32; MATERIAL_UNIFORM_FLOATS];
            write_wgpu_pbr_standard_block(&mut out, None, 0.5);
            assert_eq!(&out[0..4], &[1.0, 1.0, 1.0, 1.0]); // white base color
            assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]); // black emissive
            assert_eq!(out[8], 0.0); // metallic
            assert_eq!(out[9], 1.0); // roughness
            assert_eq!(out[10], 1.0); // normal scale
            assert_eq!(out[11], 1.0); // occlusion strength
            assert_eq!(out[12], 0.5); // alpha cutoff
        }

        #[test]
        fn packs_concrete_factors_with_srgb_decoded_base_color() {
            let properties = StandardPbrMaterialProperties {
                base_color: 0xffffffff,
                metallic: 0.25,
                roughness: 0.75,
                normal_scale: 2.0,
                occlusion_strength: 0.5,
                ..Default::default()
            };
            let mut out = [0.0f32; MATERIAL_UNIFORM_FLOATS];
            write_wgpu_pbr_standard_block(&mut out, Some(&properties), 0.3);
            // White (0xff) decodes to linear 1.0 and alpha passes through.
            assert!((out[0] - 1.0).abs() < 1e-5);
            assert!((out[3] - 1.0).abs() < 1e-6);
            assert_eq!(out[8], 0.25);
            assert_eq!(out[9], 0.75);
            assert_eq!(out[10], 2.0);
            assert_eq!(out[11], 0.5);
            assert_eq!(out[12], 0.3);
        }

        #[test]
        fn scales_emissive_by_strength() {
            let properties = StandardPbrMaterialProperties {
                emissive: 0xffffffff,
                emissive_strength: 2.0,
                ..Default::default()
            };
            let mut out = [0.0f32; MATERIAL_UNIFORM_FLOATS];
            write_wgpu_pbr_standard_block(&mut out, Some(&properties), 0.5);
            // White emissive decodes to linear 1.0, then * strength 2.0.
            assert!((out[4] - 2.0).abs() < 1e-5);
            assert_eq!(out[7], 0.0);
        }
    }

    mod unpack_color_to_linear {
        use super::*;

        #[test]
        fn decodes_white_to_one_and_black_to_zero() {
            let white = unpack_color_to_linear(0xffffffff);
            assert!((white[0] - 1.0).abs() < 1e-5);
            assert!((white[3] - 1.0).abs() < 1e-6);
            let black = unpack_color_to_linear(0x000000ff);
            assert_eq!(black[0], 0.0);
            assert!((black[3] - 1.0).abs() < 1e-6);
        }

        #[test]
        fn passes_alpha_through_without_gamma() {
            let half_alpha = unpack_color_to_linear(0xffffff80);
            assert!((half_alpha[3] - 128.0 / 255.0).abs() < 1e-6);
        }
    }
}

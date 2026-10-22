use crate::gltf_accessor::{GltfAccessorReader, gltf_integer_field};
use crate::gltf_container::decode_gltf_base64;
use crate::gltf_diagnostics::tally_gltf_numbers;
use crate::gltf_schema::*;
use crate::gltf_types::GltfImportOptions;
use flight_buffer::get_array_buffer_storage;
use flight_color::{allocate_linear_color, pack_linear_to_color};
use flight_entity::Ref;
use flight_image::{
    EmbeddedImageResourceReferenceValue, ExternalImageResourceReferenceValue,
    ImageResourceReference, create_embedded_image_resource_reference,
    create_external_image_resource_reference, create_texture_from_image_resource,
};
use flight_image_codec::detect_image_mime_type;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_materials::pbr_materials::create_standard_pbr_material;
use flight_materials::{MaterialAlphaMode, StandardPbrMaterial};
use flight_texture::{Texture, TextureColorSpace, TextureFilter, TextureUvTransform, TextureWrap};
use std::sync::{Arc, RwLock};

#[cfg(test)]
#[path = "../tests/internal/gltf_material_test.rs"]
mod tests;

pub(crate) struct GltfTextureResolver {
    pub images: Vec<Option<ImageResourceReference>>,
    pub reader: Arc<GltfAccessorReader>,
}

fn apply_gltf_sampler(texture: &mut Texture, sampler: Option<&Ref<GltfSampler>>) {
    let Some(sampler) = sampler else {
        return;
    };
    let sampler = sampler.read().unwrap();
    let target = &mut texture.texture_fields_mut().sampler;
    if let Some(wrap) = sampler.wrap_s.and_then(gltf_texture_wrap) {
        target.wrap_u = wrap;
    }
    if let Some(wrap) = sampler.wrap_t.and_then(gltf_texture_wrap) {
        target.wrap_v = wrap;
    }
    if let Some(filter) = sampler.mag_filter.and_then(gltf_texture_filter) {
        target.mag_filter = filter;
    }
    if let Some(filter) = sampler.min_filter.and_then(gltf_texture_filter) {
        target.min_filter = filter;
        target.mipmaps = matches!(
            filter,
            TextureFilter::NearestMipmapNearest
                | TextureFilter::NearestMipmapLinear
                | TextureFilter::LinearMipmapNearest
                | TextureFilter::LinearMipmapLinear
        );
    }
}

fn apply_gltf_texture_transform(
    texture: &mut Texture,
    transform: Option<&Ref<GltfTextureTransform>>,
) {
    let Some(transform) = transform else {
        return;
    };
    let transform = transform.read().unwrap();
    let target = texture.texture_fields_mut();
    target.uv_offset.x = transform
        .offset
        .as_ref()
        .and_then(|values| values.first())
        .copied()
        .unwrap_or(0.0);
    target.uv_offset.y = transform
        .offset
        .as_ref()
        .and_then(|values| values.get(1))
        .copied()
        .unwrap_or(0.0);
    target.uv_scale.x = transform
        .scale
        .as_ref()
        .and_then(|values| values.first())
        .copied()
        .unwrap_or(1.0);
    target.uv_scale.y = transform
        .scale
        .as_ref()
        .and_then(|values| values.get(1))
        .copied()
        .unwrap_or(1.0);
    target.uv_rotation = transform.rotation.unwrap_or(0.0);
}

pub(crate) fn build_gltf_image_reference(
    reader: &GltfAccessorReader,
    image: &Ref<GltfImage>,
    image_index: usize,
    options: Option<&GltfImportOptions>,
) -> Option<ImageResourceReference> {
    let (uri, mime_type, view_index, view_number) = {
        let row = image.read().unwrap();
        (
            row.uri.clone(),
            row.mime_type.clone(),
            row.buffer_view
                .and_then(|value| gltf_integer_field(&reader.metadata, image, "bufferView", value)),
            row.buffer_view,
        )
    };
    if let Some(uri) = uri {
        if uri.starts_with("data:") {
            let Some(comma) = uri.find(',') else {
                tally_gltf_numbers(
                    reader.drops.as_ref(),
                    ImportDiagnosticSeverity::Drop,
                    "gltf.image-malformed-uri",
                    &[("firstImage", image_index as f32)],
                );
                return None;
            };
            let declared = if let Some(semicolon) = uri.find(';').filter(|semicolon| *semicolon > 5)
            {
                Some(uri[5..semicolon].to_string())
            } else {
                mime_type
            };
            let bytes = decode_gltf_base64(&uri[comma + 1..]);
            let mime_type = declared.or_else(|| detect_image_mime_type(&bytes));
            return Some(gltf_embedded_image(bytes, mime_type));
        }
        let reference = create_external_image_resource_reference(uri);
        reference.write().unwrap().base_path =
            options.and_then(|options| options.base_path.clone());
        return Some(ImageResourceReference::External(
            ExternalImageResourceReferenceValue { reference },
        ));
    }
    if let Some(view_number) = view_number {
        let view = reader
            .source
            .read()
            .unwrap()
            .buffer_views
            .as_ref()
            .and_then(|views| view_index.and_then(|index| views.get(index)))
            .cloned();
        let Some(view) = view else {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.image-bufferview-out-of-range",
                &[
                    ("firstBufferView", view_number),
                    ("firstImage", image_index as f32),
                ],
            );
            return None;
        };
        let (buffer_index, start, length) = {
            let row = view.read().unwrap();
            (
                gltf_integer_field(&reader.metadata, &view, "buffer", row.buffer),
                gltf_integer_field(
                    &reader.metadata,
                    &view,
                    "byteOffset",
                    row.byte_offset.unwrap_or(0.0),
                ),
                gltf_integer_field(&reader.metadata, &view, "byteLength", row.byte_length),
            )
        };
        let (Some(buffer), Some(start), Some(length)) = (
            buffer_index.and_then(|index| reader.buffers.get(index)),
            start,
            length,
        ) else {
            tally_gltf_numbers(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Drop,
                "gltf.image-bufferview-out-of-range",
                &[
                    ("firstBufferView", view_number),
                    ("firstImage", image_index as f32),
                ],
            );
            return None;
        };
        // Uint8Array.slice clamps the upper end, including a start past the caller's view.
        let relative_start = start.min(buffer.byte_length);
        let relative_end = start.saturating_add(length).min(buffer.byte_length);
        let storage = get_array_buffer_storage(&buffer.buffer);
        let storage = storage.read().unwrap();
        let bytes: Box<[u8]> =
            storage[buffer.byte_offset + relative_start..buffer.byte_offset + relative_end].into();
        let mime_type = mime_type.or_else(|| detect_image_mime_type(&bytes));
        return Some(gltf_embedded_image(bytes, mime_type));
    }
    tally_gltf_numbers(
        reader.drops.as_ref(),
        ImportDiagnosticSeverity::Drop,
        "gltf.image-no-source",
        &[("firstImage", image_index as f32)],
    );
    return None;
}

fn gltf_embedded_image(bytes: Box<[u8]>, mime_type: Option<String>) -> ImageResourceReference {
    let reference = create_embedded_image_resource_reference(Arc::new(RwLock::new(bytes)));
    reference.write().unwrap().mime_type = mime_type;
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue { reference });
}

pub(crate) fn gltf_material_to_pbr(
    resolver: &GltfTextureResolver,
    material: &Ref<GltfMaterial>,
) -> Ref<StandardPbrMaterial> {
    let (
        pbr,
        normal,
        occlusion,
        emissive_texture,
        emissive_factor,
        alpha_mode,
        alpha_cutoff,
        double_sided,
        name,
    ) = {
        let row = material.read().unwrap();
        (
            row.pbr_metallic_roughness.clone(),
            row.normal_texture.clone(),
            row.occlusion_texture.clone(),
            row.emissive_texture.clone(),
            row.emissive_factor.clone(),
            row.alpha_mode.clone(),
            row.alpha_cutoff,
            row.double_sided,
            row.name.clone(),
        )
    };
    let (base_factor, base_texture, metallic, metallic_texture, roughness) = pbr
        .as_ref()
        .map(|pbr| {
            let pbr = pbr.read().unwrap();
            return (
                pbr.base_color_factor.clone(),
                pbr.base_color_texture.clone(),
                pbr.metallic_factor,
                pbr.metallic_roughness_texture.clone(),
                pbr.roughness_factor,
            );
        })
        .unwrap_or((None, None, None, None, None));
    let normal_scale = normal
        .as_ref()
        .and_then(|normal| normal.read().unwrap().scale)
        .unwrap_or(1.0);
    let occlusion_strength = occlusion
        .as_ref()
        .and_then(|occlusion| occlusion.read().unwrap().strength)
        .unwrap_or(1.0);
    let base_info = base_texture;
    let normal_info: Option<GltfTextureInfoRef> = normal.map(|normal| normal as GltfTextureInfoRef);
    let occlusion_info: Option<GltfTextureInfoRef> =
        occlusion.map(|occlusion| occlusion as GltfTextureInfoRef);
    let base_info: Option<GltfTextureInfoRef> = base_info.map(|info| info as GltfTextureInfoRef);
    let emissive_info: Option<GltfTextureInfoRef> =
        emissive_texture.map(|info| info as GltfTextureInfoRef);
    let metallic_info: Option<GltfTextureInfoRef> =
        metallic_texture.map(|info| info as GltfTextureInfoRef);
    let base_color =
        pack_gltf_linear_color(base_factor.as_deref().unwrap_or(&[1.0, 1.0, 1.0, 1.0]), 4);
    let base_color_map =
        resolve_gltf_texture(resolver, base_info.as_ref(), TextureColorSpace::Srgb);
    let emissive =
        pack_gltf_linear_color(emissive_factor.as_deref().unwrap_or(&[0.0, 0.0, 0.0]), 3);
    let emissive_map =
        resolve_gltf_texture(resolver, emissive_info.as_ref(), TextureColorSpace::Srgb);
    let metallic = metallic.unwrap_or(1.0);
    let metallic_roughness_map =
        resolve_gltf_texture(resolver, metallic_info.as_ref(), TextureColorSpace::Linear);
    let normal_map =
        resolve_gltf_texture(resolver, normal_info.as_ref(), TextureColorSpace::Linear);
    let occlusion_map =
        resolve_gltf_texture(resolver, occlusion_info.as_ref(), TextureColorSpace::Linear);
    let roughness = roughness.unwrap_or(1.0);
    let mut out = create_standard_pbr_material();
    out.base_color = base_color;
    out.base_color_map = base_color_map;
    out.emissive = emissive;
    out.emissive_map = emissive_map;
    out.metallic = metallic;
    out.metallic_roughness_map = metallic_roughness_map;
    out.normal_map = normal_map;
    out.normal_scale = normal_scale;
    out.occlusion_map = occlusion_map;
    out.occlusion_strength = occlusion_strength;
    out.roughness = roughness;
    out.alpha_mode = match alpha_mode.as_deref() {
        Some("MASK") => MaterialAlphaMode::Mask,
        Some("BLEND") => MaterialAlphaMode::Blend,
        _ => MaterialAlphaMode::Opaque,
    };
    out.alpha_cutoff = alpha_cutoff.unwrap_or(0.5);
    out.double_sided = double_sided.unwrap_or(false);
    out.name = name;
    return Arc::new(RwLock::new(out));
}

fn gltf_texture_filter(value: f32) -> Option<TextureFilter> {
    return match value {
        9728.0 => Some(TextureFilter::Nearest),
        9729.0 => Some(TextureFilter::Linear),
        9984.0 => Some(TextureFilter::NearestMipmapNearest),
        9985.0 => Some(TextureFilter::LinearMipmapNearest),
        9986.0 => Some(TextureFilter::NearestMipmapLinear),
        9987.0 => Some(TextureFilter::LinearMipmapLinear),
        _ => None,
    };
}

fn gltf_texture_wrap(value: f32) -> Option<TextureWrap> {
    return match value {
        10497.0 => Some(TextureWrap::Repeat),
        33071.0 => Some(TextureWrap::ClampToEdge),
        33648.0 => Some(TextureWrap::MirrorRepeat),
        _ => None,
    };
}

pub(crate) fn pack_gltf_linear_color(factor: &[f32], channels: usize) -> u32 {
    let mut color = allocate_linear_color();
    color.r = factor.first().copied().unwrap_or(0.0);
    color.g = factor.get(1).copied().unwrap_or(0.0);
    color.b = factor.get(2).copied().unwrap_or(0.0);
    color.a = if channels == 4 {
        factor.get(3).copied().unwrap_or(0.0)
    } else {
        1.0
    };
    return pack_linear_to_color(&color);
}

pub(crate) fn resolve_gltf_texture(
    resolver: &GltfTextureResolver,
    info: Option<&GltfTextureInfoRef>,
    color_space: TextureColorSpace,
) -> Option<Ref<Texture>> {
    let info = info?;
    let (index, index_number, tex_coord, extensions) = {
        let row = info.read().unwrap();
        let row = row.gltf_texture_info();
        (
            gltf_integer_field(&resolver.reader.metadata, info, "index", row.index),
            row.index,
            row.tex_coord,
            row.extensions.clone(),
        )
    };
    let texture = resolver
        .reader
        .source
        .read()
        .unwrap()
        .textures
        .as_ref()
        .and_then(|textures| index.and_then(|index| textures.get(index)))
        .cloned();
    let (source, source_number, sampler) = if let Some(texture) = texture {
        let row = texture.read().unwrap();
        let basisu = row
            .extensions
            .as_ref()
            .and_then(|extensions| extensions.read().unwrap().khr_texture_basisu.clone());
        let (source, source_number) = if let Some(basisu) = basisu {
            let basisu_row = basisu.read().unwrap();
            (
                gltf_integer_field(
                    &resolver.reader.metadata,
                    &basisu,
                    "source",
                    basisu_row.source,
                ),
                Some(basisu_row.source),
            )
        } else {
            (
                row.source.and_then(|value| {
                    gltf_integer_field(&resolver.reader.metadata, &texture, "source", value)
                }),
                row.source,
            )
        };
        (
            source,
            source_number,
            row.sampler.and_then(|value| {
                gltf_integer_field(&resolver.reader.metadata, &texture, "sampler", value)
            }),
        )
    } else {
        (None, None, None)
    };
    let Some(source_number) = source_number else {
        tally_gltf_numbers(
            resolver.reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.texture-source-missing",
            &[("firstTexture", index_number)],
        );
        return None;
    };
    let Some(resource) = source
        .and_then(|index| resolver.images.get(index))
        .and_then(|image| image.as_ref())
    else {
        tally_gltf_numbers(
            resolver.reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.texture-image-unresolved",
            &[("firstImage", source_number)],
        );
        return None;
    };
    let result = create_texture_from_image_resource(resource, None);
    let transform =
        extensions.and_then(|extensions| extensions.read().unwrap().khr_texture_transform.clone());
    let requested_uv_set = transform
        .as_ref()
        .and_then(|transform| transform.read().unwrap().tex_coord)
        .or(tex_coord)
        .unwrap_or(0.0);
    if requested_uv_set != 0.0 {
        tally_gltf_numbers(
            resolver.reader.drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.texcoord-set-unsupported",
            &[
                ("firstTexture", index_number),
                ("firstUvSet", requested_uv_set),
            ],
        );
    }
    let sampler = resolver
        .reader
        .source
        .read()
        .unwrap()
        .samplers
        .as_ref()
        .and_then(|rows| sampler.and_then(|index| rows.get(index)))
        .cloned();
    {
        let mut texture = result.write().unwrap();
        texture.texture_fields_mut().color_space = color_space;
        apply_gltf_sampler(&mut texture, sampler.as_ref());
        apply_gltf_texture_transform(&mut texture, transform.as_ref());
    }
    return Some(result);
}

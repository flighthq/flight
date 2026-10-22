use super::*;
use crate::gltf_buffer::gltf_owned_byte_view;
use crate::gltf_diagnostics::flush_gltf_drops;
use crate::gltf_json::decode_gltf_json;
use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_importdiagnostics::ImportDiagnosticDetailValue;
use serde_json::{Value, json};

fn material_resolver(source: Value, bytes: Vec<u8>) -> GltfTextureResolver {
    let parsed = decode_gltf_json(&source);
    let reader = Arc::new(GltfAccessorReader {
        source: parsed.source,
        metadata: parsed.metadata,
        buffers: vec![gltf_owned_byte_view(bytes.into_boxed_slice())],
        drops: Some(Arc::new(RwLock::new(Vec::new()))),
    });
    let source_images = reader
        .source
        .read()
        .unwrap()
        .images
        .clone()
        .unwrap_or_default();
    let images = source_images
        .iter()
        .enumerate()
        .map(|(index, image)| build_gltf_image_reference(&reader, image, index, None))
        .collect();
    return GltfTextureResolver { images, reader };
}

#[test]
fn material_keeps_authored_factors_alpha_state_and_names_and_applies_gltf_defaults() {
    let resolver = material_resolver(
        json!({"materials":[{"alphaCutoff":0.3,"alphaMode":"MASK","doubleSided":true,"emissiveFactor":[0,1,0],"name":"Canopy","pbrMetallicRoughness":{"baseColorFactor":[1,0,0,1],"metallicFactor":0.25,"roughnessFactor":0.75}},{},{"emissiveFactor":[0.5,0.5,0.5],"pbrMetallicRoughness":{"baseColorFactor":[0.5,0.5,0.5,1]}}]}),
        vec![],
    );
    let materials = resolver
        .reader
        .source
        .read()
        .unwrap()
        .materials
        .clone()
        .unwrap();
    let authored = gltf_material_to_pbr(&resolver, &materials[0]);
    let authored = authored.read().unwrap();
    assert_eq!(authored.base_color, 0xff0000ff);
    assert_eq!(authored.emissive, 0x00ff00ff);
    assert_eq!(authored.metallic, 0.25);
    assert_eq!(authored.roughness, 0.75);
    assert_eq!(authored.alpha_mode, MaterialAlphaMode::Mask);
    // D1 f32 bound (TS: 0)
    assert!((authored.alpha_cutoff - 0.3).abs() <= 4.0 * f32::EPSILON);
    assert!(authored.double_sided);
    assert_eq!(authored.name.as_deref(), Some("Canopy"));
    let defaults = gltf_material_to_pbr(&resolver, &materials[1]);
    let defaults = defaults.read().unwrap();
    assert_eq!(defaults.base_color, 0xffffffff);
    assert_eq!(defaults.emissive, 0x000000ff);
    assert_eq!(defaults.metallic, 1.0);
    assert_eq!(defaults.roughness, 1.0);
    assert_eq!(defaults.alpha_mode, MaterialAlphaMode::Opaque);
    assert_eq!(defaults.alpha_cutoff, 0.5);
    assert_eq!(defaults.name, None);
    let encoded = gltf_material_to_pbr(&resolver, &materials[2]);
    assert_eq!(encoded.read().unwrap().base_color, 0xbcbcbcff);
    assert_eq!(encoded.read().unwrap().emissive, 0xbcbcbcff);
}

#[test]
fn failed_image_holes_stay_aligned_and_every_material_map_registers_a_fresh_texture_once_on_the_same_resource()
 {
    let resolver = material_resolver(
        json!({"images":[{"uri":"data:no-comma"},{"uri":"same.png"}],"textures":[{"source":1}],"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicRoughnessTexture":{"index":0}},"normalTexture":{"index":0,"scale":0.25},"occlusionTexture":{"index":0,"strength":0.5},"emissiveTexture":{"index":0}}]}),
        vec![],
    );
    assert!(resolver.images[0].is_none());
    let material = resolver
        .reader
        .source
        .read()
        .unwrap()
        .materials
        .as_ref()
        .unwrap()[0]
        .clone();
    let material = gltf_material_to_pbr(&resolver, &material);
    let material = material.read().unwrap();
    let maps = [
        material.base_color_map.as_ref().unwrap(),
        material.metallic_roughness_map.as_ref().unwrap(),
        material.normal_map.as_ref().unwrap(),
        material.occlusion_map.as_ref().unwrap(),
        material.emissive_map.as_ref().unwrap(),
    ];
    let ImageResourceReference::External(resource) = resolver.images[1].as_ref().unwrap() else {
        panic!("expected external image")
    };
    let registered = resource.reference.read().unwrap().textures.clone();
    assert_eq!(registered.len(), 5);
    for texture in &maps {
        assert_eq!(
            registered
                .iter()
                .filter(|registered| Arc::ptr_eq(registered, texture))
                .count(),
            1
        );
    }
    for left in 0..maps.len() {
        for right in left + 1..maps.len() {
            assert!(!Arc::ptr_eq(maps[left], maps[right]));
        }
    }
    for (map, space) in maps.iter().zip([
        TextureColorSpace::Srgb,
        TextureColorSpace::Linear,
        TextureColorSpace::Linear,
        TextureColorSpace::Linear,
        TextureColorSpace::Srgb,
    ]) {
        assert_eq!(map.read().unwrap().texture_fields().color_space, space);
    }
    assert_eq!(material.normal_scale, 0.25);
    assert_eq!(material.occlusion_strength, 0.5);
}

#[test]
fn image_buffer_views_slice_clamps_the_upper_end_but_rejects_negative_or_fractional_lower_bounds() {
    let mut resolver = material_resolver(
        json!({"images":[{"bufferView":0,"mimeType":"image/custom"}],"bufferViews":[{"buffer":0,"byteOffset":2,"byteLength":999}]}),
        vec![1, 2, 3],
    );
    let backing = create_array_buffer_from_bytes(vec![99, 1, 2, 3, 88].into_boxed_slice());
    Arc::get_mut(&mut resolver.reader).unwrap().buffers[0] =
        create_array_buffer_view(&backing, 1, 3, ArrayBufferViewKind::Uint8Array).unwrap();
    let image = resolver
        .reader
        .source
        .read()
        .unwrap()
        .images
        .as_ref()
        .unwrap()[0]
        .clone();
    let reference = build_gltf_image_reference(&resolver.reader, &image, 0, None).unwrap();
    let ImageResourceReference::Embedded(reference) = reference else {
        panic!("expected embedded image")
    };
    assert_eq!(
        &**reference.reference.read().unwrap().bytes.read().unwrap(),
        &[3]
    );
    assert_eq!(
        reference.reference.read().unwrap().mime_type.as_deref(),
        Some("image/custom")
    );
    let view = resolver
        .reader
        .source
        .read()
        .unwrap()
        .buffer_views
        .as_ref()
        .unwrap()[0]
        .clone();
    for offset in [-1.0, 0.5] {
        view.write().unwrap().byte_offset = Some(offset);
        assert!(build_gltf_image_reference(&resolver.reader, &image, 0, None).is_none());
    }
    view.write().unwrap().byte_offset = Some(100.0);
    let reference = build_gltf_image_reference(&resolver.reader, &image, 0, None).unwrap();
    let ImageResourceReference::Embedded(reference) = reference else {
        panic!("expected embedded image")
    };
    assert!(
        reference
            .reference
            .read()
            .unwrap()
            .bytes
            .read()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn sampler_maps_all_six_filters_and_three_wrap_modes_and_texture_transform_overrides_the_uv_set() {
    let resolver = material_resolver(
        json!({"images":[{"uri":"image.png"}],"samplers":[{"wrapS":10497,"wrapT":33648,"magFilter":9728,"minFilter":9987}],"textures":[{"sampler":0,"source":0}],"materials":[{"normalTexture":{"index":0,"texCoord":3,"extensions":{"KHR_texture_transform":{"offset":[0.25,0.5],"scale":[2,3],"rotation":0.5,"texCoord":0}}}}]}),
        vec![],
    );
    let info = resolver
        .reader
        .source
        .read()
        .unwrap()
        .materials
        .as_ref()
        .unwrap()[0]
        .read()
        .unwrap()
        .normal_texture
        .clone()
        .unwrap();
    let info: GltfTextureInfoRef = info;
    let map = resolve_gltf_texture(&resolver, Some(&info), TextureColorSpace::Linear).unwrap();
    let map = map.read().unwrap();
    let fields = map.texture_fields();
    assert_eq!(fields.sampler.wrap_u, TextureWrap::Repeat);
    assert_eq!(fields.sampler.wrap_v, TextureWrap::MirrorRepeat);
    assert_eq!(fields.sampler.mag_filter, TextureFilter::Nearest);
    assert_eq!((fields.uv_offset.x, fields.uv_offset.y), (0.25, 0.5));
    assert_eq!((fields.uv_scale.x, fields.uv_scale.y), (2.0, 3.0));
    assert_eq!(fields.uv_rotation, 0.5);
    assert!(
        resolver
            .reader
            .drops
            .as_ref()
            .unwrap()
            .read()
            .unwrap()
            .is_empty()
    );
    let sampler = resolver
        .reader
        .source
        .read()
        .unwrap()
        .samplers
        .as_ref()
        .unwrap()[0]
        .clone();
    for (number, filter, mipmaps) in [
        (9728.0, TextureFilter::Nearest, false),
        (9729.0, TextureFilter::Linear, false),
        (9984.0, TextureFilter::NearestMipmapNearest, true),
        (9985.0, TextureFilter::LinearMipmapNearest, true),
        (9986.0, TextureFilter::NearestMipmapLinear, true),
        (9987.0, TextureFilter::LinearMipmapLinear, true),
    ] {
        sampler.write().unwrap().min_filter = Some(number);
        let texture =
            resolve_gltf_texture(&resolver, Some(&info), TextureColorSpace::Linear).unwrap();
        assert_eq!(
            texture.read().unwrap().texture_fields().sampler.min_filter,
            filter
        );
        assert_eq!(
            texture.read().unwrap().texture_fields().sampler.mipmaps,
            mipmaps
        );
    }
    sampler.write().unwrap().wrap_s = Some(33071.0);
    let texture = resolve_gltf_texture(&resolver, Some(&info), TextureColorSpace::Linear).unwrap();
    assert_eq!(
        texture.read().unwrap().texture_fields().sampler.wrap_u,
        TextureWrap::ClampToEdge
    );
}

#[test]
fn basisu_source_takes_priority_and_unsupported_uv_sets_and_failed_image_maps_report_recoveries() {
    let resolver = material_resolver(
        json!({"images":[{"uri":"base.png"},{"uri":"basis.ktx2"},{"uri":"data:bad"}],"textures":[{"source":0,"extensions":{"KHR_texture_basisu":{"source":1}}},{"source":2},{"source":99},{}],"materials":[{"pbrMetallicRoughness":{"baseColorTexture":{"index":0,"texCoord":2}}}]}),
        vec![],
    );
    let info = resolver
        .reader
        .source
        .read()
        .unwrap()
        .materials
        .as_ref()
        .unwrap()[0]
        .read()
        .unwrap()
        .pbr_metallic_roughness
        .as_ref()
        .unwrap()
        .read()
        .unwrap()
        .base_color_texture
        .clone()
        .unwrap();
    let info: GltfTextureInfoRef = info;
    let texture = resolve_gltf_texture(&resolver, Some(&info), TextureColorSpace::Srgb).unwrap();
    let ImageResourceReference::External(reference) = resolver.images[1].as_ref().unwrap() else {
        panic!("expected external image")
    };
    assert!(Arc::ptr_eq(
        &reference.reference.read().unwrap().textures[0],
        &texture
    ));
    for index in [1.0, 2.0, 3.0, 99.0] {
        let fixture = decode_gltf_json(&json!({"materials":[{"emissiveTexture":{"index":index}}]}));
        let info = fixture.source.read().unwrap().materials.as_ref().unwrap()[0]
            .read()
            .unwrap()
            .emissive_texture
            .clone()
            .unwrap();
        let info: GltfTextureInfoRef = info;
        assert!(resolve_gltf_texture(&resolver, Some(&info), TextureColorSpace::Srgb).is_none());
    }
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), resolver.reader.drops.as_ref());
    let diagnostics = diagnostics.read().unwrap();
    let uv = diagnostics
        .iter()
        .find(|diagnostic| diagnostic.kind == "gltf.texcoord-set-unsupported")
        .unwrap();
    assert_eq!(uv.severity, ImportDiagnosticSeverity::Recover);
    assert_eq!(
        uv.detail.as_ref().unwrap()["firstUvSet"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(
        diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "gltf.texture-image-unresolved")
            .unwrap()
            .detail
            .as_ref()
            .unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(
        diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "gltf.texture-source-missing")
            .unwrap()
            .detail
            .as_ref()
            .unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
}

#[test]
fn image_data_uri_uses_header_then_declared_then_sniffed_mime_and_external_base_path() {
    let resolver = material_resolver(
        json!({"images":[{"uri":"data:image/custom;base64,AQID","mimeType":"ignored"},{"uri":"data:,iVBORw0KGgo="},{"uri":"data:,AQID","mimeType":"image/declared"},{"uri":"asset.png"}]}),
        vec![],
    );
    for (index, mime) in [(0, "image/custom"), (1, "image/png"), (2, "image/declared")] {
        let ImageResourceReference::Embedded(reference) = resolver.images[index].as_ref().unwrap()
        else {
            panic!("expected embedded image")
        };
        assert_eq!(
            reference.reference.read().unwrap().mime_type.as_deref(),
            Some(mime)
        );
    }
    let image = resolver
        .reader
        .source
        .read()
        .unwrap()
        .images
        .as_ref()
        .unwrap()[3]
        .clone();
    let options = GltfImportOptions {
        base_path: Some("assets/".to_string()),
        extension_handlers: None,
        external_buffers: None,
        draco_registry: None,
    };
    let external = build_gltf_image_reference(&resolver.reader, &image, 3, Some(&options)).unwrap();
    let ImageResourceReference::External(external) = external else {
        panic!("expected external image")
    };
    assert_eq!(
        external.reference.read().unwrap().base_path.as_deref(),
        Some("assets/")
    );
    assert_eq!(external.reference.read().unwrap().uri, "asset.png");
}

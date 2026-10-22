use crate::gltf_original_test_helper::*;
use crate::gltf_test_helper::gltf_data_uri;
use flight_entity::{Record, Unknown, set_record_value};
use flight_geometry::create_vector3;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::{
    Material, Material3D, MaterialAlphaMode, STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial,
};
use flight_meshgeometry::{get_mesh_geometry_vertex_count, get_mesh_geometry_vertex_position};
use flight_scene3d::{Mesh, Scene3DDocumentMaterial, is_mesh};
use flight_scene3d_formats::contract::*;
use flight_texture::{
    TextureColorSpace, TextureFilter, TextureUvTransform, TextureWrap, get_texture_source,
};
use serde_json::json;
use std::sync::{Arc, RwLock};

mod create_scene3d_from_gltf {
    use super::*;

    #[test]
    fn case_048_reports_an_unsupported_required_extension_as_a_capability_gap_with_no_data_integrity_complaint()
     {
        let mut source = original_gltf_fixture("triangle");
        source["extensionsRequired"] = json!(["EXT_flight_not_implemented"]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&source, Some(&diagnostics));
        let diagnostics = diagnostics.read().unwrap();
        assert!(
            diagnostics
                .iter()
                .any(|entry| entry.kind == "gltf.unsupported-required-extension")
        );
        let integrity: Vec<_> = diagnostics
            .iter()
            .filter(|entry| entry.severity != ImportDiagnosticSeverity::Skip)
            .collect();
        assert!(integrity.is_empty());
    }

    #[test]
    fn case_049_raises_no_diagnostic_at_all_for_a_well_formed_file() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&original_gltf_fixture("triangle"), Some(&diagnostics));
        assert!(diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn case_050_decodes_a_gltf_material_to_a_standardpbrmaterial_carrying_its_metallic_roughness_factors()
     {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"alphaCutoff":0.3,"alphaMode":"MASK","doubleSided":true,"emissiveFactor":[0,1,0],"name":"Canopy","pbrMetallicRoughness":{"baseColorFactor":[1,0,0,1],"metallicFactor":0.25,"roughnessFactor":0.75}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(material.material_fields().kind, STANDARD_PBR_MATERIAL_KIND);
            assert_eq!(material.base_color, 0xff0000ff);
            assert_eq!(material.emissive, 0x00ff00ff);
            assert_eq!(material.metallic, 0.25);
            assert_eq!(material.roughness, 0.75);
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Mask
            );
            // D1 f32 bound (TS: 0)
            assert!(
                (material.material3d_fields().alpha_cutoff as f64 - 0.3).abs()
                    <= 4.0 * f32::EPSILON as f64
            );
            assert!(material.material3d_fields().double_sided);
            assert_eq!(material.material_fields().name.as_deref(), Some("Canopy"));
        });
        let children = original_children(&scene);
        let mesh = children[0].read().unwrap();
        assert_eq!(
            mesh.as_any()
                .downcast_ref::<Mesh>()
                .unwrap()
                .materials
                .read()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn case_051_srgb_encodes_a_mid_range_linear_basecolorfactor_so_the_shader_gamma_decode_recovers_it()
     {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"emissiveFactor":[0.5,0.5,0.5],"pbrMetallicRoughness":{"baseColorFactor":[0.5,0.5,0.5,1]}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let srgb_byte = (flight_color::linear_channel_to_srgb(0.5) * 255.0).round() as u32;
            let expected = (srgb_byte << 24) | (srgb_byte << 16) | (srgb_byte << 8);
            assert_eq!(material.base_color, expected | 0xff);
            assert_eq!(material.emissive, expected | 0xff);
            assert_ne!(srgb_byte, 0x80);
        });
    }

    #[test]
    fn case_052_applies_gltf_metallic_roughness_spec_defaults_when_factors_are_absent() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(material.base_color, 0xffffffff);
            assert_eq!(material.metallic, 1.0);
            assert_eq!(material.roughness, 1.0);
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Opaque
            );
            assert_eq!(material.material_fields().name, None);
        });
    }

    #[test]
    fn case_053_resolves_a_basecolortexture_data_uri_image_to_an_embedded_texture_ref() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 1, 2, 3, 4];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let map = material.base_color_map.as_ref().unwrap();
            assert!(get_texture_source(&*map.read().unwrap()).is_none());
            let resource = get_test_texture_resource(&scene.resources, map);
            let ImageResourceReference::Embedded(resource) = resource else {
                panic!("expected Embedded");
            };
            let resource = resource.reference.read().unwrap();
            assert_eq!(resource.mime_type.as_deref(), Some("image/png"));
            assert_eq!(&**resource.bytes.read().unwrap(), png);
        });
    }

    #[test]
    fn case_054_lists_each_gltf_image_resource_once_and_shares_its_identity_across_independently_sampled_textures()
     {
        let png = &[0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4];
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"normalTexture":{"index":1},"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]);
        source["textures"] = json!([{"sampler":0,"source":0},{"sampler":1,"source":0}]);
        source["samplers"] = json!([{"wrapS":10497},{"wrapS":33071}]);
        source["images"] = json!([{"uri":original_image_uri("image/png",png)}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let source = source.to_string();
        let document = parse_gltf(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            None,
            None,
        );
        let document = document.read().unwrap();
        assert_eq!(document.resources.len(), 1);
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("expected entity");
        };
        let material = material.material.read().unwrap();
        let material = material
            .as_any()
            .downcast_ref::<StandardPbrMaterial>()
            .unwrap();
        let base = material.base_color_map.as_ref().unwrap();
        let normal = material.normal_map.as_ref().unwrap();
        assert!(!Arc::ptr_eq(base, normal));
        let ImageResourceReference::Embedded(expected) = &document.resources[0] else {
            panic!("expected embedded");
        };
        for map in [base, normal] {
            let ImageResourceReference::Embedded(actual) =
                get_test_texture_resource(&document.resources, map)
            else {
                panic!("expected embedded");
            };
            assert!(Arc::ptr_eq(&actual.reference, &expected.reference));
        }
        let base = base.read().unwrap();
        let normal = normal.read().unwrap();
        assert_eq!(base.texture_fields().color_space, TextureColorSpace::Srgb);
        assert_eq!(
            normal.texture_fields().color_space,
            TextureColorSpace::Linear
        );
        assert_eq!(base.texture_fields().sampler.wrap_u, TextureWrap::Repeat);
        assert_eq!(
            normal.texture_fields().sampler.wrap_u,
            TextureWrap::ClampToEdge
        );
    }

    #[test]
    fn case_055_resolves_an_external_uri_image_to_an_external_texture_ref() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"emissiveTexture":{"index":0}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":"textures/emissive.png"}]);
        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let ImageResourceReference::External(resource) = get_test_texture_resource(
                &scene.resources,
                material.emissive_map.as_ref().unwrap(),
            ) else {
                panic!("expected External");
            };
            assert_eq!(
                resource.reference.read().unwrap().uri,
                "textures/emissive.png"
            );
        });
    }

    #[test]
    fn case_056_resolves_a_bufferview_embedded_image_to_an_embedded_texture_ref_and_honors_normalscale()
     {
        let positions = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let bytes: Vec<_> = positions
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let png = &[0x89, 0x50, 0x4e, 0x47, 7, 7, 7];
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":1,"byteLength":7,"byteOffset":0}],"buffers":[{"byteLength":36,"uri":gltf_data_uri(&bytes)},{"byteLength":7,"uri":gltf_data_uri(png)}],"images":[{"bufferView":1,"mimeType":"image/png"}],"materials":[{"normalTexture":{"index":0,"scale":2}}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"material":0}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}],"textures":[{"source":0}]});
        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(material.normal_scale, 2.0);
            let ImageResourceReference::Embedded(resource) =
                get_test_texture_resource(&scene.resources, material.normal_map.as_ref().unwrap())
            else {
                panic!("expected Embedded");
            };
            let resource = resource.reference.read().unwrap();
            assert_eq!(resource.mime_type.as_deref(), Some("image/png"));
            assert_eq!(&**resource.bytes.read().unwrap(), png);
        });
    }

    #[test]
    fn case_057_leaves_a_primitive_unmaterialed_when_it_references_no_material() {
        let scene = original_scene(&original_gltf_fixture("triangle"), None);
        let children = original_children(&scene);
        let mesh = children[0].read().unwrap();
        assert!(
            mesh.as_any()
                .downcast_ref::<Mesh>()
                .unwrap()
                .materials
                .read()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn case_058_resolves_pbrmetallicroughness_metallicroughnesstexture_to_a_linear_metallicroughnessmap()
     {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] =
            json!([{"pbrMetallicRoughness":{"metallicRoughnessTexture":{"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 1, 2, 3];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let map = material.metallic_roughness_map.as_ref().unwrap();
            assert_eq!(
                map.read().unwrap().texture_fields().color_space,
                TextureColorSpace::Linear
            );
            let ImageResourceReference::Embedded(resource) =
                get_test_texture_resource(&scene.resources, map)
            else {
                panic!("expected Embedded");
            };
            assert_eq!(
                resource.reference.read().unwrap().mime_type.as_deref(),
                Some("image/png")
            );
        });
    }

    #[test]
    fn case_059_reads_occlusiontexture_into_a_linear_occlusionmap_and_honors_occlusionstrength() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"occlusionTexture":{"index":0,"strength":0.5}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 4];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(material.occlusion_strength, 0.5);
            assert_eq!(
                material
                    .occlusion_map
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .texture_fields()
                    .color_space,
                TextureColorSpace::Linear
            );
        });
    }

    #[test]
    fn case_060_maps_alphamode_blend_to_blend_coverage() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] =
            json!([{"alphaMode":"BLEND","pbrMetallicRoughness":{"baseColorFactor":[1,0,0,0.5]}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Blend
            );
        });
    }

    #[test]
    fn case_061_maps_a_gltf_sampler_onto_the_texture_wrap_and_filter_state() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 5, 5];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);
        source["textures"] = json!([{"sampler":0,"source":0}]);
        source["samplers"] =
            json!([{"magFilter":9728,"minFilter":9987,"wrapS":10497,"wrapT":33648}]);
        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let map = material.base_color_map.as_ref().unwrap().read().unwrap();
            let sampler = &map.texture_fields().sampler;
            assert_eq!(sampler.wrap_u, TextureWrap::Repeat);
            assert_eq!(sampler.wrap_v, TextureWrap::MirrorRepeat);
            assert_eq!(sampler.mag_filter, TextureFilter::Nearest);
            assert_eq!(sampler.min_filter, TextureFilter::LinearMipmapLinear);
            assert!(sampler.mipmaps);
        });
    }

    #[test]
    fn case_062_clears_sampler_mipmaps_for_a_non_mip_min_filter() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 6];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);
        source["textures"] = json!([{"sampler":0,"source":0}]);
        source["samplers"] = json!([{"minFilter":9729}]);
        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let map = material.base_color_map.as_ref().unwrap().read().unwrap();
            let sampler = &map.texture_fields().sampler;
            assert_eq!(sampler.min_filter, TextureFilter::Linear);
            assert!(!sampler.mipmaps);
        });
    }

    #[test]
    fn case_063_marks_a_color_map_srgb_and_a_data_map_linear() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"normalTexture":{"index":0},"pbrMetallicRoughness":{"baseColorTexture":{"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 8];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            assert_eq!(
                material
                    .base_color_map
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .texture_fields()
                    .color_space,
                TextureColorSpace::Srgb
            );
            assert_eq!(
                material
                    .normal_map
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .texture_fields()
                    .color_space,
                TextureColorSpace::Linear
            );
        });
    }

    #[test]
    fn case_064_applies_a_khr_texture_transform_onto_the_texture_uv_fields() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"pbrMetallicRoughness":{"baseColorTexture":{"extensions":{"KHR_texture_transform":{"offset":[0.25,0.5],"rotation":1.5,"scale":[2,4]}},"index":0}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let png = &[137, 80, 78, 71, 9];
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":original_image_uri("image/png", png)}]);

        let scene = original_scene(&source, None);
        with_original_standard_material(&scene, |material| {
            let map = material.base_color_map.as_ref().unwrap().read().unwrap();
            let uv = map.texture_fields();
            assert_eq!([uv.uv_offset.x, uv.uv_offset.y], [0.25, 0.5]);
            assert_eq!(uv.uv_rotation, 1.5);
            assert_eq!([uv.uv_scale.x, uv.uv_scale.y], [2.0, 4.0]);
        });
    }

    #[test]
    fn case_065_carries_options_basepath_onto_an_external_uri_image_ref() {
        let mut source = original_gltf_fixture("triangle");
        source["materials"] = json!([{"emissiveTexture":{"index":0}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        source["textures"] = json!([{"source":0}]);
        source["images"] = json!([{"uri":"textures/emissive.png"}]);
        let scene = original_scene_with_options(
            &source,
            None,
            &GltfImportOptions {
                base_path: Some("assets/models".to_string()),
                draco_registry: None,
                extension_handlers: None,
                external_buffers: None,
            },
        );
        with_original_standard_material(&scene, |material| {
            let ImageResourceReference::External(resource) = get_test_texture_resource(
                &scene.resources,
                material.emissive_map.as_ref().unwrap(),
            ) else {
                panic!("expected External");
            };
            let resource = resource.reference.read().unwrap();
            assert_eq!(resource.uri, "textures/emissive.png");
            assert_eq!(resource.base_path.as_deref(), Some("assets/models"));
        });
    }

    #[test]
    fn case_066_reads_geometry_from_an_external_buffer_supplied_via_options_externalbuffers() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}],"buffers":[{"byteLength":36,"uri":"model.bin"}]});
        let constructor: fn() -> Record<GltfExternalBuffer> = Default::default;
        let mut external = constructor();
        set_record_value(
            &mut external,
            "model.bin".to_string(),
            GltfExternalBuffer::View(GltfExternalBufferView {
                view: original_byte_view(bytes),
            }),
        );
        let options = GltfImportOptions {
            base_path: None,
            draco_registry: None,
            extension_handlers: None,
            external_buffers: Some(Arc::new(RwLock::new(external))),
        };
        let scene = original_scene_with_options(&source, None, &options);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        let mut position = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 1);
        assert_eq!([position.x, position.y, position.z], [1.0, 0.0, 0.0]);
    }

    #[test]
    fn case_067_warns_and_drops_the_mesh_for_an_unsupplied_external_buffer() {
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}],"buffers":[{"byteLength":36,"uri":"missing.bin"}]});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.buffer-empty",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[(
                "firstUri",
                ImportDiagnosticDetailValue::String("missing.bin".to_string()),
            )],
        );
    }

    #[test]
    fn case_068_applies_a_sparse_accessor_override_on_top_of_the_base_values() {
        let mut bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(1_u16.to_le_bytes());
        bytes.extend(
            [9.0_f32, 9.0, 9.0]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = json!({"accessors":[{"bufferView":0,"componentType":5126,"count":3,"sparse":{"count":1,"indices":{"bufferView":1,"componentType":5123},"values":{"bufferView":2}},"type":"VEC3"}],"asset":{"version":"2.0"},"bufferViews":[{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":2,"byteOffset":36},{"buffer":0,"byteLength":12,"byteOffset":38}],"buffers":[{"byteLength":50,"uri":gltf_data_uri(&bytes)}],"meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],"nodes":[{"mesh":0}],"scene":0,"scenes":[{"nodes":[0]}]});
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut position = create_vector3(0.0, 0.0, 0.0);
        for (index, expected) in [[0.0, 0.0, 0.0], [9.0, 9.0, 9.0], [0.0, 1.0, 0.0]]
            .iter()
            .enumerate()
        {
            get_mesh_geometry_vertex_position(&mut position, &geometry, index as u32);
            assert_eq!([position.x, position.y, position.z], *expected);
        }
    }

    #[test]
    fn case_069_accepts_a_json_string_as_well_as_a_parsed_object() {
        let source = original_gltf_fixture("triangle").to_string();
        let scene = create_scene3d_from_gltf(
            &GltfSource::Json(GltfJsonSource { source: &source }),
            None,
            None,
        );
        assert_eq!(original_children(&scene).len(), 1);
    }
}

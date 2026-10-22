use super::awd2_test_helper::{awd_string, block, empty_document, file, property_list};
use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_materials::{Material3D, MaterialAlphaMode};
use flight_resource::ResourceResolutionState;
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use flight_shading::{SHADED_MATERIAL_KIND, ShadedMaterial};
use flight_texture::{TextureColorSpace, TextureUvTransform, get_texture_source};
use std::sync::{Arc, RwLock};

const PNG: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10];

fn create_state() -> Awd2ParseState {
    let mut state = create_awd2_parse_state();
    state.document = empty_document();
    state.diagnostics = Some(Arc::new(RwLock::new(Vec::new())));
    return state;
}

fn invoke_build(state: &mut Awd2ParseState) {
    let build = AWD2_MATERIAL_HANDLER.read().unwrap().build.clone().unwrap();
    build(state);
}

fn invoke_parse(
    handler: &Ref<Awd2BlockHandler>,
    state: &mut Awd2ParseState,
    id: u32,
    body: &[u8],
) -> Ref<Box<[u8]>> {
    let bytes = Arc::new(RwLock::new(body.to_vec().into_boxed_slice()));
    let block = Awd2Block {
        block_id: id,
        block_type: handler.read().unwrap().block_types[0],
        data_start: 0,
        data_end: body.len(),
        matrix_wide: false,
        geometry_wide: false,
        source: bytes.clone(),
        view: bytes.clone(),
    };
    let parse = handler.read().unwrap().parse.clone();
    parse(state, &block);
    return bytes;
}

fn material_body(name: &str, methods: u8, props: &[(u16, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&[AWD2_MATERIAL_TYPE_COLOR, methods]);
    bytes.extend_from_slice(&property_list(props));
    bytes.extend_from_slice(&[0; 4]);
    return bytes;
}

fn material_entity(state: &Awd2ParseState, index: usize) -> Ref<dyn Material3D> {
    let document = state.document.read().unwrap();
    let Scene3DDocumentMaterial::Entity(value) = &document.materials[index] else {
        panic!("material entity");
    };
    return value.material.clone();
}

fn texture_body(name: &str, texture_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.push(texture_type);
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    bytes.extend_from_slice(&[0; 8]);
    return bytes;
}

mod awd2_material_handler {
    use super::*;

    #[test]
    fn claims_materials_with_a_real_parse_and_build_phase_and_defers_material_allocation_until_requested()
     {
        let handler = AWD2_MATERIAL_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_MATERIAL]);
        assert_eq!(handler.build_phase, Some(AWD2_BUILD_PHASE_MATERIALS as f32));
        assert!(handler.build.is_some());
        drop(handler);
        let mut state = create_state();
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            3,
            &material_body("M", 0, &[]),
        );
        assert_eq!(state.materials.read().unwrap().len(), 1);
        assert!(state.document.read().unwrap().materials.is_empty());
        invoke_build(&mut state);
        assert!(state.document.read().unwrap().materials.is_empty());
        assert_eq!(state.resolve_material.as_ref().unwrap()(3), 0);
        assert_eq!(state.document.read().unwrap().materials.len(), 1);
    }

    #[test]
    fn imports_default_flat_color_alpha_specular_and_method_bases_with_exact_source_channels_and_diagnostics()
     {
        for (props, methods, diffuse, specular, shininess, alpha_mode, diagnostic) in [
            (
                vec![],
                0,
                0xffffffff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                vec![(
                    AWD2_MATERIAL_PROP_COLOR,
                    0x336699_u32.to_le_bytes().to_vec(),
                )],
                0,
                0x336699ff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                vec![(AWD2_MATERIAL_PROP_ALPHA, 0.25_f32.to_le_bytes().to_vec())],
                0,
                0xffffff40,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Blend,
                None,
            ),
            (
                vec![
                    (
                        AWD2_MATERIAL_PROP_COLOR,
                        0x336699_u32.to_le_bytes().to_vec(),
                    ),
                    (AWD2_MATERIAL_PROP_ALPHA, 0.5_f32.to_le_bytes().to_vec()),
                ],
                0,
                0x33669980,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Blend,
                None,
            ),
            (
                vec![
                    (AWD2_MATERIAL_PROP_GLOSS, 12.5_f32.to_le_bytes().to_vec()),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_COLOR,
                        0x336699_u32.to_le_bytes().to_vec(),
                    ),
                ],
                0,
                0xffffffff,
                0x336699ff,
                12.5,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                vec![
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_COLOR,
                        0x808080_u32.to_le_bytes().to_vec(),
                    ),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
                        0.5_f32.to_le_bytes().to_vec(),
                    ),
                ],
                0,
                0xffffffff,
                0x404040ff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                vec![
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_COLOR,
                        0x808080_u32.to_le_bytes().to_vec(),
                    ),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
                        2.0_f32.to_le_bytes().to_vec(),
                    ),
                ],
                0,
                0xffffffff,
                0x808080ff,
                50.0,
                MaterialAlphaMode::Opaque,
                Some((
                    "awd2.material-specular-strength-clamped",
                    ImportDiagnosticSeverity::Recover,
                    "strength",
                    2.0,
                )),
            ),
            (
                vec![],
                3,
                0xffffffff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                Some((
                    "awd2.material-methods-unsupported",
                    ImportDiagnosticSeverity::Skip,
                    "methods",
                    3.0,
                )),
            ),
            (
                vec![(
                    AWD2_MATERIAL_PROP_COLOR,
                    0x112233_u32.to_le_bytes().to_vec(),
                )],
                2,
                0x112233ff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                Some((
                    "awd2.material-methods-unsupported",
                    ImportDiagnosticSeverity::Skip,
                    "methods",
                    2.0,
                )),
            ),
        ] {
            let mut state = create_state();
            invoke_parse(
                &AWD2_MATERIAL_HANDLER,
                &mut state,
                1,
                &material_body("Mat", methods, &props),
            );
            invoke_build(&mut state);
            assert_eq!(state.resolve_material.as_ref().unwrap()(1), 0);
            let material = material_entity(&state, 0);
            let material = material.read().unwrap();
            let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
            assert_eq!(material.kind, SHADED_MATERIAL_KIND);
            assert_eq!(material.name.as_deref(), Some("Mat"));
            assert_eq!(material.diffuse, diffuse);
            assert_eq!(material.specular, specular);
            assert_eq!(material.shininess, shininess);
            assert_eq!(material.material3d_fields().alpha_mode, alpha_mode);
            assert!(material.modifiers.is_empty());
            assert!(material.diffuse_map.is_none());
            assert!(material.normal_map.is_none());
            assert!(material.specular_map.is_none());
            let diagnostics = state.diagnostics.as_ref().unwrap().read().unwrap();
            if let Some((kind, severity, key, value)) = diagnostic {
                assert_eq!(diagnostics.len(), 1);
                assert_eq!(diagnostics[0].kind, kind);
                assert_eq!(diagnostics[0].severity, severity);
                assert_eq!(diagnostics[0].origin, "resolveAwdMaterial");
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap()[key],
                    ImportDiagnosticDetailValue::Number(value)
                );
            } else {
                assert!(diagnostics.is_empty());
            }
        }
    }

    #[test]
    fn caches_original_material_entities_and_missing_ids_and_retains_the_original_shared_maps() {
        let mut state = create_state();
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            3,
            &material_body("", 0, &[]),
        );
        invoke_build(&mut state);
        let resolve = state.resolve_material.clone().unwrap();
        assert_eq!(resolve(0), -1);
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
        assert_eq!(resolve(3), 0);
        let original = material_entity(&state, 0);
        assert!(original.read().unwrap().material_fields().name.is_none());
        original.write().unwrap().material_fields_mut().name = Some("changed".to_string());
        assert_eq!(resolve(3), 0);
        assert!(Arc::ptr_eq(&original, &material_entity(&state, 0)));
        assert_eq!(
            original.read().unwrap().material_fields().name.as_deref(),
            Some("changed")
        );
        assert_eq!(resolve(99), -1);
        assert_eq!(resolve(99), -1);
        let diagnostics = state.diagnostics.clone().unwrap();
        assert_eq!(diagnostics.read().unwrap().len(), 1);
        assert_eq!(diagnostics.read().unwrap()[0].kind, "awd2.material-missing");
        assert_eq!(
            diagnostics.read().unwrap()[0].severity,
            ImportDiagnosticSeverity::Drop
        );
        assert_eq!(diagnostics.read().unwrap()[0].origin, "resolveAwdMaterial");
        assert_eq!(
            diagnostics.read().unwrap()[0].detail.as_ref().unwrap()["material"],
            ImportDiagnosticDetailValue::Number(99.0)
        );
        let materials = state.materials.clone();
        let document = state.document.clone();
        drop(state);
        materials.write().unwrap().push(Awd2MaterialEntry {
            key: 4,
            value: Awd2ParsedMaterial {
                alpha: None,
                color: Some(0x123456),
                diffuse_texture_id: 0,
                gloss: None,
                name: "Retained".to_string(),
                normal_texture_id: 0,
                num_methods: 0,
                specular_color: None,
                specular_strength: None,
                specular_texture_id: 0,
            },
        });
        assert_eq!(resolve(4), 1);
        assert_eq!(document.read().unwrap().materials.len(), 2);
    }

    #[test]
    fn resolves_all_texture_channels_as_unresolved_refs_with_source_color_spaces_and_shared_encoded_resource_identity()
     {
        let mut state = create_state();
        invoke_parse(
            &AWD2_TEXTURE_HANDLER,
            &mut state,
            2,
            &texture_body("maps.png", AWD2_TEXTURE_TYPE_EMBEDDED, PNG),
        );
        let props = [
            (
                AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
                2_u32.to_le_bytes().to_vec(),
            ),
            (
                AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
                2_u32.to_le_bytes().to_vec(),
            ),
            (
                AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
                2_u32.to_le_bytes().to_vec(),
            ),
        ];
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            3,
            &material_body("Mat", 0, &props),
        );
        invoke_build(&mut state);
        assert_eq!(state.resolve_material.as_ref().unwrap()(3), 0);
        let entity = material_entity(&state, 0);
        let material = entity.read().unwrap();
        let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
        let document = state.document.read().unwrap();
        assert_eq!(document.resources.len(), 1);
        let ImageResourceReference::Embedded(original) = &document.resources[0] else {
            panic!("embedded");
        };
        assert_eq!(
            &**original.reference.read().unwrap().bytes.read().unwrap(),
            PNG
        );
        assert_eq!(
            original.reference.read().unwrap().mime_type.as_deref(),
            Some("image/png")
        );
        assert_eq!(
            original.reference.read().unwrap().state,
            ResourceResolutionState::Unresolved
        );
        assert!(!Arc::ptr_eq(
            material.diffuse_map.as_ref().unwrap(),
            material.normal_map.as_ref().unwrap()
        ));
        assert!(!Arc::ptr_eq(
            material.diffuse_map.as_ref().unwrap(),
            material.specular_map.as_ref().unwrap()
        ));
        for (texture, space) in [
            (
                material.diffuse_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
            ),
            (
                material.normal_map.as_ref().unwrap(),
                TextureColorSpace::Linear,
            ),
            (
                material.specular_map.as_ref().unwrap(),
                TextureColorSpace::Srgb,
            ),
        ] {
            assert_eq!(texture.read().unwrap().texture_fields().color_space, space);
            assert!(get_texture_source(&*texture.read().unwrap()).is_none());
            let ImageResourceReference::Embedded(found) =
                get_test_texture_resource(&document.resources, texture)
            else {
                panic!("embedded");
            };
            assert!(Arc::ptr_eq(&found.reference, &original.reference));
            assert!(
                original
                    .reference
                    .read()
                    .unwrap()
                    .textures
                    .iter()
                    .any(|value| Arc::ptr_eq(value, texture))
            );
        }
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn reports_missing_texture_ids_from_the_true_origin_and_preserves_wide_specular_property_values()
     {
        for property in [
            AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
            AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
            AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
        ] {
            let mut state = create_state();
            invoke_parse(
                &AWD2_MATERIAL_HANDLER,
                &mut state,
                1,
                &material_body("M", 0, &[(property, 77_u32.to_le_bytes().to_vec())]),
            );
            invoke_build(&mut state);
            assert_eq!(state.resolve_material.as_ref().unwrap()(1), 0);
            let diagnostics = state.diagnostics.as_ref().unwrap().read().unwrap();
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "awd2.texture-missing");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(diagnostics[0].origin, "resolveAwdTexture");
            assert_eq!(
                diagnostics[0].detail.as_ref().unwrap()["texture"],
                ImportDiagnosticDetailValue::Number(77.0)
            );
        }
        let mut state = create_state();
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            1,
            &material_body(
                "M",
                0,
                &[
                    (AWD2_MATERIAL_PROP_GLOSS, 12.5_f64.to_le_bytes().to_vec()),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
                        0.5_f64.to_le_bytes().to_vec(),
                    ),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_COLOR,
                        0x808080_u32.to_le_bytes().to_vec(),
                    ),
                ],
            ),
        );
        invoke_build(&mut state);
        assert_eq!(state.resolve_material.as_ref().unwrap()(1), 0);
        let material = material_entity(&state, 0);
        let material = material.read().unwrap();
        let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
        assert_eq!(material.shininess, 12.5);
        assert_eq!(material.specular, 0x404040ff);
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn rounds_rgba_channels_after_source_number_products_without_an_early_float32_multiply() {
        let mut state = create_state();
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            1,
            &material_body(
                "Boundary",
                0,
                &[
                    (
                        AWD2_MATERIAL_PROP_ALPHA,
                        0x3f010101_u32.to_le_bytes().to_vec(),
                    ),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_COLOR,
                        0x333333_u32.to_le_bytes().to_vec(),
                    ),
                    (
                        AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
                        0x3f050505_u32.to_le_bytes().to_vec(),
                    ),
                ],
            ),
        );
        invoke_build(&mut state);
        assert_eq!(state.resolve_material.as_ref().unwrap()(1), 0);
        let material = material_entity(&state, 0);
        let material = material.read().unwrap();
        let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
        assert_eq!(
            [material.diffuse, material.specular],
            [0xffffff80, 0x1a1a1aff]
        );
    }
}

mod awd2_texture_handler {
    use super::*;

    #[test]
    fn claims_textures_without_a_build_phase_and_copies_encoded_bytes_without_decoding_them() {
        let handler = AWD2_TEXTURE_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_TEXTURE]);
        assert!(handler.build_phase.is_none());
        assert!(handler.build.is_none());
        drop(handler);
        let mut state = create_state();
        let input = invoke_parse(
            &AWD2_TEXTURE_HANDLER,
            &mut state,
            1,
            &texture_body("image.png", AWD2_TEXTURE_TYPE_EMBEDDED, PNG),
        );
        let textures = state.textures.read().unwrap();
        let parsed = &textures[0].value;
        let bytes = parsed.bytes.as_ref().unwrap();
        assert!(!Arc::ptr_eq(&input, bytes));
        assert_eq!(&**bytes.read().unwrap(), PNG);
        input.write().unwrap().fill(0);
        assert_eq!(&**bytes.read().unwrap(), PNG);
        assert_eq!(parsed.mime_type.as_deref(), Some("image/png"));
        assert!(state.document.read().unwrap().resources.is_empty());
    }

    #[test]
    fn preserves_external_urls_and_recovers_unrecognized_embedded_payloads_without_creating_an_image()
     {
        let mut state = create_state();
        invoke_parse(
            &AWD2_TEXTURE_HANDLER,
            &mut state,
            2,
            &texture_body(
                "http://example.com/tex.png",
                AWD2_TEXTURE_TYPE_EXTERNAL,
                &[],
            ),
        );
        invoke_parse(
            &AWD2_MATERIAL_HANDLER,
            &mut state,
            3,
            &material_body(
                "M",
                0,
                &[(
                    AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
                    2_u32.to_le_bytes().to_vec(),
                )],
            ),
        );
        invoke_build(&mut state);
        assert_eq!(state.resolve_material.as_ref().unwrap()(3), 0);
        let entity = material_entity(&state, 0);
        let material = entity.read().unwrap();
        let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
        let texture = material.diffuse_map.as_ref().unwrap();
        assert!(get_texture_source(&*texture.read().unwrap()).is_none());
        let document = state.document.read().unwrap();
        let ImageResourceReference::External(resource) =
            get_test_texture_resource(&document.resources, texture)
        else {
            panic!("external");
        };
        assert_eq!(
            resource.reference.read().unwrap().uri,
            "http://example.com/tex.png"
        );
        assert_eq!(
            resource.reference.read().unwrap().state,
            ResourceResolutionState::Unresolved
        );
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
        drop(document);
        invoke_parse(
            &AWD2_TEXTURE_HANDLER,
            &mut state,
            7,
            &texture_body("unknown", AWD2_TEXTURE_TYPE_EMBEDDED, &[1, 2, 3, 4]),
        );
        let textures = state.textures.read().unwrap();
        let unknown = &textures.iter().find(|entry| entry.key == 7).unwrap().value;
        assert!(unknown.bytes.is_none());
        assert!(unknown.mime_type.is_none());
        assert!(unknown.url.is_none());
        let diagnostics = state.diagnostics.as_ref().unwrap().read().unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.texture-unrecognized-format");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(diagnostics[0].origin, "parseTextureBlock");
        assert!(diagnostics[0].detail.is_none());
    }

    #[test]
    fn reports_each_material_and_texture_create_path_truncation_row_with_exact_optional_details() {
        let material = material_body("", 0, &[]);
        let texture = texture_body("", AWD2_TEXTURE_TYPE_EMBEDDED, PNG);
        for (block_type, full, cut, kind, origin, field, byte_count) in [
            (
                AWD2_BLOCK_MATERIAL,
                material.as_slice(),
                0,
                "awd2.material-truncated",
                "parseMaterialBlock",
                "name",
                None,
            ),
            (
                AWD2_BLOCK_MATERIAL,
                material.as_slice(),
                2,
                "awd2.material-truncated",
                "parseMaterialBlock",
                "type",
                None,
            ),
            (
                AWD2_BLOCK_TEXTURE,
                texture.as_slice(),
                0,
                "awd2.texture-truncated",
                "parseTextureBlock",
                "name",
                None,
            ),
            (
                AWD2_BLOCK_TEXTURE,
                texture.as_slice(),
                2,
                "awd2.texture-truncated",
                "parseTextureBlock",
                "payload",
                None,
            ),
            (
                AWD2_BLOCK_TEXTURE,
                texture.as_slice(),
                7,
                "awd2.texture-truncated",
                "parseTextureBlock",
                "data",
                Some(PNG.len() as f32),
            ),
        ] {
            let source = Arc::new(RwLock::new(
                file(&[block(block_type, 0, 1, &full[..cut])]).into_boxed_slice(),
            ));
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            let scene = create_scene3d_from_awd2(
                &source,
                &Awd2ParseOptions {
                    blocks: vec![AWD2_MATERIAL_HANDLER.clone(), AWD2_TEXTURE_HANDLER.clone()],
                    deflate: None,
                    lzma: None,
                },
                Some(&diagnostics),
            );
            assert!(scene.resources.is_empty());
            let diagnostics = diagnostics.read().unwrap();
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, kind);
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(diagnostics[0].origin, origin);
            let detail = diagnostics[0].detail.as_ref().unwrap();
            assert_eq!(
                detail["field"],
                ImportDiagnosticDetailValue::String(field.to_string())
            );
            assert_eq!(
                detail.get("bytes"),
                byte_count.map(ImportDiagnosticDetailValue::Number).as_ref()
            );
            assert!(!detail.contains_key("lights"));
        }
    }
}

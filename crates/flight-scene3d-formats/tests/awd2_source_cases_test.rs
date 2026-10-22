use super::awd2_test_helper::*;
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::{Material3D, MaterialAlphaMode};
use flight_meshgeometry::get_mesh_geometry_vertex_count;
use flight_node::contract::get_node_local_matrix4;
use flight_node::{NodeRef, get_node_children};
use flight_resource::ResourceResolutionState;
use flight_scene3d::{Mesh, Scene3D, Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::*;
use flight_shading::{SHADED_MATERIAL_KIND, ShadedMaterial};
use flight_texture::{TextureColorSpace, TextureUvTransform, get_texture_source};
use std::sync::{Arc, RwLock};

const PNG: &[u8] = &[0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10];

fn children(root: NodeRef) -> Vec<NodeRef> {
    let mut out = Vec::new();
    get_node_children(&mut out, &root);
    return out;
}

fn document(bytes: &[u8]) -> Ref<Scene3DDocument> {
    return parse_awd2(
        &Arc::new(RwLock::new(bytes.to_vec().into_boxed_slice())),
        &options(),
        None,
    );
}

fn first_material(scene: &Scene3D) -> Ref<dyn Material3D> {
    let children = children(scene.root.clone());
    assert_eq!(children.len(), 1);
    let child = children[0].read().unwrap();
    let mesh = child.as_any().downcast_ref::<Mesh>().unwrap();
    let materials = mesh.materials.read().unwrap();
    assert_eq!(materials.len(), 1);
    return materials[0].as_ref().unwrap().clone();
}

fn material_body(name: &str, kind: u8, methods: u8, properties: &[(u16, u32)]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&[kind, methods]);
    bytes.extend_from_slice(&property_list(
        &properties
            .iter()
            .map(|(key, value)| (*key, value.to_le_bytes().to_vec()))
            .collect::<Vec<_>>(),
    ));
    bytes.extend_from_slice(&[0; 4]);
    return bytes;
}

fn mesh_instance(
    name: &str,
    parent: u32,
    transform: &[f64; 12],
    geometry: u32,
    materials: &[u32],
) -> Vec<u8> {
    let mut bytes = scene_header(name, parent, transform, false);
    bytes.extend_from_slice(&geometry.to_le_bytes());
    bytes.extend_from_slice(&(materials.len() as u16).to_le_bytes());
    for material in materials {
        bytes.extend_from_slice(&material.to_le_bytes());
    }
    bytes.extend_from_slice(&[0; 8]);
    return bytes;
}

fn options() -> Awd2ParseOptions {
    return Awd2ParseOptions {
        blocks: AWD2_ALL_BLOCK_HANDLERS.clone(),
        deflate: Some(Some(Arc::new(SDK_HOST_DECOMPRESS_DEFLATE.clone()))),
        lzma: None,
    };
}

fn scene(bytes: &[u8]) -> (Scene3D, Vec<ImportDiagnostic>) {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let scene = create_scene3d_from_awd2(
        &Arc::new(RwLock::new(bytes.to_vec().into_boxed_slice())),
        &options(),
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (scene, diagnostics);
}

fn single_material(body: &[u8]) -> Vec<u8> {
    return file(&[
        block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geo", 1)),
        block(AWD2_BLOCK_MATERIAL, 0, 2, body),
        block(
            AWD2_BLOCK_MESH_INSTANCE,
            0,
            3,
            &mesh_instance("Mesh", 0, &IDENTITY_TRANSFORM, 1, &[2]),
        ),
    ]);
}

fn texture_body(name: &str, kind: u8, payload: &[u8]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.push(kind);
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    bytes.extend_from_slice(&[0; 8]);
    return bytes;
}

fn triangle(name: &str, count: usize) -> Vec<u8> {
    let positions = [0.0f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let indices = [0u16, 1, 2]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect::<Vec<_>>();
    let streams = vec![
        geometry_stream(AWD2_STREAM_POSITIONS, AWD2_DATA_FLOAT32, &positions),
        geometry_stream(AWD2_STREAM_INDICES, AWD2_DATA_UINT16, &indices),
    ];
    return geometry_body(name, &vec![streams; count]);
}

mod create_scene3d_from_awd2 {
    use super::*;

    #[test]
    fn imports_every_original_uniform_material_case_with_its_authored_name_channels_alpha_and_diagnostics()
     {
        for (name, properties, methods, diffuse, specular, shininess, alpha, diagnostic) in [
            (
                "Bare",
                vec![],
                0,
                0xffffffff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                "Shiny",
                vec![
                    (AWD2_MATERIAL_PROP_GLOSS, 12.5f32.to_bits()),
                    (AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x336699),
                ],
                0,
                0xffffffff,
                0x336699ff,
                12.5,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                "Half",
                vec![
                    (AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x808080),
                    (AWD2_MATERIAL_PROP_SPECULAR_STRENGTH, 0.5f32.to_bits()),
                ],
                0,
                0xffffffff,
                0x404040ff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                "Overdriven",
                vec![
                    (AWD2_MATERIAL_PROP_SPECULAR_COLOR, 0x808080),
                    (AWD2_MATERIAL_PROP_SPECULAR_STRENGTH, 2.0f32.to_bits()),
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
                "ColorMat",
                vec![(AWD2_MATERIAL_PROP_COLOR, 0x336699)],
                0,
                0x336699ff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                "Translucent",
                vec![
                    (AWD2_MATERIAL_PROP_COLOR, 0x336699),
                    (AWD2_MATERIAL_PROP_ALPHA, 0.5f32.to_bits()),
                ],
                0,
                0x33669980,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Blend,
                None,
            ),
            (
                "WithMethods",
                vec![(AWD2_MATERIAL_PROP_COLOR, 0x112233)],
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
            (
                "Empty",
                vec![],
                0,
                0xffffffff,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Opaque,
                None,
            ),
            (
                "AlphaOnly",
                vec![(AWD2_MATERIAL_PROP_ALPHA, 0.25f32.to_bits())],
                0,
                0xffffff40,
                0xffffffff,
                50.0,
                MaterialAlphaMode::Blend,
                None,
            ),
            (
                "MethodOnly",
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
        ] {
            let (scene, diagnostics) = scene(&single_material(&material_body(
                name,
                AWD2_MATERIAL_TYPE_COLOR,
                methods,
                &properties,
            )));
            let material = first_material(&scene);
            let material = material.read().unwrap();
            let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
            assert_eq!(material.kind, SHADED_MATERIAL_KIND);
            assert_eq!(material.name.as_deref(), Some(name));
            assert!(material.modifiers.is_empty());
            assert_eq!(material.diffuse, diffuse);
            assert_eq!(material.specular, specular);
            assert_eq!(material.shininess, shininess);
            assert_eq!(material.material3d_fields().alpha_mode, alpha);
            assert!(material.diffuse_map.is_none());
            assert!(material.normal_map.is_none());
            assert!(material.specular_map.is_none());
            if let Some((kind, severity, key, value)) = diagnostic {
                assert_eq!(diagnostics.len(), 1);
                assert_eq!(diagnostics[0].kind, kind);
                assert_eq!(diagnostics[0].severity, severity);
                assert_eq!(diagnostics[0].origin, "resolveAwdMaterial");
                assert_eq!(
                    diagnostics[0].detail.as_ref().unwrap().get(key),
                    Some(&ImportDiagnosticDetailValue::Number(value))
                );
            } else {
                assert!(diagnostics.is_empty());
            }
        }
    }

    #[test]
    fn imports_the_original_embedded_diffuse_normal_specular_and_external_texture_cases_without_decoding()
     {
        for (property, name, external, space) in [
            (
                AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
                "diffuse.png",
                false,
                TextureColorSpace::Srgb,
            ),
            (
                AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
                "normal.png",
                false,
                TextureColorSpace::Linear,
            ),
            (
                AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
                "spec.png",
                false,
                TextureColorSpace::Srgb,
            ),
            (
                AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
                "http://example.com/tex.png",
                true,
                TextureColorSpace::Srgb,
            ),
        ] {
            let mut properties = vec![(property, 2)];
            if property == AWD2_MATERIAL_PROP_NORMAL_TEXTURE {
                properties.insert(0, (AWD2_MATERIAL_PROP_COLOR, 0x808080));
            }
            let bytes = file(&[
                block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geo", 1)),
                block(
                    AWD2_BLOCK_TEXTURE,
                    0,
                    2,
                    &texture_body(
                        name,
                        if external {
                            AWD2_TEXTURE_TYPE_EXTERNAL
                        } else {
                            AWD2_TEXTURE_TYPE_EMBEDDED
                        },
                        if external { &[] } else { PNG },
                    ),
                ),
                block(
                    AWD2_BLOCK_MATERIAL,
                    0,
                    3,
                    &material_body("Mat", AWD2_MATERIAL_TYPE_TEXTURE, 0, &properties),
                ),
                block(
                    AWD2_BLOCK_MESH_INSTANCE,
                    0,
                    4,
                    &mesh_instance("Mesh", 0, &IDENTITY_TRANSFORM, 1, &[3]),
                ),
            ]);
            let (scene, diagnostics) = scene(&bytes);
            assert!(diagnostics.is_empty());
            let material = first_material(&scene);
            let material = material.read().unwrap();
            let material = material.as_any().downcast_ref::<ShadedMaterial>().unwrap();
            assert_eq!(material.kind, SHADED_MATERIAL_KIND);
            assert_eq!(material.name.as_deref(), Some("Mat"));
            assert!(material.modifiers.is_empty());
            let texture = match property {
                AWD2_MATERIAL_PROP_NORMAL_TEXTURE => material.normal_map.as_ref().unwrap(),
                AWD2_MATERIAL_PROP_SPECULAR_TEXTURE => material.specular_map.as_ref().unwrap(),
                _ => material.diffuse_map.as_ref().unwrap(),
            };
            assert_eq!(texture.read().unwrap().texture_fields().color_space, space);
            assert!(get_texture_source(&*texture.read().unwrap()).is_none());
            assert_eq!(scene.resources.len(), 1);
            match get_test_texture_resource(&scene.resources, texture) {
                ImageResourceReference::Embedded(value) => {
                    assert!(!external);
                    let value = value.reference.read().unwrap();
                    assert_eq!(value.mime_type.as_deref(), Some("image/png"));
                    assert_eq!(&**value.bytes.read().unwrap(), PNG);
                    assert_eq!(value.state, ResourceResolutionState::Unresolved);
                }
                ImageResourceReference::External(value) => {
                    assert!(external);
                    let value = value.reference.read().unwrap();
                    assert_eq!(value.uri, "http://example.com/tex.png");
                    assert_eq!(value.state, ResourceResolutionState::Unresolved);
                }
            }
        }
    }

    #[test]
    fn preserves_exact_original_missing_material_missing_texture_and_unrecognized_payload_crumbs() {
        for mode in 0..3 {
            let mut blocks = vec![block(
                AWD2_BLOCK_TRIANGLE_GEOMETRY,
                0,
                1,
                &triangle("Geo", 1),
            )];
            if mode == 2 {
                blocks.push(block(
                    AWD2_BLOCK_TEXTURE,
                    0,
                    2,
                    &texture_body("bad.dat", AWD2_TEXTURE_TYPE_EMBEDDED, &[1, 2, 3, 4]),
                ));
            }
            if mode != 0 {
                blocks.push(block(
                    AWD2_BLOCK_MATERIAL,
                    0,
                    if mode == 1 { 2 } else { 3 },
                    &material_body(
                        "Mat",
                        AWD2_MATERIAL_TYPE_TEXTURE,
                        0,
                        &[(
                            AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
                            if mode == 1 { 99 } else { 2 },
                        )],
                    ),
                ));
            }
            blocks.push(block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                if mode == 2 { 4 } else { 3 },
                &mesh_instance(
                    "Mesh",
                    0,
                    &IDENTITY_TRANSFORM,
                    1,
                    &[match mode {
                        0 => 99,
                        1 => 2,
                        _ => 3,
                    }],
                ),
            ));
            let (_, diagnostics) = scene(&file(&blocks));
            assert_eq!(diagnostics.len(), 1);
            let crumb = &diagnostics[0];
            assert_eq!(
                crumb.kind,
                match mode {
                    0 => "awd2.material-missing",
                    1 => "awd2.texture-missing",
                    _ => "awd2.texture-unrecognized-format",
                }
            );
            assert_eq!(
                crumb.origin,
                match mode {
                    0 => "resolveAwdMaterial",
                    1 => "resolveAwdTexture",
                    _ => "parseTextureBlock",
                }
            );
            assert_eq!(
                crumb.severity,
                if mode == 2 {
                    ImportDiagnosticSeverity::Recover
                } else {
                    ImportDiagnosticSeverity::Drop
                }
            );
            if mode == 2 {
                assert!(crumb.detail.is_none());
            } else {
                assert_eq!(
                    crumb.detail.as_ref().unwrap().get(if mode == 0 {
                        "material"
                    } else {
                        "texture"
                    }),
                    Some(&ImportDiagnosticDetailValue::Number(99.0))
                );
            }
        }
    }

    #[test]
    fn builds_the_original_container_hierarchy_and_preserves_right_handed_mesh_placement() {
        let mut container = scene_header("Group", 0, &IDENTITY_TRANSFORM, false);
        container.extend_from_slice(&[0; 8]);
        let bytes = file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geom", 1)),
            block(AWD2_BLOCK_CONTAINER, 0, 2, &container),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                3,
                &mesh_instance("ChildMesh", 2, &IDENTITY_TRANSFORM, 1, &[]),
            ),
        ]);
        let (imported, diagnostics) = scene(&bytes);
        assert!(diagnostics.is_empty());
        let roots = children(imported.root.clone());
        assert_eq!(roots.len(), 1);
        assert!(!roots[0].read().unwrap().as_any().is::<Mesh>());
        let inner = children(roots[0].clone());
        assert_eq!(inner.len(), 1);
        assert!(inner[0].read().unwrap().as_any().is::<Mesh>());
        let mut transform = IDENTITY_TRANSFORM;
        transform[9..12].copy_from_slice(&[10.0, 20.0, 30.0]);
        let (imported, diagnostics) = scene(&file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geom", 1)),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                2,
                &mesh_instance("Mesh", 0, &transform, 1, &[]),
            ),
        ]));
        assert!(diagnostics.is_empty());
        let matrix = get_node_local_matrix4(&children(imported.root.clone())[0]);
        for (index, expected) in [
            (12, 10.0f32),
            (13, 20.0),
            (14, -30.0),
            (0, 1.0),
            (5, 1.0),
            (10, 1.0),
        ] {
            // D1 f32 bound (TS: 0.5e-2)
            assert!(
                (matrix.m[index] - expected).abs()
                    <= 0.5e-2f32.max(4.0 * f32::EPSILON * expected.abs().max(1.0))
            );
        }
    }

    #[test]
    fn keeps_the_original_missing_geometry_node_and_its_exact_recovery_metadata() {
        let (scene, diagnostics) = scene(&file(&[block(
            AWD2_BLOCK_MESH_INSTANCE,
            0,
            1,
            &mesh_instance("Mesh", 0, &IDENTITY_TRANSFORM, 99, &[]),
        )]));
        assert_eq!(children(scene.root.clone()).len(), 1);
        assert_eq!(diagnostics.len(), 1);
        let crumb = &diagnostics[0];
        assert_eq!(crumb.kind, "awd2.mesh-instance-missing-geometry");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(crumb.origin, "parseAwd2");
        assert_eq!(
            crumb.detail.as_ref().unwrap().get("block"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        assert_eq!(
            crumb.detail.as_ref().unwrap().get("geometry"),
            Some(&ImportDiagnosticDetailValue::Number(99.0))
        );
    }
}

mod parse_awd2 {
    use super::*;

    #[test]
    fn returns_the_original_clean_triangle_document_with_indexed_mesh_and_single_root() {
        let bytes = file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Triangle", 1)),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                2,
                &mesh_instance("TriMesh", 0, &IDENTITY_TRANSFORM, 1, &[]),
            ),
        ]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let document = parse_awd2(
            &Arc::new(RwLock::new(bytes.into_boxed_slice())),
            &options(),
            Some(&diagnostics),
        );
        assert!(diagnostics.read().unwrap().is_empty());
        let document = document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.nodes[0].name.as_deref(), Some("TriMesh"));
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(
            get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
            3
        );
        assert_eq!(document.scenes.len(), 1);
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert!(document.skins.is_empty());
        assert!(document.animations.is_empty());
    }

    #[test]
    fn wires_the_original_document_parent_and_child_indices_into_roots_and_children() {
        let mut container = scene_header("Parent", 0, &IDENTITY_TRANSFORM, false);
        container.extend_from_slice(&[0; 8]);
        let document = document(&file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geom", 1)),
            block(AWD2_BLOCK_CONTAINER, 0, 10, &container),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                11,
                &mesh_instance("Child", 10, &IDENTITY_TRANSFORM, 1, &[]),
            ),
        ]));
        let document = document.read().unwrap();
        let parent = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("Parent"))
            .unwrap() as i32;
        let child = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("Child"))
            .unwrap() as i32;
        assert!(document.nodes[parent as usize].children.contains(&child));
        assert!(document.scenes[0].root_nodes.contains(&parent));
        assert!(!document.scenes[0].root_nodes.contains(&child));
    }

    #[test]
    fn appends_the_original_red_material_and_uses_its_document_index_for_the_mesh_subset() {
        let document = document(&file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geom", 1)),
            block(
                AWD2_BLOCK_MATERIAL,
                0,
                20,
                &material_body(
                    "Red",
                    AWD2_MATERIAL_TYPE_COLOR,
                    0,
                    &[(AWD2_MATERIAL_PROP_COLOR, 0xff0000)],
                ),
            ),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                2,
                &mesh_instance("Mesh", 0, &IDENTITY_TRANSFORM, 1, &[20]),
            ),
        ]));
        let document = document.read().unwrap();
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.meshes[0].materials, [0]);
        let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
            panic!("entity");
        };
        assert_eq!(
            material
                .material
                .read()
                .unwrap()
                .material_fields()
                .name
                .as_deref(),
            Some("Red")
        );
    }

    #[test]
    fn shares_one_original_encoded_resource_across_distinct_sampled_texture_entities() {
        let document = document(&file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &triangle("Geom", 2)),
            block(
                AWD2_BLOCK_TEXTURE,
                0,
                2,
                &texture_body("diffuse.png", AWD2_TEXTURE_TYPE_EMBEDDED, PNG),
            ),
            block(
                AWD2_BLOCK_MATERIAL,
                0,
                3,
                &material_body(
                    "First",
                    AWD2_MATERIAL_TYPE_TEXTURE,
                    0,
                    &[(AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2)],
                ),
            ),
            block(
                AWD2_BLOCK_MATERIAL,
                0,
                4,
                &material_body(
                    "Second",
                    AWD2_MATERIAL_TYPE_TEXTURE,
                    0,
                    &[(AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE, 2)],
                ),
            ),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                5,
                &mesh_instance("Mesh", 0, &IDENTITY_TRANSFORM, 1, &[3, 4]),
            ),
        ]));
        let document = document.read().unwrap();
        assert_eq!(document.resources.len(), 1);
        let textures = document
            .materials
            .iter()
            .map(|material| {
                let Scene3DDocumentMaterial::Entity(material) = material else {
                    panic!("entity");
                };
                return material
                    .material
                    .read()
                    .unwrap()
                    .as_any()
                    .downcast_ref::<ShadedMaterial>()
                    .unwrap()
                    .diffuse_map
                    .as_ref()
                    .unwrap()
                    .clone();
            })
            .collect::<Vec<_>>();
        assert!(!Arc::ptr_eq(&textures[0], &textures[1]));
        let ImageResourceReference::Embedded(original) = &document.resources[0] else {
            panic!("embedded");
        };
        for texture in textures {
            let ImageResourceReference::Embedded(resource) =
                get_test_texture_resource(&document.resources, &texture)
            else {
                panic!("embedded");
            };
            assert!(Arc::ptr_eq(&resource.reference, &original.reference));
        }
    }

    #[test]
    fn reports_no_unhandled_blocks_for_the_original_deferred_pair_or_complete_skinned_file() {
        for bytes in [
            file(&[
                block(AWD2_BLOCK_SKELETON_POSE, 0, 20, &[0; 4]),
                block(AWD2_BLOCK_SKELETON_ANIMATION, 0, 21, &[0; 4]),
            ]),
            skinned_triangle(),
        ] {
            let diagnostics = Arc::new(RwLock::new(Vec::new()));
            parse_awd2(
                &Arc::new(RwLock::new(bytes.into_boxed_slice())),
                &options(),
                Some(&diagnostics),
            );
            assert!(
                diagnostics
                    .read()
                    .unwrap()
                    .iter()
                    .all(|diagnostic| diagnostic.kind != "awd2.block-unhandled")
            );
        }
    }
}

use crate::gltf_accessor::{
    GltfAccessorReader, gltf_accessor_fault, gltf_integer_field, read_gltf_accessor,
};
use crate::gltf_buffer::decode_gltf_buffer;
use crate::gltf_container::{parse_gltf_source, read_glb_container};
use crate::gltf_diagnostics::{
    GltfDiagnosticDetail, GltfDiagnosticValues, GltfDropTally, flush_gltf_drops,
    gltf_diagnostic_values, report_gltf_accessor_fault, tally_gltf_drop,
};
use crate::gltf_geometry::{build_gltf_morph, primitive_gltf_to_geometry};
use crate::gltf_json::{GltfJsonDocument, GltfJsonMetadata, gltf_original_array_number};
use crate::gltf_material::{
    GltfTextureResolver, build_gltf_image_reference, gltf_material_to_pbr, resolve_gltf_texture,
};
use crate::gltf_node::{
    build_gltf_node_world_transforms, clone_gltf_transform, gltf_node_transform,
};
use crate::gltf_schema::GltfNode;
use crate::gltf_source::GltfSource;
use crate::gltf_types::*;
use flight_buffer::ArrayBufferView;
use flight_entity::Ref;
use flight_geometry::contract::{Transform3D, create_transform3d};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::Material3D;
use flight_meshgeometry::get_mesh_geometry_vertex_count;
use flight_scene3d::{
    MESH_KIND, NODE3D_KIND, Scene3D, Scene3DDocument, Scene3DDocumentMaterial,
    Scene3DDocumentMaterialEntity, Scene3DDocumentMesh, Scene3DDocumentNode, Scene3DDocumentScene,
    create_scene3d_from_document,
};
use std::sync::{Arc, RwLock};

struct GltfCoreSelection {
    handler: Ref<GltfCoreFeatureHandler>,
    kind: String,
}

struct GltfExtensionSelection {
    handler: Ref<GltfExtensionHandler>,
    kind: String,
}

pub fn create_scene3d_from_glb_with_core_feature_handlers(
    bytes: &ArrayBufferView,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Scene3D {
    let Some(container) = read_glb_container(bytes, diagnostics) else {
        return create_scene3d_from_document(&empty_gltf_document().read().unwrap(), None);
    };
    let scene_index = gltf_default_scene(&container.document);
    let document = build_gltf_document(
        container.document,
        container.binary.as_ref(),
        core_feature_handlers,
        options,
        diagnostics,
    );
    return create_scene3d_from_document(&document.read().unwrap(), Some(scene_index));
}

pub fn create_scene3d_from_gltf_with_core_feature_handlers(
    source: &GltfSource<'_>,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Scene3D {
    let Some(source) = parse_gltf_source(source, diagnostics) else {
        return create_scene3d_from_document(&empty_gltf_document().read().unwrap(), None);
    };
    let scene_index = gltf_default_scene(&source);
    let document = build_gltf_document(source, None, core_feature_handlers, options, diagnostics);
    return create_scene3d_from_document(&document.read().unwrap(), Some(scene_index));
}

fn apply_gltf_core_handlers(
    reader: &Arc<GltfAccessorReader>,
    document: &Ref<Scene3DDocument>,
    mesh_indices: Ref<Vec<Ref<Vec<i32>>>>,
    node_indices: &Ref<Vec<i32>>,
    primitive_node_indices: Ref<Vec<Ref<Vec<i32>>>>,
    world_transforms: &Arc<Vec<Transform3D>>,
    handlers: &[Ref<GltfCoreFeatureHandler>],
) {
    let mut selected: Vec<GltfCoreSelection> = Vec::new();
    for handler in handlers {
        let kind = handler.read().unwrap().kind.clone();
        if let Some(existing) = selected.iter_mut().find(|entry| entry.kind == kind) {
            tally_gltf_values(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Recover,
                "gltf.duplicate-core-feature-handler",
                "",
                &[("firstKind", ImportDiagnosticDetailValue::String(kind))],
            );
            existing.handler = handler.clone();
        } else {
            selected.push(GltfCoreSelection {
                handler: handler.clone(),
                kind,
            });
        }
    }
    for kind in ["animations", "cameras", "skins"] {
        let length = {
            let source = reader.source.read().unwrap();
            match kind {
                "animations" => source.animations.as_ref().map(Vec::len),
                "cameras" => source.cameras.as_ref().map(Vec::len),
                _ => source.skins.as_ref().map(Vec::len),
            }
            .unwrap_or(0)
        };
        if length > 0 && !selected.iter().any(|entry| entry.kind == kind) {
            tally_gltf_values(
                reader.drops.as_ref(),
                ImportDiagnosticSeverity::Skip,
                "gltf.core-feature-handler-missing",
                kind,
                &[(
                    "firstKind",
                    ImportDiagnosticDetailValue::String(kind.to_string()),
                )],
            );
        }
    }
    let transforms = world_transforms.clone();
    let accessor_reader = reader.clone();
    let accessor_drops = reader.drops.clone();
    let diagnostic_drops = reader.drops.clone();
    let context = Arc::new(RwLock::new(GltfCoreFeatureContext {
        build_node_transform: Arc::new(move |node| gltf_context_transform(&transforms, node)),
        document: document.clone(),
        mesh_indices,
        node_indices: node_indices.clone(),
        primitive_node_indices,
        read_accessor: Arc::new(move |index, expected_type| {
            let length = accessor_reader
                .source
                .read()
                .unwrap()
                .accessors
                .as_ref()
                .map(Vec::len)
                .unwrap_or(0);
            if !index.is_finite() || index < 0.0 || index.fract() != 0.0 || index as usize >= length
            {
                return gltf_accessor_fault("gltf.accessor-not-found", &[("firstAccessor", index)]);
            }
            return read_gltf_accessor(&accessor_reader, index as usize, expected_type);
        }),
        report_accessor_fault: Arc::new(move |severity, fault| {
            report_gltf_accessor_fault(accessor_drops.as_ref(), severity, fault)
        }),
        report_diagnostic: Arc::new(move |severity, kind, detail, discriminator| {
            if diagnostic_drops.is_none() {
                return;
            }
            let detail = detail
                .cloned()
                .unwrap_or_else(|| gltf_diagnostic_values(&[]));
            tally_gltf_drop(
                diagnostic_drops.as_ref(),
                severity,
                kind,
                discriminator.unwrap_or(""),
                GltfDiagnosticDetail::Values(GltfDiagnosticValues { value: detail }),
            );
        }),
        source: reader.source.clone(),
    }));
    for entry in selected {
        let apply = entry.handler.read().unwrap().apply.clone();
        apply(&context);
    }
}

fn apply_gltf_extension_handlers(
    resolver: &Arc<GltfTextureResolver>,
    document: &Ref<Scene3DDocument>,
    node_indices: &Ref<Vec<i32>>,
    world_transforms: &Arc<Vec<Transform3D>>,
    handlers: Option<&[Ref<GltfExtensionHandler>]>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) {
    let Some(handlers) = handlers.filter(|handlers| !handlers.is_empty()) else {
        return;
    };
    let mut selected: Vec<GltfExtensionSelection> = Vec::new();
    for handler in handlers {
        let kind = handler.read().unwrap().kind.clone();
        if let Some(existing) = selected.iter_mut().find(|entry| entry.kind == kind) {
            tally_gltf_values(
                resolver.reader.drops.as_ref(),
                ImportDiagnosticSeverity::Recover,
                "gltf.duplicate-extension-handler",
                "",
                &[("firstKind", ImportDiagnosticDetailValue::String(kind))],
            );
            existing.handler = handler.clone();
        } else {
            selected.push(GltfExtensionSelection {
                handler: handler.clone(),
                kind,
            });
        }
    }
    let transforms = world_transforms.clone();
    let texture_resolver = resolver.clone();
    let context = Arc::new(RwLock::new(GltfExtensionContext {
        build_node_transform: Arc::new(move |node| gltf_context_transform(&transforms, node)),
        diagnostics: diagnostics.cloned(),
        document: document.clone(),
        node_indices: node_indices.clone(),
        resolve_texture: Arc::new(move |info, color_space| {
            resolve_gltf_texture(&texture_resolver, info, color_space)
        }),
        source: resolver.reader.source.clone(),
    }));
    for entry in selected {
        let apply = entry.handler.read().unwrap().apply.clone();
        apply(&context);
    }
}

fn build_gltf_document(
    input: GltfJsonDocument,
    binary: Option<&ArrayBufferView>,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    options: Option<&GltfImportOptions>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Ref<Scene3DDocument> {
    let drops = diagnostics.map(|_| Arc::new(RwLock::new(Vec::new())));
    let version = input
        .source
        .read()
        .unwrap()
        .asset
        .as_ref()
        .map(|asset| asset.read().unwrap().version.clone());
    if !version.as_deref().is_some_and(supported_gltf_version) {
        tally_gltf_values(
            drops.as_ref(),
            ImportDiagnosticSeverity::Recover,
            "gltf.unsupported-version",
            "",
            &[(
                "version",
                ImportDiagnosticDetailValue::String(
                    version.unwrap_or_else(|| "(missing)".to_string()),
                ),
            )],
        );
    }
    let required = input
        .source
        .read()
        .unwrap()
        .extensions_required
        .clone()
        .unwrap_or_default();
    for extension in required {
        if !supported_gltf_extension(&extension, options) {
            tally_gltf_values(
                drops.as_ref(),
                ImportDiagnosticSeverity::Skip,
                "gltf.unsupported-required-extension",
                "",
                &[(
                    "firstExtension",
                    ImportDiagnosticDetailValue::String(extension),
                )],
            );
        }
    }
    let buffer_sources = input
        .source
        .read()
        .unwrap()
        .buffers
        .clone()
        .unwrap_or_default();
    let buffers = buffer_sources
        .iter()
        .map(|buffer| decode_gltf_buffer(buffer, binary, options, drops.as_ref()))
        .collect();
    let reader = Arc::new(GltfAccessorReader {
        source: input.source,
        metadata: input.metadata,
        buffers,
        drops,
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
        .map(|(index, image)| build_gltf_image_reference(&reader, image, index, options))
        .collect();
    let resolver = Arc::new(GltfTextureResolver {
        images,
        reader: reader.clone(),
    });
    let resources = resolver.images.iter().filter_map(Clone::clone).collect();
    let source_materials = reader
        .source
        .read()
        .unwrap()
        .materials
        .clone()
        .unwrap_or_default();
    let materials = source_materials
        .iter()
        .map(|material| {
            let material: Ref<dyn Material3D> = gltf_material_to_pbr(&resolver, material);
            return Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity { material });
        })
        .collect();
    let source_meshes = reader
        .source
        .read()
        .unwrap()
        .meshes
        .clone()
        .unwrap_or_default();
    let mut meshes = Vec::new();
    let mut mesh_indices = Vec::new();
    for mesh in &source_meshes {
        let (primitives, weights) = {
            let mesh = mesh.read().unwrap();
            (mesh.primitives.clone(), mesh.weights.clone())
        };
        let mut indices = Vec::new();
        for primitive in primitives {
            let Some(geometry) = primitive_gltf_to_geometry(&reader, &primitive, options) else {
                continue;
            };
            let count = get_mesh_geometry_vertex_count(&geometry.read().unwrap()) as usize;
            let morph = build_gltf_morph(&reader, &primitive, weights.as_deref(), count);
            let material = {
                let row = primitive.read().unwrap();
                row.material.map(|value| {
                    gltf_integer_field(&reader.metadata, &primitive, "material", value)
                        .and_then(|index| i32::try_from(index).ok())
                        .unwrap_or(-1)
                })
            };
            indices.push(meshes.len() as i32);
            meshes.push(Scene3DDocumentMesh {
                geometry,
                materials: material.into_iter().collect(),
                morph,
                name: None,
                skin: None,
            });
        }
        mesh_indices.push(Arc::new(RwLock::new(indices)));
    }
    let mesh_indices = Arc::new(RwLock::new(mesh_indices));
    let source_nodes = reader
        .source
        .read()
        .unwrap()
        .nodes
        .clone()
        .unwrap_or_default();
    let mut nodes = Vec::new();
    let mut node_indices = Vec::new();
    let mut primitive_node_indices = Vec::new();
    for node in &source_nodes {
        let (mesh, name) = {
            let row = node.read().unwrap();
            (
                row.mesh
                    .and_then(|value| gltf_integer_field(&reader.metadata, node, "mesh", value)),
                row.name.clone(),
            )
        };
        let expanded = mesh
            .and_then(|index| mesh_indices.read().unwrap().get(index).cloned())
            .map(|indices| indices.read().unwrap().clone())
            .unwrap_or_default();
        let index = nodes.len() as i32;
        node_indices.push(index);
        let mut primitive_nodes = Vec::new();
        nodes.push(Scene3DDocumentNode {
            children: Vec::new(),
            kind: if expanded.len() == 1 {
                MESH_KIND
            } else {
                NODE3D_KIND
            }
            .to_string(),
            mesh: if expanded.len() == 1 {
                Some(expanded[0])
            } else {
                None
            },
            name,
            transform: gltf_node_transform(node),
        });
        if expanded.len() > 1 {
            for mesh in expanded {
                let child = nodes.len() as i32;
                nodes[index as usize].children.push(child);
                primitive_nodes.push(child);
                nodes.push(Scene3DDocumentNode {
                    children: Vec::new(),
                    kind: MESH_KIND.to_string(),
                    mesh: Some(mesh),
                    name: None,
                    transform: create_transform3d(),
                });
            }
        }
        primitive_node_indices.push(Arc::new(RwLock::new(primitive_nodes)));
    }
    for (index, node) in source_nodes.iter().enumerate() {
        let children = node.read().unwrap().children.clone().unwrap_or_default();
        for (position, current) in children.into_iter().enumerate() {
            let child = gltf_array_index(&reader.metadata, node, "children", position, current)
                .and_then(|index| node_indices.get(index))
                .copied()
                .unwrap_or(-1);
            nodes[node_indices[index] as usize].children.push(child);
        }
    }
    let source_scenes = reader.source.read().unwrap().scenes.clone();
    let scenes = if let Some(source_scenes) = source_scenes {
        source_scenes
            .iter()
            .map(|scene| {
                let (name, roots) = {
                    let row = scene.read().unwrap();
                    (row.name.clone(), row.nodes.clone().unwrap_or_default())
                };
                let root_nodes = roots
                    .into_iter()
                    .enumerate()
                    .map(|(position, current)| {
                        gltf_array_index(&reader.metadata, scene, "nodes", position, current)
                            .and_then(|index| node_indices.get(index))
                            .copied()
                            .unwrap_or(-1)
                    })
                    .collect();
                return Scene3DDocumentScene { name, root_nodes };
            })
            .collect()
    } else {
        let mut roots = Vec::new();
        top_level_gltf_nodes(&mut roots, &source_nodes, &reader.metadata);
        vec![Scene3DDocumentScene {
            name: None,
            root_nodes: roots.into_iter().map(|index| node_indices[index]).collect(),
        }]
    };
    let mut world_transforms = Vec::new();
    build_gltf_node_world_transforms(
        &mut world_transforms,
        &source_nodes,
        &reader.metadata,
        reader.drops.as_ref(),
    );
    let world_transforms = Arc::new(world_transforms);
    let document = Arc::new(RwLock::new(Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials,
        meshes,
        metadata: None,
        nodes,
        resources,
        scenes,
        skins: Vec::new(),
    }));
    let node_indices = Arc::new(RwLock::new(node_indices));
    apply_gltf_core_handlers(
        &reader,
        &document,
        mesh_indices,
        &node_indices,
        Arc::new(RwLock::new(primitive_node_indices)),
        &world_transforms,
        core_feature_handlers,
    );
    apply_gltf_extension_handlers(
        &resolver,
        &document,
        &node_indices,
        &world_transforms,
        options.and_then(|options| options.extension_handlers.as_deref()),
        diagnostics,
    );
    flush_gltf_drops(diagnostics, reader.drops.as_ref());
    return document;
}

fn empty_gltf_document() -> Ref<Scene3DDocument> {
    return Arc::new(RwLock::new(Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: Vec::new(),
        skins: Vec::new(),
    }));
}

// flight-lint: allow(f64) private exact-integer limb preserves original source array indices until final table lookup; document transforms and vertex values remain f32
fn gltf_array_index<T: ?Sized>(
    metadata: &GltfJsonMetadata,
    record: &Ref<T>,
    field: &str,
    index: usize,
    current: f32,
) -> Option<usize> {
    let value = gltf_original_array_number(metadata, record, field, index, current);
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value >= usize::MAX as f64 {
        return None;
    }
    return Some(value as usize);
}

fn gltf_context_transform(transforms: &[Transform3D], node: f32) -> Transform3D {
    if node.is_finite() && node >= 0.0 && node.fract() == 0.0 {
        if let Some(transform) = transforms.get(node as usize) {
            return clone_gltf_transform(transform);
        }
    }
    return clone_gltf_transform(&create_transform3d());
}

fn gltf_default_scene(input: &GltfJsonDocument) -> i32 {
    let row = input.source.read().unwrap();
    return gltf_integer_field(
        &input.metadata,
        &input.source,
        "scene",
        row.scene.unwrap_or(0.0),
    )
    .and_then(|index| i32::try_from(index).ok())
    .unwrap_or(-1);
}

pub fn parse_glb_with_core_feature_handlers(
    bytes: &ArrayBufferView,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Ref<Scene3DDocument> {
    let Some(container) = read_glb_container(bytes, diagnostics) else {
        return empty_gltf_document();
    };
    return build_gltf_document(
        container.document,
        container.binary.as_ref(),
        core_feature_handlers,
        options,
        diagnostics,
    );
}

pub fn parse_gltf_with_core_feature_handlers(
    source: &GltfSource<'_>,
    core_feature_handlers: &[Ref<GltfCoreFeatureHandler>],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    options: Option<&GltfImportOptions>,
) -> Ref<Scene3DDocument> {
    let Some(input) = parse_gltf_source(source, diagnostics) else {
        return empty_gltf_document();
    };
    return build_gltf_document(input, None, core_feature_handlers, options, diagnostics);
}

fn supported_gltf_extension(extension: &str, options: Option<&GltfImportOptions>) -> bool {
    if extension == "KHR_draco_mesh_compression" {
        return options
            .and_then(|options| options.draco_registry.as_ref())
            .is_some_and(|registry| registry.read().unwrap().decoder.is_some());
    }
    return matches!(extension, "KHR_mesh_quantization" | "KHR_texture_transform")
        || options
            .and_then(|options| options.extension_handlers.as_ref())
            .is_some_and(|handlers| {
                handlers
                    .iter()
                    .any(|handler| handler.read().unwrap().kind == extension)
            });
}

fn supported_gltf_version(version: &str) -> bool {
    let version = version
        .trim_start_matches(|character: char| character.is_whitespace() || character == '\u{FEFF}');
    let (negative, version) = if let Some(version) = version.strip_prefix('-') {
        (true, version)
    } else {
        (false, version.strip_prefix('+').unwrap_or(version))
    };
    let count = version.bytes().take_while(u8::is_ascii_digit).count();
    return !negative && count > 0 && version[..count].parse::<u32>().ok() == Some(2);
}

fn tally_gltf_values(
    drops: Option<&Ref<Vec<GltfDropTally>>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    values: &[(&str, ImportDiagnosticDetailValue)],
) {
    if drops.is_none() {
        return;
    }
    tally_gltf_drop(
        drops,
        severity,
        kind,
        discriminator,
        GltfDiagnosticDetail::Values(GltfDiagnosticValues {
            value: gltf_diagnostic_values(values),
        }),
    );
}

fn top_level_gltf_nodes(
    out: &mut Vec<usize>,
    nodes: &[Ref<GltfNode>],
    metadata: &GltfJsonMetadata,
) {
    out.clear();
    let mut referenced = vec![false; nodes.len()];
    for node in nodes {
        for (position, current) in node
            .read()
            .unwrap()
            .children
            .clone()
            .unwrap_or_default()
            .into_iter()
            .enumerate()
        {
            if let Some(index) = gltf_array_index(metadata, node, "children", position, current) {
                if let Some(referenced) = referenced.get_mut(index) {
                    *referenced = true;
                }
            }
        }
    }
    out.extend(
        referenced
            .iter()
            .enumerate()
            .filter_map(|(index, referenced)| if *referenced { None } else { Some(index) }),
    );
}

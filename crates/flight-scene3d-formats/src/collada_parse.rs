use crate::collada_scene_shared::{
    ColladaIndexEntry, apply_collada_bind_material, parse_collada_bind_material,
};
use crate::collada_types::*;
use crate::collada_xml::{
    collada_child, collada_children, collada_local_name, collada_text, parse_collada_floats,
    walk_collada_element,
};
use flight_entity::Ref;
use flight_geometry::contract::{
    Matrix4, Transform3D, compose_matrix4_from_transform3d, copy_matrix4, create_matrix4,
    create_transform3d, decompose_matrix4_to_transform3d, multiply_matrix4,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_scene3d::{
    NODE3D_KIND, Scene3DDocument, Scene3DDocumentNode, Scene3DDocumentScene, Scene3DMetadata,
};
use flight_xml::{XmlElement, parse_xml_document};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn options_receiver_passes_the_original_explicit_family_and_options_to_the_free_parser() {
        let calls = Arc::new(RwLock::new(0));
        let observed_calls = calls.clone();
        let decoder = Arc::new(RwLock::new(ColladaElementDecoder {
            elements: Vec::new(),
            features: Vec::new(),
            build_phase: None,
            build: None,
            decode: Arc::new(move |context| {
                *observed_calls.write().unwrap() += 1;
                let (base_url, document) = {
                    let context = context.read().unwrap();
                    (context.base_url.clone(), context.document.clone())
                };
                assert_eq!(base_url.as_deref(), Some("/models"));
                let metadata = document.read().unwrap().metadata.clone().unwrap();
                metadata.write().unwrap().generator = base_url;
            }),
        }));
        let family = vec![decoder];
        let options = ColladaImportOptions {
            base_url: Some("/models".to_string()),
            decoders: Some(Vec::new()),
        };
        let receiver = options.parse_with_decoders("<COLLADA/>", &family);
        let free = parse_collada_with_decoders("<COLLADA/>", &family, Some(&options));
        assert_eq!(*calls.read().unwrap(), 2);
        assert_eq!(receiver.up_axis, free.up_axis);
        assert_eq!(receiver.root_transform, free.root_transform);
        assert_eq!(
            *receiver.diagnostics.read().unwrap(),
            *free.diagnostics.read().unwrap()
        );
        for result in [receiver, free] {
            assert_eq!(
                result
                    .document
                    .read()
                    .unwrap()
                    .metadata
                    .as_ref()
                    .unwrap()
                    .read()
                    .unwrap()
                    .generator
                    .as_deref(),
                Some("/models")
            );
        }
    }
}

struct ColladaXmlEntry {
    key: String,
    value: Ref<XmlElement>,
}

static X_UP_ROOT: LazyLock<Arc<Vec<f32>>> = LazyLock::new(|| {
    Arc::new(vec![
        0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ])
});
static Y_UP_ROOT: LazyLock<Arc<Vec<f32>>> = LazyLock::new(|| {
    Arc::new(vec![
        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ])
});
static Z_UP_ROOT: LazyLock<Arc<Vec<f32>>> = LazyLock::new(|| {
    Arc::new(vec![
        1.0, 0.0, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ])
});

fn apply_collada_root_transform(node: &mut Scene3DDocumentNode, root_matrix: &Matrix4) {
    let mut local = create_matrix4();
    let mut composed = create_matrix4();
    compose_matrix4_from_transform3d(&mut local, &node.transform);
    multiply_matrix4(&mut composed, root_matrix, &local);
    decompose_matrix4_to_transform3d(&mut node.transform, &composed);
}

fn build_collada_id_map(
    library: Option<&Ref<XmlElement>>,
    element_name: &str,
) -> Vec<ColladaXmlEntry> {
    let mut map: Vec<ColladaXmlEntry> = Vec::new();
    let mut elements = Vec::new();
    collada_children(&mut elements, library, element_name);
    for element in elements {
        let id = element.read().unwrap().attributes.get("id").cloned();
        if let Some(key) = id {
            if let Some(entry) = map.iter_mut().find(|entry| entry.key == key) {
                entry.value = element;
            } else {
                map.push(ColladaXmlEntry {
                    key,
                    value: element,
                });
            }
        }
    }
    return map;
}

fn build_collada_node(
    document: &mut Scene3DDocument,
    element: &Ref<XmlElement>,
    node_library: &[ColladaXmlEntry],
    instance_stack: &mut Vec<String>,
    geometry_indices: &[ColladaIndexEntry],
    geometry_symbols: &[ColladaStringArrayEntry],
    material_indices: &[ColladaIndexEntry],
    node_ids: &mut Vec<ColladaIndexEntry>,
    cameras: &mut Vec<ColladaDeferredCameraBinding>,
    controllers: &mut Vec<ColladaDeferredControllerBinding>,
    lights: &mut Vec<ColladaDeferredLightBinding>,
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
) -> i32 {
    let node_index = document.nodes.len() as i32;
    let transform = compose_collada_transform_elements(element);
    let (name, id, sid, children) = {
        let element = element.read().unwrap();
        (
            element
                .attributes
                .get("name")
                .or_else(|| element.attributes.get("id"))
                .cloned(),
            element.attributes.get("id").cloned(),
            element.attributes.get("sid").cloned(),
            element.children.clone(),
        )
    };
    document.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: NODE3D_KIND.to_string(),
        mesh: None,
        name,
        transform,
    });
    if let Some(id) = &id {
        if !instance_stack.contains(id) {
            instance_stack.push(id.clone());
        }
        set_collada_index(node_ids, id, node_index);
    }
    if let Some(sid) = sid {
        set_collada_index(node_ids, &sid, node_index);
    }
    for child in children {
        let name = collada_local_name(&child);
        let url = child.read().unwrap().attributes.get("url").cloned();
        if name == "node" {
            let index = build_collada_node(
                document,
                &child,
                node_library,
                instance_stack,
                geometry_indices,
                geometry_symbols,
                material_indices,
                node_ids,
                cameras,
                controllers,
                lights,
                diagnostics,
            );
            document.nodes[node_index as usize].children.push(index);
        } else if name == "instance_node" {
            let Some(reference) = url.as_ref().and_then(|url| url.strip_prefix('#')) else {
                report_collada_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "collada.missing-reference",
                    "parseCollada",
                    Some(HashMap::from([
                        (
                            "element".to_string(),
                            ImportDiagnosticDetailValue::String("instance_node".to_string()),
                        ),
                        (
                            "url".to_string(),
                            ImportDiagnosticDetailValue::String(
                                url.unwrap_or_else(|| "(missing)".to_string()),
                            ),
                        ),
                    ])),
                );
                continue;
            };
            if instance_stack.iter().any(|entry| entry == reference) {
                report_collada_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "collada.instance-cycle",
                    "parseCollada",
                    Some(HashMap::from([(
                        "node".to_string(),
                        ImportDiagnosticDetailValue::String(reference.to_string()),
                    )])),
                );
                continue;
            }
            let Some(referenced) = node_library.iter().find(|entry| entry.key == reference) else {
                report_collada_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "collada.missing-reference",
                    "parseCollada",
                    Some(HashMap::from([
                        (
                            "element".to_string(),
                            ImportDiagnosticDetailValue::String("instance_node".to_string()),
                        ),
                        (
                            "url".to_string(),
                            ImportDiagnosticDetailValue::String(url.unwrap()),
                        ),
                    ])),
                );
                continue;
            };
            let index = build_collada_node(
                document,
                &referenced.value,
                node_library,
                instance_stack,
                geometry_indices,
                geometry_symbols,
                material_indices,
                node_ids,
                cameras,
                controllers,
                lights,
                diagnostics,
            );
            document.nodes[node_index as usize].children.push(index);
        } else if name == "instance_camera" {
            if let Some(camera_id) = url.as_ref().and_then(|url| url.strip_prefix('#')) {
                cameras.push(ColladaDeferredCameraBinding {
                    camera_id: camera_id.to_string(),
                    node_index,
                });
            } else if let Some(url) = url {
                report_collada_diagnostic(
                    diagnostics,
                    ImportDiagnosticSeverity::Recover,
                    "collada.missing-reference",
                    "parseCollada",
                    Some(HashMap::from([
                        (
                            "element".to_string(),
                            ImportDiagnosticDetailValue::String("instance_camera".to_string()),
                        ),
                        ("url".to_string(), ImportDiagnosticDetailValue::String(url)),
                    ])),
                );
            }
        } else if name == "instance_geometry" {
            if let Some(geometry_id) = url.as_ref().and_then(|url| url.strip_prefix('#')) {
                if let Some(index) = geometry_indices
                    .iter()
                    .find(|entry| entry.key == geometry_id)
                    .map(|entry| entry.value)
                {
                    let symbols = geometry_symbols
                        .iter()
                        .find(|entry| entry.key == geometry_id)
                        .map(|entry| entry.value.read().unwrap());
                    let mesh = apply_collada_bind_material(
                        document,
                        index,
                        &child,
                        symbols.as_deref().map(Vec::as_slice),
                        material_indices,
                    );
                    document.nodes[node_index as usize].mesh = Some(mesh);
                }
            }
        } else if name == "instance_controller" {
            if let Some(controller_id) = url.as_ref().and_then(|url| url.strip_prefix('#')) {
                let skeleton = collada_child(Some(&child), "skeleton");
                let skeleton_root = skeleton.map(|skeleton| {
                    let skeleton = skeleton.read().unwrap();
                    let root = skeleton
                        .text
                        .trim_matches(crate::obj_features::is_obj_whitespace);
                    root.strip_prefix('#').unwrap_or(root).to_string()
                });
                controllers.push(ColladaDeferredControllerBinding {
                    controller_id: controller_id.to_string(),
                    material_overrides: parse_collada_bind_material(&child, material_indices),
                    node_index,
                    skeleton_root,
                });
            }
        } else if name == "instance_light" {
            if let Some(url) = url {
                lights.push(ColladaDeferredLightBinding { node_index, url });
            }
        }
    }
    if let Some(id) = id {
        instance_stack.retain(|entry| *entry != id);
    }
    return node_index;
}

fn build_collada_scene_hierarchy(
    context: &Ref<ColladaParseContext>,
    root: &Ref<XmlElement>,
    root_transform: &[f32],
    decoders: &[Ref<ColladaElementDecoder>],
) {
    let node_library =
        build_collada_id_map(collada_child(Some(root), "library_nodes").as_ref(), "node");
    let visual_scenes = build_collada_id_map(
        collada_child(Some(root), "library_visual_scenes").as_ref(),
        "visual_scene",
    );
    let Some(scene) = collada_child(Some(root), "scene") else {
        return;
    };
    let Some(instance) = collada_child(Some(&scene), "instance_visual_scene") else {
        return;
    };
    let url = instance.read().unwrap().attributes.get("url").cloned();
    let (document, diagnostics, geometry_indices, geometry_symbols, material_indices) = {
        let context = context.read().unwrap();
        (
            context.document.clone(),
            context.diagnostics.clone(),
            context.geometry_id_to_mesh_index.clone(),
            context.geometry_primitive_symbols.clone(),
            context.material_indices.clone(),
        )
    };
    let visual_scene = url
        .as_ref()
        .and_then(|url| url.strip_prefix('#'))
        .and_then(|id| visual_scenes.iter().find(|entry| entry.key == id))
        .map(|entry| entry.value.clone());
    let Some(visual_scene) = visual_scene else {
        report_collada_diagnostic(
            &diagnostics,
            ImportDiagnosticSeverity::Recover,
            "collada.missing-reference",
            "parseCollada",
            Some(HashMap::from([
                (
                    "element".to_string(),
                    ImportDiagnosticDetailValue::String("instance_visual_scene".to_string()),
                ),
                (
                    "url".to_string(),
                    ImportDiagnosticDetailValue::String(
                        url.unwrap_or_else(|| "(missing)".to_string()),
                    ),
                ),
            ])),
        );
        return;
    };
    let mut cameras = Vec::new();
    let mut controllers = Vec::new();
    let mut lights = Vec::new();
    let mut node_ids = Vec::new();
    let mut roots = Vec::new();
    let mut root_matrix = create_matrix4();
    root_matrix.m.copy_from_slice(root_transform);
    let identity = *Y_UP_ROOT.as_ref() == root_transform;
    {
        let geometry_indices = geometry_indices.read().unwrap();
        let geometry_symbols = geometry_symbols.read().unwrap();
        let material_indices = material_indices.read().unwrap();
        let mut document = document.write().unwrap();
        let mut nodes = Vec::new();
        collada_children(&mut nodes, Some(&visual_scene), "node");
        let mut stack = Vec::new();
        for node in nodes {
            roots.push(build_collada_node(
                &mut document,
                &node,
                &node_library,
                &mut stack,
                &geometry_indices,
                &geometry_symbols,
                &material_indices,
                &mut node_ids,
                &mut cameras,
                &mut controllers,
                &mut lights,
                &diagnostics,
            ));
        }
        if !identity {
            for index in &roots {
                apply_collada_root_transform(&mut document.nodes[*index as usize], &root_matrix);
            }
        }
    }
    let build_context = Arc::new(RwLock::new(ColladaBuildContext {
        deferred_cameras: cameras,
        deferred_controllers: controllers,
        deferred_lights: lights,
        node_id_map: node_ids,
        parse: context.clone(),
        root_node_indices: roots,
    }));
    for decoder in order_collada_build_phases(decoders) {
        let build = decoder.read().unwrap().build.clone();
        if let Some(build) = build {
            build(&build_context);
        }
    }
    let name = visual_scene.read().unwrap().attributes.get("name").cloned();
    let root_nodes = build_context.read().unwrap().root_node_indices.clone();
    document
        .write()
        .unwrap()
        .scenes
        .push(Scene3DDocumentScene { name, root_nodes });
}

fn compose_collada_transform_elements(element: &Ref<XmlElement>) -> Transform3D {
    let children = element
        .read()
        .unwrap()
        .children
        .clone()
        .into_iter()
        .filter(|child| {
            matches!(
                collada_local_name(child).as_str(),
                "matrix" | "translate" | "rotate" | "scale" | "lookat"
            )
        })
        .collect::<Vec<_>>();
    let mut transform = create_transform3d();
    if children.is_empty() {
        return transform;
    }
    let mut composed = create_matrix4();
    for element in children {
        let name = collada_local_name(&element);
        if !matches!(
            name.as_str(),
            "matrix" | "translate" | "rotate" | "scale" | "lookat"
        ) {
            continue;
        }
        let values = parse_collada_floats(&element.read().unwrap().text);
        let mut scratch = create_matrix4();
        if name == "matrix" && values.len() >= 16 {
            for column in 0..4 {
                for row in 0..4 {
                    scratch.m[column * 4 + row] = values[row * 4 + column];
                }
            }
        } else if name == "translate" && values.len() >= 3 {
            scratch.m[12..15].copy_from_slice(&values[..3]);
        } else if name == "scale" && values.len() >= 3 {
            scratch.m[0] = values[0];
            scratch.m[5] = values[1];
            scratch.m[10] = values[2];
        } else if name == "rotate" && values.len() >= 4 {
            let (ax, ay, az) = (values[0], values[1], values[2]);
            let angle = (values[3] * std::f32::consts::PI) / 180.0;
            let c = angle.cos();
            let s = angle.sin();
            let t = 1.0 - c;
            let length = (ax * ax + ay * ay + az * az).sqrt();
            if length < 1e-10 {
                continue;
            }
            let (x, y, z) = (ax / length, ay / length, az / length);
            scratch.m = [
                t * x * x + c,
                t * x * y + s * z,
                t * x * z - s * y,
                0.0,
                t * x * y - s * z,
                t * y * y + c,
                t * y * z + s * x,
                0.0,
                t * x * z + s * y,
                t * y * z - s * x,
                t * z * z + c,
                0.0,
                0.0,
                0.0,
                0.0,
                1.0,
            ];
        } else if name == "lookat" && values.len() >= 9 {
            let (ex, ey, ez) = (values[0], values[1], values[2]);
            let (mut fx, mut fy, mut fz) = (values[3] - ex, values[4] - ey, values[5] - ez);
            let length = (fx * fx + fy * fy + fz * fz).sqrt();
            if length < 1e-10 {
                continue;
            }
            fx /= length;
            fy /= length;
            fz /= length;
            let (mut sx, mut sy, mut sz) = (
                fy * values[8] - fz * values[7],
                fz * values[6] - fx * values[8],
                fx * values[7] - fy * values[6],
            );
            let length = (sx * sx + sy * sy + sz * sz).sqrt();
            if length < 1e-10 {
                continue;
            }
            sx /= length;
            sy /= length;
            sz /= length;
            let (ux, uy, uz) = (sy * fz - sz * fy, sz * fx - sx * fz, sx * fy - sy * fx);
            scratch.m = [
                sx, ux, -fx, 0.0, sy, uy, -fy, 0.0, sz, uz, -fz, 0.0, ex, ey, ez, 1.0,
            ];
        } else {
            continue;
        }
        let mut previous = create_matrix4();
        copy_matrix4(&mut previous, &composed);
        multiply_matrix4(&mut composed, &previous, &scratch);
    }
    decompose_matrix4_to_transform3d(&mut transform, &composed);
    return transform;
}

fn empty_collada_document() -> Ref<Scene3DDocument> {
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

fn order_collada_build_phases(
    decoders: &[Ref<ColladaElementDecoder>],
) -> Vec<Ref<ColladaElementDecoder>> {
    // Source MAX_SAFE_INTEGER is one below 2^53; no f32 lies between those values.
    // Keep that exact ordering boundary without widening the public phase or private arithmetic.
    let mut sorted = decoders.to_vec();
    sorted.sort_by(|a, b| {
        let a = a.read().unwrap().build_phase;
        let b = b.read().unwrap().build_phase;
        return match (a, b) {
            (Some(a), Some(b)) => (a - b)
                .partial_cmp(&0.0)
                .unwrap_or(std::cmp::Ordering::Equal),
            (None, None) => std::cmp::Ordering::Equal,
            (Some(value), None) => {
                if value.is_nan() {
                    std::cmp::Ordering::Equal
                } else if value >= 9007199254740992.0 {
                    std::cmp::Ordering::Greater
                } else {
                    std::cmp::Ordering::Less
                }
            }
            (None, Some(value)) => {
                if value.is_nan() {
                    std::cmp::Ordering::Equal
                } else if value >= 9007199254740992.0 {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                }
            }
        };
    });
    return sorted;
}

pub fn parse_collada_with_decoders(
    xml: &str,
    decoders: &[Ref<ColladaElementDecoder>],
    options: Option<&ColladaImportOptions>,
) -> ColladaParseResult {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = empty_collada_document();
    let root = parse_xml_document(xml).map(|root| Arc::new(RwLock::new(root)));
    let root = root.filter(|root| {
        let root = root.read().unwrap();
        root.name == "COLLADA" || root.name.ends_with(":COLLADA")
    });
    let Some(root) = root else {
        report_collada_diagnostic(
            &diagnostics,
            ImportDiagnosticSeverity::Reject,
            "collada.invalid-document",
            "parseCollada",
            None,
        );
        return ColladaParseResult {
            document,
            diagnostics,
            up_axis: ColladaUpAxis::YUp,
            root_transform: Y_UP_ROOT.clone(),
        };
    };
    let asset = collada_child(Some(&root), "asset");
    let axis = collada_text(asset.as_ref(), "up_axis");
    let up_axis = match axis.as_deref() {
        Some("Z_UP") => ColladaUpAxis::ZUp,
        Some("X_UP") => ColladaUpAxis::XUp,
        _ => ColladaUpAxis::YUp,
    };
    let root_transform = match up_axis {
        ColladaUpAxis::XUp => X_UP_ROOT.clone(),
        ColladaUpAxis::YUp => Y_UP_ROOT.clone(),
        ColladaUpAxis::ZUp => Z_UP_ROOT.clone(),
    };
    let contributor = collada_child(asset.as_ref(), "contributor");
    document.write().unwrap().metadata = Some(Arc::new(RwLock::new(Scene3DMetadata {
        copyright: collada_text(asset.as_ref(), "copyright"),
        generator: collada_text(contributor.as_ref(), "authoring_tool"),
        version: root.read().unwrap().attributes.get("version").cloned(),
    })));
    if up_axis != ColladaUpAxis::YUp {
        report_collada_diagnostic(
            &diagnostics,
            ImportDiagnosticSeverity::Recover,
            "collada.coordinate-conversion",
            "parseCollada",
            Some(HashMap::from([
                (
                    "from".to_string(),
                    ImportDiagnosticDetailValue::String(
                        if up_axis == ColladaUpAxis::ZUp {
                            "Z_UP"
                        } else {
                            "X_UP"
                        }
                        .to_string(),
                    ),
                ),
                (
                    "to".to_string(),
                    ImportDiagnosticDetailValue::String("Y_UP".to_string()),
                ),
            ])),
        );
    }
    walk_collada_element(&root, &mut |element| {
        let local = collada_local_name(element);
        let element = element.read().unwrap();
        if local.starts_with("instance_")
            && !matches!(
                local.as_str(),
                "instance_visual_scene" | "instance_node" | "instance_material"
            )
            && element.attributes.get("url").is_none_or(String::is_empty)
        {
            report_collada_diagnostic(
                &diagnostics,
                ImportDiagnosticSeverity::Recover,
                "collada.missing-reference",
                "parseCollada",
                Some(HashMap::from([(
                    "element".to_string(),
                    ImportDiagnosticDetailValue::String(element.name.clone()),
                )])),
            );
        }
    });
    let context = Arc::new(RwLock::new(ColladaParseContext {
        animation_channels: Arc::new(RwLock::new(Vec::new())),
        base_url: options.and_then(|options| options.base_url.clone()),
        camera_definitions: Arc::new(RwLock::new(Vec::new())),
        diagnostics: diagnostics.clone(),
        document: document.clone(),
        geometry_id_to_mesh_index: Arc::new(RwLock::new(Vec::new())),
        geometry_positions: Arc::new(RwLock::new(Vec::new())),
        geometry_primitive_symbols: Arc::new(RwLock::new(Vec::new())),
        light_definitions: Arc::new(RwLock::new(Vec::new())),
        material_indices: Arc::new(RwLock::new(Vec::new())),
        morphs: Arc::new(RwLock::new(Vec::new())),
        root: root.clone(),
        skins: Arc::new(RwLock::new(Vec::new())),
    }));
    for decoder in decoders {
        let decode = decoder.read().unwrap().decode.clone();
        decode(&context);
    }
    build_collada_scene_hierarchy(&context, &root, &root_transform, decoders);
    return ColladaParseResult {
        document,
        diagnostics,
        up_axis,
        root_transform,
    };
}

pub(crate) fn report_collada_diagnostic(
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    origin: &str,
    detail: Option<HashMap<String, ImportDiagnosticDetailValue>>,
) {
    report_import_diagnostic(
        Some(&mut diagnostics.write().unwrap()),
        severity,
        kind,
        origin,
        detail,
    );
}

pub(crate) fn set_collada_index(entries: &mut Vec<ColladaIndexEntry>, key: &str, value: i32) {
    if let Some(entry) = entries.iter_mut().find(|entry| entry.key == key) {
        entry.value = value;
    } else {
        entries.push(ColladaIndexEntry {
            key: key.to_string(),
            value,
        });
    }
}

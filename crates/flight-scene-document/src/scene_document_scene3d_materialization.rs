//! Scene3D <-> Flight document (TS `sceneDocumentScene3DMaterialization.ts`): writes a live 3D scene
//! with its document cameras and lights as a scene entry, materializes a selected 3D entry into a
//! live Scene3D with runtime cameras, lights and inert bindings, and explains every refusal.

// flight-lint: allow-file(contract-vocabulary) D16 native NodeRef / Node3DRef and open Light handles; i64 scene indices project JS safe integers; D15 object-identity maps keyed by entity uid and borrowed document node address

use std::collections::HashSet;

use flight_camera::{Camera3D, create_camera_3d, set_camera_3d_view_matrix4_from_matrix4};
use flight_entity::allocate_entity;
use flight_geometry::contract::{
    Transform3D, compose_matrix4_from_transform3d, create_transform3d,
    decompose_matrix4_to_transform3d, inverse_matrix4,
};
use flight_lighting::{AMBIENT_LIGHT_KIND, DIRECTIONAL_LIGHT_KIND, Scene3DLights};
use flight_node::contract::{NodeRevisionState, get_node_world_matrix4};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{
    Scene3D, Scene3DDocument, Scene3DDocumentCamera, Scene3DDocumentLight, as_node3d_ref,
    create_scene3d, create_scene3d_lights_from_document, is_node3d,
};

use crate::flight_document_light::decode_flight_document_light;
use crate::flight_document_text::{explain_flight_document_text, parse_flight_document_text};
use crate::scene_document_interactive_state_bindings::{
    assert_all_interactive_state_bindings_used, create_interactive_state_binding_lookup,
};
use crate::scene_document_layout_bindings::{
    FlightDocumentMaterializedNodes, FlightDocumentWrittenNodes,
    check_flight_document_layout_targets, create_flight_document_layout_bindings,
    write_flight_document_layout_bindings,
};
use crate::scene_document_materialization_selection::select_flight_document_scene;
use crate::scene_document_refusal::{
    check_flight_document_interactive_states, check_flight_document_node_fields,
    check_unregistered_node_kinds, create_scene_refusal,
};
use crate::scene_document_scene2d_materialization::{
    append_interactive_state_binding, check_root_kind_dimension,
    materialize_flight_document_children, resolve_flight_document_resources,
    write_flight_document_node,
};
use crate::types::*;

/// Writes a live 3D scene, its document cameras and its document lights as a scene entry with its
/// own Entity identity (TS `createFlightDocumentFromScene3D`). Interactive metadata and layouts
/// come only from the explicit inert bindings; a duplicate or foreign binding throws `RangeError`.
// flight-lint: allow(conform-params) D9 optional binding lists are Option slices in source order
pub fn create_flight_document_from_scene3d(
    source: &Scene3D,
    cameras: &[Scene3DDocumentCamera],
    lights: &[Scene3DDocumentLight],
    schemas: &FlightDocumentSchemaRegistry,
    interactive_state_bindings: Option<&[FlightDocumentInteractiveStateBinding]>,
    layout_bindings: Option<&[FlightDocumentLayoutBinding]>,
) -> FlightDocumentScene3D {
    let binding_lookup =
        create_interactive_state_binding_lookup(interactive_state_bindings.unwrap_or(&[]));
    let mut used_bindings: HashSet<String> = HashSet::new();
    let mut written_nodes = FlightDocumentWrittenNodes::new();
    let root: NodeRef = source.root.clone();
    let scene = write_flight_document_node(
        &root,
        schemas,
        &binding_lookup,
        &mut used_bindings,
        &mut written_nodes,
    );
    assert_all_interactive_state_bindings_used(&binding_lookup, &used_bindings);
    let mut out: FlightDocumentScene3D = allocate_entity();
    initialize_flight_document_from_scene3d(
        &mut out,
        source,
        cameras,
        lights,
        scene,
        layout_bindings.unwrap_or(&[]),
        &written_nodes,
    );
    return out;
}

/// Materializes the selected 3D scene entry into a live Scene3D with runtime cameras and lights (TS
/// `createFlightDocumentScene3DMaterialization`), or `None` when any validation refuses. World
/// matrices resolve through the caller-owned node revisions, and camera views are set through the
/// caller-owned camera guards (D5).
// flight-lint: allow(conform-params) D5 caller-owned node revisions and camera guard state replace the source module state
pub fn create_flight_document_scene3d_materialization(
    document: &FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
    scene_index: Option<i64>,
    revisions: &mut NodeRevisionState,
    camera_guards: &flight_camera::CameraGuardStateRef,
) -> Option<FlightDocumentScene3DMaterialization> {
    let selection =
        select_flight_document_scene(document, FlightDocumentSceneDimension::Scene3D, scene_index);
    let (Some(FlightDocumentScene::Scene3D(document_scene)), Some(scene_index)) =
        (selection.scene, selection.scene_index)
    else {
        return None;
    };
    let root = &document_scene.scene;
    if check_duplicate_lights(&document_scene.lights, scene_index).is_some()
        || check_unregistered_node_kinds(root, schemas, scene_index, "scene").is_some()
        || check_flight_document_node_fields(root, schemas, scene_index, "scene").is_some()
        || check_flight_document_interactive_states(
            root,
            FlightDocumentSceneDimension::Scene3D,
            schemas,
            scene_index,
            "scene",
        )
        .is_some()
        || check_flight_document_layout_targets(&document_scene.layouts, root, scene_index)
            .is_some()
    {
        return None;
    }
    let mut scene = create_scene3d();
    let resources = resolve_flight_document_resources(&document.resources, resolvers);
    if !adopt_document_root3d(&mut scene, root, schemas, &resources) {
        return None;
    }
    let live_root: NodeRef = scene.root.clone();
    let mut materialized_nodes = FlightDocumentMaterializedNodes::new();
    materialized_nodes.insert(root as *const FlightDocumentNode, live_root.clone());
    let mut interactive_state_bindings = Vec::new();
    if !append_interactive_state_binding(&mut interactive_state_bindings, &live_root, root, schemas)
    {
        return None;
    }
    if !materialize_flight_document_children(
        &live_root,
        &root.children,
        schemas,
        &resources,
        &mut interactive_state_bindings,
        &mut materialized_nodes,
    ) {
        return None;
    }
    let layout_bindings =
        create_flight_document_layout_bindings(&document_scene.layouts, root, &materialized_nodes)?;
    let flat_nodes = get_materialized_nodes(&live_root);
    let cameras = materialize_cameras(
        &document_scene.cameras,
        &flat_nodes,
        revisions,
        camera_guards,
    );
    let lights = materialize_lights(&document_scene.lights, &flat_nodes, revisions);
    let mut out: FlightDocumentScene3DMaterialization = allocate_entity();
    initialize_flight_document_scene3d_materialization(
        &mut out,
        cameras,
        interactive_state_bindings,
        layout_bindings,
        lights,
        scene,
    );
    return Some(out);
}

/// Reads `text` and materializes its selected 3D scene (TS
/// `createFlightDocumentScene3DMaterializationFromText`), or `None` on any refusal.
// flight-lint: allow(conform-params) D5 caller-owned node revisions and camera guard state replace the source module state
pub fn create_flight_document_scene3d_materialization_from_text(
    text: &str,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
    scene_index: Option<i64>,
    revisions: &mut NodeRevisionState,
    camera_guards: &flight_camera::CameraGuardStateRef,
) -> Option<FlightDocumentScene3DMaterialization> {
    let document = parse_flight_document_text(text)?;
    return create_flight_document_scene3d_materialization(
        &document,
        schemas,
        resolvers,
        scene_index,
        revisions,
        camera_guards,
    );
}

/// Writes the scene-entry fields of a written 3D scene into `out` (TS
/// `initializeFlightDocumentFromScene3D`): shallow copies of the document cameras and lights, which
/// keep their projection and light descriptor handles.
// flight-lint: allow(conform-params) D15 the written-node map keys by live node entity uid
pub fn initialize_flight_document_from_scene3d(
    out: &mut FlightDocumentScene3D,
    source: &Scene3D,
    cameras: &[Scene3DDocumentCamera],
    lights: &[Scene3DDocumentLight],
    scene: FlightDocumentNode,
    layout_bindings: &[FlightDocumentLayoutBinding],
    written_nodes: &FlightDocumentWrittenNodes,
) {
    let root: NodeRef = source.root.clone();
    out.cameras = cameras.iter().map(copy_document_camera).collect();
    out.layouts = write_flight_document_layout_bindings(layout_bindings, &root, written_nodes);
    out.lights = lights
        .iter()
        .map(|light| copy_document_light(light, light.transform.clone()))
        .collect();
    out.scene = scene;
    out.tokens = Vec::new();
}

/// Writes the materialization fields into `out` (TS
/// `initializeFlightDocumentScene3DMaterialization`).
pub fn initialize_flight_document_scene3d_materialization(
    out: &mut FlightDocumentScene3DMaterialization,
    cameras: Vec<Camera3D>,
    interactive_state_bindings: Vec<FlightDocumentInteractiveStateBinding>,
    layout_bindings: Vec<FlightDocumentLayoutBinding>,
    lights: Scene3DLights,
    scene: Scene3D,
) {
    out.cameras = cameras;
    out.interactive_state_bindings = interactive_state_bindings;
    out.layout_bindings = layout_bindings;
    out.lights = lights;
    out.scene = scene;
}

// Replaces the scene's default root with the authored one; false when the root cannot serve as a
// 3D root (checked structurally) or was not published through its family handle.
fn adopt_document_root3d(
    scene: &mut Scene3D,
    document_root: &FlightDocumentNode,
    schemas: &FlightDocumentSchemaRegistry,
    resources: &FlightDocumentResourceLookup,
) -> bool {
    let Some(schema) = schemas.node_schemas.entries.get(&document_root.kind) else {
        return true;
    };
    let Some(root) = (schema.create_node)(&document_root.fields, resources) else {
        return false;
    };
    if !is_node3d(&*root.read().unwrap()) {
        return false;
    }
    let Some(root) = as_node3d_ref(&root) else {
        return false;
    };
    scene.root = root;
    return true;
}

fn append_materialized_nodes(out: &mut Vec<NodeRef>, node: &NodeRef) {
    out.push(node.clone());
    let mut children = Vec::new();
    get_node_children(&mut children, node);
    for child in children {
        append_materialized_nodes(out, &child);
    }
}

fn check_duplicate_lights(
    lights: &[Scene3DDocumentLight],
    scene_index: i64,
) -> Option<FlightDocumentRefusalExplanation> {
    let mut ambient_count = 0;
    let mut directional_count = 0;
    for light in lights {
        let kind = light.descriptor.read().unwrap().kind().to_string();
        if kind == AMBIENT_LIGHT_KIND {
            ambient_count += 1;
            if ambient_count > 1 {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::DuplicateAmbientLight,
                    scene_index,
                    "lights",
                ));
            }
        }
        if kind == DIRECTIONAL_LIGHT_KIND {
            directional_count += 1;
            if directional_count > 1 {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::DuplicateDirectionalLight,
                    scene_index,
                    "lights",
                ));
            }
        }
    }
    return None;
}

fn copy_document_camera(camera: &Scene3DDocumentCamera) -> Scene3DDocumentCamera {
    return Scene3DDocumentCamera {
        far: camera.far,
        name: camera.name.clone(),
        near: camera.near,
        node: camera.node,
        projection: camera.projection.clone(),
        transform: camera.transform.clone(),
    };
}

fn copy_document_light(
    light: &Scene3DDocumentLight,
    transform: Transform3D,
) -> Scene3DDocumentLight {
    return Scene3DDocumentLight {
        descriptor: light.descriptor.clone(),
        name: light.name.clone(),
        node: light.node,
        transform,
    };
}

/// Explains why the selected 3D scene entry would refuse to materialize, or `None` when it is valid
/// (TS `explainFlightDocumentScene3DRefusal`).
pub fn explain_flight_document_scene3d_refusal(
    document: &FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: Option<i64>,
) -> Option<FlightDocumentRefusalExplanation> {
    let selection =
        select_flight_document_scene(document, FlightDocumentSceneDimension::Scene3D, scene_index);
    if selection.refusal.is_some() {
        return selection.refusal;
    }
    let (Some(FlightDocumentScene::Scene3D(scene)), Some(scene_index)) =
        (selection.scene, selection.scene_index)
    else {
        return None;
    };
    return check_duplicate_lights(&scene.lights, scene_index)
        .or_else(|| check_unregistered_node_kinds(&scene.scene, schemas, scene_index, "scene"))
        .or_else(|| check_flight_document_node_fields(&scene.scene, schemas, scene_index, "scene"))
        .or_else(|| {
            check_flight_document_interactive_states(
                &scene.scene,
                FlightDocumentSceneDimension::Scene3D,
                schemas,
                scene_index,
                "scene",
            )
        })
        .or_else(|| check_flight_document_layout_targets(&scene.layouts, &scene.scene, scene_index))
        .or_else(|| {
            check_root_kind_dimension(
                &scene.scene,
                FlightDocumentSceneDimension::Scene3D,
                schemas,
                scene_index,
            )
        });
}

/// Explains a refusal of `text` for the 3D entrypoint (TS `explainFlightDocumentScene3DRefusalFromText`).
pub fn explain_flight_document_scene3d_refusal_from_text(
    text: &str,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: Option<i64>,
) -> Option<FlightDocumentRefusalExplanation> {
    let Some(document) = parse_flight_document_text(text) else {
        return explain_flight_document_text(text);
    };
    return explain_flight_document_scene3d_refusal(&document, schemas, scene_index);
}

// The bound node of a document camera/light index, or None when the index is absent or out of
// range.
fn get_bound_materialized_node(
    index: Option<i32>,
    materialized_nodes: &[NodeRef],
) -> Option<&NodeRef> {
    let index = usize::try_from(index?).ok()?;
    return materialized_nodes.get(index);
}

// Scene3DDocument binding indices address a flat node table: the materialized tree flattened in the
// binary format's depth-first order, including the scene root at index zero.
fn get_materialized_nodes(root: &NodeRef) -> Vec<NodeRef> {
    let mut out = Vec::new();
    append_materialized_nodes(&mut out, root);
    return out;
}

fn materialize_cameras(
    cameras: &[Scene3DDocumentCamera],
    materialized_nodes: &[NodeRef],
    revisions: &mut NodeRevisionState,
    camera_guards: &flight_camera::CameraGuardStateRef,
) -> Vec<Camera3D> {
    // D25: the two working matrices come from the canonical geometry pool and return to it.
    let mut placement = flight_geometry::acquire_matrix4();
    let mut view = flight_geometry::acquire_matrix4();
    let mut out = Vec::with_capacity(cameras.len());
    for source in cameras {
        let mut camera = create_camera_3d();
        camera.far = source.far;
        camera.near = source.near;
        camera.projection = source.projection.clone();
        match get_bound_materialized_node(source.node, materialized_nodes) {
            None => {
                compose_matrix4_from_transform3d(&mut placement, &source.transform);
                if inverse_matrix4(&mut view, &placement) {
                    set_camera_3d_view_matrix4_from_matrix4(camera_guards, &mut camera, &view);
                }
            }
            Some(bound) => {
                let world = get_node_world_matrix4(bound, revisions);
                if inverse_matrix4(&mut view, &world) {
                    set_camera_3d_view_matrix4_from_matrix4(camera_guards, &mut camera, &view);
                }
            }
        }
        out.push(camera);
    }
    flight_geometry::release_matrix4(view);
    flight_geometry::release_matrix4(placement);
    return out;
}

fn materialize_lights(
    lights: &[Scene3DDocumentLight],
    materialized_nodes: &[NodeRef],
    revisions: &mut NodeRevisionState,
) -> Scene3DLights {
    let resolved_lights = lights
        .iter()
        .map(|source| {
            let decoded = Scene3DDocumentLight {
                descriptor: decode_flight_document_light(&source.descriptor),
                name: source.name.clone(),
                node: source.node,
                transform: source.transform.clone(),
            };
            let Some(bound) = get_bound_materialized_node(source.node, materialized_nodes) else {
                return decoded;
            };
            let mut transform = create_transform3d();
            decompose_matrix4_to_transform3d(
                &mut transform,
                &get_node_world_matrix4(bound, revisions),
            );
            return copy_document_light(&decoded, transform);
        })
        .collect();
    let document = Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: resolved_lights,
        materials: Vec::new(),
        meshes: Vec::new(),
        metadata: None,
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: Vec::new(),
        skins: Vec::new(),
    };
    return create_scene3d_lights_from_document(&document);
}

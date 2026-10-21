//! Scene2D <-> Flight document (TS `sceneDocumentScene2DMaterialization.ts`): writes a live 2D scene
//! as a document scene entry, materializes a selected 2D entry into a live Scene2D with inert
//! interactive-state and layout bindings, and explains every refusal.

// flight-lint: allow-file(f64) D1: raw document background colors and fields are JS Numbers
// flight-lint: allow-file(contract-vocabulary) D16 native NodeRef / Node2DRef handles; i64 scene indices project JS safe integers; D15 object-identity maps keyed by entity uid and borrowed document node address

use std::collections::HashSet;
use std::sync::Arc;

use flight_entity::{
    Ref, allocate_entity, delete_record_value, get_record_value, set_record_value,
};
use flight_node::{NodeRef, add_node_child, get_node_children};
use flight_scene2d::{Scene2D, Scene2DOptions, as_node2d_ref, create_scene2d, is_node2d};

use crate::flight_document_light::to_uint32;
use crate::flight_document_text::{explain_flight_document_text, parse_flight_document_text};
use crate::scene_document_interactive_state_bindings::{
    FlightDocumentInteractiveStateBindingLookup, assert_all_interactive_state_bindings_used,
    create_interactive_state_binding_lookup, get_node_identity,
    is_interactive_state_binding_target_supported, is_strictly_equal,
    read_interactive_state_binding_metadata,
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
use crate::types::*;

/// Writes a live 2D scene as a document scene entry with its own Entity identity (TS
/// `createFlightDocumentFromScene2D`). Interactive metadata and layouts come only from the explicit
/// inert bindings; a duplicate or foreign binding throws `RangeError`.
// flight-lint: allow(conform-params) D9 optional binding lists are Option slices in source order
pub fn create_flight_document_from_scene2d(
    source: &Scene2D,
    schemas: &FlightDocumentSchemaRegistry,
    interactive_state_bindings: Option<&[FlightDocumentInteractiveStateBinding]>,
    layout_bindings: Option<&[FlightDocumentLayoutBinding]>,
) -> FlightDocumentScene2D {
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
    let mut out: FlightDocumentScene2D = allocate_entity();
    initialize_flight_document_from_scene2d(
        &mut out,
        source,
        scene,
        layout_bindings.unwrap_or(&[]),
        &written_nodes,
    );
    return out;
}

/// Materializes the selected 2D scene entry into a live Scene2D (TS
/// `createFlightDocumentScene2DMaterialization`), or `None` when any validation refuses; the
/// `explain_*` seams name the refusal. `scene_index` defaults to the document's default scene.
pub fn create_flight_document_scene2d_materialization(
    document: &FlightDocument,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
    scene_index: Option<i64>,
) -> Option<FlightDocumentScene2DMaterialization> {
    let selection =
        select_flight_document_scene(document, FlightDocumentSceneDimension::Scene2D, scene_index);
    let (Some(FlightDocumentScene::Scene2D(document_scene)), Some(scene_index)) =
        (selection.scene, selection.scene_index)
    else {
        return None;
    };
    let root = &document_scene.scene;
    if check_unregistered_node_kinds(root, schemas, scene_index, "scene").is_some()
        || check_flight_document_node_fields(root, schemas, scene_index, "scene").is_some()
        || check_flight_document_interactive_states(
            root,
            FlightDocumentSceneDimension::Scene2D,
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
    let scene = create_scene2d(Some(&Scene2DOptions {
        color: document_scene.background_color.map(to_uint32),
        ..Default::default()
    }));
    let resources = resolve_flight_document_resources(&document.resources, resolvers);
    // The authored root carries a kind and fields like any other node; materializing only its
    // children would discard both, so the root is adopted from its own schema.
    if !adopt_document_root2d(&scene, root, schemas, &resources) {
        return None;
    }
    let live_root: NodeRef = scene.read().unwrap().root.clone();
    let mut materialized_nodes = FlightDocumentMaterializedNodes::new();
    materialized_nodes.insert(root as *const FlightDocumentNode, live_root.clone());
    let mut interactive_state_bindings: Vec<FlightDocumentInteractiveStateBinding> = Vec::new();
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
    let mut out: FlightDocumentScene2DMaterialization = allocate_entity();
    initialize_flight_document_scene2d_materialization(
        &mut out,
        interactive_state_bindings,
        layout_bindings,
        scene,
    );
    return Some(out);
}

/// Reads `text` and materializes its selected 2D scene (TS
/// `createFlightDocumentScene2DMaterializationFromText`), or `None` on any refusal.
pub fn create_flight_document_scene2d_materialization_from_text(
    text: &str,
    schemas: &FlightDocumentSchemaRegistry,
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
    scene_index: Option<i64>,
) -> Option<FlightDocumentScene2DMaterialization> {
    let document = parse_flight_document_text(text)?;
    return create_flight_document_scene2d_materialization(
        &document,
        schemas,
        resolvers,
        scene_index,
    );
}

/// Writes the scene-entry fields of a written 2D scene into `out` (TS
/// `initializeFlightDocumentFromScene2D`), the construction initializer of
/// `create_flight_document_from_scene2d`.
// flight-lint: allow(conform-params) D15 the written-node map keys by live node entity uid
pub fn initialize_flight_document_from_scene2d(
    out: &mut FlightDocumentScene2D,
    source: &Scene2D,
    scene: FlightDocumentNode,
    layout_bindings: &[FlightDocumentLayoutBinding],
    written_nodes: &FlightDocumentWrittenNodes,
) {
    let root: NodeRef = source.root.clone();
    out.background_color = source.color.map(f64::from);
    out.layouts = write_flight_document_layout_bindings(layout_bindings, &root, written_nodes);
    out.scene = scene;
    out.tokens = Vec::new();
}

/// Writes the materialization fields into `out` (TS `initializeFlightDocumentScene2DMaterialization`),
/// the construction initializer of `create_flight_document_scene2d_materialization`.
pub fn initialize_flight_document_scene2d_materialization(
    out: &mut FlightDocumentScene2DMaterialization,
    interactive_state_bindings: Vec<FlightDocumentInteractiveStateBinding>,
    layout_bindings: Vec<FlightDocumentLayoutBinding>,
    scene: Ref<Scene2D>,
) {
    out.interactive_state_bindings = interactive_state_bindings;
    out.layout_bindings = layout_bindings;
    out.scene = scene;
}

// Replaces the scene's default root with the authored one, carrying its kind and fields; false when
// the root cannot serve as a 2D root. The dimension check is structural: the node is built and its
// family is read, and its own published family handle becomes the root (Principal 68e645eb C1).
fn adopt_document_root2d(
    scene: &Ref<Scene2D>,
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
    if !is_node2d(&*root.read().unwrap()) {
        return false;
    }
    let Some(root) = as_node2d_ref(&root) else {
        return false;
    };
    let previous = std::mem::replace(&mut scene.write().unwrap().root, root.clone());
    root.write()
        .unwrap()
        .node2d_fields_mut()
        .node2d_runtime_mut()
        .scene2d = Some(Arc::downgrade(scene));
    previous
        .write()
        .unwrap()
        .node2d_fields_mut()
        .node2d_runtime_mut()
        .scene2d = None;
    return true;
}

pub(crate) fn append_interactive_state_binding(
    out: &mut Vec<FlightDocumentInteractiveStateBinding>,
    node: &NodeRef,
    document_node: &FlightDocumentNode,
    schemas: &FlightDocumentSchemaRegistry,
) -> bool {
    let Some(interactive_states) = &document_node.interactive_states else {
        return true;
    };
    if !is_interactive_state_binding_target_supported(node, document_node, schemas) {
        return false;
    }
    out.push(FlightDocumentInteractiveStateBinding {
        interactive_states: interactive_states.clone(),
        node: node.clone(),
        transition: document_node.transition.clone(),
    });
    return true;
}

// A registered root kind belonging to the other dimension: detected structurally by building the
// node with a genuinely empty resource lookup and reading its family.
pub(crate) fn check_root_kind_dimension(
    document_root: &FlightDocumentNode,
    dimension: FlightDocumentSceneDimension,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: i64,
) -> Option<FlightDocumentRefusalExplanation> {
    let schema = schemas.node_schemas.entries.get(&document_root.kind)?;
    let probe = (schema.create_node)(
        &document_root.fields,
        &FlightDocumentResourceLookup::default(),
    )?;
    let matches = {
        let guard = probe.read().unwrap();
        match dimension {
            FlightDocumentSceneDimension::Scene2D => is_node2d(&*guard),
            FlightDocumentSceneDimension::Scene3D => flight_scene3d::is_node3d(&*guard),
        }
    };
    if matches {
        return None;
    }
    let mut refusal = create_scene_refusal(
        FlightDocumentRefusalReason::RootKindMismatch,
        scene_index,
        "scene",
    );
    refusal.kind = Some(document_root.kind.clone());
    return Some(refusal);
}

/// Explains why the selected scene entry of `dimension` would refuse to materialize, or `None` when
/// it is valid (TS `explainFlightDocumentRefusal`).
pub fn explain_flight_document_refusal(
    document: &FlightDocument,
    dimension: FlightDocumentSceneDimension,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: Option<i64>,
) -> Option<FlightDocumentRefusalExplanation> {
    let selection = select_flight_document_scene(document, dimension, scene_index);
    if selection.refusal.is_some() {
        return selection.refusal;
    }
    let (Some(scene), Some(scene_index)) = (selection.scene, selection.scene_index) else {
        return None;
    };
    let (root, layouts) = match scene {
        FlightDocumentScene::Scene2D(scene) => (&scene.scene, &scene.layouts),
        FlightDocumentScene::Scene3D(scene) => (&scene.scene, &scene.layouts),
    };
    return check_unregistered_node_kinds(root, schemas, scene_index, "scene")
        .or_else(|| check_flight_document_node_fields(root, schemas, scene_index, "scene"))
        .or_else(|| {
            check_flight_document_interactive_states(root, dimension, schemas, scene_index, "scene")
        })
        .or_else(|| check_flight_document_layout_targets(layouts, root, scene_index))
        .or_else(|| check_root_kind_dimension(root, dimension, schemas, scene_index));
}

/// Explains a refusal of `text`: the text refusal when it does not read, else the document refusal
/// (TS `explainFlightDocumentRefusalFromText`).
pub fn explain_flight_document_refusal_from_text(
    text: &str,
    dimension: FlightDocumentSceneDimension,
    schemas: &FlightDocumentSchemaRegistry,
    scene_index: Option<i64>,
) -> Option<FlightDocumentRefusalExplanation> {
    let Some(document) = parse_flight_document_text(text) else {
        return explain_flight_document_text(text);
    };
    return explain_flight_document_refusal(&document, dimension, schemas, scene_index);
}

pub(crate) fn materialize_flight_document_children(
    parent: &NodeRef,
    children: &[FlightDocumentNode],
    schemas: &FlightDocumentSchemaRegistry,
    resources: &FlightDocumentResourceLookup,
    interactive_state_bindings: &mut Vec<FlightDocumentInteractiveStateBinding>,
    materialized_nodes: &mut FlightDocumentMaterializedNodes,
) -> bool {
    for child in children {
        let Some(schema) = schemas.node_schemas.entries.get(&child.kind) else {
            continue;
        };
        let Some(node) = (schema.create_node)(&child.fields, resources) else {
            continue;
        };
        add_node_child(parent, &node);
        materialized_nodes.insert(child as *const FlightDocumentNode, node.clone());
        if !append_interactive_state_binding(interactive_state_bindings, &node, child, schemas) {
            return false;
        }
        if !materialize_flight_document_children(
            &node,
            &child.children,
            schemas,
            resources,
            interactive_state_bindings,
            materialized_nodes,
        ) {
            return false;
        }
    }
    return true;
}

// Resolves each declared resource once through its kind's resolver; a missing resolver or a `None`
// result leaves the key unresolved.
pub(crate) fn resolve_flight_document_resources(
    descriptors: &[FlightDocumentResourceDescriptor],
    resolvers: Option<&FlightDocumentResourceResolverRegistry>,
) -> FlightDocumentResourceLookup {
    let mut out = FlightDocumentResourceLookup::default();
    let Some(resolvers) = resolvers else {
        return out;
    };
    for descriptor in descriptors {
        let Some(resolver) = resolvers.resolvers.entries.get(&descriptor.kind) else {
            continue;
        };
        if let Some(resolved) = resolver(&descriptor.key, descriptor) {
            set_record_value(&mut out, descriptor.key.clone(), resolved);
        }
    }
    return out;
}

// Writes the registered schema fields of `source`, then removes every field strictly equal to its
// schema default.
fn write_fields_with_defaults(
    out: &mut FlightDocumentFields,
    source: &NodeRef,
    schema: &FlightDocumentNodeSchema,
) {
    (schema.write_node_fields)(out, source, &FlightDocumentResourceLookup::default());
    for field in &schema.fields {
        let Some(default_value) = &field.default_value else {
            continue;
        };
        if get_record_value(out, &field.name)
            .is_some_and(|value| is_strictly_equal(value, default_value))
        {
            delete_record_value(out, &field.name);
        }
    }
}

// Writes one live node and its subtree as document nodes, recording each written node by the live
// node's identity.
pub(crate) fn write_flight_document_node(
    source: &NodeRef,
    schemas: &FlightDocumentSchemaRegistry,
    bindings: &FlightDocumentInteractiveStateBindingLookup,
    used_bindings: &mut HashSet<String>,
    written_nodes: &mut FlightDocumentWrittenNodes,
) -> FlightDocumentNode {
    let mut fields = FlightDocumentFields::default();
    let kind = source.read().unwrap().node_fields().kind.clone();
    if let Some(schema) = schemas.node_schemas.entries.get(&kind) {
        write_fields_with_defaults(&mut fields, source, schema);
    }
    let mut children = Vec::new();
    get_node_children(&mut children, source);
    let metadata =
        read_interactive_state_binding_metadata(source, bindings, used_bindings, schemas);
    let document_node = FlightDocumentNode {
        children: children
            .iter()
            .map(|child| {
                write_flight_document_node(child, schemas, bindings, used_bindings, written_nodes)
            })
            .collect(),
        fields,
        interactive_states: metadata.interactive_states,
        kind,
        transition: metadata.transition,
    };
    written_nodes.insert(get_node_identity(source), document_node.clone());
    return document_node;
}

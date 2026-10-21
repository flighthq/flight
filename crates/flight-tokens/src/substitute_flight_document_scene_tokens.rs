//! Substitution of resolved token values into a scene's node fields (TS
//! `substituteFlightDocumentSceneTokens.ts`).

use std::cell::RefCell;

use flight_entity::{get_record_keys, get_record_value, set_record_value};
use flight_scene_document::contract::create_flight_document_refusal_explanation;
use flight_scene_document::{
    FlightDocumentFields, FlightDocumentNode, FlightDocumentRefusalExplanation,
    FlightDocumentRefusalReason, FlightDocumentScene, FlightDocumentScene2D, FlightDocumentScene3D,
    FlightDocumentTokenResolution, FlightDocumentValue,
};
use flight_scene3d::{Scene3DDocumentCamera, Scene3DDocumentLight};

use crate::flight_document_token_reference::{
    INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE, substitute_flight_document_token_value,
};

struct SceneSubstitutionState<'a> {
    refusal: Option<FlightDocumentRefusalExplanation>,
    resolution: &'a FlightDocumentTokenResolution,
}

// The source spread shares the camera records; Rust copies them, keeping each field's value.
fn copy_camera(camera: &Scene3DDocumentCamera) -> Scene3DDocumentCamera {
    return Scene3DDocumentCamera {
        far: camera.far,
        name: camera.name.clone(),
        near: camera.near,
        node: camera.node,
        projection: camera.projection.clone(),
        transform: camera.transform.clone(),
    };
}

// The light descriptor stays the SAME shared light handle (D16 open family identity).
fn copy_light(light: &Scene3DDocumentLight) -> Scene3DDocumentLight {
    return Scene3DDocumentLight {
        descriptor: light.descriptor.clone(),
        name: light.name.clone(),
        node: light.node,
        transform: light.transform.clone(),
    };
}

/// The first refusal substituting `resolution` into `scene` would meet, or `None` when every
/// reference resolves (TS `explainFlightDocumentSceneTokenSubstitution`).
pub fn explain_flight_document_scene_token_substitution(
    scene: &FlightDocumentScene,
    resolution: &FlightDocumentTokenResolution,
) -> Option<FlightDocumentRefusalExplanation> {
    return read_substitution(scene, resolution).1;
}

// A reference the resolution does not cover is a named refusal, never a `$…` string left in a
// field a renderer will read as a number. Silent pass-through would make the file say one thing and
// the render show another, with nothing reporting the difference.
fn lookup(
    key: &str,
    path: &str,
    state: &RefCell<SceneSubstitutionState>,
) -> Option<FlightDocumentValue> {
    let value = get_record_value(&state.borrow().resolution.values, key).cloned();
    if value.is_none() {
        refuse(
            state,
            FlightDocumentRefusalReason::TokenUnresolved,
            path,
            Some(key),
        );
        return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
    }
    return value;
}

fn read_substitution(
    scene: &FlightDocumentScene,
    resolution: &FlightDocumentTokenResolution,
) -> (
    Option<FlightDocumentNode>,
    Option<FlightDocumentRefusalExplanation>,
) {
    let root_node = match scene {
        FlightDocumentScene::Scene2D(entry) => &entry.scene,
        FlightDocumentScene::Scene3D(entry) => &entry.scene,
    };
    let state = RefCell::new(SceneSubstitutionState {
        refusal: None,
        resolution,
    });
    let root = substitute_node(root_node, "scene", &state);
    if root.is_none() {
        return (None, state.into_inner().refusal);
    }
    return (root, None);
}

// Records the FIRST refusal only (the source's `??=`), carrying the resolution's mode.
fn refuse(
    state: &RefCell<SceneSubstitutionState>,
    reason: FlightDocumentRefusalReason,
    path: &str,
    token_key: Option<&str>,
) {
    let mut current = state.borrow_mut();
    if current.refusal.is_none() {
        let mut out = create_flight_document_refusal_explanation();
        out.mode = Some(current.resolution.mode.clone());
        out.path = path.to_string();
        out.reason = reason;
        out.token_key = token_key.map(str::to_string);
        current.refusal = Some(out);
    }
}

/// A NEW scene entry of the same dimension with every node-field reference replaced from
/// `resolution`, or `None` wherever the explain seam reports a refusal (TS
/// `substituteFlightDocumentSceneTokens`). Pure: the input scene is never touched. Every
/// scene-level section (layouts and tokens, plus the background color or the cameras and lights)
/// is carried over unchanged and only `scene` is replaced.
pub fn substitute_flight_document_scene_tokens(
    scene: &FlightDocumentScene,
    resolution: &FlightDocumentTokenResolution,
) -> Option<FlightDocumentScene> {
    let root = read_substitution(scene, resolution).0?;
    return Some(match scene {
        FlightDocumentScene::Scene2D(entry) => {
            let mut out = FlightDocumentScene2D::default();
            out.background_color = entry.background_color;
            out.layouts = entry.layouts.clone();
            out.scene = root;
            out.tokens = entry.tokens.clone();
            FlightDocumentScene::Scene2D(out)
        }
        FlightDocumentScene::Scene3D(entry) => {
            let mut out = FlightDocumentScene3D::default();
            out.cameras = entry.cameras.iter().map(copy_camera).collect();
            out.layouts = entry.layouts.clone();
            out.lights = entry.lights.iter().map(copy_light).collect();
            out.scene = root;
            out.tokens = entry.tokens.clone();
            FlightDocumentScene::Scene3D(out)
        }
    });
}

// Rebuilds a node from its kind, substituted fields and substituted children, as the source does.
fn substitute_node(
    node: &FlightDocumentNode,
    path: &str,
    state: &RefCell<SceneSubstitutionState>,
) -> Option<FlightDocumentNode> {
    let mut names = Vec::new();
    get_record_keys(&mut names, &node.fields);
    let mut fields = FlightDocumentFields::default();
    for name in names {
        let field_path = format!("{}.fields.{}", path, name);
        let value = get_record_value(&node.fields, &name).expect("a listed record key");
        let substituted = substitute_flight_document_token_value(
            value,
            &field_path,
            &mut |key: &str, at: &str| lookup(key, at, state),
            &mut |at: &str| {
                refuse(
                    state,
                    FlightDocumentRefusalReason::TokenReferenceInvalid,
                    at,
                    None,
                )
            },
        )?;
        set_record_value(&mut fields, name, substituted);
    }
    let mut children = Vec::with_capacity(node.children.len());
    for (index, child) in node.children.iter().enumerate() {
        let child_path = format!("{}.children[{}]", path, index);
        children.push(substitute_node(child, &child_path, state)?);
    }
    return Some(FlightDocumentNode {
        children,
        fields,
        interactive_states: None,
        kind: node.kind.clone(),
        transition: None,
    });
}

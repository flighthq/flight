//! What a scene uses that some consumer must be registered for (TS `sceneKindUsage.ts`): one walk,
//! no registry, no backend.

use flight_entity::allocate_entity;
use flight_materials::BLEND_MODE_NORMAL;
use flight_node::{Node, NodeRef, for_each_node_descendant};

use crate::display_object::as_node2d;
use crate::types::*;

/// Allocates an empty usage record a caller can reuse across scenes (TS `createScene2DKindUsage`).
pub fn create_scene2d_kind_usage() -> Scene2DKindUsage {
    let mut out: Scene2DKindUsage = allocate_entity();
    initialize_scene2d_kind_usage(&mut out);
    return out;
}

/// The construction initializer of `create_scene2d_kind_usage`: four empty lists (TS
/// `initializeScene2DKindUsage`).
pub fn initialize_scene2d_kind_usage(out: &mut Scene2DKindUsage) {
    out.blend_modes = Vec::new();
    out.material_kinds = Vec::new();
    out.node_kinds = Vec::new();
    out.shape_command_keys = Vec::new();
}

// A linear scan rather than a set: these lists are the handful of distinct kinds a document uses.
fn add_scene2d_used_kind(kinds: &mut Vec<String>, kind: &str) {
    for existing in kinds.iter() {
        if existing == kind {
            return;
        }
    }
    kinds.push(kind.to_string());
}

/// Clears `out`, then fills it with every kind the scene uses: node kinds, explicit non-Normal
/// blend modes, material kinds and recorded shape command keys, each deduped and sorted (TS
/// `getScene2DKindUsage`). Reports what is in the scene, never whether anything can draw it.
pub fn get_scene2d_kind_usage(out: &mut Scene2DKindUsage, scene: &Scene2D) {
    out.blend_modes.clear();
    out.material_kinds.clear();
    out.node_kinds.clear();
    out.shape_command_keys.clear();
    let root: NodeRef = scene.root.clone();
    visit_scene2d_kind_usage(out, &*root.read().unwrap());
    for_each_node_descendant(&root, &mut |node| {
        visit_scene2d_kind_usage(out, &*node.read().unwrap());
    });
    for kinds in [
        &mut out.blend_modes,
        &mut out.material_kinds,
        &mut out.node_kinds,
        &mut out.shape_command_keys,
    ] {
        kinds.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    }
}

// flight-lint: allow(f64) D1: the stream cursor advances by JS-number argument counts, so NaN ends the walk as in the source
fn visit_scene2d_kind_usage(out: &mut Scene2DKindUsage, node: &dyn Node) {
    add_scene2d_used_kind(&mut out.node_kinds, &node.node_fields().kind);
    let Some(node) = as_node2d(node) else {
        return;
    };
    let fields = node.node2d_fields();
    // An unset mode inherits and Normal needs no realization, so only an explicit other mode counts.
    if let Some(blend_mode) = &fields.blend_mode
        && blend_mode != BLEND_MODE_NORMAL
    {
        add_scene2d_used_kind(&mut out.blend_modes, blend_mode);
    }
    if let Some(material) = &fields.material {
        let kind = material.read().unwrap().material2d_fields().kind.clone();
        add_scene2d_used_kind(&mut out.material_kinds, &kind);
    }
    let Some(commands) = node.shape_command_stream() else {
        return;
    };
    // `[key, argCount, ...args]`: advance by the declared count, as a JS number (NaN stops the walk).
    let mut i: f64 = 0.0;
    while i < commands.len() as f64 {
        let index = i as usize;
        if i.fract() == 0.0
            && let Some(key) = commands.key_at(index)
        {
            add_scene2d_used_kind(&mut out.shape_command_keys, key);
        }
        i += commands.arg_count_at(index + 1) + 2.0;
    }
}

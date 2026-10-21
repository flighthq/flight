use std::sync::Arc;

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_node::contract::{
    NodeOrderList, NodeRef, apply_node_order_list, create_node_order_list, dispose_node_order_list,
    get_node_parent, set_node_order_list_entry_above, set_node_order_list_entry_below,
    set_node_order_list_from_node_children,
};
use flight_scene2d::Node2DRef;

use crate::rive_import_registry::{
    import_rive_core_object_as_data, register_rive_core_object_handler,
};
use crate::types::*;

struct RiveDrawTarget {
    is_above: bool,
    node: Node2DRef,
}

pub fn apply_rive_draw_order(
    nodes: &[Option<Node2DRef>],
    artboard: &RiveArtboardGraph,
    root: &Node2DRef,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let mut lists: Vec<(NodeRef, NodeOrderList)> = Vec::new();
    for (index, object) in artboard.objects.iter().enumerate() {
        if object.type_key != RIVE_DRAW_RULES_TYPE_KEY as u64 {
            continue;
        }
        let governed_index = artboard
            .parent_indices
            .get(index)
            .copied()
            .and_then(|index| usize::try_from(index).ok());
        let governed = resolve_rive_draw_node(nodes, governed_index);
        let target = resolve_rive_draw_target(
            nodes,
            artboard,
            read_rive_draw_id(object, RIVE_DRAW_TARGET_ID),
        );
        let (Some(governed), Some(target)) = (governed, target) else {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.draw-rule-unresolved",
                "applyRiveDrawOrder",
                None,
            );
            continue;
        };

        let governed_node: NodeRef = governed.clone();
        let target_node: NodeRef = target.node.clone();
        let Some(parent) = get_node_parent(&governed_node) else {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.draw-rule-crosses-parent",
                "applyRiveDrawOrder",
                None,
            );
            continue;
        };
        if !get_node_parent(&target_node)
            .as_ref()
            .is_some_and(|target_parent| Arc::ptr_eq(target_parent, &parent))
        {
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                ImportDiagnosticSeverity::Drop,
                "rive.draw-rule-crosses-parent",
                "applyRiveDrawOrder",
                None,
            );
            continue;
        }

        let list_index = lists
            .iter()
            .position(|(candidate, _)| Arc::ptr_eq(candidate, &parent))
            .unwrap_or_else(|| {
                let mut list = create_node_order_list();
                set_node_order_list_from_node_children(&mut list, &parent);
                lists.push((parent.clone(), list));
                lists.len() - 1
            });
        let list = &mut lists[list_index].1;
        if target.is_above {
            set_node_order_list_entry_above(list, &governed_node, &target_node);
        } else {
            set_node_order_list_entry_below(list, &governed_node, &target_node);
        }
    }

    let root_node: NodeRef = root.clone();
    for (parent, mut list) in lists {
        let target = if Arc::ptr_eq(&parent, &root_node) {
            &root_node
        } else {
            &parent
        };
        apply_node_order_list(target, &list);
        dispose_node_order_list(&mut list);
    }
}

fn read_rive_draw_id(object: &RiveCoreObject, key: u64) -> Option<usize> {
    let property = object
        .properties
        .iter()
        .find(|candidate| candidate.key == key)?;
    return match property.value {
        RiveValue::Uint(value) => usize::try_from(value).ok(),
        RiveValue::Color(value) => usize::try_from(value).ok(),
        RiveValue::Double(value) if value.is_finite() && value >= 0.0 && value.fract() == 0.0 => {
            Some(value as usize)
        }
        _ => None,
    };
}

pub fn register_rive_draw_order_handlers(registry: &mut RiveImportRegistry) {
    let draw_order = Arc::new(RiveCoreObjectHandler {
        apply_artboard: Some(Arc::new(|context| {
            apply_rive_draw_order(
                &context.nodes,
                context.artboard,
                &context.root,
                context.diagnostics.as_deref_mut(),
            );
        })),
        apply_document: None,
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
    });
    register_rive_core_object_handler(registry, RIVE_DRAW_TARGET_TYPE_KEY, draw_order.clone());
    register_rive_core_object_handler(registry, RIVE_DRAW_RULES_TYPE_KEY, draw_order);
}

fn resolve_rive_draw_node(nodes: &[Option<Node2DRef>], index: Option<usize>) -> Option<Node2DRef> {
    return index.and_then(|index| nodes.get(index)).cloned().flatten();
}

fn resolve_rive_draw_target(
    nodes: &[Option<Node2DRef>],
    artboard: &RiveArtboardGraph,
    target_index: Option<usize>,
) -> Option<RiveDrawTarget> {
    let target = artboard.objects.get(target_index?)?;
    if target.type_key != RIVE_DRAW_TARGET_TYPE_KEY as u64 {
        return None;
    }
    let drawable = resolve_rive_draw_node(nodes, read_rive_draw_id(target, RIVE_DRAWABLE_ID))?;
    return Some(RiveDrawTarget {
        is_above: read_rive_draw_id(target, RIVE_PLACEMENT_VALUE) == Some(RIVE_PLACEMENT_AFTER),
        node: drawable,
    });
}

const RIVE_DRAW_TARGET_TYPE_KEY: i32 = 48;
const RIVE_DRAW_RULES_TYPE_KEY: i32 = 49;

const RIVE_DRAWABLE_ID: u64 = 119;
const RIVE_PLACEMENT_VALUE: u64 = 120;
const RIVE_DRAW_TARGET_ID: u64 = 121;

const RIVE_PLACEMENT_AFTER: usize = 1;

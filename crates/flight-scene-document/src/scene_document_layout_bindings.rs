//! Inert layout bindings between authored layout trees and live nodes (TS
//! `sceneDocumentLayoutBindings.ts`). Live node identity keys by entity uid; authored document node
//! identity keys by the borrowed record's address (D15 object-keyed maps).

// flight-lint: allow-file(f64) D1: layout style values are JS Numbers checked by the safe-integer grammar
// flight-lint: allow-file(contract-vocabulary) D15 object-identity maps keyed by entity uid and by borrowed document node address; D16 native NodeRef handles

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use flight_entity::{entries, get_record_value, throw_range_error};
use flight_node::{NodeRef, get_node_children};

use crate::scene_document_interactive_state_bindings::get_node_identity;
use crate::scene_document_refusal::create_scene_refusal;
use crate::types::*;

/// Live nodes materialized for authored document nodes, by document node identity (TS
/// `ReadonlyMap<FlightDocumentNode, N>`).
pub type FlightDocumentMaterializedNodes = HashMap<*const FlightDocumentNode, NodeRef>;

/// Authored document nodes written for live nodes, by live node identity (TS
/// `ReadonlyMap<NodeAny, FlightDocumentNode>`).
pub type FlightDocumentWrittenNodes = HashMap<String, FlightDocumentNode>;

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

/// Replaces each layout's authored target names with the index-matched live nodes (TS
/// `createFlightDocumentLayoutBindings`), sharing the authored tree; `None` when a named target was
/// not materialized.
pub fn create_flight_document_layout_bindings(
    layouts: &[FlightDocumentLayoutDescriptor],
    root: &FlightDocumentNode,
    materialized_nodes: &FlightDocumentMaterializedNodes,
) -> Option<Vec<FlightDocumentLayoutBinding>> {
    if layouts.is_empty() {
        return Some(Vec::new());
    }
    let target_names: HashSet<&str> = layouts
        .iter()
        .flat_map(|layout| layout.targets.iter().map(String::as_str))
        .collect();
    let mut nodes_by_name: HashMap<String, NodeRef> = HashMap::new();
    if !collect_materialized_nodes_by_name(
        root,
        &target_names,
        materialized_nodes,
        &mut nodes_by_name,
    ) {
        return None;
    }
    let bindings = layouts
        .iter()
        .map(|layout| FlightDocumentLayoutBinding {
            targets: layout
                .targets
                .iter()
                .map(|target| {
                    nodes_by_name
                        .get(target)
                        .cloned()
                        .expect("collected by name")
                })
                .collect(),
            tree: layout.tree.clone(),
        })
        .collect();
    return Some(bindings);
}

/// Validates every layout's structure and that each target names exactly one authored node (TS
/// `checkFlightDocumentLayoutTargets`): malformed descriptors refuse `StructureInvalid`, a missing
/// name `LayoutTargetUnresolved`, and a name authored more than once `LayoutTargetAmbiguous`.
pub fn check_flight_document_layout_targets(
    layouts: &[FlightDocumentLayoutDescriptor],
    root: &FlightDocumentNode,
    scene_index: i64,
) -> Option<FlightDocumentRefusalExplanation> {
    let mut target_paths: Vec<(String, String)> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for (layout_index, layout) in layouts.iter().enumerate() {
        let layout_path = format!("layouts[{layout_index}]");
        let nodes = &layout.tree.nodes;
        if nodes.is_empty() {
            return Some(create_scene_refusal(
                FlightDocumentRefusalReason::StructureInvalid,
                scene_index,
                &format!("{layout_path}.tree.nodes"),
            ));
        }
        if layout.targets.len() != nodes.len() {
            return Some(create_scene_refusal(
                FlightDocumentRefusalReason::StructureInvalid,
                scene_index,
                &format!("{layout_path}.targets"),
            ));
        }
        for (node_index, node) in nodes.iter().enumerate() {
            if !is_flight_document_layout_node(node, node_index) {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::StructureInvalid,
                    scene_index,
                    &format!("{layout_path}.tree.nodes[{node_index}]"),
                ));
            }
        }
        for (target_index, target) in layout.targets.iter().enumerate() {
            let target_path = format!("{layout_path}.targets[{target_index}]");
            if target.is_empty() || !seen.insert(target.clone()) {
                return Some(create_scene_refusal(
                    FlightDocumentRefusalReason::StructureInvalid,
                    scene_index,
                    &target_path,
                ));
            }
            target_paths.push((target.clone(), target_path));
        }
    }

    let mut match_counts: HashMap<String, usize> = HashMap::new();
    collect_authored_target_matches(root, &seen, &mut match_counts);
    for (target, target_path) in &target_paths {
        let count = match_counts.get(target).copied().unwrap_or(0);
        if count == 1 {
            continue;
        }
        let reason = if count == 0 {
            FlightDocumentRefusalReason::LayoutTargetUnresolved
        } else {
            FlightDocumentRefusalReason::LayoutTargetAmbiguous
        };
        return Some(create_scene_refusal(reason, scene_index, target_path));
    }
    return None;
}

fn collect_authored_target_matches(
    node: &FlightDocumentNode,
    target_names: &HashSet<String>,
    counts: &mut HashMap<String, usize>,
) {
    if let Some(FlightDocumentValue::String(name)) = get_record_value(&node.fields, "name")
        && target_names.contains(name)
    {
        *counts.entry(name.clone()).or_insert(0) += 1;
    }
    for child in &node.children {
        collect_authored_target_matches(child, target_names, counts);
    }
}

fn collect_live_nodes(
    node: &NodeRef,
    live_nodes: &mut HashSet<String>,
    name_counts: &mut HashMap<String, usize>,
) {
    live_nodes.insert(get_node_identity(node));
    if let Some(name) = node.read().unwrap().node_fields().name.clone() {
        *name_counts.entry(name).or_insert(0) += 1;
    }
    let mut children = Vec::new();
    get_node_children(&mut children, node);
    for child in children {
        collect_live_nodes(&child, live_nodes, name_counts);
    }
}

fn collect_materialized_nodes_by_name(
    document_node: &FlightDocumentNode,
    target_names: &HashSet<&str>,
    materialized_nodes: &FlightDocumentMaterializedNodes,
    out: &mut HashMap<String, NodeRef>,
) -> bool {
    if let Some(FlightDocumentValue::String(name)) = get_record_value(&document_node.fields, "name")
        && target_names.contains(name.as_str())
    {
        let Some(materialized) =
            materialized_nodes.get(&(document_node as *const FlightDocumentNode))
        else {
            return false;
        };
        out.insert(name.clone(), materialized.clone());
    }
    for child in &document_node.children {
        if !collect_materialized_nodes_by_name(child, target_names, materialized_nodes, out) {
            return false;
        }
    }
    return true;
}

fn is_document_fields(fields: &FlightDocumentFields) -> bool {
    let mut pairs = Vec::new();
    entries(&mut pairs, fields);
    return pairs
        .iter()
        .all(|(_, value)| is_flight_document_value(value));
}

fn is_flight_document_layout_node(node: &FlightDocumentLayoutNode, index: usize) -> bool {
    return !node.kind.is_empty()
        && node.parent_index >= -1
        && node.parent_index < index as i64
        && node.container_style.as_ref().is_none_or(is_document_fields)
        && node.item_style.as_ref().is_none_or(is_document_fields);
}

// A value the text codec can represent: finite numbers, and integers only within the safe range.
fn is_flight_document_value(value: &FlightDocumentValue) -> bool {
    return match value {
        FlightDocumentValue::Number(number) => {
            number.is_finite() && (number.fract() != 0.0 || number.abs() <= MAX_SAFE_INTEGER)
        }
        FlightDocumentValue::Array(items) => items.iter().all(is_flight_document_value),
        FlightDocumentValue::Fields(fields) => is_document_fields(fields),
        _ => true,
    };
}

/// Writes live layout bindings back as authored descriptors that name their targets by `Node.name`
/// (TS `writeFlightDocumentLayoutBindings`), cloning each document-safe tree. Throws `RangeError`
/// for writer misuse: a malformed tree, a foreign or repeated target, or a target whose name is
/// missing, duplicated, or not represented by its node schema.
pub fn write_flight_document_layout_bindings(
    bindings: &[FlightDocumentLayoutBinding],
    root: &NodeRef,
    written_nodes: &FlightDocumentWrittenNodes,
) -> Vec<FlightDocumentLayoutDescriptor> {
    if bindings.is_empty() {
        return Vec::new();
    }
    let mut scene_nodes: HashSet<String> = HashSet::new();
    let mut name_counts: HashMap<String, usize> = HashMap::new();
    collect_live_nodes(root, &mut scene_nodes, &mut name_counts);
    let mut used_targets: HashSet<String> = HashSet::new();
    let mut layouts = Vec::with_capacity(bindings.len());
    for binding in bindings {
        let nodes = &binding.tree.nodes;
        if nodes.is_empty() || binding.targets.len() != nodes.len() {
            throw_range_error(
                "FlightDocument layout targets must match a non-empty tree index-for-index",
            );
        }
        for (node_index, node) in nodes.iter().enumerate() {
            if !is_flight_document_layout_node(node, node_index) {
                throw_range_error(
                    "FlightDocument layout tree must use document-safe styles and parent-before-child indices",
                );
            }
        }
        let mut targets = Vec::with_capacity(binding.targets.len());
        for target in &binding.targets {
            let identity = get_node_identity(target);
            if !scene_nodes.contains(&identity) || !used_targets.insert(identity.clone()) {
                throw_range_error(
                    "FlightDocument layout targets must be unique members of the written scene",
                );
            }
            let name = target.read().unwrap().node_fields().name.clone();
            let Some(name) =
                name.filter(|name| !name.is_empty() && name_counts.get(name) == Some(&1))
            else {
                throw_range_error(
                    "FlightDocument layout targets require unique non-empty Node.name values",
                );
            };
            let represented = written_nodes.get(&identity).is_some_and(|written| {
                return matches!(get_record_value(&written.fields, "name"), Some(FlightDocumentValue::String(value)) if *value == name);
            });
            if !represented {
                throw_range_error(
                    "FlightDocument layout target Node.name must be represented by its node schema",
                );
            }
            targets.push(name);
        }
        layouts.push(FlightDocumentLayoutDescriptor {
            targets,
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: nodes.clone(),
            }),
        });
    }
    return layouts;
}

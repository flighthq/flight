use std::collections::HashSet;

use flight_entity::Kind;
use flight_materials::STANDARD_MATERIAL_KIND;
use flight_node::NodeRef;
use flight_registry::KindMap;

use crate::{RenderState, Scene3DPipelineCoverageExplanation};

fn collect_used_3d_kinds(root: &NodeRef) -> (HashSet<Kind>, HashSet<Kind>) {
    let mut kinds = HashSet::new();
    let mut material_kinds = HashSet::new();
    let mut stack = vec![root.clone()];
    while let Some(current) = stack.pop() {
        let current = current.read().unwrap();
        kinds.insert(current.node_fields().kind.clone());
        if let Some(node3d) = current.as_any().downcast_ref::<flight_scene3d::Mesh>() {
            for material in node3d.materials.read().unwrap().iter() {
                material_kinds.insert(match material {
                    Some(material) => material.read().unwrap().material_fields().kind.clone(),
                    None => STANDARD_MATERIAL_KIND.to_string(),
                });
            }
        }
        if let Some(children) = &current.node_runtime().children {
            for child in children.iter().rev() {
                stack.push(child.clone());
            }
        }
    }
    return (kinds, material_kinds);
}

pub fn explain_scene_3d_pipeline_coverage<S: RenderState, T>(
    state: &S,
    scene: &NodeRef,
    material_renderers: Option<&KindMap<T>>,
) -> Scene3DPipelineCoverageExplanation {
    let (used_kind_set, used_material_kind_set) = collect_used_3d_kinds(scene);
    let mut registered_kinds = state.render_registries().node_renderers.key_order.clone();
    let mut registered_material_kinds = material_renderers
        .map(|map| map.key_order.clone())
        .unwrap_or_default();
    let mut used_kinds: Vec<_> = used_kind_set.iter().cloned().collect();
    let mut used_material_kinds: Vec<_> = used_material_kind_set.iter().cloned().collect();
    crate::explain_scene2d_pipeline_coverage::sort_kinds(&mut registered_kinds);
    crate::explain_scene2d_pipeline_coverage::sort_kinds(&mut registered_material_kinds);
    crate::explain_scene2d_pipeline_coverage::sort_kinds(&mut used_kinds);
    crate::explain_scene2d_pipeline_coverage::sort_kinds(&mut used_material_kinds);
    let registered_kind_set: HashSet<_> = registered_kinds.iter().cloned().collect();
    let registered_material_kind_set: HashSet<_> =
        registered_material_kinds.iter().cloned().collect();
    return Scene3DPipelineCoverageExplanation {
        uncovered_kinds: used_kinds
            .iter()
            .filter(|kind| !registered_kind_set.contains(*kind))
            .cloned()
            .collect(),
        uncovered_material_kinds: used_material_kinds
            .iter()
            .filter(|kind| !registered_material_kind_set.contains(*kind))
            .cloned()
            .collect(),
        unused_registrations: registered_kinds
            .iter()
            .filter(|kind| !used_kind_set.contains(*kind))
            .cloned()
            .collect(),
        unused_material_registrations: registered_material_kinds
            .iter()
            .filter(|kind| !used_material_kind_set.contains(*kind))
            .cloned()
            .collect(),
        registered_kinds,
        registered_material_kinds,
        used_kinds,
        used_material_kinds,
    };
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts

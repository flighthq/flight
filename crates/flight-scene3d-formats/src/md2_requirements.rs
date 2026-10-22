use crate::md2_feature_requirements::MD2_FEATURE_SCENE_REQUIREMENTS;
use crate::md2_features::collect_md2_features;
use crate::scene3d_format_requirements::MD2_REQUIREMENT_KEY_NAMESPACE;
use flight_entity::Uint8Array;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_md2_requirements(source: &Uint8Array) -> RequirementSet {
    let mut requirements = Vec::new();
    let mut features = Vec::new();
    if collect_md2_features(&mut features, source) {
        features.sort();
        for feature in features {
            requirements.push(Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: format!("{}.{}", MD2_REQUIREMENT_KEY_NAMESPACE, feature),
            });
            if let Some(entry) = MD2_FEATURE_SCENE_REQUIREMENTS
                .iter()
                .find(|entry| entry.feature == feature)
            {
                requirements.extend(entry.requirements.iter().cloned());
            }
        }
    }
    return create_requirement_set(
        &[
            RequirementFacet::DocumentFormat,
            RequirementFacet::SceneMaterialKind,
        ],
        &requirements,
    );
}

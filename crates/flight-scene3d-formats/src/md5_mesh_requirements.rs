use crate::md5_mesh_feature_requirements::MD5_MESH_FEATURE_SCENE_REQUIREMENTS;
use crate::md5_mesh_features::collect_md5_mesh_features;
use crate::scene3d_format_requirements::MD5_REQUIREMENT_KEY_NAMESPACE;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_md5_mesh_requirements(source: &str) -> RequirementSet {
    let mut features = Vec::new();
    collect_md5_mesh_features(&mut features, source);
    features.sort();
    let mut requirements = Vec::new();
    for feature in features {
        requirements.push(Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{}.{}", MD5_REQUIREMENT_KEY_NAMESPACE, feature),
        });
        if let Some(entry) = MD5_MESH_FEATURE_SCENE_REQUIREMENTS
            .iter()
            .find(|entry| entry.feature == feature)
        {
            requirements.extend(entry.requirements.iter().cloned());
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

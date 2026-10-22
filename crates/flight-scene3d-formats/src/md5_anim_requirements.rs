use crate::md5_anim_features::collect_md5_anim_features;
use crate::scene3d_format_requirements::MD5_REQUIREMENT_KEY_NAMESPACE;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_md5_anim_requirements(source: &str) -> RequirementSet {
    let mut features = Vec::new();
    collect_md5_anim_features(&mut features, source);
    features.sort();
    let requirements: Vec<Requirement> = features
        .into_iter()
        .map(|feature| Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{}.{}", MD5_REQUIREMENT_KEY_NAMESPACE, feature),
        })
        .collect();
    return create_requirement_set(
        &[
            RequirementFacet::DocumentFormat,
            RequirementFacet::SceneMaterialKind,
        ],
        &requirements,
    );
}

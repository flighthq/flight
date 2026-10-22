use crate::gltf_feature_requirements::GLTF_FEATURE_SCENE_REQUIREMENTS;
use crate::gltf_features::{collect_glb_features, collect_gltf_features};
use crate::gltf_source::GltfSource;
use crate::scene3d_format_requirements::GLTF_REQUIREMENT_KEY_NAMESPACE;
use flight_entity::Uint8Array;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

fn build_gltf_requirement_set(features: &mut [String]) -> RequirementSet {
    features.sort();
    let mut requirements = Vec::new();
    for feature in features {
        requirements.push(Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{GLTF_REQUIREMENT_KEY_NAMESPACE}.{feature}"),
        });
        if let Some(entry) = GLTF_FEATURE_SCENE_REQUIREMENTS
            .iter()
            .find(|entry| entry.feature == *feature)
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

pub fn parse_glb_requirements(source: &Uint8Array) -> RequirementSet {
    let mut features = Vec::new();
    collect_glb_features(&mut features, source);
    return build_gltf_requirement_set(&mut features);
}

pub fn parse_gltf_requirements(source: GltfSource<'_>) -> RequirementSet {
    let mut features = Vec::new();
    collect_gltf_features(&mut features, source);
    return build_gltf_requirement_set(&mut features);
}

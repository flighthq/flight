use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use flight_requirement::{Requirement, RequirementFacet};
use flight_shading::SHADED_MATERIAL_KIND;
use std::sync::LazyLock;

pub static AWD2_BLOCK_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        return vec![Scene3DFormatFeatureRequirements {
            feature: "Material".to_string(),
            requirements: vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: SHADED_MATERIAL_KIND.to_string(),
            }],
        }];
    });

pub static AWD2_DOCUMENT_SCENE_REQUIREMENTS: LazyLock<Vec<Requirement>> = LazyLock::new(Vec::new);

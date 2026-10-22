use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use flight_materials::BLINN_PHONG_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use std::sync::LazyLock;

pub static MD5_MESH_FEATURE_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        return vec![Scene3DFormatFeatureRequirements {
            feature: "Material".to_string(),
            requirements: vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: BLINN_PHONG_MATERIAL_KIND.to_string(),
            }],
        }];
    });

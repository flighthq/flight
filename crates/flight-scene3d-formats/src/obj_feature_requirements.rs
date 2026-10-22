use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use crate::obj_types::{OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE};
use flight_materials::{BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND};
use flight_requirement::{Requirement, RequirementFacet};
use std::sync::LazyLock;

pub static OBJ_FEATURE_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        vec![
            Scene3DFormatFeatureRequirements {
                feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE.to_string(),
                requirements: vec![Requirement {
                    facet: RequirementFacet::SceneMaterialKind,
                    key: BLINN_PHONG_MATERIAL_KIND.to_string(),
                }],
            },
            Scene3DFormatFeatureRequirements {
                feature: OBJ_MATERIAL_STANDARD_PBR_FEATURE.to_string(),
                requirements: vec![Requirement {
                    facet: RequirementFacet::SceneMaterialKind,
                    key: STANDARD_PBR_MATERIAL_KIND.to_string(),
                }],
            },
        ]
    });

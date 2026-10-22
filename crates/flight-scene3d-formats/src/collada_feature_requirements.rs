use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use flight_materials::STANDARD_PBR_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use std::sync::LazyLock;

pub static COLLADA_FEATURE_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        ["Effect.Blinn", "Effect.Lambert", "Effect.Phong", "Material"]
            .into_iter()
            .map(|feature| Scene3DFormatFeatureRequirements {
                feature: feature.to_string(),
                requirements: vec![Requirement {
                    facet: RequirementFacet::SceneMaterialKind,
                    key: STANDARD_PBR_MATERIAL_KIND.to_string(),
                }],
            })
            .collect()
    });

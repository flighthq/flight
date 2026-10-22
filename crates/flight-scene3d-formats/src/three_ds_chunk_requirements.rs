use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use crate::three_ds_chunk_census::get_three_ds_chunk_name;
use crate::three_ds_schema::THREE_DS_MATERIAL;
use flight_materials::BLINN_PHONG_MATERIAL_KIND;
use flight_requirement::{Requirement, RequirementFacet};
use std::sync::LazyLock;

pub static THREE_DS_CHUNK_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        vec![Scene3DFormatFeatureRequirements {
            feature: get_three_ds_chunk_name(THREE_DS_MATERIAL),
            requirements: vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: BLINN_PHONG_MATERIAL_KIND.to_string(),
            }],
        }]
    });

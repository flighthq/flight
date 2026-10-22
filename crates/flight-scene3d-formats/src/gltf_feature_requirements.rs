use crate::feature_requirements::Scene3DFormatFeatureRequirements;
use flight_materials::{
    SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND,
};
use flight_requirement::{Requirement, RequirementFacet};
use std::sync::LazyLock;

pub static GLTF_FEATURE_SCENE_REQUIREMENTS: LazyLock<Vec<Scene3DFormatFeatureRequirements>> =
    LazyLock::new(|| {
        [
            ("Mesh", STANDARD_PBR_MATERIAL_KIND),
            ("KHR_materials_unlit", UNLIT_MATERIAL_KIND),
            (
                "KHR_materials_pbrSpecularGlossiness",
                SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
            ),
        ]
        .into_iter()
        .map(|(feature, material)| Scene3DFormatFeatureRequirements {
            feature: feature.to_string(),
            requirements: vec![Requirement {
                facet: RequirementFacet::SceneMaterialKind,
                key: material.to_string(),
            }],
        })
        .collect()
    });

use crate::obj_feature_requirements::OBJ_FEATURE_SCENE_REQUIREMENTS;
use crate::obj_features::{OBJ_MATERIAL_FEATURE, collect_obj_features};
use crate::obj_material_model::collect_obj_material_models;
use crate::obj_types::{OBJ_MATERIAL_BLINN_PHONG_FEATURE, OBJ_MATERIAL_STANDARD_PBR_FEATURE};
use crate::scene3d_format_requirements::OBJ_REQUIREMENT_KEY_NAMESPACE;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub fn parse_obj_requirements(
    source: &str,
    material_libraries: Option<&[String]>,
) -> RequirementSet {
    let mut features = Vec::new();
    collect_obj_features(&mut features, source);
    if let Some(index) = features
        .iter()
        .position(|feature| feature == OBJ_MATERIAL_FEATURE)
    {
        features.remove(index);
        let mut models = Vec::new();
        let mut library_models = Vec::new();
        for library in material_libraries.unwrap_or(&[]) {
            collect_obj_material_models(&mut library_models, library);
            for model in library_models.drain(..) {
                if !models.contains(&model) {
                    models.push(model);
                }
            }
        }
        if models.is_empty() {
            models.push(OBJ_MATERIAL_BLINN_PHONG_FEATURE.to_string());
            models.push(OBJ_MATERIAL_STANDARD_PBR_FEATURE.to_string());
        }
        for model in models {
            if !features.contains(&model) {
                features.push(model);
            }
        }
    }
    features.sort();
    let mut requirements = Vec::new();
    for feature in features {
        requirements.push(Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{OBJ_REQUIREMENT_KEY_NAMESPACE}.{feature}"),
        });
        if let Some(entry) = OBJ_FEATURE_SCENE_REQUIREMENTS
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

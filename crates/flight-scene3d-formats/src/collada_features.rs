use crate::collada_feature_requirements::COLLADA_FEATURE_SCENE_REQUIREMENTS;
use crate::collada_xml::{collada_local_name, walk_collada_element};
use crate::scene3d_format_requirements::COLLADA_REQUIREMENT_KEY_NAMESPACE;
use flight_entity::Ref;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};
use flight_xml::{XmlElement, parse_xml_document};
use std::sync::{Arc, LazyLock, RwLock};

#[derive(Debug, PartialEq, Eq)]
pub struct ColladaElementCount {
    pub feature: String,
    pub count: usize,
}

pub struct ColladaFeatureElements {
    pub feature: String,
    pub elements: Vec<String>,
}

pub static COLLADA_FEATURE_ELEMENTS: LazyLock<Vec<ColladaFeatureElements>> = LazyLock::new(|| {
    [
        ("Animation", vec!["animation"]),
        ("Camera", vec!["camera"]),
        ("Camera.Orthographic", vec!["orthographic"]),
        ("Camera.Perspective", vec!["perspective"]),
        ("Controller", vec!["controller"]),
        ("Controller.Morph", vec!["morph"]),
        ("Controller.Skin", vec!["skin"]),
        ("Effect.Blinn", vec!["blinn"]),
        ("Effect.Lambert", vec!["lambert"]),
        ("Effect.Phong", vec!["phong"]),
        ("Geometry", vec!["geometry"]),
        ("Image", vec!["image"]),
        ("Light", vec!["light"]),
        ("Light.Ambient", vec!["ambient"]),
        ("Light.Directional", vec!["directional"]),
        ("Light.Point", vec!["point"]),
        ("Light.Spot", vec!["spot"]),
        ("Material", vec!["material", "effect"]),
    ]
    .into_iter()
    .map(|(feature, elements)| ColladaFeatureElements {
        feature: feature.to_string(),
        elements: elements.into_iter().map(str::to_string).collect(),
    })
    .collect()
});

fn collada_coarse_feature(element: &str) -> Option<&'static str> {
    return match element {
        "animation" => Some("Animation"),
        "camera" => Some("Camera"),
        "controller" => Some("Controller"),
        "effect" | "material" => Some("Material"),
        "geometry" => Some("Geometry"),
        "image" => Some("Image"),
        "light" => Some("Light"),
        _ => None,
    };
}

fn collada_sub_feature(parent: &str, element: &str) -> Option<&'static str> {
    return match (parent, element) {
        ("camera", "orthographic") => Some("Camera.Orthographic"),
        ("camera", "perspective") => Some("Camera.Perspective"),
        ("controller", "morph") => Some("Controller.Morph"),
        ("controller", "skin") => Some("Controller.Skin"),
        ("effect", "blinn") => Some("Effect.Blinn"),
        ("effect", "lambert") => Some("Effect.Lambert"),
        ("effect", "phong") => Some("Effect.Phong"),
        ("light", "ambient") => Some("Light.Ambient"),
        ("light", "directional") => Some("Light.Directional"),
        ("light", "point") => Some("Light.Point"),
        ("light", "spot") => Some("Light.Spot"),
        _ => None,
    };
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first census output, clear/fill retaining capacity; bool preserves null versus readable empty map
pub fn collect_collada_element_counts(out: &mut Vec<ColladaElementCount>, xml: &str) -> bool {
    out.clear();
    let Some(root) = parse_xml_document(xml) else {
        return false;
    };
    let root = Arc::new(RwLock::new(root));
    if collada_local_name(&root) != "COLLADA" {
        return false;
    }
    visit_collada_features(&root, &mut |feature| {
        if let Some(entry) = out.iter_mut().find(|entry| entry.feature == feature) {
            entry.count += 1;
        } else {
            out.push(ColladaElementCount {
                feature: feature.to_string(),
                count: 1,
            });
        }
    });
    return true;
}

// flight-lint: allow(conform-params) Principal21f7557f D24: required first ordered unique feature query output, clear/fill retaining capacity
pub fn collect_collada_features(out: &mut Vec<String>, xml: &str) {
    out.clear();
    let Some(root) = parse_xml_document(xml) else {
        return;
    };
    let root = Arc::new(RwLock::new(root));
    if collada_local_name(&root) != "COLLADA" {
        return;
    }
    visit_collada_features(&root, &mut |feature| {
        if !out.iter().any(|entry| entry == feature) {
            out.push(feature.to_string());
        }
    });
}

pub fn is_readable_collada(xml: &str) -> bool {
    let Some(root) = parse_xml_document(xml) else {
        return false;
    };
    return collada_local_name(&Arc::new(RwLock::new(root))) == "COLLADA";
}

pub fn parse_collada_requirements(xml: &str) -> RequirementSet {
    let mut features = Vec::new();
    collect_collada_features(&mut features, xml);
    features.sort();
    let mut requirements = Vec::new();
    for feature in features {
        requirements.push(Requirement {
            facet: RequirementFacet::DocumentFormat,
            key: format!("{COLLADA_REQUIREMENT_KEY_NAMESPACE}.{feature}"),
        });
        if let Some(entry) = COLLADA_FEATURE_SCENE_REQUIREMENTS
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

fn visit_collada_features(root: &Ref<XmlElement>, seen: &mut dyn FnMut(&str)) {
    walk_collada_element(root, &mut |element| {
        let name = collada_local_name(element);
        if let Some(feature) = collada_coarse_feature(&name) {
            seen(feature);
            if matches!(name.as_str(), "camera" | "controller" | "effect" | "light") {
                walk_collada_element(element, &mut |descendant| {
                    if let Some(feature) =
                        collada_sub_feature(&name, &collada_local_name(descendant))
                    {
                        seen(feature);
                    }
                });
            }
        }
    });
}

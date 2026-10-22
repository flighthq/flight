use crate::collada_parse::set_collada_index;
use crate::collada_scene_shared::ColladaIndexEntry;
use crate::collada_xml::parse_collada_floats;
use crate::obj_features::is_obj_whitespace;
use crate::shared::create_external_texture_ref;
use crate::stl_features::parse_stl_number;
use flight_color::{allocate_linear_color, pack_linear_to_color};
use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use flight_materials::contract::{
    create_standard_pbr_material, get_pbr_roughness_from_phong_shininess,
};
use flight_materials::{Material3D, MaterialAlphaMode, StandardPbrMaterial};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_texture::{Texture, TextureColorSpace, TextureUvTransform};
use flight_xml::XmlElement;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

pub fn append_collada_materials(
    root: &Ref<XmlElement>,
    materials: &mut Vec<Scene3DDocumentMaterial>,
    resources: &mut Vec<ImageResourceReference>,
    material_indices: &mut Vec<ColladaIndexEntry>,
    base_url: Option<&str>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) {
    let images = index_elements(root, "image");
    let effects = index_elements(root, "effect");
    let mut collada_material_missing_references = HashSet::new();
    for (_, effect) in &effects {
        for profile in &effect.read().unwrap().children {
            let name = local_name(profile);
            if name.starts_with("profile_") && name != "profile_COMMON" {
                report_import_diagnostic(
                    diagnostics.as_deref_mut(),
                    ImportDiagnosticSeverity::Skip,
                    "collada.unsupported-profile",
                    "appendColladaMaterials",
                    Some(HashMap::from([
                        (
                            "effect".to_string(),
                            ImportDiagnosticDetailValue::String(
                                attribute(effect, "id").unwrap_or_default(),
                            ),
                        ),
                        (
                            "profile".to_string(),
                            ImportDiagnosticDetailValue::String(name),
                        ),
                    ])),
                );
            }
        }
    }
    let mut sources = Vec::new();
    descendants(&mut sources, root, "material");
    for source in sources {
        let id = attribute(&source, "id")
            .unwrap_or_default()
            .trim_matches(is_obj_whitespace)
            .to_string();
        let instance = child(Some(&source), "instance_effect");
        let effect_id = reference_id(
            instance
                .as_ref()
                .and_then(|value| attribute(value, "url"))
                .as_deref(),
        );
        let effect = effect_id.as_ref().and_then(|id| lookup(&effects, id));
        let mut material = if let Some(effect) = effect {
            convert_effect(
                &effect,
                instance.as_ref(),
                &images,
                resources,
                base_url,
                diagnostics.as_deref_mut(),
                &mut collada_material_missing_references,
            )
        } else {
            if let Some(effect_id) = effect_id {
                missing_reference(
                    diagnostics.as_deref_mut(),
                    &mut collada_material_missing_references,
                    "effect",
                    &effect_id,
                    &id,
                );
            }
            create_standard_pbr_material()
        };
        material.name = attribute(&source, "name")
            .map(|name| name.trim_matches(is_obj_whitespace).to_string())
            .filter(|name| !name.is_empty())
            .or_else(|| (!id.is_empty()).then_some(id.clone()));
        let index = materials.len();
        materials.push(Scene3DDocumentMaterial::Entity(
            Scene3DDocumentMaterialEntity {
                material: Arc::new(RwLock::new(material)),
            },
        ));
        if !id.is_empty() {
            set_collada_index(material_indices, &id, index as i32);
        }
    }
}

fn append_parameters(
    out: &mut Vec<(String, Ref<XmlElement>)>,
    parent: &Ref<XmlElement>,
    element_name: &str,
    attribute_name: &str,
) {
    for parameter in &parent.read().unwrap().children {
        if local_name(parameter) != element_name {
            continue;
        }
        let Some(id) = attribute(parameter, attribute_name)
            .map(|id| id.trim_matches(is_obj_whitespace).to_string())
            .filter(|id| !id.is_empty())
        else {
            continue;
        };
        if let Some(entry) = out.iter_mut().find(|entry| entry.0 == id) {
            entry.1 = parameter.clone();
        } else {
            out.push((id, parameter.clone()));
        }
    }
}

fn attribute(element: &Ref<XmlElement>, name: &str) -> Option<String> {
    return element.read().unwrap().attributes.get(name).cloned();
}

fn child(element: Option<&Ref<XmlElement>>, name: &str) -> Option<Ref<XmlElement>> {
    return element?
        .read()
        .unwrap()
        .children
        .iter()
        .find(|entry| local_name(entry) == name)
        .cloned();
}

fn convert_effect(
    effect: &Ref<XmlElement>,
    instance: Option<&Ref<XmlElement>>,
    images: &[(String, Ref<XmlElement>)],
    resources: &mut Vec<ImageResourceReference>,
    base_url: Option<&str>,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    collada_material_missing_references: &mut HashSet<String>,
) -> StandardPbrMaterial {
    let profile = child(Some(effect), "profile_COMMON");
    let technique = child(profile.as_ref(), "technique");
    let shading = technique.as_ref().and_then(|technique| {
        technique
            .read()
            .unwrap()
            .children
            .iter()
            .find(|entry| matches!(local_name(entry).as_str(), "blinn" | "lambert" | "phong"))
            .cloned()
    });
    let (Some(profile), Some(technique), Some(shading)) = (profile, technique.clone(), shading)
    else {
        let declared = technique.as_ref().and_then(|technique| {
            technique
                .read()
                .unwrap()
                .children
                .iter()
                .find(|entry| {
                    matches!(
                        local_name(entry).as_str(),
                        "blinn" | "constant" | "lambert" | "phong"
                    )
                })
                .cloned()
        });
        if let Some(declared) = declared {
            report_import_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Skip,
                "collada.unsupported-shading-model",
                "appendColladaMaterials",
                Some(HashMap::from([
                    (
                        "effect".to_string(),
                        ImportDiagnosticDetailValue::String(
                            attribute(effect, "id").unwrap_or_default(),
                        ),
                    ),
                    (
                        "shadingModel".to_string(),
                        ImportDiagnosticDetailValue::String(local_name(&declared)),
                    ),
                ])),
            );
        }
        return create_standard_pbr_material();
    };
    let mut parameters = Vec::new();
    append_parameters(&mut parameters, &profile, "newparam", "sid");
    append_parameters(&mut parameters, &technique, "newparam", "sid");
    if let Some(instance) = instance {
        append_parameters(&mut parameters, instance, "setparam", "ref");
    }
    let diffuse_property = child(Some(&shading), "diffuse");
    let emission_property = child(Some(&shading), "emission");
    let mut diffuse = resolve_color(diffuse_property.as_ref(), &parameters, [1.0; 4]);
    let emission = resolve_color(
        emission_property.as_ref(),
        &parameters,
        [0.0, 0.0, 0.0, 1.0],
    );
    let transparent = child(Some(&shading), "transparent");
    let transparency = resolve_float(
        child(Some(&shading), "transparency").as_ref(),
        &parameters,
        1.0,
    );
    let transparent_color = resolve_color(transparent.as_ref(), &parameters, [1.0; 4]);
    let opacity = if transparent
        .as_ref()
        .and_then(|element| attribute(element, "opaque"))
        .as_deref()
        == Some("RGB_ZERO")
    {
        let luminance = transparent_color[0] * 0.212671
            + transparent_color[1] * 0.71516
            + transparent_color[2] * 0.072169;
        (1.0 - luminance * transparency).clamp(0.0, 1.0)
    } else {
        (transparent_color[3] * transparency).clamp(0.0, 1.0)
    };
    diffuse[3] *= opacity;
    let shininess = resolve_float(
        child(Some(&shading), "shininess").as_ref(),
        &parameters,
        0.0,
    );
    let base_color_map = resolve_texture(
        diffuse_property.as_ref(),
        effect,
        &parameters,
        images,
        resources,
        base_url,
        TextureColorSpace::Srgb,
        diagnostics.as_deref_mut(),
        collada_material_missing_references,
    );
    let emissive_map = resolve_texture(
        emission_property.as_ref(),
        effect,
        &parameters,
        images,
        resources,
        base_url,
        TextureColorSpace::Srgb,
        diagnostics.as_deref_mut(),
        collada_material_missing_references,
    );
    let normal = first_descendant(&profile, &["bump", "normal"]);
    let normal_map = resolve_texture(
        normal.as_ref(),
        effect,
        &parameters,
        images,
        resources,
        base_url,
        TextureColorSpace::Linear,
        diagnostics,
        collada_material_missing_references,
    );
    let mut material = create_standard_pbr_material();
    material.base_color = pack_color(diffuse);
    material.base_color_map = base_color_map;
    material.emissive = pack_color(emission);
    material.emissive_map = emissive_map;
    material.metallic = 0.0;
    material.normal_map = normal_map;
    material.roughness = if local_name(&shading) == "lambert" {
        1.0
    } else {
        get_pbr_roughness_from_phong_shininess(shininess)
    };
    material.material3d_fields_mut().alpha_mode =
        if transparent.is_some() || child(Some(&shading), "transparency").is_some() {
            MaterialAlphaMode::Blend
        } else {
            MaterialAlphaMode::Opaque
        };
    return material;
}

fn descendants(out: &mut Vec<Ref<XmlElement>>, element: &Ref<XmlElement>, name: &str) {
    for descendant in &element.read().unwrap().children {
        if local_name(descendant) == name {
            out.push(descendant.clone());
        }
        descendants(out, descendant, name);
    }
}

fn first_descendant(element: &Ref<XmlElement>, names: &[&str]) -> Option<Ref<XmlElement>> {
    for descendant in &element.read().unwrap().children {
        if names.contains(&local_name(descendant).as_str()) {
            return Some(descendant.clone());
        }
        if let Some(nested) = first_descendant(descendant, names) {
            return Some(nested);
        }
    }
    return None;
}

fn index_elements(root: &Ref<XmlElement>, name: &str) -> Vec<(String, Ref<XmlElement>)> {
    let mut matches = Vec::new();
    descendants(&mut matches, root, name);
    let mut indexed: Vec<(String, Ref<XmlElement>)> = Vec::new();
    for element in matches {
        let id = attribute(&element, "id")
            .unwrap_or_default()
            .trim_matches(is_obj_whitespace)
            .to_string();
        if !id.is_empty() && !indexed.iter().any(|entry| entry.0 == id) {
            indexed.push((id, element));
        }
    }
    return indexed;
}

fn local_name(element: &Ref<XmlElement>) -> String {
    let name = element.read().unwrap().name.clone();
    return name
        .rsplit_once(':')
        .map_or_else(|| name.clone(), |(_, local)| local.to_string());
}

fn lookup(entries: &[(String, Ref<XmlElement>)], id: &str) -> Option<Ref<XmlElement>> {
    return entries
        .iter()
        .find(|entry| entry.0 == id)
        .map(|entry| entry.1.clone());
}

fn missing_reference(
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    collada_material_missing_references: &mut HashSet<String>,
    element: &str,
    reference: &str,
    owner: &str,
) {
    if !collada_material_missing_references.insert(format!("{element}\0{reference}\0{owner}")) {
        return;
    }
    report_import_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Recover,
        "collada.missing-reference",
        "appendColladaMaterials",
        Some(HashMap::from([
            (
                "element".to_string(),
                ImportDiagnosticDetailValue::String(element.to_string()),
            ),
            (
                "owner".to_string(),
                ImportDiagnosticDetailValue::String(owner.to_string()),
            ),
            (
                "reference".to_string(),
                ImportDiagnosticDetailValue::String(reference.to_string()),
            ),
        ])),
    );
}

fn pack_color(values: [f32; 4]) -> u32 {
    let mut color = allocate_linear_color();
    color.r = values[0];
    color.g = values[1];
    color.b = values[2];
    color.a = values[3];
    return pack_linear_to_color(&color);
}

fn reference_id(value: Option<&str>) -> Option<String> {
    let value = value?.trim_matches(is_obj_whitespace);
    if value.is_empty() {
        return None;
    }
    return Some(
        value
            .rsplit_once('#')
            .map_or(value, |(_, id)| id)
            .to_string(),
    );
}

fn resolve_color(
    property: Option<&Ref<XmlElement>>,
    parameters: &[(String, Ref<XmlElement>)],
    fallback: [f32; 4],
) -> [f32; 4] {
    let Some(value) = resolve_property(property, parameters, &["color", "float3", "float4"]) else {
        return fallback;
    };
    let numbers = parse_collada_floats(&value.read().unwrap().text);
    return if numbers.len() < 3 {
        fallback
    } else {
        [
            numbers[0],
            numbers[1],
            numbers[2],
            numbers.get(3).copied().unwrap_or(1.0),
        ]
    };
}

// flight-lint: allow(f64) existing strict Number finite classification before canonical f32 write; no new double arithmetic
fn resolve_float(
    property: Option<&Ref<XmlElement>>,
    parameters: &[(String, Ref<XmlElement>)],
    fallback: f32,
) -> f32 {
    let Some(value) = resolve_property(property, parameters, &["float"]) else {
        return fallback;
    };
    let value = parse_stl_number(value.read().unwrap().text.trim_matches(is_obj_whitespace));
    return if value.is_finite() {
        value as f32
    } else {
        fallback
    };
}

fn resolve_property(
    property: Option<&Ref<XmlElement>>,
    parameters: &[(String, Ref<XmlElement>)],
    names: &[&str],
) -> Option<Ref<XmlElement>> {
    let property = property?;
    if let Some(direct) = property
        .read()
        .unwrap()
        .children
        .iter()
        .find(|entry| names.contains(&local_name(entry).as_str()))
        .cloned()
    {
        return Some(direct);
    }
    let parameter = child(Some(property), "param")?;
    let id = attribute(&parameter, "ref")?;
    let id = id.trim_matches(is_obj_whitespace);
    if id.is_empty() {
        return None;
    }
    let definition = lookup(parameters, id)?;
    return definition
        .read()
        .unwrap()
        .children
        .iter()
        .find(|entry| names.contains(&local_name(entry).as_str()))
        .cloned();
}

fn resolve_texture(
    property: Option<&Ref<XmlElement>>,
    effect: &Ref<XmlElement>,
    parameters: &[(String, Ref<XmlElement>)],
    images: &[(String, Ref<XmlElement>)],
    resources: &mut Vec<ImageResourceReference>,
    base_url: Option<&str>,
    color_space: TextureColorSpace,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    collada_material_missing_references: &mut HashSet<String>,
) -> Option<Ref<Texture>> {
    let texture_element = first_descendant(property?, &["texture"])?;
    let sampler_id = attribute(&texture_element, "texture")?;
    let sampler_id = sampler_id.trim_matches(is_obj_whitespace);
    if sampler_id.is_empty() {
        return None;
    }
    let owner = attribute(effect, "id").unwrap_or_default();
    let Some(sampler) = lookup(parameters, sampler_id) else {
        missing_reference(
            diagnostics,
            collada_material_missing_references,
            "sampler2D",
            sampler_id,
            &owner,
        );
        return None;
    };
    let surface_id = child(child(Some(&sampler), "sampler2D").as_ref(), "source")
        .map(|entry| {
            entry
                .read()
                .unwrap()
                .text
                .trim_matches(is_obj_whitespace)
                .to_string()
        })
        .unwrap_or_default();
    let Some(surface) = lookup(parameters, &surface_id) else {
        missing_reference(
            diagnostics,
            collada_material_missing_references,
            "surface",
            if surface_id.is_empty() {
                sampler_id
            } else {
                &surface_id
            },
            &owner,
        );
        return None;
    };
    let image_id = reference_id(
        child(child(Some(&surface), "surface").as_ref(), "init_from")
            .map(|entry| entry.read().unwrap().text.clone())
            .as_deref(),
    );
    let Some(image) = image_id.as_ref().and_then(|id| lookup(images, id)) else {
        missing_reference(
            diagnostics,
            collada_material_missing_references,
            "image",
            image_id.as_deref().unwrap_or(&surface_id),
            &owner,
        );
        return None;
    };
    let init_from = child(Some(&image), "init_from");
    let uri = init_from
        .as_ref()
        .map(|entry| {
            entry
                .read()
                .unwrap()
                .text
                .trim_matches(is_obj_whitespace)
                .to_string()
        })
        .filter(|uri| !uri.is_empty())
        .or_else(|| {
            child(init_from.as_ref(), "ref")
                .map(|entry| {
                    entry
                        .read()
                        .unwrap()
                        .text
                        .trim_matches(is_obj_whitespace)
                        .to_string()
                })
                .filter(|uri| !uri.is_empty())
        });
    let Some(uri) = uri else {
        missing_reference(
            diagnostics.as_deref_mut(),
            collada_material_missing_references,
            "image",
            image_id.as_deref().unwrap_or(""),
            &owner,
        );
        return None;
    };
    let texture = create_external_texture_ref(&uri, base_url, Some(resources));
    texture.write().unwrap().texture_fields_mut().color_space = color_space;
    return Some(texture);
}

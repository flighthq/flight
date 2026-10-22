use crate::obj_features::is_obj_whitespace;
use crate::obj_number::{parse_obj_float, parse_obj_integer};
use crate::obj_schema::{ObjMaterial, ObjMaterialEntry, ObjMaterialLibrary};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
    report_import_diagnostic,
};
use std::collections::HashMap;

struct MtlDropTally {
    key: String,
    count: usize,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
    kind: String,
    severity: ImportDiagnosticSeverity,
}

fn create_default_obj_material(name: &str) -> ObjMaterial {
    return ObjMaterial {
        ambient: [0.0; 3],
        anisotropy: None,
        anisotropy_rotation: None,
        clearcoat: None,
        clearcoat_roughness: None,
        diffuse: [0.8; 3],
        dissolve: 1.0,
        emissive: None,
        illumination: 2.0,
        map_ambient: None,
        map_bump: None,
        map_diffuse: None,
        map_dissolve: None,
        map_emissive: None,
        map_metallic: None,
        map_normal: None,
        map_roughness: None,
        map_specular: None,
        metallic: None,
        name: name.to_string(),
        roughness: None,
        sheen: None,
        specular: [0.0; 3],
        specular_exponent: 0.0,
    };
}

fn is_mtl_color(directive: &str) -> bool {
    return matches!(directive, "Ka" | "Kd" | "Ks" | "Ke");
}

fn is_mtl_map(directive: &str) -> bool {
    return matches!(
        directive,
        "map_Kd"
            | "map_Ka"
            | "map_Ks"
            | "map_Bump"
            | "bump"
            | "map_d"
            | "map_Ke"
            | "map_Pr"
            | "map_Pm"
            | "norm"
    );
}

fn is_mtl_scalar(directive: &str) -> bool {
    return matches!(
        directive,
        "Ns" | "d" | "Tr" | "illum" | "Pr" | "Pm" | "Ps" | "Pc" | "Pcr" | "aniso" | "anisor"
    );
}

// flight-lint: allow(f64) Foreman80958601 private MTL color components use parseFloat prefix/Number.isFinite before final canonical f32 material fields, including finite1e300 that narrows to Inf
fn parse_mtl_color(
    args: &str,
    drops: Option<&mut Vec<MtlDropTally>>,
    directive: &str,
    line_index: usize,
) -> Option<[f32; 3]> {
    let parts: Vec<&str> = args
        .split(is_obj_whitespace)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 3 {
        tally_mtl_color(drops, directive, line_index, "too-few-components");
        return None;
    }
    let components = [
        parse_obj_float(parts[0]),
        parse_obj_float(parts[1]),
        parse_obj_float(parts[2]),
    ];
    if let [Some(r), Some(g), Some(b)] = components {
        return Some([r as f32, g as f32, b as f32]);
    }
    tally_mtl_color(drops, directive, line_index, "non-numeric");
    return None;
}

// flight-lint: allow(f64) Foreman80958601 private MTL parseFloat/parseInt finite classification and source Tr=1-v complement occur before the final canonical f32 write; no other material arithmetic widens
fn parse_mtl_scalar(directive: &str, args: &str) -> Option<f32> {
    let value = if directive == "illum" {
        parse_obj_integer(args)
    } else {
        parse_obj_float(args)
    }?;
    return Some(if directive == "Tr" {
        (1.0 - value) as f32
    } else {
        value as f32
    });
}

pub fn parse_obj_material_library(
    source: &str,
    mut diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> ObjMaterialLibrary {
    let mut materials: Vec<ObjMaterialEntry> = Vec::new();
    let mut current: Option<usize> = None;
    let mut drops = diagnostics.is_some().then(Vec::<MtlDropTally>::new);
    for (line_index, line) in source.split('\n').enumerate() {
        let raw = line.trim_matches(is_obj_whitespace);
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let Some(space_index) = raw.find(' ') else {
            if raw == "newmtl" {
                tally_mtl_drop(
                    drops.as_mut(),
                    ImportDiagnosticSeverity::Drop,
                    "mtl.newmtl-no-name",
                    "",
                    HashMap::from([(
                        "firstLine".to_string(),
                        ImportDiagnosticDetailValue::Number((line_index + 1) as f32),
                    )]),
                );
            } else if is_mtl_color(raw) || is_mtl_scalar(raw) || is_mtl_map(raw) {
                if current.is_none() {
                    tally_mtl_directive_before_material(drops.as_mut(), raw, line_index);
                } else if is_mtl_color(raw) {
                    tally_mtl_color(drops.as_mut(), raw, line_index, "too-few-components");
                } else if is_mtl_scalar(raw) {
                    tally_mtl_invalid_value(drops.as_mut(), raw, line_index);
                } else {
                    tally_mtl_drop(
                        drops.as_mut(),
                        ImportDiagnosticSeverity::Drop,
                        "mtl.map-no-filename",
                        raw,
                        HashMap::from([
                            (
                                "directive".to_string(),
                                ImportDiagnosticDetailValue::String(raw.to_string()),
                            ),
                            (
                                "firstLine".to_string(),
                                ImportDiagnosticDetailValue::Number((line_index + 1) as f32),
                            ),
                        ]),
                    );
                }
            }
            continue;
        };
        let directive = &raw[..space_index];
        let args = raw[space_index + 1..].trim_matches(is_obj_whitespace);
        if directive == "newmtl" {
            let value = create_default_obj_material(args);
            if let Some(index) = materials.iter().position(|entry| entry.key == args) {
                materials[index].value = value;
                current = Some(index);
            } else {
                materials.push(ObjMaterialEntry {
                    key: args.to_string(),
                    value,
                });
                current = Some(materials.len() - 1);
            }
            continue;
        }
        if !is_mtl_color(directive) && !is_mtl_scalar(directive) && !is_mtl_map(directive) {
            continue;
        }
        let Some(index) = current else {
            tally_mtl_directive_before_material(drops.as_mut(), directive, line_index);
            continue;
        };
        let material = &mut materials[index].value;
        if is_mtl_color(directive) {
            if let Some(color) = parse_mtl_color(args, drops.as_mut(), directive, line_index) {
                match directive {
                    "Ka" => material.ambient = color,
                    "Kd" => material.diffuse = color,
                    "Ks" => material.specular = color,
                    _ => material.emissive = Some(color),
                }
            }
        } else if is_mtl_scalar(directive) {
            if let Some(value) = parse_mtl_scalar(directive, args) {
                match directive {
                    "Ns" => material.specular_exponent = value,
                    "d" | "Tr" => material.dissolve = value,
                    "illum" => material.illumination = value,
                    "Pr" => material.roughness = Some(value),
                    "Pm" => material.metallic = Some(value),
                    "Ps" => material.sheen = Some(value),
                    "Pc" => material.clearcoat = Some(value),
                    "Pcr" => material.clearcoat_roughness = Some(value),
                    "aniso" => material.anisotropy = Some(value),
                    _ => material.anisotropy_rotation = Some(value),
                }
            } else {
                tally_mtl_invalid_value(drops.as_mut(), directive, line_index);
            }
        } else {
            let value = Some(args.to_string());
            match directive {
                "map_Kd" => material.map_diffuse = value,
                "map_Ka" => material.map_ambient = value,
                "map_Ks" => material.map_specular = value,
                "map_Bump" | "bump" => material.map_bump = value,
                "map_d" => material.map_dissolve = value,
                "map_Ke" => material.map_emissive = value,
                "map_Pr" => material.map_roughness = value,
                "map_Pm" => material.map_metallic = value,
                _ => material.map_normal = value,
            }
        }
    }
    if let Some(drops) = drops {
        for mut tally in drops {
            tally.detail.insert(
                "count".to_string(),
                ImportDiagnosticDetailValue::Number(tally.count as f32),
            );
            report_import_diagnostic(
                diagnostics.as_deref_mut(),
                tally.severity,
                &tally.kind,
                "parseObjMaterialLibrary",
                Some(tally.detail),
            );
        }
    }
    return ObjMaterialLibrary { materials };
}

fn tally_mtl_color(
    drops: Option<&mut Vec<MtlDropTally>>,
    directive: &str,
    line_index: usize,
    reason: &str,
) {
    tally_mtl_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "mtl.color-malformed",
        reason,
        HashMap::from([
            (
                "firstDirective".to_string(),
                ImportDiagnosticDetailValue::String(directive.to_string()),
            ),
            (
                "firstLine".to_string(),
                ImportDiagnosticDetailValue::Number((line_index + 1) as f32),
            ),
            (
                "reason".to_string(),
                ImportDiagnosticDetailValue::String(reason.to_string()),
            ),
        ]),
    );
}

fn tally_mtl_directive_before_material(
    drops: Option<&mut Vec<MtlDropTally>>,
    directive: &str,
    line_index: usize,
) {
    tally_mtl_drop(
        drops,
        ImportDiagnosticSeverity::Drop,
        "mtl.directive-before-material",
        "",
        HashMap::from([
            (
                "firstDirective".to_string(),
                ImportDiagnosticDetailValue::String(directive.to_string()),
            ),
            (
                "firstLine".to_string(),
                ImportDiagnosticDetailValue::Number((line_index + 1) as f32),
            ),
        ]),
    );
}

fn tally_mtl_drop(
    drops: Option<&mut Vec<MtlDropTally>>,
    severity: ImportDiagnosticSeverity,
    kind: &str,
    discriminator: &str,
    detail: HashMap<String, ImportDiagnosticDetailValue>,
) {
    let Some(drops) = drops else {
        return;
    };
    let key = format!("{kind}|{discriminator}");
    if let Some(existing) = drops.iter_mut().find(|entry| entry.key == key) {
        existing.count += 1;
    } else {
        drops.push(MtlDropTally {
            key,
            count: 1,
            detail,
            kind: kind.to_string(),
            severity,
        });
    }
}

fn tally_mtl_invalid_value(
    drops: Option<&mut Vec<MtlDropTally>>,
    directive: &str,
    line_index: usize,
) {
    tally_mtl_drop(
        drops,
        ImportDiagnosticSeverity::Recover,
        "mtl.invalid-value",
        directive,
        HashMap::from([
            (
                "directive".to_string(),
                ImportDiagnosticDetailValue::String(directive.to_string()),
            ),
            (
                "firstLine".to_string(),
                ImportDiagnosticDetailValue::Number((line_index + 1) as f32),
            ),
        ]),
    );
}

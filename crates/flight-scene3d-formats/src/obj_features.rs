use std::sync::LazyLock;

pub struct ObjFeatureDirectives {
    pub feature: String,
    pub directives: Vec<String>,
}

pub static OBJ_FEATURE_DIRECTIVES: LazyLock<Vec<ObjFeatureDirectives>> = LazyLock::new(|| {
    vec![
        ObjFeatureDirectives {
            feature: "Face".to_string(),
            directives: vec!["f".to_string()],
        },
        ObjFeatureDirectives {
            feature: "Line".to_string(),
            directives: vec!["l".to_string()],
        },
        ObjFeatureDirectives {
            feature: OBJ_MATERIAL_FEATURE.to_string(),
            directives: vec!["usemtl".to_string(), "mtllib".to_string()],
        },
        ObjFeatureDirectives {
            feature: "Point".to_string(),
            directives: vec!["p".to_string()],
        },
    ]
});
pub const OBJ_MATERIAL_FEATURE: &str = "Material";

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn collect_obj_features(out: &mut Vec<String>, source: &str) {
    out.clear();
    for raw in source.split('\n') {
        let raw = raw.trim_start_matches(is_obj_whitespace);
        if raw.is_empty() || raw.starts_with('#') {
            continue;
        }
        let directive = raw.split(is_obj_whitespace).next().unwrap_or("");
        if let Some(entry) = OBJ_FEATURE_DIRECTIVES
            .iter()
            .find(|entry| entry.directives.iter().any(|value| value == directive))
        {
            if !out.contains(&entry.feature) {
                out.push(entry.feature.clone());
                if out.len() == OBJ_FEATURE_DIRECTIVES.len() {
                    break;
                }
            }
        }
    }
    return;
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn collect_obj_material_library_references(out: &mut Vec<String>, source: &str) {
    out.clear();
    for raw in source.split('\n') {
        let line = raw.trim_matches(is_obj_whitespace);
        if line.is_empty() || line.starts_with('#') || !line.starts_with("mtllib") {
            continue;
        }
        for path in line[6..]
            .trim_matches(is_obj_whitespace)
            .split(is_obj_whitespace)
        {
            if !path.is_empty() && !out.iter().any(|value| value == path) {
                out.push(path.to_string());
            }
        }
    }
    return;
}

pub(crate) fn is_obj_whitespace(value: char) -> bool {
    return matches!(
        value,
        '\t' | '\n' | '\u{000b}' | '\u{000c}' | '\r' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    );
}

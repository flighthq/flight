use crate::stl_features::is_stl_whitespace;

pub const MD5_MESH_FEATURE_NAMES: [&str; 3] = ["Skeleton", "Mesh", "Material"];

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn collect_md5_mesh_features(out: &mut Vec<String>, source: &str) {
    out.clear();
    let mut in_mesh = false;
    for line in source.split('\n') {
        let line = line.trim_matches(is_stl_whitespace);
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if line == "joints {" {
            if !out.iter().any(|feature| feature == "Skeleton") {
                out.push("Skeleton".to_string());
            }
            continue;
        }
        if line == "mesh {" {
            if !out.iter().any(|feature| feature == "Mesh") {
                out.push("Mesh".to_string());
            }
            in_mesh = true;
            continue;
        }
        if in_mesh {
            if line == "}" {
                in_mesh = false;
                continue;
            }
            if line.starts_with("shader") {
                if let Some(start) = line.find('"') {
                    if line[start + 1..].find('"').is_some_and(|end| end > 0)
                        && !out.iter().any(|feature| feature == "Material")
                    {
                        out.push("Material".to_string());
                    }
                }
            }
        }
    }
    return;
}

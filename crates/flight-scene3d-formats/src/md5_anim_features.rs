use crate::stl_features::is_stl_whitespace;

pub const MD5_ANIM_FEATURE_NAMES: [&str; 2] = ["Hierarchy", "Animation"];

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn collect_md5_anim_features(out: &mut Vec<String>, source: &str) {
    out.clear();
    for line in source.split('\n') {
        let line = line.trim_matches(is_stl_whitespace);
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        if line == "hierarchy {" {
            if !out.iter().any(|feature| feature == "Hierarchy") {
                out.push("Hierarchy".to_string());
            }
            continue;
        }
        if line.starts_with("frame ") && line.ends_with('{') {
            if !out.iter().any(|feature| feature == "Animation") {
                out.push("Animation".to_string());
            }
            if out.len() == 2 {
                break;
            }
        }
    }
    return;
}

use crate::md2_schema::{MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION};
use flight_entity::Uint8Array;

pub const MD2_FEATURE_NAMES: [&str; 3] = ["Mesh", "Material", "Animation"];

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned output; boolean retains the source nullable-result success distinction
pub fn collect_md2_features(out: &mut Vec<String>, source: &Uint8Array) -> bool {
    out.clear();
    if source.len() < MD2_HEADER_SIZE {
        return false;
    }
    let read = |offset| i32::from_le_bytes(source[offset..offset + 4].try_into().unwrap());
    if read(0) != MD2_MAGIC || read(4) != MD2_VERSION {
        return false;
    }
    let skins = read(20);
    let triangles = read(32);
    let frames = read(40);
    if skins < 0 || triangles < 0 || frames < 0 {
        return false;
    }
    if triangles > 0 && frames > 0 {
        out.push("Mesh".to_string());
    }
    if skins > 0 {
        out.push("Material".to_string());
    }
    if frames > 1 {
        out.push("Animation".to_string());
    }
    return true;
}

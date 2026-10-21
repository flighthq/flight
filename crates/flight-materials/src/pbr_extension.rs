use crate::PbrExtension;

pub fn get_pbr_extension_kind(extension: &PbrExtension) -> &str {
    return match extension {
        PbrExtension::Anisotropy(e) => &e.kind,
        PbrExtension::Clearcoat(e) => &e.kind,
        PbrExtension::Iridescence(e) => &e.kind,
        PbrExtension::Sheen(e) => &e.kind,
        PbrExtension::Specular(e) => &e.kind,
        PbrExtension::TransmissionVolume(e) => &e.kind,
        PbrExtension::WrappedDiffuse(e) => &e.kind,
    };
}

pub fn is_valid_pbr_uv_set(value: u32) -> bool {
    return value == 0 || value == 1;
}

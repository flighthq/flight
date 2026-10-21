use flight_entity::Uint8Array;

use crate::types::TextureContainerKind;

pub fn detect_texture_container(bytes: &Uint8Array) -> Option<TextureContainerKind> {
    if bytes.starts_with(&KTX2_MAGIC) {
        return Some(TextureContainerKind::Ktx2);
    }
    if bytes.starts_with(b"DDS ") {
        return Some(TextureContainerKind::Dds);
    }
    if bytes.starts_with(b"ATF") {
        return Some(TextureContainerKind::Atf);
    }
    if bytes.starts_with(&[0x73, 0x42]) {
        return Some(TextureContainerKind::Basis);
    }
    return None;
}

const KTX2_MAGIC: [u8; 12] = [
    0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
];

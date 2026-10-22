//! Host capability explanations for the capability groups this crate owns (`imageDecode`,
//! `imageEncode`), redistributed from the former aggregate host (D26; TS `hostExplain.ts`). Each
//! explainer appends to a caller-owned explanation, so a host provider composes its own host's
//! explanation; there is no aggregate.

use flight_host::{HostCapabilityGroupExplanation, HostExplanation};

use crate::{HostImageDecodeCapabilities, HostImageEncodeCapabilities};

/// Appends the `imageDecode` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.imageDecode`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the imageDecode group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_image_decode_capabilities(
    out: &mut HostExplanation,
    image_decode: &HostImageDecodeCapabilities,
) {
    let mut slots = Vec::new();
    if image_decode.avif.is_some() {
        slots.push("avif".to_string());
    }
    if image_decode.bmp.is_some() {
        slots.push("bmp".to_string());
    }
    if image_decode.gif.is_some() {
        slots.push("gif".to_string());
    }
    if image_decode.jpeg.is_some() {
        slots.push("jpeg".to_string());
    }
    if image_decode.png.is_some() {
        slots.push("png".to_string());
    }
    if image_decode.webp.is_some() {
        slots.push("webp".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "imageDecode".to_string(),
        slots,
    });
}

/// Appends the `imageEncode` group and its filled slot names, in source property order, to a host
/// explanation (TS `explainHost` over `host.imageEncode`). A host provider composes its host's
/// explanation by calling each group's explainer in group order.
// flight-lint: allow(conform-extra) D26: the imageEncode group's share of the former aggregate explainHost, owned by its feature
pub fn explain_host_image_encode_capabilities(
    out: &mut HostExplanation,
    image_encode: &HostImageEncodeCapabilities,
) {
    let mut slots = Vec::new();
    if image_encode.jpeg.is_some() {
        slots.push("jpeg".to_string());
    }
    if image_encode.png.is_some() {
        slots.push("png".to_string());
    }
    if image_encode.webp.is_some() {
        slots.push("webp".to_string());
    }
    out.groups.push(HostCapabilityGroupExplanation {
        group: "imageEncode".to_string(),
        slots,
    });
}

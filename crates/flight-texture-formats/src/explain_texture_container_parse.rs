use flight_entity::Uint8Array;

use crate::detect_texture_container::detect_texture_container;
use crate::parse_atf::get_atf_parse_failure_reason;
use crate::parse_basis::get_basis_parse_failure_reason;
use crate::parse_dds::get_dds_parse_failure_reason;
use crate::parse_ktx2::get_ktx2_parse_failure_reason;
use crate::types::{
    TextureContainerKind, TextureContainerParseExplanation, TextureContainerParseFailureReason,
};

pub fn explain_texture_container_parse(
    bytes: &Uint8Array,
) -> Option<TextureContainerParseExplanation> {
    let Some(container) = detect_texture_container(bytes) else {
        return Some(TextureContainerParseExplanation {
            container: None,
            reason: TextureContainerParseFailureReason::ContainerUnrecognized,
        });
    };
    let reason = match container {
        TextureContainerKind::Atf => get_atf_parse_failure_reason(bytes),
        TextureContainerKind::Basis => get_basis_parse_failure_reason(bytes),
        TextureContainerKind::Dds => get_dds_parse_failure_reason(bytes),
        TextureContainerKind::Ktx2 => get_ktx2_parse_failure_reason(bytes),
    };
    return reason.map(|reason| TextureContainerParseExplanation {
        container: Some(container),
        reason,
    });
}

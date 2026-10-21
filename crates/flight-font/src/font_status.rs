use flight_entity::Unknown;

use crate::font_shorthand::get_font_shorthand;
use crate::types::*;

/// Reports whether the host has a face matching the exact family/style shorthand.
pub fn is_font_loaded(
    backend: &HostFontLoadingCapability,
    family: &str,
    style: Option<&str>,
) -> bool {
    return (backend.check_font_face)(&get_font_shorthand(family, style));
}

/// Resolves when the host's registered-font set is ready, preserving any rejection unchanged.
pub async fn when_fonts_ready(backend: &HostFontLoadingCapability) -> Result<(), Unknown> {
    return (backend.when_ready)().await;
}

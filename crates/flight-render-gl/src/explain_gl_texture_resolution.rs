// flight-lint: allow-file(contract-vocabulary) D17 texture dispatch consumes the native open TextureVariant contract

use flight_render::{TextureResolutionExplanation, TextureResolutionStatus};
use flight_texture::{TextureVariant, get_texture_source_kind};

use crate::GlRenderState;

pub fn explain_gl_texture_resolution(
    state: &GlRenderState,
    texture: &dyn TextureVariant,
) -> TextureResolutionExplanation {
    let kind = get_texture_source_kind(texture);
    let Some(kind) = kind else {
        return TextureResolutionExplanation {
            kind: None,
            status: TextureResolutionStatus::MissingKind,
        };
    };
    let status = if state
        .gl_registries
        .texture_resolvers
        .entries
        .contains_key(&kind)
    {
        TextureResolutionStatus::Registered
    } else {
        TextureResolutionStatus::MissingResolver
    };
    return TextureResolutionExplanation {
        kind: Some(kind),
        status,
    };
}

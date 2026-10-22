// flight-lint: allow-file(contract-vocabulary) D17: render-wgpu contracts carry native wgpu values and Rust callback/trait-object forms of the TS GPU* and closure types
//! Texture-resolution diagnostics (TS `explainWgpuTextureResolution.ts`).

use flight_render::{TextureResolutionExplanation, TextureResolutionStatus};
use flight_texture::{TextureVariant, get_texture_source_kind};

use crate::types::*;

/// Whether a texture's source kind has a registered resolver on this state (TS
/// `explainWgpuTextureResolution`).
pub fn explain_wgpu_texture_resolution(
    state: &WgpuRenderState,
    texture: &dyn TextureVariant,
) -> TextureResolutionExplanation {
    let Some(kind) = get_texture_source_kind(texture) else {
        return TextureResolutionExplanation {
            kind: None,
            status: TextureResolutionStatus::MissingKind,
        };
    };
    let registered = state
        .runtime
        .registries
        .texture_resolvers
        .entries
        .contains_key(&kind);
    return TextureResolutionExplanation {
        kind: Some(kind),
        status: if registered {
            TextureResolutionStatus::Registered
        } else {
            TextureResolutionStatus::MissingResolver
        },
    };
}

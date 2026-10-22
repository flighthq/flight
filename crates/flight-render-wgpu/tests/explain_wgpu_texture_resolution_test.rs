use flight_entity::Ref;
use flight_render::{TextureResolutionExplanation, TextureResolutionStatus};
use flight_render_wgpu::*;
use flight_texture::{TextureColorSpace, TextureVariant, create_texture};

use crate::support::*;

fn resolve_nothing(
    _state: &mut WgpuRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<Ref<WgpuTextureEntry>> {
    return None;
}

mod explain_wgpu_texture_resolution {
    use super::*;

    #[test]
    fn distinguishes_missing_kinds_missing_resolvers_and_registered_resolvers() {
        let mut state = create_wgpu_render_state_for_test(None);
        let texture = create_test_texture_with_kind("acme.test", 1, 1);

        assert_eq!(
            explain_wgpu_texture_resolution(&state, &create_texture(None)),
            TextureResolutionExplanation {
                kind: None,
                status: TextureResolutionStatus::MissingKind,
            }
        );
        assert_eq!(
            explain_wgpu_texture_resolution(&state, &texture),
            TextureResolutionExplanation {
                kind: Some("acme.test".to_string()),
                status: TextureResolutionStatus::MissingResolver,
            }
        );

        register_wgpu_texture_resolver(&mut state, "acme.test".to_string(), Some(resolve_nothing));
        assert_eq!(
            explain_wgpu_texture_resolution(&state, &texture),
            TextureResolutionExplanation {
                kind: Some("acme.test".to_string()),
                status: TextureResolutionStatus::Registered,
            }
        );
    }
}

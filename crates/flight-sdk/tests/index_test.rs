// TS `sdk/src/index.test.ts` ("package exports"): each check that an export is a function becomes a
// typed function binding, so the test also pins the export's signature.
use flight_sdk::*;

mod adjustments_domain {
    use super::*;

    #[test]
    fn exports_create_identity_color_matrix() {
        let create: fn() -> [f32; 20] = create_identity_color_matrix;
        assert_eq!(create()[0], 1.0);
    }
}

mod application_domain {
    use super::*;

    #[test]
    fn exports_create_app_loop() {
        let _: fn() -> Ref<AppLoop> = create_app_loop;
    }

    #[test]
    fn exports_create_app_window() {
        let _: fn() -> Ref<AppWindow> = create_app_window;
    }
}

mod display_object_domain {
    use super::*;

    #[test]
    fn exports_sprite_kind_with_expected_value() {
        assert_eq!(SPRITE_KIND, "Sprite");
    }

    #[test]
    fn exports_create_sprite() {
        let _: fn() -> Ref<Sprite> = create_sprite;
    }

    #[test]
    fn exports_create_display_object() {
        let _: fn() -> Ref<DisplayObject> = create_display_object;
    }

    #[test]
    fn exports_display_object_kind_with_expected_value() {
        assert_eq!(DISPLAY_OBJECT_KIND, "DisplayObject");
    }
}

mod effects_domain {
    use super::*;

    #[test]
    fn exports_create_bloom_effect() {
        let _: fn() -> Ref<BloomEffect> = create_bloom_effect;
    }
}

mod geometry_domain {
    use super::*;

    #[test]
    fn exports_create_matrix() {
        let _: fn(f32, f32, f32, f32, f32, f32) -> Matrix = create_matrix;
    }

    #[test]
    fn exports_create_rectangle() {
        let _: fn(f32, f32, f32, f32) -> Rectangle = create_rectangle;
    }
}

mod particles_domain {
    use super::*;

    #[test]
    fn exports_create_particle_emitter_config() {
        let _ = create_particle_emitter_config;
    }

    #[test]
    fn exports_particle_emitter_2d_kind_with_expected_value() {
        assert_eq!(PARTICLE_EMITTER_2D_KIND, "ParticleEmitter2D");
    }
}

mod render_domain {
    use super::*;

    #[cfg(feature = "gl")]
    #[test]
    fn exports_create_gl_render_state() {
        let _ = create_gl_render_state;
    }

    #[test]
    fn exports_register_node_renderer() {
        let _: fn(&mut BaseRenderState, Kind, &'static NodeRenderer<BaseRenderState>) =
            register_node_renderer::<BaseRenderState>;
    }
}

mod sprite_domain {
    use super::*;

    #[test]
    fn exports_create_sprite() {
        let _: fn() -> Ref<Sprite> = create_sprite;
    }

    #[test]
    fn exports_sprite_kind_with_expected_value() {
        assert_eq!(SPRITE_KIND, "Sprite");
    }
}

mod text_domain {
    use super::*;

    #[test]
    fn exports_create_text_label() {
        assert!(create_text_label(None).read().is_ok());
    }

    #[test]
    fn exports_text_label_kind_with_expected_value() {
        assert_eq!(TEXT_LABEL_KIND, "TextLabel");
    }
}

mod timeline_tween_domain {
    use super::*;

    #[test]
    fn exports_create_tween() {
        let _ = create_tween::<Vector2>;
    }

    #[test]
    fn exports_create_tween_manager() {
        let _: fn(Option<&TweenManagerOptions>) -> TweenManager = create_tween_manager;
    }
}

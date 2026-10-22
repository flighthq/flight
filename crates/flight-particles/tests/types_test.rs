use flight_particles::*;

mod create_signal {
    use super::*;

    #[test]
    fn returns_a_default_signal() {
        let s = create_signal();
        assert_eq!(s, Signal {});
    }
}

// flight-lint: allow(test-method-call) calls the free function particle_blend_mode_as_str, not the impl method; lint matches substring
mod particle_blend_mode_as_str {
    use super::*;

    #[test]
    fn add_roundtrips_through_as_str() {
        assert_eq!(particle_blend_mode_as_str(ParticleBlendMode::Add), "add");
    }

    #[test]
    fn multiply_roundtrips_through_as_str() {
        assert_eq!(particle_blend_mode_as_str(ParticleBlendMode::Multiply), "multiply");
    }

    #[test]
    fn normal_roundtrips_through_as_str() {
        assert_eq!(particle_blend_mode_as_str(ParticleBlendMode::Normal), "normal");
    }

    #[test]
    fn screen_roundtrips_through_as_str() {
        assert_eq!(particle_blend_mode_as_str(ParticleBlendMode::Screen), "screen");
    }

    #[test]
    fn config_default_blend_mode_is_none() {
        let config = create_particle_emitter_config(None);
        assert!(config.blend_mode.is_none());
    }

    #[test]
    fn options_default_blend_mode_is_absent() {
        let opts = create_particle_emitter_config_options();
        assert!(opts.blend_mode.is_none());
    }

    #[test]
    fn options_explicit_null_is_some_none() {
        let opts = ParticleEmitterConfigOptions {
            blend_mode: Some(None),
            ..create_particle_emitter_config_options()
        };
        assert_eq!(opts.blend_mode, Some(None));
        let config = create_particle_emitter_config(Some(&opts));
        assert!(config.blend_mode.is_none());
    }

    #[test]
    fn options_typed_value_resolves_to_config() {
        let opts = ParticleEmitterConfigOptions {
            blend_mode: Some(Some(ParticleBlendMode::Screen)),
            ..create_particle_emitter_config_options()
        };
        let config = create_particle_emitter_config(Some(&opts));
        assert_eq!(config.blend_mode, Some(ParticleBlendMode::Screen));
    }

    #[test]
    fn all_four_variants_are_distinct() {
        let variants = [
            ParticleBlendMode::Add,
            ParticleBlendMode::Multiply,
            ParticleBlendMode::Normal,
            ParticleBlendMode::Screen,
        ];
        for i in 0..variants.len() {
            for j in (i + 1)..variants.len() {
                assert_ne!(variants[i], variants[j]);
            }
        }
    }

    #[test]
    fn enum_is_copy() {
        let a = ParticleBlendMode::Add;
        let b = a;
        assert_eq!(a, b);
    }
}

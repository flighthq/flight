use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

mod serialize_libgdx_particle {
    use super::*;

    #[test]
    fn writes_the_header_count_and_sections_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let text = serialize_libgdx_particle(&config, None, None);
        assert!(text.starts_with("Particle Effect"));
        assert!(text.contains("maxParticleCount: 1000"));
        assert!(text.contains("Tint\ncolors: ffffff,ffffff"));
    }

    #[test]
    fn round_trips_counts_lifetime_and_blend_through_the_parser() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 321.0;
        config.lifetime_min = 0.25;
        config.lifetime_max = 0.75;
        config.blend_mode = Some(String::from("add"));
        let text = serialize_libgdx_particle(&config, None, None);
        let parsed = parse_libgdx_particle(&text, None);
        assert_eq!(parsed.max_particles, 321.0);
        assert_eq!(parsed.lifetime_min, 0.25);
        assert_eq!(parsed.lifetime_max, 0.75);
        assert_eq!(parsed.blend_mode.as_deref(), Some("add"));
    }
}

mod serialize_libgdx_particle_document {
    use super::*;

    #[test]
    fn warns_about_unsupported_tint_and_bursts() {
        let mut config = create_particle_emitter_config(None);
        config.color_curve = Some(vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
        config.burst_count = 5.0;
        let result = serialize_libgdx_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("Color curve"))
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("bursts"))
        );
    }
}

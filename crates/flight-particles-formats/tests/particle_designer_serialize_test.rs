use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

mod serialize_particle_designer_plist {
    use super::*;

    #[test]
    fn writes_a_plist_with_integer_and_real_keys() {
        let config = create_particle_emitter_config(None);
        let text = serialize_particle_designer_plist(&config, None, None);
        assert!(text.starts_with("<?xml version=\"1.0\" encoding=\"utf-8\"?>"));
        assert!(text.contains("<key>maxParticles</key>"));
        assert!(text.contains("<integer>1000</integer>"));
        assert!(text.contains("<key>particleLifespan</key>"));
    }

    #[test]
    fn round_trips_counts_and_lifespan_through_the_parser() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 64.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 1.5;
        let text = serialize_particle_designer_plist(&config, None, None);
        let parsed = parse_particle_designer_plist(&text, None);
        assert_eq!(parsed.max_particles, 64.0);
        assert_eq!(parsed.lifetime_min, 0.5);
        assert_eq!(parsed.lifetime_max, 1.5);
    }
}

mod serialize_particle_designer_plist_document {
    use super::*;

    #[test]
    fn warns_about_a_scale_curve_and_unknown_blend_mode() {
        let mut config = create_particle_emitter_config(None);
        config.scale_curve = Some(vec![1.0, 0.5, 0.0]);
        config.blend_mode = Some(String::from("multiply"));
        let result = serialize_particle_designer_plist_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("Scale curve"))
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("Blend mode"))
        );
    }
}

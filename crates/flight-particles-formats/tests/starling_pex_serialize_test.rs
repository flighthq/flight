use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

mod serialize_starling_pex {
    use super::*;

    #[test]
    fn writes_attribute_style_xml() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 64.0;
        let text = serialize_starling_pex(&config, None, None);
        assert!(text.starts_with("<?xml version=\"1.0\" encoding=\"utf-8\"?>"));
        assert!(text.contains("<attribute name=\"maxParticles\" value=\"64\"/>"));
        assert!(text.contains("<attribute name=\"startColor\" red="));
    }

    #[test]
    fn round_trips_counts_and_lifespan_through_the_parser() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 64.0;
        config.lifetime_min = 0.5;
        config.lifetime_max = 1.5;
        let text = serialize_starling_pex(&config, None, None);
        let parsed = parse_starling_pex(&text, None);
        assert_eq!(parsed.max_particles, 64.0);
        assert_eq!(parsed.lifetime_min, 0.5);
        assert_eq!(parsed.lifetime_max, 1.5);
    }
}

mod serialize_starling_pex_document {
    use super::*;

    #[test]
    fn warns_about_color_curves_and_unknown_blend_modes() {
        let mut config = create_particle_emitter_config(None);
        config.color_curve = Some(vec![1.0, 1.0, 1.0, 0.0, 0.0, 0.0]);
        config.blend_mode = Some(String::from("multiply"));
        let result = serialize_starling_pex_document(&config, None, None);
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
                .any(|warning| warning.contains("Blend mode"))
        );
    }
}

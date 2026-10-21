use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

mod serialize_spine_particle {
    use super::*;

    #[test]
    fn produces_valid_json_that_round_trips_counts() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 300.0;
        config.lifetime_min = 0.4;
        config.lifetime_max = 0.8;
        let text = serialize_spine_particle(&config, None);
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid json");
        assert_eq!(parsed["maxParticles"], 300.0);
        let reparsed = parse_spine_particle(&text);
        assert_eq!(reparsed.max_particles, 300.0);
        assert_eq!(reparsed.lifetime_min, 0.4);
    }

    #[test]
    fn preserves_the_existing_document_name() {
        let source = "{\"name\":\"spark\",\"continuous\":true,\"emission\":{\"low\":1,\"high\":1}}";
        let document = parse_spine_particle_document(source).document;
        let text = serialize_spine_particle(&create_particle_emitter_config(None), Some(&document));
        assert!(text.contains("\"name\": \"spark\""));
    }
}

mod serialize_spine_particle_document {
    use super::*;

    #[test]
    fn warns_for_bursts_and_color_variance() {
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 3.0;
        config.color_start_variance_r = 0.1;
        let result = serialize_spine_particle_document(&config, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("bursts"))
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("colorStartVariance"))
        );
    }
}

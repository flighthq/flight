use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

mod serialize_unity_particle {
    use super::*;

    #[test]
    fn writes_the_expected_camel_case_document() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 100.0;
        config.lifetime_min = 1.0;
        config.lifetime_max = 2.0;
        let text = serialize_unity_particle(&config, None, None);
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid json");
        assert_eq!(parsed["maxParticles"], 100.0);
        assert_eq!(parsed["startLifetime"]["mode"], "twoConstants");
        assert_eq!(parsed["colorOverLifetime"]["enabled"], true);
    }

    #[test]
    fn round_trips_lifetime_and_speed_through_the_parser() {
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 1.0;
        config.lifetime_max = 2.0;
        config.speed_min = 5.0;
        config.speed_max = 10.0;
        let text = serialize_unity_particle(&config, None, None);
        let parsed = parse_unity_particle(&text, None);
        assert_eq!(parsed.lifetime_min, 1.0);
        assert_eq!(parsed.lifetime_max, 2.0);
        assert_eq!(parsed.speed_min, 5.0);
        assert_eq!(parsed.speed_max, 10.0);
    }
}

mod serialize_unity_particle_document {
    use super::*;

    #[test]
    fn warns_for_gravity_x_variance_and_inheritance() {
        let mut config = create_particle_emitter_config(None);
        config.gravity_x = 1.0;
        config.velocity_inheritance = 0.5;
        config.color_start_variance_g = 0.1;
        let result = serialize_unity_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("gravityX"))
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("velocityInheritance"))
        );
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("colorStartVariance"))
        );
    }
}

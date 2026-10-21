use std::sync::Arc;

use flight_particles_formats::contract::*;

const LIBGDX: &str = "Particle Effect\n- Spark -\nmaxParticleCount: 10\n";

fn registry() -> ParticleFormatRegistry {
    let mut registry = create_particle_format_registry();
    register_particle_format(
        &mut registry,
        "libgdx",
        ParticleFormatCodec {
            detect: Arc::new(|text| text.starts_with("Particle Effect")),
            parse_to_config: Arc::new(|_text, _options| {
                let mut config = flight_particles::create_particle_emitter_config(None);
                config.max_particles = 7.0;
                return config;
            }),
            parse_to_document: Arc::new(|_text, _options| ParticleFormatParseDocumentResult {
                config: flight_particles::create_particle_emitter_config(None),
                diagnostics: Vec::new(),
            }),
            serialize: None,
        },
    );
    return registry;
}

mod parse_particle_config {
    use super::*;

    #[test]
    fn routes_through_detection_to_the_registered_codec() {
        let config = parse_particle_config(&registry(), LIBGDX, None);
        assert_eq!(config.max_particles, 7.0);
    }

    #[test]
    fn falls_back_to_a_default_config_for_unknown_input() {
        let config = parse_particle_config(&registry(), "unknown", None);
        assert_eq!(config.max_particles, 1000.0);
    }
}

mod parse_particle_config_document {
    use super::*;

    #[test]
    fn reports_no_detected_format_as_an_unknown_format_reject() {
        let result = parse_particle_config_document(&registry(), "unknown", None);
        assert_eq!(result.format, None);
        assert_eq!(result.diagnostics[0].kind, "particles.unknown-format");
    }

    #[test]
    fn returns_the_detected_format_and_codec_diagnostics() {
        let result = parse_particle_config_document(&registry(), LIBGDX, None);
        assert_eq!(result.format, Some(String::from("libgdx")));
        assert!(result.diagnostics.is_empty());
    }
}

use std::sync::Arc;

use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_particles_formats::contract::*;

fn registered_formats(registry: &ParticleFormatRegistry) -> Vec<ParticleFormatKind> {
    let mut out = Vec::new();
    get_registered_particle_formats(&mut out, registry);
    return out;
}

fn codec(detect_name: &'static str) -> ParticleFormatCodec {
    return ParticleFormatCodec {
        detect: Arc::new(move |text| text == detect_name),
        parse_to_config: Arc::new(|_text, _options| {
            flight_particles::create_particle_emitter_config(None)
        }),
        parse_to_document: Arc::new(|_text, _options| ParticleFormatParseDocumentResult {
            config: flight_particles::create_particle_emitter_config(None),
            diagnostics: Vec::new(),
        }),
        serialize: None,
    };
}

mod create_particle_format_registry {
    use super::*;

    #[test]
    fn allocates_an_empty_registry() {
        let registry = create_particle_format_registry();
        assert!(registered_formats(&registry).is_empty());
    }
}

mod detect_registered_particle_format {
    use super::*;

    #[test]
    fn returns_the_first_registered_codec_that_matches() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "one", codec("shared"));
        register_particle_format(&mut registry, "two", codec("shared"));
        assert_eq!(
            detect_registered_particle_format(&registry, "shared"),
            Some(String::from("one"))
        );
    }

    #[test]
    fn ignores_a_panicking_detect_callback() {
        let mut registry = create_particle_format_registry();
        let mut broken = codec("never");
        broken.detect = Arc::new(|_text| panic!("broken detector"));
        register_particle_format(&mut registry, "broken", broken);
        register_particle_format(&mut registry, "working", codec("hit"));
        assert_eq!(
            detect_registered_particle_format(&registry, "hit"),
            Some(String::from("working"))
        );
    }
}

mod get_particle_format_codec {
    use super::*;

    #[test]
    fn returns_the_codec_or_none() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "kind", codec("x"));
        assert!(get_particle_format_codec(&registry, "kind").is_some());
        assert!(get_particle_format_codec(&registry, "missing").is_none());
    }
}

mod get_registered_particle_formats {
    use super::*;

    #[test]
    fn lists_kinds_in_registration_order() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "a", codec("a"));
        register_particle_format(&mut registry, "b", codec("b"));
        assert_eq!(
            registered_formats(&registry),
            vec!["a".to_string(), "b".to_string()]
        );
    }
}

mod parse_registered_particle_format {
    use super::*;

    #[test]
    fn reports_an_unknown_format_as_a_reject() {
        let registry = create_particle_format_registry();
        let result = parse_registered_particle_format(&registry, "x", "missing", None);
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].kind, "particles.unknown-format");
        assert_eq!(result.format, Some(String::from("missing")));
    }

    #[test]
    fn turns_a_codec_panic_into_a_parse_error() {
        let mut registry = create_particle_format_registry();
        let mut broken = codec("x");
        broken.parse_to_document = Arc::new(|_text, _options| panic!("boom"));
        register_particle_format(&mut registry, "broken", broken);
        let result = parse_registered_particle_format(&registry, "x", "broken", None);
        assert_eq!(result.diagnostics[0].kind, "particles.parse-error");
    }
}

mod parse_registered_particle_format_source_cases {
    use super::*;

    #[test]
    fn parses_with_the_registered_codec_and_reports_its_format() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "test.MyFormat", parsing_codec());
        let result =
            parse_registered_particle_format(&registry, "MY_FORMAT:75", "test.MyFormat", None);
        assert_eq!(result.format, Some(String::from("test.MyFormat")));
        assert_eq!(result.config.max_particles, 75.0);
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn reports_unknown_format_as_a_reject_with_its_origin() {
        let registry = create_particle_format_registry();
        let result = parse_registered_particle_format(&registry, "whatever", "nope.Missing", None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "particles.unknown-format")
            .expect("unknown-format diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(crumb.origin, "parseRegisteredParticleFormat");
    }

    #[test]
    fn reports_a_codec_parse_error_as_a_reject_with_the_message_and_origin() {
        let mut registry = create_particle_format_registry();
        let mut broken = parsing_codec();
        broken.parse_to_document = Arc::new(|_text, _options| panic!("bad input"));
        register_particle_format(&mut registry, "test.MyFormat", broken);
        let result =
            parse_registered_particle_format(&registry, "MY_FORMAT:bad", "test.MyFormat", None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "particles.parse-error")
            .expect("parse-error diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(crumb.origin, "parseRegisteredParticleFormat");
        assert_eq!(
            crumb
                .detail
                .as_ref()
                .and_then(|detail| detail.get("message")),
            Some(&ImportDiagnosticDetailValue::String(String::from(
                "bad input"
            )))
        );
    }

    #[test]
    fn passes_shared_parse_options_to_the_registered_codec() {
        let seen = Arc::new(std::sync::Mutex::new(None::<f32>));
        let captured = seen.clone();
        let mut registry = create_particle_format_registry();
        let mut observing = parsing_codec();
        observing.parse_to_document = Arc::new(move |text, options| {
            *captured.lock().unwrap() = options.and_then(|options| options.texture_size);
            let value = text["MY_FORMAT:".len()..].parse::<f32>().unwrap_or(50.0);
            return ParticleFormatParseDocumentResult {
                config: config_with_max_particles(value),
                diagnostics: Vec::new(),
            };
        });
        register_particle_format(&mut registry, "test.MyFormat", observing);
        let options = ParseParticleConfigOptions {
            pixels_per_unit: None,
            texture_size: Some(32.0),
        };
        parse_registered_particle_format(
            &mut registry,
            "MY_FORMAT:75",
            "test.MyFormat",
            Some(&options),
        );
        assert_eq!(*seen.lock().unwrap(), Some(32.0));
    }
}

mod register_particle_format {
    use super::*;

    #[test]
    fn is_last_write_wins_and_keeps_the_original_position() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "a", codec("a"));
        register_particle_format(&mut registry, "b", codec("b"));
        register_particle_format(&mut registry, "a", codec("replaced"));
        assert_eq!(
            registered_formats(&registry),
            vec!["a".to_string(), "b".to_string()]
        );
        assert_eq!(
            detect_registered_particle_format(&registry, "replaced"),
            Some(String::from("a"))
        );
    }
}

mod register_particle_format_source_cases {
    use super::*;

    #[test]
    fn extends_the_unified_parsers_without_dispatch_changes() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "test.MyFormat", parsing_codec());
        assert_eq!(
            parse_particle_config(&registry, "MY_FORMAT:125", None).max_particles,
            125.0
        );
        let document = parse_particle_config_document(&registry, "MY_FORMAT:125", None);
        assert!(document.diagnostics.is_empty());
        assert_eq!(document.format, Some(String::from("test.MyFormat")));
    }
}

mod unregister_particle_format {
    use super::*;

    #[test]
    fn removes_the_kind_and_reports_presence() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "a", codec("a"));
        assert!(unregister_particle_format(&mut registry, "a"));
        assert!(!unregister_particle_format(&mut registry, "a"));
        assert!(registered_formats(&registry).is_empty());
    }
}

fn config_with_max_particles(max_particles: f32) -> flight_particles::ParticleEmitterConfig {
    let mut config = flight_particles::create_particle_emitter_config(None);
    config.max_particles = max_particles;
    return config;
}

fn parsing_codec() -> ParticleFormatCodec {
    return ParticleFormatCodec {
        detect: Arc::new(|text| text.starts_with("MY_FORMAT:")),
        parse_to_config: Arc::new(|text, _options| {
            let value = text["MY_FORMAT:".len()..].parse::<f32>().unwrap_or(50.0);
            return config_with_max_particles(value);
        }),
        parse_to_document: Arc::new(|text, _options| {
            let value = text["MY_FORMAT:".len()..].parse::<f32>().unwrap_or(50.0);
            return ParticleFormatParseDocumentResult {
                config: config_with_max_particles(value),
                diagnostics: Vec::new(),
            };
        }),
        serialize: None,
    };
}

mod unregister_particle_format_source_cases {
    use super::*;

    #[test]
    fn returns_the_kind_when_a_codec_detects_the_input() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "test.MyFormat", parsing_codec());
        assert_eq!(
            detect_registered_particle_format(&registry, "MY_FORMAT:100"),
            Some(String::from("test.MyFormat"))
        );
    }

    #[test]
    fn returns_none_when_no_codec_matches() {
        let registry = create_particle_format_registry();
        assert_eq!(
            detect_registered_particle_format(&registry, "totally unknown"),
            None
        );
    }
}

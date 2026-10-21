use std::sync::Arc;

use flight_particles_formats::contract::*;

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
        assert!(get_registered_particle_formats(&registry).is_empty());
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
            get_registered_particle_formats(&registry),
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

mod register_particle_format {
    use super::*;

    #[test]
    fn is_last_write_wins_and_keeps_the_original_position() {
        let mut registry = create_particle_format_registry();
        register_particle_format(&mut registry, "a", codec("a"));
        register_particle_format(&mut registry, "b", codec("b"));
        register_particle_format(&mut registry, "a", codec("replaced"));
        assert_eq!(
            get_registered_particle_formats(&registry),
            vec!["a".to_string(), "b".to_string()]
        );
        assert_eq!(
            detect_registered_particle_format(&registry, "replaced"),
            Some(String::from("a"))
        );
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
        assert!(get_registered_particle_formats(&registry).is_empty());
    }
}

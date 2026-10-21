use std::sync::Arc;

use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
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

fn built_in_registry() -> ParticleFormatRegistry {
    let mut registry = create_particle_format_registry();
    register_built_in_particle_formats(&mut registry);
    return registry;
}

const LIBGDX_SNIPPET: &str =
    "Particle Effect\n- Spark -\nmaxParticleCount: 75\nadditive: false\nimagePath: fire.png\n";
const PLIST_SNIPPET: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<plist version=\"1.0\">\n<dict>\n<key>maxParticles</key><integer>150</integer>\n<key>emitterType</key><integer>0</integer>\n<key>duration</key><real>-1</real>\n<key>particleLifespan</key><real>1.0</real>\n<key>speed</key><real>100</real>\n<key>angle</key><real>90</real>\n<key>startParticleSize</key><real>16</real>\n<key>finishParticleSize</key><real>8</real>\n<key>textureFileName</key><string>test.png</string>\n</dict>\n</plist>";
const PIXI_JSON: &str = "{\"pos\":{\"x\":0,\"y\":0},\"alpha\":{\"start\":1,\"end\":0},\"speed\":{\"start\":100,\"end\":50},\"lifetime\":{\"min\":0.5,\"max\":1.5},\"maxParticles\":600,\"frequency\":0.01,\"blendMode\":\"add\"}";
const SPINE_JSON: &str = "{\"name\":\"spark\",\"maxParticles\":300,\"continuous\":true,\"duration\":-1,\"emission\":{\"low\":80,\"high\":120},\"life\":{\"low\":400,\"high\":800},\"velocity\":{\"low\":50,\"high\":200},\"angle\":{\"low\":60,\"high\":120},\"tint\":[{\"time\":0,\"color\":\"ffffff\"},{\"time\":1,\"color\":\"ff0000\"}],\"alpha\":[{\"time\":0,\"alpha\":1},{\"time\":1,\"alpha\":0}],\"blendMode\":\"normal\",\"premultiplied\":false,\"images\":[\"spark.png\"]}";
const STARLING_PEX_SNIPPET: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<particleEmitterConfig>\n<attribute name=\"maxParticles\" value=\"250\"/>\n<attribute name=\"emitterType\" value=\"0\"/>\n<attribute name=\"duration\" value=\"-1\"/>\n<attribute name=\"particleLifespan\" value=\"1.0\"/>\n<attribute name=\"speed\" value=\"80\"/>\n<attribute name=\"angle\" value=\"90\"/>\n<attribute name=\"startParticleSize\" value=\"16\"/>\n<attribute name=\"finishParticleSize\" value=\"8\"/>\n<attribute name=\"startColor\" red=\"1\" green=\"1\" blue=\"1\" alpha=\"1\"/>\n<attribute name=\"finishColor\" red=\"1\" green=\"1\" blue=\"1\" alpha=\"0\"/>\n<attribute name=\"blendFuncSource\" value=\"770\"/>\n<attribute name=\"blendFuncDestination\" value=\"1\"/>\n</particleEmitterConfig>";
const UNITY_JSON: &str = "{\"name\":\"smoke\",\"duration\":5.0,\"looping\":true,\"prewarm\":false,\"maxParticles\":500,\"startLifetime\":{\"mode\":\"twoConstants\",\"constantMin\":1.0,\"constantMax\":2.5},\"startSpeed\":{\"mode\":\"twoConstants\",\"constantMin\":0.5,\"constantMax\":1.5},\"startSize\":{\"mode\":\"constant\",\"constant\":1.0},\"startRotation\":{\"mode\":\"constant\",\"constant\":0},\"startColor\":{\"r\":0.8,\"g\":0.8,\"b\":0.8,\"a\":1.0},\"gravityModifier\":0.0,\"physicsGravity\":9.81,\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":20},\"bursts\":[]},\"shape\":{\"enabled\":false,\"shapeType\":\"Cone\",\"radius\":0,\"angle\":25,\"scale\":{\"x\":1,\"y\":1,\"z\":1}},\"colorOverLifetime\":{\"enabled\":false,\"colorStart\":{\"r\":1,\"g\":1,\"b\":1,\"a\":1},\"colorEnd\":{\"r\":1,\"g\":1,\"b\":1,\"a\":0}},\"sizeOverLifetime\":{\"enabled\":false,\"sizeStart\":1,\"sizeEnd\":1},\"rotationOverLifetime\":{\"enabled\":false,\"angularVelocity\":{\"mode\":\"constant\",\"constant\":0}}}";

mod parse_particle_config_document_built_ins {
    use super::*;

    #[test]
    fn returns_libgdx_kind_and_config() {
        let result = parse_particle_config_document(&built_in_registry(), LIBGDX_SNIPPET, None);
        assert_eq!(result.format, Some(LIBGDX_PARTICLE_FORMAT_KIND.to_string()));
        assert_eq!(result.config.max_particles, 75.0);
    }

    #[test]
    fn returns_particle_designer_kind_config_and_no_diagnostics() {
        let result = parse_particle_config_document(&built_in_registry(), PLIST_SNIPPET, None);
        assert_eq!(
            result.format,
            Some(PARTICLE_DESIGNER_FORMAT_KIND.to_string())
        );
        assert_eq!(result.config.max_particles, 150.0);
        assert!(result.diagnostics.is_empty());
    }

    #[test]
    fn returns_pixi_kind_and_config() {
        let result = parse_particle_config_document(&built_in_registry(), PIXI_JSON, None);
        assert_eq!(result.format, Some(PIXI_PARTICLE_FORMAT_KIND.to_string()));
        assert_eq!(result.config.max_particles, 600.0);
    }

    #[test]
    fn returns_spine_kind_and_config() {
        let result = parse_particle_config_document(&built_in_registry(), SPINE_JSON, None);
        assert_eq!(result.format, Some(SPINE_PARTICLE_FORMAT_KIND.to_string()));
        assert_eq!(result.config.max_particles, 300.0);
    }

    #[test]
    fn returns_starling_pex_kind_config_and_additive_blend() {
        let result =
            parse_particle_config_document(&built_in_registry(), STARLING_PEX_SNIPPET, None);
        assert_eq!(result.format, Some(STARLING_PEX_FORMAT_KIND.to_string()));
        assert_eq!(result.config.max_particles, 250.0);
        assert_eq!(result.config.blend_mode.as_deref(), Some("add"));
    }

    #[test]
    fn returns_unity_kind_and_config() {
        let result = parse_particle_config_document(&built_in_registry(), UNITY_JSON, None);
        assert_eq!(result.format, Some(UNITY_PARTICLE_FORMAT_KIND.to_string()));
        assert_eq!(result.config.max_particles, 500.0);
    }

    #[test]
    fn reports_unknown_format_as_a_reject_with_null_format_and_its_origin() {
        let result =
            parse_particle_config_document(&built_in_registry(), "totally unknown content", None);
        assert_eq!(result.format, None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "particles.unknown-format")
            .expect("unknown-format diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Reject);
        assert_eq!(crumb.origin, "parseParticleConfigDocument");
    }

    #[test]
    fn returns_null_format_and_diagnostics_for_an_empty_string() {
        let result = parse_particle_config_document(&built_in_registry(), "", None);
        assert_eq!(result.format, None);
        assert!(!result.diagnostics.is_empty());
    }

    #[test]
    fn does_not_throw_for_truncated_json_that_passes_detection() {
        let result = parse_particle_config_document(
            &built_in_registry(),
            "{ \"gravityModifier\": 0.5, \"looping\"",
            None,
        );
        assert_eq!(result.format, None);
    }

    #[test]
    fn reports_a_spine_parse_refusal_for_a_malformed_tint_entry() {
        let text = "{\"continuous\":true,\"tint\":[null]}";
        assert!(
            parse_particle_config(&built_in_registry(), text, None)
                .max_particles
                .is_finite()
        );
        let result = parse_particle_config_document(&built_in_registry(), text, None);
        assert_eq!(result.format, Some(SPINE_PARTICLE_FORMAT_KIND.to_string()));
        assert!(has_message(
            &result.diagnostics,
            "Invalid Spine particle document: tint[0] must be a JSON object"
        ));
    }

    #[test]
    fn reports_a_spine_parse_refusal_for_a_malformed_alpha_entry() {
        let text = "{\"continuous\":true,\"alpha\":[null]}";
        let result = parse_particle_config_document(&built_in_registry(), text, None);
        assert_eq!(result.format, Some(SPINE_PARTICLE_FORMAT_KIND.to_string()));
        assert!(has_message(
            &result.diagnostics,
            "Invalid Spine particle document: alpha[0] must be a JSON object"
        ));
    }

    #[test]
    fn reports_a_spine_parse_refusal_for_a_malformed_image_entry() {
        let text = "{\"continuous\":true,\"images\":[7]}";
        let result = parse_particle_config_document(&built_in_registry(), text, None);
        assert_eq!(result.format, Some(SPINE_PARTICLE_FORMAT_KIND.to_string()));
        assert!(has_message(
            &result.diagnostics,
            "Invalid Spine particle document: images[0] must be a string"
        ));
    }
}

fn has_message(diagnostics: &[flight_importdiagnostics::ImportDiagnostic], message: &str) -> bool {
    return diagnostics.iter().any(|diagnostic| {
        diagnostic.kind == "particles.parse-error"
            && diagnostic.severity == ImportDiagnosticSeverity::Reject
            && diagnostic.origin == "parseParticleConfigDocument"
            && diagnostic
                .detail
                .as_ref()
                .and_then(|detail| detail.get("message"))
                == Some(&ImportDiagnosticDetailValue::String(String::from(message)))
    });
}

mod parse_particle_config_source_cases {
    use super::*;

    #[test]
    fn parses_libgdx() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), LIBGDX_SNIPPET, None).max_particles,
            75.0
        );
    }

    #[test]
    fn parses_particle_designer_plist() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), PLIST_SNIPPET, None).max_particles,
            150.0
        );
    }

    #[test]
    fn parses_pixi_json() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), PIXI_JSON, None).max_particles,
            600.0
        );
    }

    #[test]
    fn parses_spine_json() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), SPINE_JSON, None).max_particles,
            300.0
        );
    }

    #[test]
    fn parses_starling_pex_xml() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), STARLING_PEX_SNIPPET, None).max_particles,
            250.0
        );
    }

    #[test]
    fn parses_unity_json() {
        assert_eq!(
            parse_particle_config(&built_in_registry(), UNITY_JSON, None).max_particles,
            500.0
        );
    }

    #[test]
    fn returns_a_finite_default_config_for_unknown_input() {
        let config = parse_particle_config(&built_in_registry(), "not a particle file", None);
        assert!(config.max_particles.is_finite());
    }

    #[test]
    fn returns_a_default_config_for_an_empty_string_without_throwing() {
        let config = parse_particle_config(&built_in_registry(), "", None);
        assert!(config.max_particles.is_finite());
    }
}

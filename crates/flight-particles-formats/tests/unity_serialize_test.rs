use flight_particles::contract::{
    ColorKeyframe, CurveKeyframe, particle_color_curve_from_keyframes,
    particle_curve_from_keyframes, sample_particle_color_curve, sample_particle_curve,
};
use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

const SMOKE_JSON: &str = "{\"name\":\"smoke\",\"duration\":5.0,\"looping\":true,\"prewarm\":false,\"maxParticles\":500,\"startLifetime\":{\"mode\":\"twoConstants\",\"constantMin\":1.0,\"constantMax\":2.5},\"startSpeed\":{\"mode\":\"twoConstants\",\"constantMin\":0.5,\"constantMax\":1.5},\"startSize\":{\"mode\":\"twoConstants\",\"constantMin\":0.8,\"constantMax\":1.2},\"startRotation\":{\"mode\":\"constant\",\"constant\":0},\"startColor\":{\"r\":0.8,\"g\":0.8,\"b\":0.8,\"a\":1.0},\"gravityModifier\":0.1,\"physicsGravity\":9.81,\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":20},\"bursts\":[]},\"shape\":{\"enabled\":true,\"shapeType\":\"Cone\",\"radius\":0.5,\"angle\":15,\"scale\":{\"x\":1,\"y\":1,\"z\":1}},\"colorOverLifetime\":{\"enabled\":true,\"colorStart\":{\"r\":0.8,\"g\":0.8,\"b\":0.8,\"a\":1.0},\"colorEnd\":{\"r\":0.3,\"g\":0.3,\"b\":0.3,\"a\":0.0}},\"sizeOverLifetime\":{\"enabled\":true,\"sizeStart\":1.0,\"sizeEnd\":2.0},\"rotationOverLifetime\":{\"enabled\":true,\"angularVelocity\":{\"mode\":\"twoConstants\",\"constantMin\":-45,\"constantMax\":45}}}";

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

fn ppu_parse() -> UnityParseOptions {
    return UnityParseOptions {
        pixels_per_unit: Some(100.0),
    };
}

fn ppu_serialize() -> UnitySerializeOptions {
    return UnitySerializeOptions {
        pixels_per_unit: Some(100.0),
    };
}

mod unity_serialize_source_cases {
    use super::*;

    #[test]
    fn round_trips_key_config_fields_through_parse_serialize_parse() {
        let config = parse_unity_particle(SMOKE_JSON, Some(&ppu_parse()));
        let document = parse_unity_particle_document(SMOKE_JSON, Some(&ppu_parse())).document;
        let text = serialize_unity_particle(&config, Some(&document), Some(&ppu_serialize()));
        let reparsed = parse_unity_particle(&text, Some(&ppu_parse()));
        assert_eq!(reparsed.max_particles, config.max_particles);
        assert!((reparsed.lifetime_min - config.lifetime_min).abs() < 1e-3);
        assert!((reparsed.gravity_y - config.gravity_y).abs() < 1e-2);
        assert!((reparsed.alpha_end - config.alpha_end).abs() < 1e-3);
        assert!((reparsed.scale_end - config.scale_end).abs() < 1e-2);
    }

    #[test]
    fn produces_valid_json() {
        let config = parse_unity_particle(SMOKE_JSON, None);
        let text = serialize_unity_particle(&config, None, None);
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid json");
        assert!(parsed.is_object());
    }

    #[test]
    fn preserves_the_existing_document_name() {
        let document = parse_unity_particle_document(SMOKE_JSON, Some(&ppu_parse())).document;
        let text = serialize_unity_particle(
            &create_particle_emitter_config(None),
            Some(&document),
            Some(&ppu_serialize()),
        );
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid json");
        assert_eq!(parsed["name"], "smoke");
    }

    #[test]
    fn document_result_has_text_and_no_warnings_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let result = serialize_unity_particle_document(&config, None, None);
        let parsed: serde_json::Value = serde_json::from_str(&result.text).expect("valid json");
        assert!(parsed.is_object());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn warns_when_the_config_has_horizontal_gravity() {
        let mut config = create_particle_emitter_config(None);
        config.gravity_x = 5.0;
        let result = serialize_unity_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("gravityX"))
        );
    }

    #[test]
    fn warns_when_the_config_has_color_end_variance() {
        let mut config = create_particle_emitter_config(None);
        config.color_end_variance_r = 0.1;
        let result = serialize_unity_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("colorEndVariance"))
        );
    }

    #[test]
    fn has_no_warnings_for_a_config_with_representable_features() {
        let config = parse_unity_particle(SMOKE_JSON, Some(&ppu_parse()));
        let result = serialize_unity_particle_document(&config, None, Some(&ppu_serialize()));
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn emits_baked_curves_as_a_gradient_and_size_curve_that_reimport_identically() {
        let mut color_curve = Vec::new();
        particle_color_curve_from_keyframes(
            &mut color_curve,
            &[
                ColorKeyframe {
                    r: 1.0,
                    g: 0.0,
                    b: 0.0,
                    time: 0.0,
                },
                ColorKeyframe {
                    r: 0.0,
                    g: 1.0,
                    b: 0.0,
                    time: 0.5,
                },
                ColorKeyframe {
                    r: 0.0,
                    g: 0.0,
                    b: 1.0,
                    time: 1.0,
                },
            ],
            33,
        );
        let mut alpha_curve = Vec::new();
        particle_curve_from_keyframes(
            &mut alpha_curve,
            &[
                CurveKeyframe {
                    time: 0.0,
                    value: 0.0,
                },
                CurveKeyframe {
                    time: 0.5,
                    value: 1.0,
                },
                CurveKeyframe {
                    time: 1.0,
                    value: 0.0,
                },
            ],
            33,
        );
        let mut scale_curve = Vec::new();
        particle_curve_from_keyframes(
            &mut scale_curve,
            &[
                CurveKeyframe {
                    time: 0.0,
                    value: 0.0,
                },
                CurveKeyframe {
                    time: 0.5,
                    value: 1.0,
                },
                CurveKeyframe {
                    time: 1.0,
                    value: 0.0,
                },
            ],
            33,
        );
        let mut config = create_particle_emitter_config(None);
        config.color_curve = Some(color_curve);
        config.alpha_curve = Some(alpha_curve);
        config.scale_curve = Some(scale_curve);
        let text = serialize_unity_particle(&config, None, Some(&ppu_serialize()));
        let parsed: serde_json::Value = serde_json::from_str(&text).expect("valid json");
        assert!(parsed["colorOverLifetime"]["gradient"].is_object());
        assert!(parsed["sizeOverLifetime"]["curve"].is_object());
        let reparsed = parse_unity_particle(&text, Some(&ppu_parse()));
        let color = reparsed.color_curve.expect("color curve");
        let alpha = reparsed.alpha_curve.expect("alpha curve");
        let scale = reparsed.scale_curve.expect("scale curve");
        let mut out = [0.0_f32, 0.0, 0.0];
        sample_particle_color_curve(&mut out, 0, &color, 0.5);
        assert!(out[1] > 0.8);
        assert!(sample_particle_curve(&alpha, 0.5) > 0.9);
        assert!(sample_particle_curve(&scale, 0.5) > sample_particle_curve(&scale, 0.0));
    }
}

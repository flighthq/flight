use flight_particles::create_particle_emitter_config;
use flight_particles::ParticleBlendMode;
use flight_particles_formats::contract::*;

const FIRE_PEX_ATTR: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<particleEmitterConfig>
  <attribute name="maxParticles" value="200"/>
  <attribute name="emitterType" value="0"/>
  <attribute name="duration" value="-1"/>
  <attribute name="particleLifespan" value="1.5"/>
  <attribute name="particleLifespanVariance" value="0.5"/>
  <attribute name="speed" value="100"/>
  <attribute name="speedVariance" value="20"/>
  <attribute name="angle" value="90"/>
  <attribute name="angleVariance" value="30"/>
  <attribute name="gravityx" value="0"/>
  <attribute name="gravityy" value="200"/>
  <attribute name="sourcePositionVariancex" value="0"/>
  <attribute name="sourcePositionVariancey" value="0"/>
  <attribute name="startParticleSize" value="32"/>
  <attribute name="startParticleSizeVariance" value="8"/>
  <attribute name="finishParticleSize" value="8"/>
  <attribute name="finishParticleSizeVariance" value="0"/>
  <attribute name="startColor" red="1" green="0.5" blue="0" alpha="1"/>
  <attribute name="startColorVariance" red="0" green="0" blue="0" alpha="0"/>
  <attribute name="finishColor" red="1" green="0" blue="0" alpha="0"/>
  <attribute name="finishColorVariance" red="0" green="0" blue="0" alpha="0"/>
  <attribute name="rotationStart" value="0"/>
  <attribute name="rotationStartVariance" value="0"/>
  <attribute name="rotationEnd" value="0"/>
  <attribute name="rotationEndVariance" value="0"/>
  <attribute name="maxRadius" value="0"/>
  <attribute name="maxRadiusVariance" value="0"/>
  <attribute name="minRadius" value="0"/>
  <attribute name="minRadiusVariance" value="0"/>
  <attribute name="rotatePerSecond" value="0"/>
  <attribute name="rotatePerSecondVariance" value="0"/>
  <attribute name="radialAcceleration" value="0"/>
  <attribute name="radialAccelVariance" value="0"/>
  <attribute name="tangentialAcceleration" value="0"/>
  <attribute name="tangentialAccelVariance" value="0"/>
  <attribute name="blendFuncSource" value="770"/>
  <attribute name="blendFuncDestination" value="771"/>
  <attribute name="textureFileName" value="fire.png"/>
</particleEmitterConfig>"#;

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
        config.blend_mode = Some(ParticleBlendMode::Multiply);
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

fn parse_texture_32() -> StarlingPexParseOptions {
    return StarlingPexParseOptions {
        texture_size: Some(32.0),
    };
}

fn serialize_texture_32() -> StarlingPexSerializeOptions {
    return StarlingPexSerializeOptions {
        texture_size: Some(32.0),
    };
}

mod starling_pex_serialize_source_cases {
    use super::*;

    #[test]
    fn round_trips_key_config_fields() {
        let config = parse_starling_pex(FIRE_PEX_ATTR, Some(&parse_texture_32()));
        let document =
            parse_starling_pex_document(FIRE_PEX_ATTR, Some(&parse_texture_32())).document;
        let xml = serialize_starling_pex(&config, Some(&document), Some(&serialize_texture_32()));
        let reparsed = parse_starling_pex(&xml, Some(&parse_texture_32()));
        assert_eq!(reparsed.max_particles, config.max_particles);
        assert!((reparsed.direction_x - config.direction_x).abs() < 1e-3);
        assert!((reparsed.gravity_y - config.gravity_y).abs() < 0.1);
        assert!((reparsed.color_start_r - config.color_start_r).abs() < 1e-3);
        assert!((reparsed.alpha_end - config.alpha_end).abs() < 1e-3);
    }

    #[test]
    fn preserves_the_texture_file_name() {
        let config = parse_starling_pex(FIRE_PEX_ATTR, None);
        let document = parse_starling_pex_document(FIRE_PEX_ATTR, None).document;
        assert!(serialize_starling_pex(&config, Some(&document), None).contains("fire.png"));
    }

    #[test]
    fn produces_valid_xml_with_the_pex_root() {
        let config = parse_starling_pex(FIRE_PEX_ATTR, None);
        let xml = serialize_starling_pex(&config, None, None);
        assert!(xml.contains("<?xml version=\"1.0\""));
        assert!(xml.contains("<particleEmitterConfig>"));
        assert!(xml.contains("</particleEmitterConfig>"));
    }

    #[test]
    fn produces_xml_parseable_for_a_fresh_config() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 50.0;
        config.blend_mode = Some(ParticleBlendMode::Add);
        let xml = serialize_starling_pex(&config, None, None);
        let reparsed = parse_starling_pex(&xml, None);
        assert_eq!(reparsed.max_particles, 50.0);
        assert_eq!(reparsed.blend_mode, Some(ParticleBlendMode::Add));
    }

    #[test]
    fn maps_normal_blend_to_destination_771() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Normal);
        assert!(
            serialize_starling_pex(&config, None, None)
                .contains("blendFuncDestination\" value=\"771\"")
        );
    }

    #[test]
    fn maps_add_blend_to_destination_1() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Add);
        assert!(
            serialize_starling_pex(&config, None, None)
                .contains("blendFuncDestination\" value=\"1\"")
        );
    }

    #[test]
    fn document_result_has_text_and_no_warnings_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let result = serialize_starling_pex_document(&config, None, None);
        assert!(result.text.contains("<particleEmitterConfig>"));
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn warns_when_multiply_blend_cannot_be_represented() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Multiply);
        let result = serialize_starling_pex_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.to_lowercase().contains("multiply"))
        );
    }

    #[test]
    fn warns_when_the_config_has_bursts() {
        let mut config = create_particle_emitter_config(None);
        config.burst_count = 5.0;
        let result = serialize_starling_pex_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.to_lowercase().contains("burst"))
        );
    }

    #[test]
    fn has_no_blend_warnings_for_add() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Add);
        let result = serialize_starling_pex_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .filter(|warning| warning.to_lowercase().contains("blend"))
                .count()
                == 0
        );
    }
}

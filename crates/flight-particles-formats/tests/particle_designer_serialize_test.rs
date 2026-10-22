use flight_particles::ParticleBlendMode;
use flight_particles::create_particle_emitter_config;
use flight_particles_formats::contract::*;

const FIRE_PLIST: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>maxParticles</key><integer>200</integer>
  <key>emitterType</key><integer>0</integer>
  <key>duration</key><real>-1</real>
  <key>particleLifespan</key><real>1.5</real>
  <key>particleLifespanVariance</key><real>0.5</real>
  <key>speed</key><real>100</real>
  <key>speedVariance</key><real>20</real>
  <key>angle</key><real>90</real>
  <key>angleVariance</key><real>30</real>
  <key>gravityx</key><real>0</real>
  <key>gravityy</key><real>200</real>
  <key>sourcePositionVariancex</key><real>0</real>
  <key>sourcePositionVariancey</key><real>0</real>
  <key>startParticleSize</key><real>32</real>
  <key>startParticleSizeVariance</key><real>8</real>
  <key>finishParticleSize</key><real>8</real>
  <key>finishParticleSizeVariance</key><real>0</real>
  <key>startColorRed</key><real>1</real>
  <key>startColorGreen</key><real>0.5</real>
  <key>startColorBlue</key><real>0</real>
  <key>startColorAlpha</key><real>1</real>
  <key>startColorVarianceRed</key><real>0</real>
  <key>startColorVarianceGreen</key><real>0</real>
  <key>startColorVarianceBlue</key><real>0</real>
  <key>startColorVarianceAlpha</key><real>0</real>
  <key>finishColorRed</key><real>1</real>
  <key>finishColorGreen</key><real>0</real>
  <key>finishColorBlue</key><real>0</real>
  <key>finishColorAlpha</key><real>0</real>
  <key>finishColorVarianceRed</key><real>0</real>
  <key>finishColorVarianceGreen</key><real>0</real>
  <key>finishColorVarianceBlue</key><real>0</real>
  <key>finishColorVarianceAlpha</key><real>0</real>
  <key>rotationStart</key><real>0</real>
  <key>rotationStartVariance</key><real>0</real>
  <key>rotationEnd</key><real>0</real>
  <key>rotationEndVariance</key><real>0</real>
  <key>maxRadius</key><real>0</real>
  <key>maxRadiusVariance</key><real>0</real>
  <key>minRadius</key><real>0</real>
  <key>minRadiusVariance</key><real>0</real>
  <key>rotatePerSecond</key><real>0</real>
  <key>rotatePerSecondVariance</key><real>0</real>
  <key>blendFuncSource</key><integer>770</integer>
  <key>blendFuncDestination</key><integer>771</integer>
  <key>textureFileName</key><string>fire.png</string>
</dict>
</plist>"#;

mod particle_designer_serialize_round_trip {
    use super::*;

    #[test]
    fn round_trips_color_start_variance_through_serialize() {
        let modified = "<plist><dict><key>maxParticles</key><integer>200</integer><key>startColorVarianceGreen</key><real>0.2</real></dict></plist>";
        let config = parse_particle_designer_plist(modified, None);
        let document = parse_particle_designer_plist_document(modified, None).document;
        let xml = serialize_particle_designer_plist(&config, Some(&document), None);
        assert!(
            (parse_particle_designer_plist(&xml, None).color_start_variance_g - 0.2).abs() < 1e-3
        );
    }
}

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
        config.blend_mode = Some(ParticleBlendMode::Multiply);
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

mod serialize_particle_designer_source_cases {
    use super::*;

    fn texture_32() -> ParticleDesignerSerializeOptions {
        return ParticleDesignerSerializeOptions {
            texture_size: Some(32.0),
        };
    }

    fn parse_texture_32() -> ParticleDesignerParseOptions {
        return ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
    }

    #[test]
    fn round_trips_key_config_fields() {
        let config = parse_particle_designer_plist(FIRE_PLIST, Some(&parse_texture_32()));
        let document =
            parse_particle_designer_plist_document(FIRE_PLIST, Some(&parse_texture_32())).document;
        let xml = serialize_particle_designer_plist(&config, Some(&document), Some(&texture_32()));
        let reparsed = parse_particle_designer_plist(&xml, Some(&parse_texture_32()));
        assert_eq!(reparsed.max_particles, config.max_particles);
        assert!((reparsed.direction_x - config.direction_x).abs() < 1e-3);
        assert!((reparsed.gravity_y - config.gravity_y).abs() < 0.1);
        assert!((reparsed.color_start_r - config.color_start_r).abs() < 1e-3);
        assert!((reparsed.alpha_end - config.alpha_end).abs() < 1e-3);
    }

    #[test]
    fn preserves_the_texture_file_name() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let document = parse_particle_designer_plist_document(FIRE_PLIST, None).document;
        assert!(
            serialize_particle_designer_plist(&config, Some(&document), None).contains("fire.png")
        );
    }

    #[test]
    fn produces_valid_plist_xml() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let xml = serialize_particle_designer_plist(&config, None, None);
        assert!(xml.contains("<?xml version=\"1.0\""));
        assert!(xml.contains("<plist version=\"1.0\">"));
    }

    #[test]
    fn escapes_xml_special_characters_and_round_trips_them() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        let mut document = parse_particle_designer_plist_document(FIRE_PLIST, None).document;
        document.texture_file_name = String::from("a&b<c>.png");
        let xml = serialize_particle_designer_plist(&config, Some(&document), None);
        assert!(!xml.contains("a&b<c>"));
        assert!(xml.contains("&amp;"));
        assert_eq!(
            parse_particle_designer_plist_document(&xml, None)
                .document
                .texture_file_name,
            "a&b<c>.png"
        );
    }
}

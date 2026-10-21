use flight_particles_formats::contract::*;

const PLIST: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<plist version=\"1.0\">\n<dict>\n<key>maxParticles</key><integer>200</integer>\n<key>emitterType</key><integer>1</integer>\n<key>duration</key><real>-1</real>\n<key>particleLifespan</key><real>1</real>\n<key>particleLifespanVariance</key><real>0.5</real>\n<key>speed</key><real>100</real>\n<key>angle</key><real>90</real>\n<key>angleVariance</key><real>10</real>\n<key>startParticleSize</key><real>32</real>\n<key>finishParticleSize</key><real>16</real>\n<key>startColorRed</key><real>0.5</real>\n<key>startColorGreen</key><real>1</real>\n<key>finishColorAlpha</key><real>0</real>\n<key>radialAcceleration</key><real>5</real>\n<key>blendFuncSource</key><integer>770</integer>\n<key>blendFuncDestination</key><integer>1</integer>\n<key>textureFileName</key><string>spark.png</string>\n</dict>\n</plist>";

mod parse_particle_designer_plist {
    use super::*;

    #[test]
    fn maps_lifetime_sizes_colors_and_additive_blend() {
        let config = parse_particle_designer_plist(PLIST, None);
        assert_eq!(config.max_particles, 200.0);
        assert_eq!(config.lifetime_min, 0.5);
        assert_eq!(config.lifetime_max, 1.5);
        assert_eq!(config.color_start_r, 0.5);
        assert_eq!(config.color_end_b, 1.0);
        assert_eq!(config.alpha_end, 0.0);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
        assert!(config.looping);
    }

    #[test]
    fn honors_the_texture_size_normalization() {
        let options = ParticleDesignerParseOptions {
            texture_size: Some(64.0),
        };
        let config = parse_particle_designer_plist(PLIST, Some(&options));
        assert_eq!(config.scale_min, 0.5);
    }
}

mod parse_particle_designer_plist_document {
    use super::*;

    #[test]
    fn keeps_the_document_and_reports_radial_and_alpha_variance_losses() {
        let result = parse_particle_designer_plist_document(PLIST, None);
        assert_eq!(result.document.texture_file_name, "spark.png");
        assert_eq!(
            result.document.emitter_type,
            ParticleDesignerEmitterType::Radial
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "particledesigner.radial-approximated")
        );
    }

    #[test]
    fn does_not_report_alpha_variance_when_the_variance_is_zero() {
        let result = parse_particle_designer_plist_document(PLIST, None);
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "particledesigner.alpha-variance-unsupported")
        );
    }
}

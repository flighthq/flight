use flight_particles_formats::contract::*;

const PEX: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<particleEmitterConfig>\n  <attribute name=\"maxParticles\" value=\"200\"/>\n  <attribute name=\"emitterType\" value=\"1\"/>\n  <attribute name=\"particleLifespan\" value=\"1\"/>\n  <attribute name=\"particleLifespanVariance\" value=\"0.5\"/>\n  <attribute name=\"speed\" value=\"100\"/>\n  <attribute name=\"angle\" value=\"90\"/>\n  <attribute name=\"radialAcceleration\" value=\"5\"/>\n  <attribute name=\"startColor\" red=\"1\" green=\"0\" blue=\"0\" alpha=\"1\"/>\n  <attribute name=\"finishColor\" red=\"0\" green=\"0\" blue=\"1\" alpha=\"0\"/>\n  <attribute name=\"blendFuncSource\" value=\"770\"/>\n  <attribute name=\"blendFuncDestination\" value=\"1\"/>\n  <attribute name=\"textureFileName\" value=\"spark.png\"/>\n</particleEmitterConfig>";

mod parse_starling_pex {
    use super::*;

    #[test]
    fn reads_attribute_style_values_and_colors() {
        let config = parse_starling_pex(PEX, None);
        assert_eq!(config.max_particles, 200.0);
        assert_eq!(config.lifetime_min, 0.5);
        assert_eq!(config.lifetime_max, 1.5);
        assert_eq!(config.color_start_r, 1.0);
        assert_eq!(config.color_end_b, 1.0);
        assert_eq!(config.alpha_end, 0.0);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
    }

    #[test]
    fn rejects_input_that_does_not_begin_with_a_tag() {
        assert!(std::panic::catch_unwind(|| parse_starling_pex("not xml", None)).is_err());
    }
}

mod parse_starling_pex_document {
    use super::*;

    #[test]
    fn preserves_the_document_and_reports_radial_losses() {
        let result = parse_starling_pex_document(PEX, None);
        assert_eq!(result.document.texture_file_name, "spark.png");
        assert_eq!(result.document.emitter_type, StarlingPexEmitterType::Radial);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "starlingpex.radial-approximated")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "starlingpex.radial-acceleration-unsupported")
        );
    }
}

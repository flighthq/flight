use flight_particles::ParticleBlendMode;
use flight_particles_formats::contract::*;

const SPARK: &str = "Particle Effect\n- Spark -\nmaxParticleCount: 100\nadditive: true\nimagePath: spark.png\n\nDuration\nlowMin: 3000\nlowMax: 3000\nhighMin: 3000\nhighMax: 3000\n\nLife\nlowMin: 400\nlowMax: 400\nhighMin: 800\nhighMax: 800\n\nSpawn Shape\nshape: ellipse\n\nSpawn Width\nlowMin: 100\nlowMax: 100\nhighMin: 100\nhighMax: 100\n\nSpawn Height\nlowMin: 100\nlowMax: 100\nhighMin: 100\nhighMax: 100\n\nTint\ncolors: ff0000,00ff00\ntimelineCount: 2\ntimeline0: 0\ntimeline1: 1\n\nTransparency\nscalingCount: 2\nscaling0: 1\nscaling1: 0\n";

mod parse_libgdx_particle {
    use super::*;

    #[test]
    fn maps_root_counts_lifetime_and_the_circular_spawn_shape() {
        let config = parse_libgdx_particle(SPARK, None);
        assert_eq!(config.max_particles, 100.0);
        assert_eq!(config.lifetime_min, 0.4);
        assert_eq!(config.lifetime_max, 0.8);
        assert!(!config.looping);
        assert_eq!(config.duration, 3.0);
        assert_eq!(format!("{:?}", config.emitter_shape), "Circle");
        assert_eq!(config.emitter_radius, 50.0);
        assert_eq!(config.blend_mode, Some(ParticleBlendMode::Add));
        assert_eq!(config.color_start_r, 1.0);
        assert_eq!(config.color_end_g, 1.0);
        assert_eq!(config.alpha_start, 1.0);
        assert_eq!(config.alpha_end, 0.0);
    }

    #[test]
    fn rejects_empty_input_with_the_source_message() {
        let failure = std::panic::catch_unwind(|| parse_libgdx_particle("  ", None));
        assert!(failure.is_err());
    }
}

mod parse_libgdx_particle_document {
    use super::*;

    #[test]
    fn preserves_the_document_and_reports_the_unmapped_emission() {
        let result = parse_libgdx_particle_document(SPARK, None);
        assert_eq!(result.document.name, "Spark");
        assert_eq!(result.document.image_path, "spark.png");
        assert_eq!(
            result.document.tint.colors,
            vec!["ff0000".to_string(), "00ff00".to_string()]
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "libgdx.emission-unsupported")
        );
    }
}

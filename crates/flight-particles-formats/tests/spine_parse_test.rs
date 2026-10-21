use flight_particles_formats::contract::*;

const SPARK: &str = "{\"name\":\"spark\",\"maxParticles\":300,\"continuous\":true,\"duration\":-1,\"emission\":{\"low\":80,\"high\":120},\"life\":{\"low\":400,\"high\":800},\"lifeOffset\":{\"low\":10,\"high\":10},\"x\":{\"low\":0,\"high\":0},\"y\":{\"low\":0,\"high\":0},\"spawnShape\":\"ellipse\",\"spawnWidth\":{\"low\":100,\"high\":100},\"spawnHeight\":{\"low\":100,\"high\":100},\"velocity\":{\"low\":50,\"high\":200},\"angle\":{\"low\":60,\"high\":120},\"rotation\":{\"low\":0,\"high\":90},\"wind\":{\"low\":0,\"high\":0},\"gravity\":{\"low\":5,\"high\":5},\"scale\":{\"low\":0.5,\"high\":1.5},\"scaleEnd\":{\"low\":0,\"high\":0},\"tint\":[{\"time\":0,\"color\":\"ffffff\"},{\"time\":1,\"color\":\"ff0000\"}],\"alpha\":[{\"time\":0,\"alpha\":1},{\"time\":1,\"alpha\":0}],\"blendMode\":\"additive\",\"premultiplied\":true,\"images\":[\"spark.png\"]}";

mod parse_spine_particle {
    use super::*;

    #[test]
    fn maps_ranges_rotation_and_blend() {
        let config = parse_spine_particle(SPARK);
        assert_eq!(config.max_particles, 300.0);
        assert_eq!(config.lifetime_min, 0.4);
        assert_eq!(config.lifetime_max, 0.8);
        assert_eq!(config.speed_min, 50.0);
        assert_eq!(config.speed_max, 200.0);
        assert_eq!(config.spawn_rate, 100.0);
        assert_eq!(format!("{:?}", config.emitter_shape), "Circle");
        assert_eq!(config.emitter_radius, 50.0);
        assert!((config.rotation_speed_max - std::f32::consts::FRAC_PI_2).abs() < 0.001);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
        assert_eq!(config.color_start_r, 1.0);
        assert_eq!(config.color_end_r, 1.0);
        assert_eq!(config.color_end_g, 0.0);
        assert_eq!(config.alpha_end, 0.0);
    }

    #[test]
    fn rejects_non_object_roots() {
        assert!(std::panic::catch_unwind(|| parse_spine_particle("[]")).is_err());
        assert!(std::panic::catch_unwind(|| parse_spine_particle("{bad")).is_err());
    }
}

mod parse_spine_particle_document {
    use super::*;

    #[test]
    fn preserves_the_document_and_reports_unsupported_fields() {
        let result = parse_spine_particle_document(SPARK);
        assert_eq!(result.document.name, "spark");
        assert_eq!(result.document.images, vec!["spark.png".to_string()]);
        assert_eq!(result.document.blend_mode, SpineBlendMode::Additive);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "spine.life-offset-unsupported")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "spine.premultiplied-informational")
        );
    }
}

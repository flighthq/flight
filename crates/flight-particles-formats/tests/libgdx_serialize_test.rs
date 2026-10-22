use flight_particles::create_particle_emitter_config;
use flight_particles::ParticleBlendMode;
use flight_particles_formats::contract::*;

const SPARK_P: &str = r#"Particle Effect
- Spark -
minParticleCount: 4
maxParticleCount: 100
additive: true
imagePath: spark.png
imageCount: 1

Delay
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Duration
lowMin: 3000
lowMax: 3000
highMin: 3000
highMax: 3000
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Emission
lowMin: 0
lowMax: 0
highMin: 80
highMax: 120
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Life
lowMin: 400
lowMax: 400
highMin: 800
highMax: 800
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Life Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

X Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Y Offset
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Spawn Shape
shape: point

Spawn Width
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Spawn Height
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Scale
lowMin: 16
lowMax: 16
highMin: 32
highMax: 32
relative: false
scalingCount: 2
scaling0: 1
scaling1: 0.25
timelineCount: 2
timeline0: 0
timeline1: 1

Velocity
active: true
lowMin: 50
lowMax: 50
highMin: 200
highMax: 200
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Angle
active: true
lowMin: 60
lowMax: 60
highMin: 120
highMax: 120
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Rotation
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Wind
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Gravity
active: false
lowMin: 0
lowMax: 0
highMin: 0
highMax: 0
relative: false
scalingCount: 1
scaling0: 1
timelineCount: 1
timeline0: 0

Tint
colors: ffaa00,ff0000
timelineCount: 2
timeline0: 0
timeline1: 1

Transparency
lowMin: 0
lowMax: 0
highMin: 1
highMax: 1
relative: false
scalingCount: 2
scaling0: 1
scaling1: 0
timelineCount: 2
timeline0: 0
timeline1: 1

"#;

mod serialize_libgdx_particle {
    use super::*;

    #[test]
    fn writes_the_header_count_and_sections_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let text = serialize_libgdx_particle(&config, None, None);
        assert!(text.starts_with("Particle Effect"));
        assert!(text.contains("maxParticleCount: 1000"));
        assert!(text.contains("Tint\ncolors: ffffff,ffffff"));
    }

    #[test]
    fn round_trips_counts_lifetime_and_blend_through_the_parser() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 321.0;
        config.lifetime_min = 0.25;
        config.lifetime_max = 0.75;
        config.blend_mode = Some(ParticleBlendMode::Add);
        let text = serialize_libgdx_particle(&config, None, None);
        let parsed = parse_libgdx_particle(&text, None);
        assert_eq!(parsed.max_particles, 321.0);
        assert_eq!(parsed.lifetime_min, 0.25);
        assert_eq!(parsed.lifetime_max, 0.75);
        assert_eq!(parsed.blend_mode, Some(ParticleBlendMode::Add));
    }
}

mod serialize_libgdx_particle_document {
    use super::*;

    #[test]
    fn warns_about_unsupported_tint_and_bursts() {
        let mut config = create_particle_emitter_config(None);
        config.color_curve = Some(vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
        config.burst_count = 5.0;
        let result = serialize_libgdx_particle_document(&config, None, None);
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
                .any(|warning| warning.contains("bursts"))
        );
    }
}

mod serialize_libgdx_source_cases {
    use super::*;

    #[test]
    fn round_trips_key_config_fields() {
        let config = parse_libgdx_particle(SPARK_P, None);
        let document = parse_libgdx_particle_document(SPARK_P, None).document;
        let text = serialize_libgdx_particle(&config, Some(&document), None);
        let reparsed = parse_libgdx_particle(&text, None);
        assert_eq!(reparsed.max_particles, config.max_particles);
        assert!((reparsed.speed_min - config.speed_min).abs() < 0.1);
        assert!((reparsed.speed_max - config.speed_max).abs() < 0.1);
        assert!((reparsed.lifetime_min - config.lifetime_min).abs() < 0.01);
        assert!((reparsed.lifetime_max - config.lifetime_max).abs() < 0.01);
    }

    #[test]
    fn preserves_the_image_path_round_trip() {
        let config = parse_libgdx_particle(SPARK_P, None);
        let document = parse_libgdx_particle_document(SPARK_P, None).document;
        let text = serialize_libgdx_particle(&config, Some(&document), None);
        assert_eq!(
            parse_libgdx_particle_document(&text, None)
                .document
                .image_path,
            "spark.png"
        );
    }

    #[test]
    fn writes_text_readable_by_the_parser_for_a_fresh_config() {
        let mut config = create_particle_emitter_config(None);
        config.max_particles = 50.0;
        config.blend_mode = Some(ParticleBlendMode::Add);
        let text = serialize_libgdx_particle(&config, None, None);
        let reparsed = parse_libgdx_particle(&text, None);
        assert_eq!(reparsed.max_particles, 50.0);
        assert_eq!(reparsed.blend_mode, Some(ParticleBlendMode::Add));
    }

    #[test]
    fn maps_add_to_additive_true() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Add);
        assert!(serialize_libgdx_particle(&config, None, None).contains("additive: true"));
    }

    #[test]
    fn maps_normal_to_additive_false() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Normal);
        assert!(serialize_libgdx_particle(&config, None, None).contains("additive: false"));
    }

    #[test]
    fn document_result_has_text_and_no_warnings_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let result = serialize_libgdx_particle_document(&config, None, None);
        assert!(result.text.contains("Particle Effect"));
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn warns_when_multiply_blend_cannot_be_represented() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Multiply);
        let result = serialize_libgdx_particle_document(&config, None, None);
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
        let result = serialize_libgdx_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.to_lowercase().contains("burst"))
        );
    }

    #[test]
    fn warns_when_the_config_has_color_start_variance() {
        let mut config = create_particle_emitter_config(None);
        config.color_start_variance_r = 0.1;
        let result = serialize_libgdx_particle_document(&config, None, None);
        assert!(
            result
                .warnings
                .iter()
                .any(|warning| warning.contains("colorStartVariance"))
        );
    }

    #[test]
    fn has_no_blend_warnings_for_add() {
        let mut config = create_particle_emitter_config(None);
        config.blend_mode = Some(ParticleBlendMode::Add);
        let result = serialize_libgdx_particle_document(&config, None, None);
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

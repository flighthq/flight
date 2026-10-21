//! Remaining per-format source assertions from the pinned `particles-formats` tests, kept together
//! so each format's source cases read next to their fixture. Function-level modules live in their
//! own files.

use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_particles::contract::{sample_particle_color_curve, sample_particle_curve};
use flight_particles_formats::contract::*;

fn panic_message(failure: Box<dyn std::any::Any + Send>) -> String {
    return match failure.downcast_ref::<String>() {
        Some(message) => message.clone(),
        None => match failure.downcast_ref::<&str>() {
            Some(message) => String::from(*message),
            None => String::new(),
        },
    };
}

const LIBGDX_SPARK: &str = r#"Particle Effect
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

const FIRE_PLIST: &str = r#"<?xml version="1.0" encoding="utf-8"?>
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
  <key>blendFuncSource</key><integer>770</integer>
  <key>blendFuncDestination</key><integer>771</integer>
  <key>textureFileName</key><string>fire.png</string>
</dict>
</plist>"#;

const PIXI_FIRE: &str = r#"{"alpha":{"start":1,"end":0},"scale":{"start":0.5,"end":1.5,"minimumScaleMultiplier":1},"color":{"start":"ffaa00","end":"ff0000"},"speed":{"start":200,"end":50},"acceleration":{"x":0,"y":0},"maxSpeed":0,"maxParticles":1000,"startRotation":{"min":0,"max":360},"noRotation":false,"rotationSpeed":{"min":0,"max":0},"lifetime":{"min":0.5,"max":1.5},"blendMode":"add","frequency":0.001,"emitterLifetime":-1,"pos":{"x":0,"y":0},"addAtBack":false,"spawnType":"point"}"#;
const PIXI_RECT: &str = r#"{"alpha":{"start":1,"end":0},"scale":{"start":1,"end":1},"color":{"start":"ffffff","end":"ffffff"},"speed":{"start":100,"end":100},"maxParticles":200,"lifetime":{"min":1,"max":2},"blendMode":"normal","frequency":0.01,"pos":{"x":0,"y":0},"spawnRect":{"x":-50,"y":-50,"w":100,"h":100}}"#;

const SPINE_SPARK: &str = r#"{"name":"spark","maxParticles":300,"continuous":true,"duration":-1,"emission":{"low":80,"high":120},"life":{"low":400,"high":800},"lifeOffset":{"low":0,"high":0},"x":{"low":0,"high":0},"y":{"low":0,"high":0},"spawnShape":"point","spawnWidth":{"low":0,"high":0},"spawnHeight":{"low":0,"high":0},"velocity":{"low":50,"high":200},"angle":{"low":60,"high":120},"rotation":{"low":0,"high":360},"wind":{"low":0,"high":0},"gravity":{"low":200,"high":200},"scale":{"low":0.5,"high":1.5},"scaleEnd":{"low":0,"high":0},"tint":[{"time":0,"color":"ffaa00"},{"time":1,"color":"ff0000"}],"alpha":[{"time":0,"alpha":1},{"time":1,"alpha":0}],"blendMode":"additive","premultiplied":false,"images":["spark.png"]}"#;

const FIRE_PEX: &str = r#"<?xml version="1.0" encoding="utf-8"?>
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
  <attribute name="radialAcceleration" value="0"/>
  <attribute name="tangentialAcceleration" value="0"/>
  <attribute name="blendFuncSource" value="770"/>
  <attribute name="blendFuncDestination" value="771"/>
  <attribute name="textureFileName" value="fire.png"/>
</particleEmitterConfig>"#;

const UNITY_SMOKE: &str = r#"{"name":"smoke","duration":5.0,"looping":true,"prewarm":false,"maxParticles":500,"startLifetime":{"mode":"twoConstants","constantMin":1.0,"constantMax":2.5},"startSpeed":{"mode":"twoConstants","constantMin":0.5,"constantMax":1.5},"startSize":{"mode":"twoConstants","constantMin":0.8,"constantMax":1.2},"startRotation":{"mode":"constant","constant":0},"startColor":{"r":0.8,"g":0.8,"b":0.8,"a":1.0},"gravityModifier":0.1,"physicsGravity":9.81,"emission":{"rateOverTime":{"mode":"constant","constant":20},"bursts":[]},"shape":{"enabled":true,"shapeType":"Cone","radius":0.5,"angle":15,"scale":{"x":1,"y":1,"z":1}},"colorOverLifetime":{"enabled":true,"colorStart":{"r":0.8,"g":0.8,"b":0.8,"a":1.0},"colorEnd":{"r":0.3,"g":0.3,"b":0.3,"a":0.0}},"sizeOverLifetime":{"enabled":true,"sizeStart":1.0,"sizeEnd":2.0},"rotationOverLifetime":{"enabled":true,"angularVelocity":{"mode":"twoConstants","constantMin":-45,"constantMax":45}}}"#;

mod libgdx_parse_parity {
    use super::*;

    #[test]
    fn maps_the_authored_document() {
        let config = parse_libgdx_particle(LIBGDX_SPARK, None);
        assert_eq!(config.max_particles, 100.0);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
        assert!((config.lifetime_min - 0.4).abs() < 1e-4);
        assert!((config.lifetime_max - 0.8).abs() < 1e-4);
        assert!((config.speed_min - 50.0).abs() < 1e-3);
        assert!((config.speed_max - 200.0).abs() < 1e-3);
        assert!(config.direction_x.abs() < 1e-2);
        assert!((config.direction_y + 1.0).abs() < 1e-2);
        assert!((config.spread - (30.0_f32 * std::f32::consts::PI / 180.0)).abs() < 1e-3);
        assert!((config.color_start_g - (0xaa as f32 / 255.0)).abs() < 1e-2);
        assert!(config.color_end_g.abs() < 1e-3);
        assert!((config.alpha_start - 1.0).abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert_eq!(format!("{:?}", config.emitter_shape), "Point");
        assert!((config.scale_end - 0.25).abs() < 1e-3);
        assert!(!config.looping);
        assert!((config.duration - 3.0).abs() < 1e-3);
    }

    #[test]
    fn normalizes_scale_and_maps_non_additive_blend() {
        let options = LibgdxParseOptions {
            texture_size: Some(32.0),
        };
        let config = parse_libgdx_particle(LIBGDX_SPARK, Some(&options));
        assert!((config.scale_min - 0.5).abs() < 1e-3);
        assert!((config.scale_max - 1.0).abs() < 1e-3);
        let text = LIBGDX_SPARK.replace("additive: true", "additive: false");
        assert_eq!(
            parse_libgdx_particle(&text, None).blend_mode.as_deref(),
            Some("normal")
        );
    }

    #[test]
    fn preserves_name_and_image_and_reports_its_unmapped_fields() {
        let result = parse_libgdx_particle_document(LIBGDX_SPARK, None);
        assert_eq!(result.document.name, "Spark");
        assert_eq!(result.document.image_path, "spark.png");
        let kinds: Vec<String> = result.diagnostics.iter().map(|d| d.kind.clone()).collect();
        assert_eq!(kinds, vec![String::from("libgdx.emission-unsupported")]);
        assert_eq!(
            result.diagnostics[0].severity,
            ImportDiagnosticSeverity::Recover
        );
        assert_eq!(result.diagnostics[0].origin, "collectLibgdxDiagnostics");
    }

    #[test]
    fn reports_each_supported_or_dropped_feature() {
        let cases = [
            (
                "Delay\nactive: false",
                "Delay\nactive: true",
                "libgdx.delay-unsupported",
                ImportDiagnosticSeverity::Skip,
            ),
            (
                "Life Offset\nactive: false",
                "Life Offset\nactive: true",
                "libgdx.life-offset-unsupported",
                ImportDiagnosticSeverity::Skip,
            ),
            (
                "X Offset\nactive: false",
                "X Offset\nactive: true",
                "libgdx.position-offset-unsupported",
                ImportDiagnosticSeverity::Skip,
            ),
            (
                "shape: point",
                "shape: line",
                "libgdx.line-shape-mapped-to-point",
                ImportDiagnosticSeverity::Recover,
            ),
            (
                "shape: point",
                "shape: point\nedges: true",
                "libgdx.spawn-edges-unsupported",
                ImportDiagnosticSeverity::Skip,
            ),
            (
                "colors: ffaa00,ff0000",
                "colors: ff0000,00ff00,0000ff",
                "libgdx.tint-reduced",
                ImportDiagnosticSeverity::Recover,
            ),
        ];
        for (from, to, kind, severity) in cases {
            let text = LIBGDX_SPARK.replace(from, to);
            let result = parse_libgdx_particle_document(&text, None);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == kind)
                .unwrap_or_else(|| panic!("missing {kind}"));
            assert_eq!(crumb.severity, severity);
            assert_eq!(crumb.origin, "collectLibgdxDiagnostics");
        }
        let premultiplied = LIBGDX_SPARK.replace(
            "maxParticleCount: 100",
            "maxParticleCount: 100\npremultipliedAlpha: true",
        );
        let result = parse_libgdx_particle_document(&premultiplied, None);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "libgdx.premultiplied-alpha-informational")
        );
        let reduced = LIBGDX_SPARK.replace(
            "highMax: 1\nrelative: false\nscalingCount: 2\nscaling0: 1\nscaling1: 0",
            "highMax: 1\nrelative: false\nscalingCount: 3\nscaling0: 1\nscaling1: 0.5\nscaling2: 0",
        );
        let result = parse_libgdx_particle_document(&reduced, None);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "libgdx.transparency-reduced")
        );
        let zero_rate = LIBGDX_SPARK.replace("highMin: 80\nhighMax: 120", "highMin: 0\nhighMax: 0");
        let result = parse_libgdx_particle_document(&zero_rate, None);
        assert_ne!(result.config.spawn_rate, 0.0);
        assert_eq!(
            result
                .diagnostics
                .iter()
                .map(|d| d.kind.clone())
                .collect::<Vec<_>>(),
            vec![String::from("libgdx.emission-unsupported")]
        );
    }
}

mod particle_designer_parse_parity {
    use super::*;

    #[test]
    fn maps_the_authored_plist() {
        let config = parse_particle_designer_plist(FIRE_PLIST, None);
        assert_eq!(config.max_particles, 200.0);
        assert!((config.lifetime_min - 1.0).abs() < 1e-3);
        assert!((config.lifetime_max - 2.0).abs() < 1e-3);
        assert!((config.speed_min - 80.0).abs() < 1e-3);
        assert!((config.speed_max - 120.0).abs() < 1e-3);
        assert!(config.direction_x.abs() < 1e-3);
        assert!((config.direction_y + 1.0).abs() < 1e-3);
        assert!((config.spread - (30.0_f32 * std::f32::consts::PI / 180.0)).abs() < 1e-4);
        assert!((config.gravity_y - 200.0).abs() < 1e-3);
        assert!((config.color_start_g - 0.5).abs() < 1e-3);
        assert!(config.color_end_g.abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert_eq!(format!("{:?}", config.emitter_shape), "Point");
        assert!(config.looping);
        assert_eq!(config.duration, 0.0);
    }

    #[test]
    fn normalizes_scale_and_computes_scale_end() {
        let options = ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
        let config = parse_particle_designer_plist(FIRE_PLIST, Some(&options));
        assert!((config.scale_min - 0.75).abs() < 1e-3);
        assert!((config.scale_max - 1.25).abs() < 1e-3);
        assert!((config.scale_end - 0.25).abs() < 1e-3);
    }

    #[test]
    fn maps_variance_blend_and_positive_duration() {
        let variance = FIRE_PLIST.replace(
            "<key>startColorVarianceRed</key><real>0</real>",
            "<key>startColorVarianceRed</key><real>0.3</real>",
        );
        assert!(
            (parse_particle_designer_plist(&variance, None).color_start_variance_r - 0.3).abs()
                < 1e-3
        );
        let additive = FIRE_PLIST.replace(
            "<key>blendFuncDestination</key><integer>771</integer>",
            "<key>blendFuncDestination</key><integer>1</integer>",
        );
        assert_eq!(
            parse_particle_designer_plist(&additive, None)
                .blend_mode
                .as_deref(),
            Some("add")
        );
        let timed = FIRE_PLIST.replace(
            "<key>duration</key><real>-1</real>",
            "<key>duration</key><real>2.5</real>",
        );
        let config = parse_particle_designer_plist(&timed, None);
        assert!(!config.looping);
        assert!((config.duration - 2.5).abs() < 1e-3);
    }

    #[test]
    fn falls_back_for_empty_tags_and_garbage() {
        let xml = "<plist><dict><key>maxParticles</key><integer></integer><key>speed</key><real></real></dict></plist>";
        let config = parse_particle_designer_plist(xml, None);
        assert_eq!(config.max_particles, 200.0);
        assert!(config.speed_min.is_finite());
        assert!(config.speed_max.is_finite());
        assert!(
            parse_particle_designer_plist("", None)
                .max_particles
                .is_finite()
        );
        assert!(
            parse_particle_designer_plist("not xml at all", None)
                .gravity_y
                .is_finite()
        );
    }

    #[test]
    fn document_preserves_values_and_reports_feature_losses() {
        let result = parse_particle_designer_plist_document(FIRE_PLIST, Some(&parse_texture_32()));
        assert_eq!(result.document.texture_file_name, "fire.png");
        assert_eq!(result.document.blend_func_source, 770.0);
        assert_eq!(result.document.blend_func_destination, 771.0);
        assert!(
            result
                .diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.severity != ImportDiagnosticSeverity::Skip)
                .count()
                == 0
        );
        let radial = FIRE_PLIST.replace(
            "<key>emitterType</key><integer>0</integer>",
            "<key>emitterType</key><integer>1</integer>",
        );
        let result = parse_particle_designer_plist_document(&radial, None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "particledesigner.radial-approximated")
            .expect("radial diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(crumb.origin, "collectParticleDesignerDiagnostics");
        for (from, to, kind) in [
            (
                "<key>finishParticleSizeVariance</key><real>0</real>",
                "<key>finishParticleSizeVariance</key><real>4</real>",
                "particledesigner.finish-size-variance-unsupported",
            ),
            (
                "<key>startColorVarianceAlpha</key><real>0</real>",
                "<key>startColorVarianceAlpha</key><real>0.5</real>",
                "particledesigner.alpha-variance-unsupported",
            ),
            (
                "<key>maxParticles</key><integer>200</integer>",
                "<key>maxParticles</key><integer>200</integer><key>radialAcceleration</key><real>50</real>",
                "particledesigner.radial-acceleration-unsupported",
            ),
            (
                "<key>maxParticles</key><integer>200</integer>",
                "<key>maxParticles</key><integer>200</integer><key>tangentialAcceleration</key><real>50</real>",
                "particledesigner.tangential-acceleration-unsupported",
            ),
        ] {
            let result =
                parse_particle_designer_plist_document(&FIRE_PLIST.replace(from, to), None);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == kind)
                .unwrap_or_else(|| panic!("missing {kind}"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "collectParticleDesignerDiagnostics");
        }
    }

    fn parse_texture_32() -> ParticleDesignerParseOptions {
        return ParticleDesignerParseOptions {
            texture_size: Some(32.0),
        };
    }
}

mod pixi_parse_parity {
    use super::*;

    #[test]
    fn maps_the_authored_json() {
        let config = parse_pixi_particle(PIXI_FIRE);
        assert_eq!(config.max_particles, 1000.0);
        assert!((config.spawn_rate - 1000.0).abs() < 1.0);
        assert!((config.lifetime_min - 0.5).abs() < 1e-3);
        assert!((config.lifetime_max - 1.5).abs() < 1e-3);
        assert!((config.speed_min - 50.0).abs() < 1e-3);
        assert!((config.speed_max - 200.0).abs() < 1e-3);
        assert!((config.alpha_start - 1.0).abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert!((config.color_start_g - (0xaa as f32 / 255.0)).abs() < 1e-2);
        assert!(config.color_end_g.abs() < 1e-3);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
        assert!((config.scale_min - 0.5).abs() < 1e-3);
        assert!((config.scale_max - 1.5).abs() < 1e-3);
    }

    #[test]
    fn maps_rect_circle_and_screen_space_angles() {
        let rect = parse_pixi_particle(PIXI_RECT);
        assert_eq!(rect.blend_mode.as_deref(), Some("normal"));
        assert_eq!(format!("{:?}", rect.emitter_shape), "Rect");
        assert!((rect.emitter_width - 100.0).abs() < 1e-3);
        assert!((rect.emitter_height - 100.0).abs() < 1e-3);
        let circle = parse_pixi_particle(
            r#"{"pos":{"x":0,"y":0},"alpha":{"start":1},"spawnCircle":{"x":0,"y":0,"r":30}}"#,
        );
        assert_eq!(format!("{:?}", circle.emitter_shape), "Circle");
        assert!((circle.emitter_radius - 30.0).abs() < 1e-3);
        let angle = parse_pixi_particle(
            r#"{"pos":{"x":0,"y":0},"alpha":{"start":1},"angle":{"min":90,"max":90}}"#,
        );
        assert!(angle.direction_x.abs() < 1e-3);
        assert!((angle.direction_y - 1.0).abs() < 1e-3);
    }

    #[test]
    fn rejects_invalid_json_and_non_object_roots_with_source_messages() {
        let failure =
            std::panic::catch_unwind(|| parse_pixi_particle("{not valid")).expect_err("panic");
        assert!(str::contains(
            &panic_message(failure),
            "Invalid Pixi particle JSON"
        ));
        for text in ["null", "[1,2]"] {
            let failure =
                std::panic::catch_unwind(|| parse_pixi_particle(text)).expect_err("panic");
            assert!(str::contains(
                &panic_message(failure),
                "expected a JSON object"
            ));
        }
    }

    #[test]
    fn falls_back_for_an_empty_object_and_reports_unsupported_features() {
        let config = parse_pixi_particle("{}");
        assert!(config.max_particles.is_finite());
        assert!(config.lifetime_min.is_finite());
        assert!(
            parse_pixi_particle_document(PIXI_FIRE)
                .diagnostics
                .is_empty()
        );
        for (extra, kind, severity) in [
            (
                r#""acceleration":{"x":0,"y":100}"#,
                "pixi.acceleration-unsupported",
                ImportDiagnosticSeverity::Skip,
            ),
            (
                r#""spawnBurst":{"count":5,"time":0.5}"#,
                "pixi.spawn-burst-mapped-to-point",
                ImportDiagnosticSeverity::Recover,
            ),
            (
                r#""spawnPolygon":[{"x":0,"y":0}]"#,
                "pixi.spawn-polygon-mapped-to-point",
                ImportDiagnosticSeverity::Recover,
            ),
            (
                r#""behaviors":[{"type":"moveSpeed"}]"#,
                "pixi.behaviors-partial",
                ImportDiagnosticSeverity::Skip,
            ),
        ] {
            let json = format!(
                r#"{{"pos":{{"x":0,"y":0}},"alpha":{{"start":1}},{}}}"#,
                extra
            );
            let result = parse_pixi_particle_document(&json);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == kind)
                .unwrap_or_else(|| panic!("missing {kind}"));
            assert_eq!(crumb.severity, severity);
            assert_eq!(crumb.origin, "collectPixiDiagnostics");
        }
    }
}

mod spine_parse_parity {
    use super::*;

    #[test]
    fn maps_the_authored_json() {
        let config = parse_spine_particle(SPINE_SPARK);
        assert_eq!(config.max_particles, 300.0);
        assert_eq!(config.blend_mode.as_deref(), Some("add"));
        assert!((config.lifetime_min - 0.4).abs() < 1e-4);
        assert!((config.lifetime_max - 0.8).abs() < 1e-4);
        assert!((config.spawn_rate - 100.0).abs() < 1e-3);
        assert!((config.speed_min - 50.0).abs() < 1e-3);
        assert!((config.speed_max - 200.0).abs() < 1e-3);
        assert!(config.direction_x.abs() < 1e-2);
        assert!((config.direction_y + 1.0).abs() < 1e-2);
        assert!((config.spread - (30.0_f32 * std::f32::consts::PI / 180.0)).abs() < 1e-3);
        assert!((config.gravity_y - 200.0).abs() < 1e-3);
        assert!((config.color_start_g - (0xaa as f32 / 255.0)).abs() < 1e-2);
        assert!(config.color_end_g.abs() < 1e-3);
        assert!((config.alpha_start - 1.0).abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert!((config.rotation_speed_max - 360.0_f32.to_radians()).abs() < 1e-3);
        assert!(config.looping);
        assert_eq!(config.duration, 0.0);
        assert!(config.color_curve.is_none());
        assert!(config.alpha_curve.is_none());
    }

    #[test]
    fn maps_normal_blend_and_finite_duration() {
        let normal = SPINE_SPARK.replace("\"blendMode\":\"additive\"", "\"blendMode\":\"normal\"");
        assert_eq!(
            parse_spine_particle(&normal).blend_mode.as_deref(),
            Some("normal")
        );
        let timed = SPINE_SPARK
            .replace("\"continuous\":true", "\"continuous\":false")
            .replace("\"duration\":-1", "\"duration\":2000");
        let config = parse_spine_particle(&timed);
        assert!(!config.looping);
        assert!((config.duration - 2.0).abs() < 1e-3);
    }

    #[test]
    fn bakes_three_stop_timelines_into_curves() {
        let tinted = SPINE_SPARK.replace(
            "\"tint\":[{\"time\":0,\"color\":\"ffaa00\"},{\"time\":1,\"color\":\"ff0000\"}]",
            "\"tint\":[{\"time\":0,\"color\":\"ff0000\"},{\"time\":0.5,\"color\":\"00ff00\"},{\"time\":1,\"color\":\"0000ff\"}]",
        );
        let curve = parse_spine_particle(&tinted)
            .color_curve
            .expect("color curve");
        let mut out = [0.0_f32, 0.0, 0.0];
        sample_particle_color_curve(&mut out, 0, &curve, 0.5);
        assert!(out[1] > 0.8);
        assert!(out[0] < 0.2);
        let faded = SPINE_SPARK.replace(
            "\"alpha\":[{\"time\":0,\"alpha\":1},{\"time\":1,\"alpha\":0}]",
            "\"alpha\":[{\"time\":0,\"alpha\":0},{\"time\":0.5,\"alpha\":1},{\"time\":1,\"alpha\":0}]",
        );
        let curve = parse_spine_particle(&faded)
            .alpha_curve
            .expect("alpha curve");
        assert!(sample_particle_curve(&curve, 0.5) > 0.9);
        assert!(sample_particle_curve(&curve, 0.0) < 0.1);
    }

    #[test]
    fn rejects_malformed_documents_with_exact_messages() {
        let failure =
            std::panic::catch_unwind(|| parse_spine_particle("{not valid")).expect_err("panic");
        assert!(str::contains(
            &panic_message(failure),
            "Invalid Spine particle JSON"
        ));
        for text in ["null", "\"a string\"", "[1,2,3]"] {
            let failure =
                std::panic::catch_unwind(|| parse_spine_particle(text)).expect_err("panic");
            assert!(str::contains(
                &panic_message(failure),
                "expected a JSON object"
            ));
        }
        let failure = std::panic::catch_unwind(|| {
            parse_spine_particle(r#"{"continuous":true,"tint":[null]}"#)
        })
        .expect_err("panic");
        assert_eq!(
            panic_message(failure),
            "Invalid Spine particle document: tint[0] must be a JSON object"
        );
        let failure = std::panic::catch_unwind(|| {
            parse_spine_particle(r#"{"alpha":[null],"continuous":true}"#)
        })
        .expect_err("panic");
        assert_eq!(
            panic_message(failure),
            "Invalid Spine particle document: alpha[0] must be a JSON object"
        );
        let failure = std::panic::catch_unwind(|| {
            parse_spine_particle_document(r#"{"continuous":true,"images":[7]}"#)
        })
        .err()
        .expect("panic");
        assert_eq!(
            panic_message(failure),
            "Invalid Spine particle document: images[0] must be a string"
        );
    }

    #[test]
    fn accepts_valid_nested_keyframes_and_sanitizes_bad_colors() {
        let result = parse_spine_particle_document(
            r#"{"alpha":[{"alpha":0.75,"time":0}],"continuous":true,"images":["particle.png"],"tint":[{"color":"336699","time":0}]}"#,
        );
        assert!((result.config.alpha_start - 0.75).abs() < 1e-3);
        assert!((result.config.color_start_b - 0.6).abs() < 1e-2);
        assert_eq!(result.document.images, vec![String::from("particle.png")]);
        assert_eq!(result.document.tint[0].color, "336699");
        let config = parse_spine_particle(r#"{"tint":[{"time":0,"color":"zzzzzz"}]}"#);
        assert!(config.color_start_r.is_finite());
        assert!(config.color_start_g.is_finite());
        assert!(config.color_start_b.is_finite());
        let empty = parse_spine_particle("{}");
        assert!(empty.lifetime_min.is_finite());
        assert!(empty.spawn_rate.is_finite());
        assert!(empty.color_start_r.is_finite());
    }

    #[test]
    fn document_preserves_features_and_reports_losses() {
        let result = parse_spine_particle_document(SPINE_SPARK);
        assert_eq!(result.document.name, "spark");
        assert_eq!(result.document.blend_mode, SpineBlendMode::Additive);
        assert_eq!(result.document.images[0], "spark.png");
        assert!(result.diagnostics.is_empty());
        let life_offset = SPINE_SPARK.replace(
            "\"lifeOffset\":{\"low\":0,\"high\":0}",
            "\"lifeOffset\":{\"low\":100,\"high\":200}",
        );
        let position = SPINE_SPARK.replace(
            "\"x\":{\"low\":0,\"high\":0}",
            "\"x\":{\"low\":0,\"high\":50}",
        );
        let premultiplied =
            SPINE_SPARK.replace("\"premultiplied\":false", "\"premultiplied\":true");
        for (text, kind) in [
            (life_offset, "spine.life-offset-unsupported"),
            (position, "spine.position-range-unsupported"),
            (premultiplied, "spine.premultiplied-informational"),
        ] {
            let result = parse_spine_particle_document(&text);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == kind)
                .unwrap_or_else(|| panic!("missing {kind}"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "collectSpineDiagnostics");
        }
    }
}

mod spine_serialize_parity {
    use super::*;

    #[test]
    fn document_text_is_valid_json_with_no_default_warnings() {
        let config = flight_particles::create_particle_emitter_config(None);
        let result = serialize_spine_particle_document(&config, None);
        let parsed: serde_json::Value = serde_json::from_str(&result.text).expect("valid json");
        assert!(parsed.is_object());
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn round_trips_lifetime() {
        let config = parse_spine_particle(SPINE_SPARK);
        let document = parse_spine_particle_document(SPINE_SPARK).document;
        let reparsed = parse_spine_particle(&serialize_spine_particle(&config, Some(&document)));
        assert_eq!(reparsed.max_particles, config.max_particles);
        assert!((reparsed.lifetime_min - config.lifetime_min).abs() < 1e-3);
        assert!((reparsed.lifetime_max - config.lifetime_max).abs() < 1e-3);
    }
}

mod starling_pex_parse_parity {
    use super::*;

    #[test]
    fn maps_the_authored_pex() {
        let config = parse_starling_pex(FIRE_PEX, None);
        assert_eq!(config.max_particles, 200.0);
        assert!((config.lifetime_min - 1.0).abs() < 1e-3);
        assert!((config.lifetime_max - 2.0).abs() < 1e-3);
        assert!((config.speed_min - 80.0).abs() < 1e-3);
        assert!((config.speed_max - 120.0).abs() < 1e-3);
        assert!(config.direction_x.abs() < 1e-3);
        assert!((config.direction_y + 1.0).abs() < 1e-3);
        assert!((config.spread - (30.0_f32 * std::f32::consts::PI / 180.0)).abs() < 1e-4);
        assert!((config.gravity_y - 200.0).abs() < 1e-3);
        assert!((config.color_start_g - 0.5).abs() < 1e-3);
        assert!(config.color_end_g.abs() < 1e-3);
        assert!((config.alpha_start - 1.0).abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert_eq!(config.blend_mode.as_deref(), Some("normal"));
        assert!(config.looping);
        assert_eq!(config.duration, 0.0);
        assert_eq!(format!("{:?}", config.emitter_shape), "Point");
    }

    #[test]
    fn normalizes_scale_and_maps_additive_and_circle() {
        let options = StarlingPexParseOptions {
            texture_size: Some(32.0),
        };
        let scaled = parse_starling_pex(FIRE_PEX, Some(&options));
        assert!((scaled.scale_min - 0.75).abs() < 1e-3);
        assert!((scaled.scale_max - 1.25).abs() < 1e-3);
        let additive = FIRE_PEX.replace(
            "blendFuncDestination\" value=\"771\"",
            "blendFuncDestination\" value=\"1\"",
        );
        assert_eq!(
            parse_starling_pex(&additive, None).blend_mode.as_deref(),
            Some("add")
        );
        let circular = FIRE_PEX
            .replace(
                "sourcePositionVariancex\" value=\"0\"",
                "sourcePositionVariancex\" value=\"20\"",
            )
            .replace(
                "sourcePositionVariancey\" value=\"0\"",
                "sourcePositionVariancey\" value=\"20\"",
            );
        let config = parse_starling_pex(&circular, None);
        assert_eq!(format!("{:?}", config.emitter_shape), "Circle");
        assert!((config.emitter_radius - 20.0).abs() < 1e-3);
    }

    #[test]
    fn rejects_non_xml_input() {
        for text in ["not xml", "{}"] {
            let failure =
                std::panic::catch_unwind(|| parse_starling_pex(text, None)).expect_err("panic");
            assert!(str::contains(
                &panic_message(failure),
                "Invalid Starling PEX"
            ));
        }
    }

    #[test]
    fn document_preserves_values_and_reports_losses() {
        let result = parse_starling_pex_document(FIRE_PEX, None);
        assert_eq!(result.document.texture_file_name, "fire.png");
        assert_eq!(result.document.blend_func_source, 770.0);
        assert_eq!(result.document.blend_func_destination, 771.0);
        assert!(result.diagnostics.is_empty());
        let radial = FIRE_PEX.replace("emitterType\" value=\"0\"", "emitterType\" value=\"1\"");
        let result = parse_starling_pex_document(&radial, None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "starlingpex.radial-approximated")
            .expect("radial diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(crumb.origin, "collectStarlingPexDiagnostics");
        for (from, to, kind) in [
            (
                "radialAcceleration\" value=\"0\"",
                "radialAcceleration\" value=\"50\"",
                "starlingpex.radial-acceleration-unsupported",
            ),
            (
                "tangentialAcceleration\" value=\"0\"",
                "tangentialAcceleration\" value=\"50\"",
                "starlingpex.tangential-acceleration-unsupported",
            ),
            (
                "finishParticleSizeVariance\" value=\"0\"",
                "finishParticleSizeVariance\" value=\"4\"",
                "starlingpex.finish-size-variance-unsupported",
            ),
            (
                "startColorVariance\" red=\"0\" green=\"0\" blue=\"0\" alpha=\"0\"",
                "startColorVariance\" red=\"0\" green=\"0\" blue=\"0\" alpha=\"0.5\"",
                "starlingpex.alpha-variance-unsupported",
            ),
        ] {
            let result = parse_starling_pex_document(&FIRE_PEX.replace(from, to), None);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == kind)
                .unwrap_or_else(|| panic!("missing {kind}"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "collectStarlingPexDiagnostics");
        }
    }
}

mod unity_parse_parity {
    use super::*;

    fn ppu() -> UnityParseOptions {
        return UnityParseOptions {
            pixels_per_unit: Some(100.0),
        };
    }

    #[test]
    fn maps_the_authored_json() {
        let config = parse_unity_particle(UNITY_SMOKE, Some(&ppu()));
        assert_eq!(config.max_particles, 500.0);
        assert!((config.lifetime_min - 1.0).abs() < 1e-3);
        assert!((config.lifetime_max - 2.5).abs() < 1e-3);
        assert!((config.speed_min - 50.0).abs() < 1e-3);
        assert!((config.speed_max - 150.0).abs() < 1e-3);
        assert!((config.gravity_y - 0.1 * 9.81 * 100.0).abs() < 0.1);
        assert!((config.spread - (15.0_f32 * std::f32::consts::PI / 180.0)).abs() < 1e-3);
        assert!((config.color_start_r - 0.8).abs() < 1e-3);
        assert!((config.color_end_r - 0.3).abs() < 1e-3);
        assert!((config.alpha_start - 1.0).abs() < 1e-3);
        assert!(config.alpha_end.abs() < 1e-3);
        assert!((config.scale_end - 2.0).abs() < 1e-3);
        assert!((config.rotation_speed_min - (-45.0_f32).to_radians()).abs() < 1e-3);
        assert!((config.rotation_speed_max - 45.0_f32.to_radians()).abs() < 1e-3);
        assert!(config.looping);
        assert_eq!(config.duration, 0.0);
        assert!(config.color_curve.is_none());
        assert!(config.alpha_curve.is_none());
        assert!(config.scale_curve.is_none());
    }

    #[test]
    fn maps_finite_duration_and_bursts() {
        let timed = UNITY_SMOKE
            .replace("\"looping\":true", "\"looping\":false")
            .replace("\"duration\":5.0", "\"duration\":3.0");
        let config = parse_unity_particle(&timed, Some(&ppu()));
        assert!(!config.looping);
        assert!((config.duration - 3.0).abs() < 1e-3);
        let burst = UNITY_SMOKE.replace(
            "\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":20},\"bursts\":[]}",
            "\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":0},\"bursts\":[{\"time\":0,\"count\":25,\"cycleCount\":0,\"repeatInterval\":2}]}",
        );
        let config = parse_unity_particle(&burst, Some(&ppu()));
        assert_eq!(config.burst_count, 25.0);
        assert_eq!(config.burst_interval, 2.0);
    }

    #[test]
    fn bakes_gradient_and_size_curves() {
        let gradient = UNITY_SMOKE.replace(
            "\"colorOverLifetime\":{\"enabled\":true,\"colorStart\":{\"r\":0.8,\"g\":0.8,\"b\":0.8,\"a\":1.0},\"colorEnd\":{\"r\":0.3,\"g\":0.3,\"b\":0.3,\"a\":0.0}}",
            "\"colorOverLifetime\":{\"enabled\":true,\"gradient\":{\"colorKeys\":[{\"time\":0,\"color\":{\"r\":1,\"g\":0,\"b\":0}},{\"time\":0.5,\"color\":{\"r\":0,\"g\":1,\"b\":0}},{\"time\":1,\"color\":{\"r\":0,\"g\":0,\"b\":1}}],\"alphaKeys\":[{\"time\":0,\"alpha\":0},{\"time\":0.5,\"alpha\":1},{\"time\":1,\"alpha\":0}]}}",
        );
        let config = parse_unity_particle(&gradient, Some(&ppu()));
        let color = config.color_curve.expect("color curve");
        let alpha = config.alpha_curve.expect("alpha curve");
        let mut out = [0.0_f32, 0.0, 0.0];
        sample_particle_color_curve(&mut out, 0, &color, 0.5);
        assert!(out[1] > 0.8);
        assert!(sample_particle_curve(&alpha, 0.5) > 0.9);
        let size = UNITY_SMOKE.replace(
            "\"sizeOverLifetime\":{\"enabled\":true,\"sizeStart\":1.0,\"sizeEnd\":2.0}",
            "\"sizeOverLifetime\":{\"enabled\":true,\"curve\":{\"keys\":[{\"time\":0,\"value\":0},{\"time\":0.5,\"value\":1},{\"time\":1,\"value\":0}]}}",
        );
        let curve = parse_unity_particle(&size, Some(&ppu()))
            .scale_curve
            .expect("scale curve");
        assert!(sample_particle_curve(&curve, 0.5) > sample_particle_curve(&curve, 0.0));
        let result = parse_unity_particle_document(&gradient, None);
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind.to_lowercase().contains("gradient"))
        );
    }

    #[test]
    fn rejects_malformed_json_and_non_object_roots() {
        let failure = std::panic::catch_unwind(|| parse_unity_particle("{not valid", None))
            .expect_err("panic");
        assert!(str::contains(
            &panic_message(failure),
            "Invalid Unity particle JSON"
        ));
        for text in ["null", "42", "[]"] {
            let failure =
                std::panic::catch_unwind(|| parse_unity_particle(text, None)).expect_err("panic");
            assert!(str::contains(
                &panic_message(failure),
                "expected a JSON object"
            ));
        }
        let empty = parse_unity_particle("{}", None);
        assert!(empty.max_particles.is_finite());
        assert!(empty.lifetime_min.is_finite());
        assert!(empty.gravity_y.is_finite());
        assert!(empty.spawn_rate.is_finite());
    }

    #[test]
    fn document_preserves_values_and_reports_losses() {
        let result = parse_unity_particle_document(UNITY_SMOKE, Some(&ppu()));
        assert_eq!(result.document.name, "smoke");
        assert!(result.document.looping);
        assert!(!result.document.prewarm);
        assert!(result.diagnostics.is_empty());
        let modules = UNITY_SMOKE.replace(
            "\"rotationOverLifetime\":{\"enabled\":true,\"angularVelocity\":{\"mode\":\"twoConstants\",\"constantMin\":-45,\"constantMax\":45}}",
            "\"rotationOverLifetime\":{\"enabled\":true,\"angularVelocity\":{\"mode\":\"twoConstants\",\"constantMin\":-45,\"constantMax\":45}},\"noise\":{\"enabled\":true},\"collision\":{\"enabled\":true},\"trails\":{\"enabled\":false}",
        );
        let result = parse_unity_particle_document(&modules, Some(&ppu()));
        let module = |name: &str| {
            result.diagnostics.iter().find(|diagnostic| {
                diagnostic.kind == "unity.module-unsupported"
                    && diagnostic
                        .detail
                        .as_ref()
                        .and_then(|detail| detail.get("module"))
                        == Some(&ImportDiagnosticDetailValue::String(String::from(name)))
            })
        };
        let noise = module("noise").expect("noise diagnostic");
        assert_eq!(noise.severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(noise.origin, "collectUnityDiagnostics");
        assert!(module("collision").is_some());
        assert!(module("trails").is_none());

        let bursts = UNITY_SMOKE.replace(
            "\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":20},\"bursts\":[]}",
            "\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":0},\"bursts\":[{\"time\":0,\"count\":5},{\"time\":1,\"count\":5}]}",
        );
        let result = parse_unity_particle_document(&bursts, None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "unity.extra-bursts-unsupported")
            .expect("burst diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
        assert_eq!(crumb.origin, "collectUnityDiagnostics");
        assert_eq!(
            crumb
                .detail
                .as_ref()
                .and_then(|detail| detail.get("burstCount")),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );

        let donut = UNITY_SMOKE.replace(
            "\"shape\":{\"enabled\":true,\"shapeType\":\"Cone\",\"radius\":0.5,\"angle\":15,\"scale\":{\"x\":1,\"y\":1,\"z\":1}}",
            "\"shape\":{\"enabled\":true,\"shapeType\":\"Donut\"}",
        );
        let result = parse_unity_particle_document(&donut, None);
        let crumb = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.kind == "unity.shape-unsupported")
            .expect("shape diagnostic");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(crumb.origin, "collectUnityDiagnostics");
        assert_eq!(
            crumb
                .detail
                .as_ref()
                .and_then(|detail| detail.get("shapeType")),
            Some(&ImportDiagnosticDetailValue::String(String::from("Donut")))
        );

        let prewarm = UNITY_SMOKE.replace("\"prewarm\":false", "\"prewarm\":true");
        let result = parse_unity_particle_document(&prewarm, None);
        assert_eq!(
            result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == "unity.prewarm-unsupported")
                .expect("prewarm diagnostic")
                .severity,
            ImportDiagnosticSeverity::Skip
        );
        for rotation in [
            "\"startRotation\":{\"mode\":\"constant\",\"constant\":45}",
            "\"startRotation\":{\"mode\":\"curve\",\"curve\":{\"keys\":[{\"time\":0,\"value\":90}]}}",
        ] {
            let text = UNITY_SMOKE.replace(
                "\"startRotation\":{\"mode\":\"constant\",\"constant\":0}",
                rotation,
            );
            let result = parse_unity_particle_document(&text, None);
            let crumb = result
                .diagnostics
                .iter()
                .find(|diagnostic| diagnostic.kind == "unity.start-rotation-unsupported")
                .expect("rotation diagnostic");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "collectUnityDiagnostics");
        }
    }
}

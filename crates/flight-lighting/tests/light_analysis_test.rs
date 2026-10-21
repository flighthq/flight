use flight_entity::{Entity, EntityRuntimeSlot};
use flight_geometry::{BoundingSphere, create_bounding_sphere, create_vector3};
use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 options and the custom open-kind fixture are plain records with no create factory

fn sphere(x: f32, y: f32, z: f32, radius: f32) -> BoundingSphere {
    return create_bounding_sphere(x, y, z, radius);
}

fn close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 0.000_1,
        "{actual} != {expected}"
    );
}

fn custom_light(kind: &str) -> CustomLight {
    let mut light: CustomLight = flight_entity::allocate_entity();
    light.kind = kind.to_string();
    return light;
}

#[derive(Debug, Default)]
struct CustomLight {
    runtime: EntityRuntimeSlot,
    kind: String,
    enabled: Option<bool>,
    casts_shadow: Option<bool>,
    color: u32,
    intensity: f32,
}

impl Entity for CustomLight {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return &self.runtime;
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return &mut self.runtime;
    }
}

impl Light for CustomLight {
    fn casts_shadow_value(&self) -> Option<bool> {
        return self.casts_shadow;
    }

    fn colored_intensity(&self) -> Option<(u32, f32)> {
        return Some((self.color, self.intensity));
    }

    fn enabled_value(&self) -> Option<bool> {
        return self.enabled;
    }

    fn kind(&self) -> &str {
        return &self.kind;
    }
}

mod get_light_contribution_at_bounding_sphere {
    use super::*;

    #[test]
    fn applies_decay_radius_slack_range_window_and_disable_gate() {
        let inverse_square = create_point_light(Some(&PointLightOptions {
            position: Some(create_vector3(0.0, 0.0, 0.0)),
            range: Some(-1.0),
            ..crate::point_options()
        }));
        close(
            get_light_contribution_at_bounding_sphere(&inverse_square, &sphere(2.0, 0.0, 0.0, 0.0)),
            0.25,
        );
        close(
            get_light_contribution_at_bounding_sphere(&inverse_square, &sphere(4.0, 0.0, 0.0, 2.0)),
            0.25,
        );
        let linear = create_point_light(Some(&PointLightOptions {
            decay: Some(1.0),
            ..crate::point_options()
        }));
        close(
            get_light_contribution_at_bounding_sphere(&linear, &sphere(4.0, 0.0, 0.0, 0.0)),
            0.25,
        );
        let finite = create_point_light(Some(&PointLightOptions {
            range: Some(4.0),
            ..crate::point_options()
        }));
        assert_eq!(
            get_light_contribution_at_bounding_sphere(&finite, &sphere(4.0, 0.0, 0.0, 0.0)),
            0.0
        );
        let disabled = create_point_light(Some(&PointLightOptions {
            enabled: Some(false),
            ..crate::point_options()
        }));
        assert_eq!(
            get_light_contribution_at_bounding_sphere(&disabled, &sphere(0.0, 0.0, 0.0, 0.0)),
            0.0
        );
        assert_eq!(
            get_light_contribution_at_bounding_sphere(
                &inverse_square,
                &sphere(0.0, 0.0, 0.0, -1.0)
            ),
            0.0
        );
    }

    #[test]
    fn applies_spot_smoothstep_and_propagates_nan_for_invalid_geometry() {
        let spot = create_spot_light(Some(&SpotLightOptions {
            direction: Some(create_vector3(1.0, 0.0, 0.0)),
            inner_cone_degrees: Some(10.0),
            outer_cone_degrees: Some(30.0),
            ..crate::spot_options()
        }));
        assert!(
            get_light_contribution_at_bounding_sphere(&spot, &sphere(4.0, 0.0, 0.0, 0.0)) > 0.0
        );
        assert_eq!(
            get_light_contribution_at_bounding_sphere(&spot, &sphere(0.0, 4.0, 0.0, 0.0)),
            0.0
        );
        assert!(
            get_light_contribution_at_bounding_sphere(&spot, &sphere(f32::NAN, 0.0, 0.0, 0.0))
                .is_nan()
        );
    }
}

mod get_light_influence_bounds {
    use super::*;

    #[test]
    fn emits_disabled_unlimited_and_finite_sentinels() {
        let mut out = sphere(9.0, 8.0, 7.0, -1.0);
        get_light_influence_bounds(
            &mut out,
            &create_point_light(Some(&PointLightOptions {
                enabled: Some(false),
                ..crate::point_options()
            })),
        );
        assert_eq!(
            (out.center.x, out.center.y, out.center.z, out.radius),
            (0.0, 0.0, 0.0, 0.0)
        );
        get_light_influence_bounds(&mut out, &create_ambient_light(None));
        assert_eq!(out.radius, -1.0);
        get_light_influence_bounds(
            &mut out,
            &create_area_light(Some(&AreaLightOptions {
                position: Some(create_vector3(5.0, 2.0, 1.0)),
                range: Some(3.0),
                ..crate::area_options()
            })),
        );
        assert_eq!(
            (out.center.x, out.center.y, out.center.z, out.radius),
            (5.0, 2.0, 1.0, 3.0)
        );
    }
}

mod get_light_luminance {
    use super::*;

    #[test]
    fn dispatches_builtins_in_linear_light_and_rejects_custom_kinds() {
        assert_eq!(
            get_light_luminance(&create_ambient_light(Some(&AmbientLightOptions {
                color: Some(0x0000_00ff),
                ..crate::ambient_options()
            }))),
            0.0
        );
        close(
            get_light_luminance(&create_ambient_light(Some(&AmbientLightOptions {
                color: Some(0x8080_80ff),
                ..crate::ambient_options()
            }))),
            0.215_86,
        );
        close(
            get_light_luminance(&create_hemisphere_light(Some(&HemisphereLightOptions {
                ground_color: Some(0x0000_00ff),
                intensity: Some(2.0),
                sky_color: Some(0xffff_ffff),
                ..crate::hemisphere_options()
            }))),
            1.0,
        );
        assert_eq!(get_light_luminance(&create_environment(None)), 0.0);
        let custom = CustomLight {
            enabled: Some(true),
            color: 0xffff_ffff,
            intensity: 5.0,
            ..custom_light("acme:GlowLight")
        };
        assert_eq!(get_light_luminance(&custom), 0.0);
    }
}

mod has_light_influence_on_bounds {
    use super::*;

    #[test]
    fn handles_unlimited_overlap_empty_and_open_kinds() {
        let bounds = sphere(20.0, 0.0, 0.0, 1.0);
        assert!(has_light_influence_on_bounds(
            &create_ambient_light(None),
            &bounds
        ));
        assert!(!has_light_influence_on_bounds(
            &create_point_light(Some(&PointLightOptions {
                range: Some(5.0),
                ..crate::point_options()
            })),
            &bounds
        ));
        assert!(has_light_influence_on_bounds(
            &create_point_light(Some(&PointLightOptions {
                range: Some(-1.0),
                ..crate::point_options()
            })),
            &bounds
        ));
        assert!(!has_light_influence_on_bounds(
            &create_point_light(Some(&PointLightOptions {
                range: Some(10.0),
                ..crate::point_options()
            })),
            &sphere(0.0, 0.0, 0.0, -1.0)
        ));
        let custom = custom_light("acme:GlowLight");
        assert!(has_light_influence_on_bounds(&custom, &bounds));
    }
}

mod is_light_casting_shadow {
    use super::*;

    #[test]
    fn returns_strict_booleans_for_builtin_and_open_kinds() {
        assert!(!is_light_casting_shadow(&create_ambient_light(None)));
        assert!(is_light_casting_shadow(&create_directional_light(Some(
            &DirectionalLightOptions {
                casts_shadow: Some(true),
                ..crate::directional_options()
            }
        ))));
        assert!(!is_light_casting_shadow(&create_directional_light(Some(
            &DirectionalLightOptions {
                casts_shadow: Some(true),
                enabled: Some(false),
                ..crate::directional_options()
            }
        ))));
        let custom = CustomLight {
            casts_shadow: Some(true),
            ..custom_light("acme:GlowLight")
        };
        assert!(is_light_casting_shadow(&custom));
        let absent = custom_light("acme:OtherLight");
        assert!(!is_light_casting_shadow(&absent));
    }
}

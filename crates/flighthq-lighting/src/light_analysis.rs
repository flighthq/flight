//! Light analysis utilities: influence bounds, luminance, overlap, and shadow
//! queries that dispatch across light variants.

use flighthq_types::{BoundingSphere, Light, Vector3};

/// Writes the world-space influence bounding sphere of a light into `out`. The
/// sphere bounds the region the light can illuminate. Lights with a finite
/// `range` produce a sphere centered at `position` with `radius = range`.
/// Non-spatial lights (ambient, hemisphere, environment) and infinite-range
/// spatial lights (directional, or point/spot/area with `range < 0`) produce a
/// sentinel sphere with `radius = -1` (unlimited reach).
pub fn get_light_influence_bounds(out: &mut BoundingSphere, light: &Light) {
    match light {
        Light::Ambient(_) | Light::Hemisphere(_) => {
            out.center = Vector3::default();
            out.radius = -1.0;
        }
        Light::Directional(_) => {
            out.center = Vector3::default();
            out.radius = -1.0;
        }
        Light::Point(p) => {
            if p.range < 0.0 {
                out.center = Vector3::default();
                out.radius = -1.0;
            } else {
                out.center = p.position;
                out.radius = p.range;
            }
        }
        Light::Spot(s) => {
            if s.range < 0.0 {
                out.center = Vector3::default();
                out.radius = -1.0;
            } else {
                out.center = s.position;
                out.radius = s.range;
            }
        }
        Light::Area(a) => {
            if a.range < 0.0 {
                out.center = Vector3::default();
                out.radius = -1.0;
            } else {
                out.center = a.position;
                out.radius = a.range;
            }
        }
    }
}

/// Returns the perceptual luminance of a light's color x intensity. The
/// luminance is computed from the packed sRGB-albedo RGBA color using the
/// standard ITU-R BT.709 coefficients, then scaled by `intensity`. Useful for
/// ranking lights by visual importance when prioritizing a forward-light budget.
///
/// Returns `0.0` for light variants that have no `color` field (currently none,
/// but future-proofs).
pub fn get_light_luminance(light: &Light) -> f32 {
    let (color, intensity) = match light {
        Light::Ambient(l) => (l.color, l.intensity),
        Light::Directional(l) => (l.color, l.intensity),
        Light::Point(l) => (l.color, l.intensity),
        Light::Spot(l) => (l.color, l.intensity),
        Light::Hemisphere(l) => (l.sky_color, l.intensity),
        Light::Area(l) => (l.color, l.intensity),
    };
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma * intensity
}

/// Returns `true` when `light` could influence a point within `bounds`.
/// Non-spatial lights (ambient, hemisphere, directional) and infinite-range
/// lights always return `true`. For spatial lights with a finite range, tests
/// whether the influence sphere intersects `bounds` using a sphere-sphere
/// overlap test. An empty `bounds` (radius < 0) is treated as no overlap.
pub fn has_light_influence_on_bounds(light: &Light, bounds: &BoundingSphere) -> bool {
    let mut scratch = BoundingSphere {
        center: Vector3::default(),
        radius: -1.0,
    };
    get_light_influence_bounds(&mut scratch, light);

    // Sentinel radius (-1) = unlimited reach.
    if scratch.radius < 0.0 {
        return true;
    }
    // Empty bounds -- treat as no overlap.
    if bounds.radius < 0.0 {
        return false;
    }
    // Sphere-sphere overlap: distance between centers <= sum of radii.
    let dx = scratch.center.x - bounds.center.x;
    let dy = scratch.center.y - bounds.center.y;
    let dz = scratch.center.z - bounds.center.z;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    let rad_sum = scratch.radius + bounds.radius;
    dist_sq <= rad_sum * rad_sum
}

/// Returns `true` when the light is configured to cast shadows. Non-shadow-
/// capable light types (ambient, hemisphere) always return `false`.
pub fn is_light_shadow_casting(light: &Light) -> bool {
    match light {
        Light::Ambient(_) | Light::Hemisphere(_) => false,
        Light::Directional(l) => l.casts_shadow,
        Light::Point(l) => l.casts_shadow,
        Light::Spot(l) => l.casts_shadow,
        Light::Area(l) => l.casts_shadow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AreaLightOptions, DirectionalLightOptions, PointLightOptions, SpotLightOptions,
        create_area_light, create_directional_light, create_point_light, create_spot_light,
    };
    use flighthq_types::{AmbientLight, HemisphereLight, Vector3Like};

    mod get_light_influence_bounds {
        use super::*;

        #[test]
        fn ambient_light_has_unlimited_reach() {
            let light = Light::Ambient(AmbientLight {
                color: 0xffffffff,
                intensity: 1.0,
            });
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.radius, -1.0);
        }

        #[test]
        fn directional_light_has_unlimited_reach() {
            let light =
                Light::Directional(create_directional_light(&DirectionalLightOptions::default()));
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.radius, -1.0);
        }

        #[test]
        fn point_light_with_finite_range_returns_position_and_range() {
            let light = Light::Point(create_point_light(&PointLightOptions {
                position: Some(Vector3Like {
                    x: 1.0,
                    y: 2.0,
                    z: 3.0,
                }),
                range: 10.0,
                ..PointLightOptions::default()
            }));
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.center.x, 1.0);
            assert_eq!(sphere.center.y, 2.0);
            assert_eq!(sphere.center.z, 3.0);
            assert_eq!(sphere.radius, 10.0);
        }

        #[test]
        fn point_light_with_infinite_range_returns_sentinel() {
            let light = Light::Point(create_point_light(&PointLightOptions::default()));
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.radius, -1.0);
        }

        #[test]
        fn spot_light_with_finite_range_returns_position_and_range() {
            let light = Light::Spot(create_spot_light(&SpotLightOptions {
                position: Some(Vector3Like {
                    x: 5.0,
                    y: 0.0,
                    z: 0.0,
                }),
                range: 20.0,
                ..SpotLightOptions::default()
            }));
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.center.x, 5.0);
            assert_eq!(sphere.radius, 20.0);
        }

        #[test]
        fn area_light_with_finite_range_returns_position_and_range() {
            let light = Light::Area(create_area_light(&AreaLightOptions {
                position: Some(Vector3Like {
                    x: 0.0,
                    y: 5.0,
                    z: 0.0,
                }),
                range: 8.0,
                ..AreaLightOptions::default()
            }));
            let mut sphere = BoundingSphere::default();
            get_light_influence_bounds(&mut sphere, &light);
            assert_eq!(sphere.center.y, 5.0);
            assert_eq!(sphere.radius, 8.0);
        }
    }

    mod get_light_luminance {
        use super::*;

        #[test]
        fn white_at_unit_intensity_is_one() {
            let light = Light::Ambient(AmbientLight {
                color: 0xffffffff,
                intensity: 1.0,
            });
            assert!((get_light_luminance(&light) - 1.0).abs() < 1e-4);
        }

        #[test]
        fn black_at_any_intensity_is_zero() {
            let light = Light::Ambient(AmbientLight {
                color: 0x000000ff,
                intensity: 5.0,
            });
            assert!((get_light_luminance(&light)).abs() < 1e-6);
        }

        #[test]
        fn scales_by_intensity() {
            let light = Light::Ambient(AmbientLight {
                color: 0xffffffff,
                intensity: 2.0,
            });
            assert!((get_light_luminance(&light) - 2.0).abs() < 1e-4);
        }

        #[test]
        fn hemisphere_uses_sky_color() {
            let light = Light::Hemisphere(HemisphereLight {
                sky_color: 0xff0000ff, // pure red
                ground_color: 0x000000ff,
                intensity: 1.0,
            });
            // BT.709 red coefficient = 0.2126
            assert!((get_light_luminance(&light) - 0.2126).abs() < 1e-4);
        }
    }

    mod has_light_influence_on_bounds {
        use super::*;

        #[test]
        fn ambient_light_always_influences() {
            let light = Light::Ambient(AmbientLight {
                color: 0xffffffff,
                intensity: 1.0,
            });
            let bounds = BoundingSphere {
                center: Vector3 {
                    x: 1000.0,
                    y: 1000.0,
                    z: 1000.0,
                },
                radius: 1.0,
            };
            assert!(has_light_influence_on_bounds(&light, &bounds));
        }

        #[test]
        fn point_light_overlaps_nearby_bounds() {
            let light = Light::Point(create_point_light(&PointLightOptions {
                range: 10.0,
                ..PointLightOptions::default()
            }));
            let bounds = BoundingSphere {
                center: Vector3 {
                    x: 5.0,
                    y: 0.0,
                    z: 0.0,
                },
                radius: 2.0,
            };
            assert!(has_light_influence_on_bounds(&light, &bounds));
        }

        #[test]
        fn point_light_does_not_overlap_distant_bounds() {
            let light = Light::Point(create_point_light(&PointLightOptions {
                range: 5.0,
                ..PointLightOptions::default()
            }));
            let bounds = BoundingSphere {
                center: Vector3 {
                    x: 100.0,
                    y: 0.0,
                    z: 0.0,
                },
                radius: 1.0,
            };
            assert!(!has_light_influence_on_bounds(&light, &bounds));
        }

        #[test]
        fn treats_empty_bounds_as_no_overlap() {
            let light = Light::Point(create_point_light(&PointLightOptions {
                range: 10.0,
                ..PointLightOptions::default()
            }));
            let bounds = BoundingSphere {
                center: Vector3::default(),
                radius: -1.0,
            };
            assert!(!has_light_influence_on_bounds(&light, &bounds));
        }
    }

    mod is_light_shadow_casting {
        use super::*;

        #[test]
        fn ambient_light_never_casts_shadows() {
            let light = Light::Ambient(AmbientLight {
                color: 0xffffffff,
                intensity: 1.0,
            });
            assert!(!is_light_shadow_casting(&light));
        }

        #[test]
        fn hemisphere_light_never_casts_shadows() {
            let light = Light::Hemisphere(HemisphereLight {
                sky_color: 0xffffffff,
                ground_color: 0x000000ff,
                intensity: 1.0,
            });
            assert!(!is_light_shadow_casting(&light));
        }

        #[test]
        fn directional_light_with_casts_shadow_true() {
            let light = Light::Directional(create_directional_light(&DirectionalLightOptions {
                casts_shadow: true,
                ..DirectionalLightOptions::default()
            }));
            assert!(is_light_shadow_casting(&light));
        }

        #[test]
        fn directional_light_with_casts_shadow_false() {
            let light =
                Light::Directional(create_directional_light(&DirectionalLightOptions::default()));
            assert!(!is_light_shadow_casting(&light));
        }

        #[test]
        fn spot_light_with_casts_shadow_true() {
            let light = Light::Spot(create_spot_light(&SpotLightOptions {
                casts_shadow: true,
                ..SpotLightOptions::default()
            }));
            assert!(is_light_shadow_casting(&light));
        }
    }
}

use flight_color::get_color_luminance;
use flight_geometry::BoundingSphere;

use crate::types::*;

// flight-lint: allow-file(contract-vocabulary) D16 open Light traits preserve custom kind dispatch without a closed union

pub fn get_light_contribution_at_bounding_sphere(
    light: &dyn PunctualLight,
    bounds: &BoundingSphere,
) -> f32 {
    if !is_light_enabled(light) || bounds.radius < 0.0 {
        return 0.0;
    }

    let center_dx = bounds.center.x - light.position().x;
    let center_dy = bounds.center.y - light.position().y;
    let center_dz = bounds.center.z - light.position().z;
    let center_distance =
        (center_dx * center_dx + center_dy * center_dy + center_dz * center_dz).sqrt();
    let distance = js_max(center_distance - bounds.radius, 0.0);
    let distance_squared = distance * distance;

    let mut window = 1.0;
    if light.range() > 0.0 {
        let factor = distance_squared / (light.range() * light.range());
        let windowed = js_max(0.0, js_min(1.0, 1.0 - factor * factor));
        window = windowed * windowed;
    }
    let attenuation = js_max(distance, 0.01).powf(light.decay());
    let mut contribution = get_light_luminance(light) * window / attenuation;

    if light.kind() == SPOT_LIGHT_KIND {
        if let Some((direction, inner_cone_cos, outer_cone_cos)) = light.spot_cone() {
            let direction_length =
                (direction.x * direction.x + direction.y * direction.y + direction.z * direction.z)
                    .sqrt();
            let inverse_ray_length = if center_distance > 0.0 {
                1.0 / center_distance
            } else {
                0.0
            };
            let inverse_direction_length = if direction_length > 0.0 {
                1.0 / direction_length
            } else {
                0.0
            };
            let cosine =
                (direction.x * center_dx + direction.y * center_dy + direction.z * center_dz)
                    * inverse_ray_length
                    * inverse_direction_length;
            contribution *= smoothstep(
                outer_cone_cos,
                inner_cone_cos,
                if center_distance > 0.0 { cosine } else { 1.0 },
            );
        }
    }

    return contribution;
}

pub fn get_light_influence_bounds(out: &mut BoundingSphere, light: &dyn Light) {
    if !is_light_enabled(light) {
        write_bound(out, 0.0, 0.0, 0.0, 0.0);
        return;
    }
    let kind = light.kind();
    if kind == AMBIENT_LIGHT_KIND
        || kind == HEMISPHERE_LIGHT_KIND
        || kind == ENVIRONMENT_KIND
        || kind == DIRECTIONAL_LIGHT_KIND
    {
        write_bound(out, 0.0, 0.0, 0.0, -1.0);
        return;
    }
    if kind == POINT_LIGHT_KIND || kind == SPOT_LIGHT_KIND || kind == AREA_LIGHT_KIND {
        if let Some((position, range)) = light.spatial_influence() {
            if range < 0.0 {
                write_bound(out, 0.0, 0.0, 0.0, -1.0);
            } else {
                write_bound(out, position.x, position.y, position.z, range);
            }
            return;
        }
    }
    write_bound(out, 0.0, 0.0, 0.0, -1.0);
}

pub fn get_light_luminance(light: &dyn Light) -> f32 {
    if !is_light_enabled(light) {
        return 0.0;
    }
    let kind = light.kind();
    if kind == ENVIRONMENT_KIND {
        return 0.0;
    }
    if kind == HEMISPHERE_LIGHT_KIND {
        return match light.hemisphere_intensity() {
            Some((ground_color, sky_color, intensity)) => {
                (get_color_luminance(ground_color) + get_color_luminance(sky_color))
                    * 0.5
                    * intensity
            }
            None => 0.0,
        };
    }
    if kind == AMBIENT_LIGHT_KIND
        || kind == AREA_LIGHT_KIND
        || kind == DIRECTIONAL_LIGHT_KIND
        || kind == POINT_LIGHT_KIND
        || kind == SPOT_LIGHT_KIND
    {
        return match light.colored_intensity() {
            Some((color, intensity)) => get_color_luminance(color) * intensity,
            None => 0.0,
        };
    }
    return 0.0;
}

pub fn has_light_influence_on_bounds(light: &dyn Light, bounds: &BoundingSphere) -> bool {
    if !is_light_enabled(light) {
        return false;
    }
    let kind = light.kind();
    if kind == AMBIENT_LIGHT_KIND
        || kind == HEMISPHERE_LIGHT_KIND
        || kind == ENVIRONMENT_KIND
        || kind == DIRECTIONAL_LIGHT_KIND
    {
        return true;
    }
    if kind != POINT_LIGHT_KIND && kind != SPOT_LIGHT_KIND && kind != AREA_LIGHT_KIND {
        return true;
    }
    let Some((position, range)) = light.spatial_influence() else {
        return true;
    };
    if range < 0.0 {
        return true;
    }
    if bounds.radius < 0.0 {
        return false;
    }
    let dx = position.x - bounds.center.x;
    let dy = position.y - bounds.center.y;
    let dz = position.z - bounds.center.z;
    let distance_squared = dx * dx + dy * dy + dz * dz;
    let radius_sum = range + bounds.radius;
    return distance_squared <= radius_sum * radius_sum;
}

pub fn is_light_casting_shadow(light: &dyn Light) -> bool {
    if !is_light_enabled(light) {
        return false;
    }
    let kind = light.kind();
    if kind == AMBIENT_LIGHT_KIND || kind == HEMISPHERE_LIGHT_KIND || kind == ENVIRONMENT_KIND {
        return false;
    }
    return light.casts_shadow_value() == Some(true);
}

fn is_light_enabled(light: &dyn Light) -> bool {
    return light.enabled_value() != Some(false);
}

fn js_max(a: f32, b: f32) -> f32 {
    if a.is_nan() || b.is_nan() {
        return f32::NAN;
    }
    return if a > b { a } else { b };
}

fn js_min(a: f32, b: f32) -> f32 {
    if a.is_nan() || b.is_nan() {
        return f32::NAN;
    }
    return if a < b { a } else { b };
}

fn smoothstep(edge_0: f32, edge_1: f32, value: f32) -> f32 {
    if edge_0 == edge_1 {
        return if value < edge_0 { 0.0 } else { 1.0 };
    }
    let t = js_max(0.0, js_min(1.0, (value - edge_0) / (edge_1 - edge_0)));
    return t * t * (3.0 - 2.0 * t);
}

fn write_bound(out: &mut BoundingSphere, x: f32, y: f32, z: f32, radius: f32) {
    out.center.x = x;
    out.center.y = y;
    out.center.z = z;
    out.radius = radius;
}

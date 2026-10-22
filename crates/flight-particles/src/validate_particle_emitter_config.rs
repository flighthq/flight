use crate::{create_particle_emitter_config, ParticleConfigIssue, ParticleEmitterConfig};

fn check_finite(issues: &mut Vec<ParticleConfigIssue>, field: &str, value: f32) {
    if !value.is_finite() {
        issues.push(ParticleConfigIssue {
            field: field.to_string(),
            message: format!("{} must be a finite number (got {})", field, value),
            severity: "error".to_string(),
        });
    }
}

fn check_non_negative(issues: &mut Vec<ParticleConfigIssue>, field: &str, value: f32) {
    if value.is_finite() && value < 0.0 {
        issues.push(ParticleConfigIssue {
            field: field.to_string(),
            message: format!("{} must not be negative (got {})", field, value),
            severity: "warning".to_string(),
        });
    }
}

fn is_finite_curve(curve: Option<&[f32]>) -> bool {
    match curve {
        None => false,
        Some(c) => {
            if c.is_empty() {
                return false;
            }
            for v in c {
                if !v.is_finite() {
                    return false;
                }
            }
            return true;
        }
    }
}

/// Return a copy of the config with every value coerced to something the
/// simulation can run safely.
pub fn normalize_particle_emitter_config(
    config: Option<&ParticleEmitterConfig>,
) -> ParticleEmitterConfig {
    let mut out = create_particle_emitter_config(config);
    let defaults = create_particle_emitter_config(None);

    // Replace any non-finite numeric field with its canonical default.
    if !out.alpha_end.is_finite() { out.alpha_end = defaults.alpha_end; }
    if !out.alpha_start.is_finite() { out.alpha_start = defaults.alpha_start; }
    if !out.burst_count.is_finite() { out.burst_count = defaults.burst_count; }
    if !out.burst_interval.is_finite() { out.burst_interval = defaults.burst_interval; }
    if !out.color_end_b.is_finite() { out.color_end_b = defaults.color_end_b; }
    if !out.color_end_g.is_finite() { out.color_end_g = defaults.color_end_g; }
    if !out.color_end_r.is_finite() { out.color_end_r = defaults.color_end_r; }
    if !out.color_end_variance_b.is_finite() { out.color_end_variance_b = defaults.color_end_variance_b; }
    if !out.color_end_variance_g.is_finite() { out.color_end_variance_g = defaults.color_end_variance_g; }
    if !out.color_end_variance_r.is_finite() { out.color_end_variance_r = defaults.color_end_variance_r; }
    if !out.color_start_b.is_finite() { out.color_start_b = defaults.color_start_b; }
    if !out.color_start_g.is_finite() { out.color_start_g = defaults.color_start_g; }
    if !out.color_start_r.is_finite() { out.color_start_r = defaults.color_start_r; }
    if !out.color_start_variance_b.is_finite() { out.color_start_variance_b = defaults.color_start_variance_b; }
    if !out.color_start_variance_g.is_finite() { out.color_start_variance_g = defaults.color_start_variance_g; }
    if !out.color_start_variance_r.is_finite() { out.color_start_variance_r = defaults.color_start_variance_r; }
    if !out.direction_x.is_finite() { out.direction_x = defaults.direction_x; }
    if !out.direction_y.is_finite() { out.direction_y = defaults.direction_y; }
    if !out.direction_z.is_finite() { out.direction_z = defaults.direction_z; }
    if !out.duration.is_finite() { out.duration = defaults.duration; }
    if !out.emitter_cone_angle.is_finite() { out.emitter_cone_angle = defaults.emitter_cone_angle; }
    if !out.emitter_depth.is_finite() { out.emitter_depth = defaults.emitter_depth; }
    if !out.emitter_height.is_finite() { out.emitter_height = defaults.emitter_height; }
    if !out.emitter_radius.is_finite() { out.emitter_radius = defaults.emitter_radius; }
    if !out.emitter_width.is_finite() { out.emitter_width = defaults.emitter_width; }
    if !out.frame_count.is_finite() { out.frame_count = defaults.frame_count; }
    if !out.frame_rate.is_finite() { out.frame_rate = defaults.frame_rate; }
    if !out.gravity_x.is_finite() { out.gravity_x = defaults.gravity_x; }
    if !out.gravity_y.is_finite() { out.gravity_y = defaults.gravity_y; }
    if !out.gravity_z.is_finite() { out.gravity_z = defaults.gravity_z; }
    if !out.lifetime_max.is_finite() { out.lifetime_max = defaults.lifetime_max; }
    if !out.lifetime_min.is_finite() { out.lifetime_min = defaults.lifetime_min; }
    if !out.max_particles.is_finite() { out.max_particles = defaults.max_particles; }
    if !out.region_id_max.is_finite() { out.region_id_max = defaults.region_id_max; }
    if !out.region_id_min.is_finite() { out.region_id_min = defaults.region_id_min; }
    if !out.rotation_speed_max.is_finite() { out.rotation_speed_max = defaults.rotation_speed_max; }
    if !out.rotation_speed_min.is_finite() { out.rotation_speed_min = defaults.rotation_speed_min; }
    if !out.scale_end.is_finite() { out.scale_end = defaults.scale_end; }
    if !out.scale_max.is_finite() { out.scale_max = defaults.scale_max; }
    if !out.scale_min.is_finite() { out.scale_min = defaults.scale_min; }
    if !out.spawn_rate.is_finite() { out.spawn_rate = defaults.spawn_rate; }
    if !out.speed_max.is_finite() { out.speed_max = defaults.speed_max; }
    if !out.speed_min.is_finite() { out.speed_min = defaults.speed_min; }
    if !out.spread.is_finite() { out.spread = defaults.spread; }
    if !out.velocity_inheritance.is_finite() { out.velocity_inheritance = defaults.velocity_inheritance; }

    // Drop any curve that is empty or contains a non-finite sample.
    out.alpha_curve = if is_finite_curve(out.alpha_curve.as_deref()) {
        out.alpha_curve
    } else {
        None
    };
    out.color_curve = if is_finite_curve(out.color_curve.as_deref()) {
        out.color_curve
    } else {
        None
    };
    out.scale_curve = if is_finite_curve(out.scale_curve.as_deref()) {
        out.scale_curve
    } else {
        None
    };

    // Clamp and floor
    out.max_particles = out.max_particles.floor().max(0.0);
    out.burst_count = out.burst_count.floor().max(0.0);
    out.burst_interval = out.burst_interval.max(0.0);
    out.duration = out.duration.max(0.0);
    out.frame_count = out.frame_count.floor().max(1.0);
    out.frame_rate = out.frame_rate.max(0.0);
    out.region_id_min = out.region_id_min.floor().max(0.0);
    out.region_id_max = out.region_id_max.floor().max(out.region_id_min);
    out.spawn_rate = out.spawn_rate.max(0.0);
    out.lifetime_min = out.lifetime_min.max(0.0);
    out.lifetime_max = out.lifetime_max.max(0.0);
    out.speed_min = out.speed_min.max(0.0);
    out.speed_max = out.speed_max.max(0.0);
    out.scale_min = out.scale_min.max(0.0);
    out.scale_max = out.scale_max.max(0.0);
    out.emitter_cone_angle = out.emitter_cone_angle.max(0.0);
    out.emitter_depth = out.emitter_depth.max(0.0);
    out.emitter_radius = out.emitter_radius.max(0.0);
    out.emitter_width = out.emitter_width.max(0.0);
    out.emitter_height = out.emitter_height.max(0.0);

    return out;
}

fn report_curve(
    issues: &mut Vec<ParticleConfigIssue>,
    curve: Option<&[f32]>,
    field: &str,
    stride: usize,
) {
    let c = match curve {
        None => return,
        Some(c) => c,
    };
    if c.is_empty() {
        issues.push(ParticleConfigIssue {
            field: field.to_string(),
            message: format!("{} is empty and will be ignored", field),
            severity: "warning".to_string(),
        });
        return;
    }
    if c.len() % stride != 0 {
        issues.push(ParticleConfigIssue {
            field: field.to_string(),
            message: format!(
                "{} length ({}) is not a multiple of {}",
                field,
                c.len(),
                stride
            ),
            severity: "warning".to_string(),
        });
    }
    for i in 0..c.len() {
        if !c[i].is_finite() {
            issues.push(ParticleConfigIssue {
                field: field.to_string(),
                message: format!("{} contains a non-finite sample at index {}", field, i),
                severity: "error".to_string(),
            });
            break;
        }
    }
}

fn report_inverted_range(
    issues: &mut Vec<ParticleConfigIssue>,
    min_field: &str,
    min_val: f32,
    max_field: &str,
    max_val: f32,
) {
    if min_val.is_finite() && max_val.is_finite() && min_val > max_val {
        issues.push(ParticleConfigIssue {
            field: min_field.to_string(),
            message: format!(
                "{} ({}) is greater than {} ({})",
                min_field, min_val, max_field, max_val
            ),
            severity: "warning".to_string(),
        });
    }
}

fn report_unit_range(issues: &mut Vec<ParticleConfigIssue>, field: &str, value: f32) {
    if value.is_finite() && (value < 0.0 || value > 1.0) {
        issues.push(ParticleConfigIssue {
            field: field.to_string(),
            message: format!("{} ({}) is outside the expected 0-1 range", field, value),
            severity: "warning".to_string(),
        });
    }
}

/// Report problems in a particle config without modifying it.
// flight-lint: allow(conform-params) D24: Rust &mut out-param for issue collection reuse; TS returns allocated array
pub fn validate_particle_emitter_config(
    out: &mut Vec<ParticleConfigIssue>,
    config: &ParticleEmitterConfig,
) {
    // Check all numeric fields for finiteness.
    check_finite(out, "alpha_end", config.alpha_end);
    check_finite(out, "alpha_start", config.alpha_start);
    check_finite(out, "burst_count", config.burst_count);
    check_finite(out, "burst_interval", config.burst_interval);
    check_finite(out, "color_end_b", config.color_end_b);
    check_finite(out, "color_end_g", config.color_end_g);
    check_finite(out, "color_end_r", config.color_end_r);
    check_finite(out, "color_end_variance_b", config.color_end_variance_b);
    check_finite(out, "color_end_variance_g", config.color_end_variance_g);
    check_finite(out, "color_end_variance_r", config.color_end_variance_r);
    check_finite(out, "color_start_b", config.color_start_b);
    check_finite(out, "color_start_g", config.color_start_g);
    check_finite(out, "color_start_r", config.color_start_r);
    check_finite(out, "color_start_variance_b", config.color_start_variance_b);
    check_finite(out, "color_start_variance_g", config.color_start_variance_g);
    check_finite(out, "color_start_variance_r", config.color_start_variance_r);
    check_finite(out, "direction_x", config.direction_x);
    check_finite(out, "direction_y", config.direction_y);
    check_finite(out, "direction_z", config.direction_z);
    check_finite(out, "duration", config.duration);
    check_finite(out, "emitter_cone_angle", config.emitter_cone_angle);
    check_finite(out, "emitter_depth", config.emitter_depth);
    check_finite(out, "emitter_height", config.emitter_height);
    check_finite(out, "emitter_radius", config.emitter_radius);
    check_finite(out, "emitter_width", config.emitter_width);
    check_finite(out, "frame_count", config.frame_count);
    check_finite(out, "frame_rate", config.frame_rate);
    check_finite(out, "gravity_x", config.gravity_x);
    check_finite(out, "gravity_y", config.gravity_y);
    check_finite(out, "gravity_z", config.gravity_z);
    check_finite(out, "lifetime_max", config.lifetime_max);
    check_finite(out, "lifetime_min", config.lifetime_min);
    check_finite(out, "max_particles", config.max_particles);
    check_finite(out, "region_id_max", config.region_id_max);
    check_finite(out, "region_id_min", config.region_id_min);
    check_finite(out, "rotation_speed_max", config.rotation_speed_max);
    check_finite(out, "rotation_speed_min", config.rotation_speed_min);
    check_finite(out, "scale_end", config.scale_end);
    check_finite(out, "scale_max", config.scale_max);
    check_finite(out, "scale_min", config.scale_min);
    check_finite(out, "spawn_rate", config.spawn_rate);
    check_finite(out, "speed_max", config.speed_max);
    check_finite(out, "speed_min", config.speed_min);
    check_finite(out, "spread", config.spread);
    check_finite(out, "velocity_inheritance", config.velocity_inheritance);

    // Check non-negative fields.
    check_non_negative(out, "burst_count", config.burst_count);
    check_non_negative(out, "burst_interval", config.burst_interval);
    check_non_negative(out, "duration", config.duration);
    check_non_negative(out, "emitter_cone_angle", config.emitter_cone_angle);
    check_non_negative(out, "emitter_depth", config.emitter_depth);
    check_non_negative(out, "emitter_height", config.emitter_height);
    check_non_negative(out, "emitter_radius", config.emitter_radius);
    check_non_negative(out, "emitter_width", config.emitter_width);
    check_non_negative(out, "frame_rate", config.frame_rate);
    check_non_negative(out, "lifetime_min", config.lifetime_min);
    check_non_negative(out, "lifetime_max", config.lifetime_max);
    check_non_negative(out, "max_particles", config.max_particles);
    check_non_negative(out, "scale_max", config.scale_max);
    check_non_negative(out, "scale_min", config.scale_min);
    check_non_negative(out, "speed_max", config.speed_max);
    check_non_negative(out, "speed_min", config.speed_min);
    check_non_negative(out, "spawn_rate", config.spawn_rate);

    // Special cases
    if config.lifetime_max.is_finite() && config.lifetime_max <= 0.0 {
        out.push(ParticleConfigIssue {
            field: "lifetime_max".to_string(),
            message: "lifetime_max must be > 0 or particles die instantly".to_string(),
            severity: "warning".to_string(),
        });
    }
    if config.max_particles.is_finite() && config.max_particles <= 0.0 {
        out.push(ParticleConfigIssue {
            field: "max_particles".to_string(),
            message: "max_particles must be >= 1 or nothing ever spawns".to_string(),
            severity: "warning".to_string(),
        });
    }
    if config.frame_count.is_finite() && config.frame_count < 1.0 {
        out.push(ParticleConfigIssue {
            field: "frame_count".to_string(),
            message: "frame_count must be >= 1".to_string(),
            severity: "warning".to_string(),
        });
    }

    // Inverted min/max ranges
    report_inverted_range(out, "lifetime_min", config.lifetime_min, "lifetime_max", config.lifetime_max);
    report_inverted_range(out, "speed_min", config.speed_min, "speed_max", config.speed_max);
    report_inverted_range(out, "scale_min", config.scale_min, "scale_max", config.scale_max);
    report_inverted_range(out, "rotation_speed_min", config.rotation_speed_min, "rotation_speed_max", config.rotation_speed_max);

    // Unit range checks
    report_unit_range(out, "alpha_start", config.alpha_start);
    report_unit_range(out, "alpha_end", config.alpha_end);

    // Curve checks
    report_curve(out, config.alpha_curve.as_deref(), "alpha_curve", 1);
    report_curve(out, config.color_curve.as_deref(), "color_curve", 3);
    report_curve(out, config.scale_curve.as_deref(), "scale_curve", 1);

}

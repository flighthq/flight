//! Validation and normalization of `ParticleEmitterConfig`.
//!
//! - [`validate_particle_emitter_config`] — reports issues without modifying
//!   the config.  Use in asset pipelines, editor inspectors, or CI checks.
//! - [`normalize_particle_emitter_config`] — returns a corrected copy safe
//!   for the simulation: non-finite numbers fall back to defaults, negative
//!   counts/rates/sizes are clamped to 0, and integer fields are floored.
//!
//! Unlike the TypeScript source, most count/rate/index fields are already typed
//! as `u32`/`bool`/enum in Rust, so they cannot be non-finite or negative.  The
//! finite/non-negative passes therefore only iterate the `f32` fields; the
//! integer-only corrections (`frame_count >= 1`, `region_id_max >= region_id_min`)
//! are applied directly.

use flighthq_types::{ParticleConfigIssue, ParticleConfigIssueSeverity, ParticleEmitterConfig};

use crate::state::default_particle_emitter_config;

/// Return a copy of `config` with every value coerced into something the
/// simulation can run safely.
///
/// - Non-finite `f32` fields fall back to their canonical defaults.
/// - Negative non-negative fields (counts, rates, sizes) are clamped to `0`.
/// - `frame_count` is forced to `>= 1`.
/// - `region_id_max` is forced to `>= region_id_min`.
/// - Curves that are empty or contain non-finite samples are set to `None`.
///
/// Range inversions (e.g. `lifetime_min > lifetime_max`) are left intact;
/// use [`validate_particle_emitter_config`] to surface those to the author.
pub fn normalize_particle_emitter_config(config: &ParticleEmitterConfig) -> ParticleEmitterConfig {
    let defaults = default_particle_emitter_config();
    let mut out = config.clone();

    // Replace any non-finite f32 field with its canonical default.
    for (value, default) in numeric_fields_mut(&mut out, &defaults) {
        if !value.is_finite() {
            *value = default;
        }
    }

    // Clamp non-negative f32 fields to >= 0.
    for value in non_negative_fields_mut(&mut out) {
        if *value < 0.0 {
            *value = 0.0;
        }
    }

    // Integer-only corrections.
    if out.frame_count < 1 {
        out.frame_count = 1;
    }
    if out.region_id_max < out.region_id_min {
        out.region_id_max = out.region_id_min;
    }

    // Drop any curve that is empty or contains a non-finite sample so it can
    // never inject NaN — the simulation falls back to its linear path.
    if !is_finite_curve(out.alpha_curve.as_deref()) {
        out.alpha_curve = None;
    }
    if !is_finite_curve(out.color_curve.as_deref()) {
        out.color_curve = None;
    }
    if !is_finite_curve(out.scale_curve.as_deref()) {
        out.scale_curve = None;
    }

    out
}

/// Report problems in a particle config without modifying it.
///
/// Returns an empty `Vec` for a clean config.  Use
/// [`normalize_particle_emitter_config`] to obtain a corrected config for
/// safe runtime use.
pub fn validate_particle_emitter_config(
    config: &ParticleEmitterConfig,
) -> Vec<ParticleConfigIssue> {
    let mut issues: Vec<ParticleConfigIssue> = Vec::new();

    for (name, value) in numeric_fields(config) {
        if !value.is_finite() {
            issues.push(ParticleConfigIssue {
                field: name.to_string(),
                message: format!("{name} must be a finite number (got {value})"),
                severity: ParticleConfigIssueSeverity::Error,
            });
        }
    }

    for (name, value) in non_negative_fields(config) {
        if value.is_finite() && value < 0.0 {
            issues.push(ParticleConfigIssue {
                field: name.to_string(),
                message: format!("{name} must not be negative (got {value})"),
                severity: ParticleConfigIssueSeverity::Warning,
            });
        }
    }

    // A non-positive maximum lifetime means particles die the frame they spawn.
    if config.lifetime_max.is_finite() && config.lifetime_max <= 0.0 {
        issues.push(warning(
            "lifetimeMax",
            "lifetimeMax must be > 0 or particles die instantly",
        ));
    }
    // A non-positive cap means the emitter can never hold a particle.
    if config.max_particles == 0 {
        issues.push(warning(
            "maxParticles",
            "maxParticles must be >= 1 or nothing ever spawns",
        ));
    }
    if config.frame_count < 1 {
        issues.push(warning("frameCount", "frameCount must be >= 1"));
    }

    // Inverted min/max ranges still simulate but almost always indicate a mistake.
    report_inverted_range(
        &mut issues,
        "lifetimeMin",
        config.lifetime_min,
        "lifetimeMax",
        config.lifetime_max,
    );
    report_inverted_range(
        &mut issues,
        "speedMin",
        config.speed_min,
        "speedMax",
        config.speed_max,
    );
    report_inverted_range(
        &mut issues,
        "scaleMin",
        config.scale_min,
        "scaleMax",
        config.scale_max,
    );
    report_inverted_range(
        &mut issues,
        "rotationSpeedMin",
        config.rotation_speed_min,
        "rotationSpeedMax",
        config.rotation_speed_max,
    );

    report_unit_range(&mut issues, "alphaStart", config.alpha_start);
    report_unit_range(&mut issues, "alphaEnd", config.alpha_end);

    report_curve(&mut issues, config.alpha_curve.as_deref(), "alphaCurve", 1);
    report_curve(&mut issues, config.color_curve.as_deref(), "colorCurve", 3);
    report_curve(&mut issues, config.scale_curve.as_deref(), "scaleCurve", 1);

    issues
}

fn is_finite_curve(curve: Option<&[f32]>) -> bool {
    match curve {
        None => false,
        Some(c) if c.is_empty() => false,
        Some(c) => c.iter().all(|v| v.is_finite()),
    }
}

// Every f32 field paired with its authoring name. Kept as one list so the
// validate and normalize passes iterate the same set without drifting.
fn numeric_fields(config: &ParticleEmitterConfig) -> [(&'static str, f32); 35] {
    [
        ("alphaEnd", config.alpha_end),
        ("alphaStart", config.alpha_start),
        ("burstInterval", config.burst_interval),
        ("duration", config.duration),
        ("colorEndB", config.color_end_b),
        ("colorEndG", config.color_end_g),
        ("colorEndR", config.color_end_r),
        ("colorEndVarianceB", config.color_end_variance_b),
        ("colorEndVarianceG", config.color_end_variance_g),
        ("colorEndVarianceR", config.color_end_variance_r),
        ("colorStartB", config.color_start_b),
        ("colorStartG", config.color_start_g),
        ("colorStartR", config.color_start_r),
        ("colorStartVarianceB", config.color_start_variance_b),
        ("colorStartVarianceG", config.color_start_variance_g),
        ("colorStartVarianceR", config.color_start_variance_r),
        ("directionX", config.direction_x),
        ("directionY", config.direction_y),
        ("emitterHeight", config.emitter_height),
        ("emitterRadius", config.emitter_radius),
        ("emitterWidth", config.emitter_width),
        ("frameRate", config.frame_rate),
        ("gravityX", config.gravity_x),
        ("gravityY", config.gravity_y),
        ("lifetimeMax", config.lifetime_max),
        ("lifetimeMin", config.lifetime_min),
        ("rotationSpeedMax", config.rotation_speed_max),
        ("rotationSpeedMin", config.rotation_speed_min),
        ("scaleEnd", config.scale_end),
        ("scaleMax", config.scale_max),
        ("scaleMin", config.scale_min),
        ("speedMax", config.speed_max),
        ("speedMin", config.speed_min),
        ("spawnRate", config.spawn_rate),
        ("spread", config.spread),
    ]
}

// Mutable references to every f32 field, paired with the default value for the
// same field. Used by normalize to overwrite non-finite values.
fn numeric_fields_mut<'a>(
    config: &'a mut ParticleEmitterConfig,
    defaults: &ParticleEmitterConfig,
) -> Vec<(&'a mut f32, f32)> {
    vec![
        (&mut config.alpha_end, defaults.alpha_end),
        (&mut config.alpha_start, defaults.alpha_start),
        (&mut config.burst_interval, defaults.burst_interval),
        (&mut config.duration, defaults.duration),
        (&mut config.color_end_b, defaults.color_end_b),
        (&mut config.color_end_g, defaults.color_end_g),
        (&mut config.color_end_r, defaults.color_end_r),
        (
            &mut config.color_end_variance_b,
            defaults.color_end_variance_b,
        ),
        (
            &mut config.color_end_variance_g,
            defaults.color_end_variance_g,
        ),
        (
            &mut config.color_end_variance_r,
            defaults.color_end_variance_r,
        ),
        (&mut config.color_start_b, defaults.color_start_b),
        (&mut config.color_start_g, defaults.color_start_g),
        (&mut config.color_start_r, defaults.color_start_r),
        (
            &mut config.color_start_variance_b,
            defaults.color_start_variance_b,
        ),
        (
            &mut config.color_start_variance_g,
            defaults.color_start_variance_g,
        ),
        (
            &mut config.color_start_variance_r,
            defaults.color_start_variance_r,
        ),
        (&mut config.direction_x, defaults.direction_x),
        (&mut config.direction_y, defaults.direction_y),
        (&mut config.emitter_height, defaults.emitter_height),
        (&mut config.emitter_radius, defaults.emitter_radius),
        (&mut config.emitter_width, defaults.emitter_width),
        (&mut config.frame_rate, defaults.frame_rate),
        (&mut config.gravity_x, defaults.gravity_x),
        (&mut config.gravity_y, defaults.gravity_y),
        (&mut config.lifetime_max, defaults.lifetime_max),
        (&mut config.lifetime_min, defaults.lifetime_min),
        (&mut config.rotation_speed_max, defaults.rotation_speed_max),
        (&mut config.rotation_speed_min, defaults.rotation_speed_min),
        (&mut config.scale_end, defaults.scale_end),
        (&mut config.scale_max, defaults.scale_max),
        (&mut config.scale_min, defaults.scale_min),
        (&mut config.speed_max, defaults.speed_max),
        (&mut config.speed_min, defaults.speed_min),
        (&mut config.spawn_rate, defaults.spawn_rate),
        (&mut config.spread, defaults.spread),
    ]
}

// f32 fields that must never be negative, paired with their authoring name.
fn non_negative_fields(config: &ParticleEmitterConfig) -> [(&'static str, f32); 13] {
    [
        ("burstInterval", config.burst_interval),
        ("duration", config.duration),
        ("emitterHeight", config.emitter_height),
        ("emitterRadius", config.emitter_radius),
        ("emitterWidth", config.emitter_width),
        ("frameRate", config.frame_rate),
        ("lifetimeMin", config.lifetime_min),
        ("lifetimeMax", config.lifetime_max),
        ("scaleMax", config.scale_max),
        ("scaleMin", config.scale_min),
        ("speedMax", config.speed_max),
        ("speedMin", config.speed_min),
        ("spawnRate", config.spawn_rate),
    ]
}

fn non_negative_fields_mut(config: &mut ParticleEmitterConfig) -> Vec<&mut f32> {
    vec![
        &mut config.burst_interval,
        &mut config.duration,
        &mut config.emitter_height,
        &mut config.emitter_radius,
        &mut config.emitter_width,
        &mut config.frame_rate,
        &mut config.lifetime_min,
        &mut config.lifetime_max,
        &mut config.scale_max,
        &mut config.scale_min,
        &mut config.speed_max,
        &mut config.speed_min,
        &mut config.spawn_rate,
    ]
}

fn report_curve(
    issues: &mut Vec<ParticleConfigIssue>,
    curve: Option<&[f32]>,
    field: &str,
    stride: usize,
) {
    let Some(curve) = curve else { return };
    if curve.is_empty() {
        issues.push(warning(
            field,
            &format!("{field} is empty and will be ignored"),
        ));
        return;
    }
    if curve.len() % stride != 0 {
        issues.push(warning(
            field,
            &format!(
                "{field} length ({}) is not a multiple of {stride}",
                curve.len()
            ),
        ));
    }
    for (i, &sample) in curve.iter().enumerate() {
        if !sample.is_finite() {
            issues.push(ParticleConfigIssue {
                field: field.to_string(),
                message: format!("{field} contains a non-finite sample at index {i}"),
                severity: ParticleConfigIssueSeverity::Error,
            });
            break;
        }
    }
}

fn report_inverted_range(
    issues: &mut Vec<ParticleConfigIssue>,
    min_field: &str,
    min: f32,
    max_field: &str,
    max: f32,
) {
    if min.is_finite() && max.is_finite() && min > max {
        issues.push(warning(
            min_field,
            &format!("{min_field} ({min}) is greater than {max_field} ({max})"),
        ));
    }
}

fn report_unit_range(issues: &mut Vec<ParticleConfigIssue>, field: &str, value: f32) {
    if value.is_finite() && !(0.0..=1.0).contains(&value) {
        issues.push(warning(
            field,
            &format!("{field} ({value}) is outside the expected 0-1 range"),
        ));
    }
}

fn warning(field: &str, message: &str) -> ParticleConfigIssue {
    ParticleConfigIssue {
        field: field.to_string(),
        message: message.to_string(),
        severity: ParticleConfigIssueSeverity::Warning,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::create_particle_emitter_config;

    #[test]
    fn normalize_particle_emitter_config_nan_falls_back_to_default() {
        let mut config = create_particle_emitter_config(None);
        config.gravity_y = f32::NAN;
        config.spawn_rate = f32::INFINITY;
        config.lifetime_max = f32::NEG_INFINITY;
        let out = normalize_particle_emitter_config(&config);
        assert_eq!(out.gravity_y, 0.0); // default
        assert_eq!(out.spawn_rate, 10.0); // default
        assert!(out.lifetime_max.is_finite());
    }

    #[test]
    fn normalize_particle_emitter_config_negative_clamped() {
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = -10.0;
        config.emitter_radius = -50.0;
        config.lifetime_min = -3.0;
        let out = normalize_particle_emitter_config(&config);
        assert_eq!(out.spawn_rate, 0.0);
        assert_eq!(out.emitter_radius, 0.0);
        assert_eq!(out.lifetime_min, 0.0);
    }

    #[test]
    fn normalize_particle_emitter_config_frame_count_minimum_one() {
        let mut config = create_particle_emitter_config(None);
        config.frame_count = 0;
        let out = normalize_particle_emitter_config(&config);
        assert_eq!(out.frame_count, 1);
    }

    #[test]
    fn normalize_particle_emitter_config_keeps_region_id_max_above_min() {
        let mut config = create_particle_emitter_config(None);
        config.region_id_min = 5;
        config.region_id_max = 2;
        let out = normalize_particle_emitter_config(&config);
        assert!(out.region_id_max >= out.region_id_min);
    }

    #[test]
    fn normalize_particle_emitter_config_drops_invalid_curves() {
        let mut config = create_particle_emitter_config(None);
        config.alpha_curve = Some(vec![1.0, f32::NAN, 0.0]);
        config.scale_curve = Some(vec![]);
        config.color_curve = Some(vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0]);
        let out = normalize_particle_emitter_config(&config);
        assert!(out.alpha_curve.is_none()); // had NaN -> dropped
        assert!(out.scale_curve.is_none()); // empty -> dropped
        assert!(out.color_curve.is_some()); // valid -> kept
    }

    #[test]
    fn validate_particle_emitter_config_clean() {
        let config = create_particle_emitter_config(None);
        assert!(validate_particle_emitter_config(&config).is_empty());
    }

    #[test]
    fn validate_particle_emitter_config_inverted_range_warns() {
        let mut config = create_particle_emitter_config(None);
        config.lifetime_min = 5.0;
        config.lifetime_max = 1.0;
        let issues = validate_particle_emitter_config(&config);
        assert!(issues.iter().any(|i| i.field == "lifetimeMin"));
    }

    #[test]
    fn validate_particle_emitter_config_non_finite_errors() {
        let mut config = create_particle_emitter_config(None);
        config.gravity_y = f32::NAN;
        config.spawn_rate = f32::INFINITY;
        let issues = validate_particle_emitter_config(&config);
        let errors: Vec<&str> = issues
            .iter()
            .filter(|i| i.severity == ParticleConfigIssueSeverity::Error)
            .map(|i| i.field.as_str())
            .collect();
        assert!(errors.contains(&"gravityY"));
        assert!(errors.contains(&"spawnRate"));
    }

    #[test]
    fn validate_particle_emitter_config_negative_warns() {
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = -5.0;
        let issues = validate_particle_emitter_config(&config);
        assert!(
            issues
                .iter()
                .any(|i| i.field == "spawnRate"
                    && i.severity == ParticleConfigIssueSeverity::Warning)
        );
    }

    #[test]
    fn validate_particle_emitter_config_unit_range_warns() {
        let mut config = create_particle_emitter_config(None);
        config.alpha_start = 2.0;
        let issues = validate_particle_emitter_config(&config);
        assert!(issues.iter().any(|i| i.field == "alphaStart"));
    }

    #[test]
    fn validate_particle_emitter_config_non_finite_curve_errors() {
        let mut config = create_particle_emitter_config(None);
        config.alpha_curve = Some(vec![0.0, f32::NAN, 1.0]);
        let issues = validate_particle_emitter_config(&config);
        assert!(
            issues.iter().any(
                |i| i.field == "alphaCurve" && i.severity == ParticleConfigIssueSeverity::Error
            )
        );
    }
}

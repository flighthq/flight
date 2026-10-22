use crate::{ParticleEmitterConfig, ParticleEmitterConfigOptions};

pub fn create_particle_emitter_config(
    config: Option<&ParticleEmitterConfigOptions>,
) -> ParticleEmitterConfig {
    let defaults = ParticleEmitterConfig::default();
    return match config {
        None => defaults,
        Some(c) => ParticleEmitterConfig {
            alpha_curve: c.alpha_curve.clone().unwrap_or(defaults.alpha_curve),
            alpha_end: c.alpha_end.unwrap_or(defaults.alpha_end),
            alpha_start: c.alpha_start.unwrap_or(defaults.alpha_start),
            blend_mode: c.blend_mode.unwrap_or(defaults.blend_mode),
            burst_count: c.burst_count.unwrap_or(defaults.burst_count),
            burst_interval: c.burst_interval.unwrap_or(defaults.burst_interval),
            color_curve: c.color_curve.clone().unwrap_or(defaults.color_curve),
            color_end_b: c.color_end_b.unwrap_or(defaults.color_end_b),
            color_end_g: c.color_end_g.unwrap_or(defaults.color_end_g),
            color_end_r: c.color_end_r.unwrap_or(defaults.color_end_r),
            color_end_variance_b: c
                .color_end_variance_b
                .unwrap_or(defaults.color_end_variance_b),
            color_end_variance_g: c
                .color_end_variance_g
                .unwrap_or(defaults.color_end_variance_g),
            color_end_variance_r: c
                .color_end_variance_r
                .unwrap_or(defaults.color_end_variance_r),
            color_start_b: c.color_start_b.unwrap_or(defaults.color_start_b),
            color_start_g: c.color_start_g.unwrap_or(defaults.color_start_g),
            color_start_r: c.color_start_r.unwrap_or(defaults.color_start_r),
            color_start_variance_b: c
                .color_start_variance_b
                .unwrap_or(defaults.color_start_variance_b),
            color_start_variance_g: c
                .color_start_variance_g
                .unwrap_or(defaults.color_start_variance_g),
            color_start_variance_r: c
                .color_start_variance_r
                .unwrap_or(defaults.color_start_variance_r),
            direction_x: c.direction_x.unwrap_or(defaults.direction_x),
            direction_y: c.direction_y.unwrap_or(defaults.direction_y),
            direction_z: c.direction_z.unwrap_or(defaults.direction_z),
            duration: c.duration.unwrap_or(defaults.duration),
            emitter_cone_angle: c.emitter_cone_angle.unwrap_or(defaults.emitter_cone_angle),
            emitter_depth: c.emitter_depth.unwrap_or(defaults.emitter_depth),
            emitter_height: c.emitter_height.unwrap_or(defaults.emitter_height),
            emitter_radius: c.emitter_radius.unwrap_or(defaults.emitter_radius),
            emitter_shape: c.emitter_shape.clone().unwrap_or(defaults.emitter_shape),
            emitter_width: c.emitter_width.unwrap_or(defaults.emitter_width),
            frame_count: c.frame_count.unwrap_or(defaults.frame_count),
            frame_rate: c.frame_rate.unwrap_or(defaults.frame_rate),
            gravity_x: c.gravity_x.unwrap_or(defaults.gravity_x),
            gravity_y: c.gravity_y.unwrap_or(defaults.gravity_y),
            gravity_z: c.gravity_z.unwrap_or(defaults.gravity_z),
            lifetime_max: c.lifetime_max.unwrap_or(defaults.lifetime_max),
            lifetime_min: c.lifetime_min.unwrap_or(defaults.lifetime_min),
            looping: c.looping.unwrap_or(defaults.looping),
            max_particles: c.max_particles.unwrap_or(defaults.max_particles),
            region_id_max: c.region_id_max.unwrap_or(defaults.region_id_max),
            region_id_min: c.region_id_min.unwrap_or(defaults.region_id_min),
            rotation_speed_max: c.rotation_speed_max.unwrap_or(defaults.rotation_speed_max),
            rotation_speed_min: c.rotation_speed_min.unwrap_or(defaults.rotation_speed_min),
            scale_curve: c.scale_curve.clone().unwrap_or(defaults.scale_curve),
            scale_end: c.scale_end.unwrap_or(defaults.scale_end),
            scale_max: c.scale_max.unwrap_or(defaults.scale_max),
            scale_min: c.scale_min.unwrap_or(defaults.scale_min),
            spawn_rate: c.spawn_rate.unwrap_or(defaults.spawn_rate),
            speed_max: c.speed_max.unwrap_or(defaults.speed_max),
            speed_min: c.speed_min.unwrap_or(defaults.speed_min),
            spread: c.spread.unwrap_or(defaults.spread),
            velocity_inheritance: c
                .velocity_inheritance
                .unwrap_or(defaults.velocity_inheritance),
            world_space: c.world_space.unwrap_or(defaults.world_space),
        },
    };
}

// flight-lint: allow(conform-extra) D23 C: native all-omitted options record for the approved independently optional TS Partial input
pub fn create_particle_emitter_config_options() -> ParticleEmitterConfigOptions {
    return ParticleEmitterConfigOptions {
        alpha_curve: None,
        alpha_end: None,
        alpha_start: None,
        blend_mode: None,
        burst_count: None,
        burst_interval: None,
        color_curve: None,
        color_end_b: None,
        color_end_g: None,
        color_end_r: None,
        color_end_variance_b: None,
        color_end_variance_g: None,
        color_end_variance_r: None,
        color_start_b: None,
        color_start_g: None,
        color_start_r: None,
        color_start_variance_b: None,
        color_start_variance_g: None,
        color_start_variance_r: None,
        direction_x: None,
        direction_y: None,
        direction_z: None,
        duration: None,
        emitter_cone_angle: None,
        emitter_depth: None,
        emitter_height: None,
        emitter_radius: None,
        emitter_shape: None,
        emitter_width: None,
        frame_count: None,
        frame_rate: None,
        gravity_x: None,
        gravity_y: None,
        gravity_z: None,
        lifetime_max: None,
        lifetime_min: None,
        looping: None,
        max_particles: None,
        region_id_max: None,
        region_id_min: None,
        rotation_speed_max: None,
        rotation_speed_min: None,
        scale_curve: None,
        scale_end: None,
        scale_max: None,
        scale_min: None,
        spawn_rate: None,
        speed_max: None,
        speed_min: None,
        spread: None,
        velocity_inheritance: None,
        world_space: None,
    };
}

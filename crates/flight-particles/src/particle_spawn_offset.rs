use crate::{EmitterShape, ParticleEmitterConfig};

const TWO_PI: f32 = std::f32::consts::PI * 2.0;

/// Write a deterministic 2D spawn-shape offset at `offset` in `out`.
///
/// Point and zero-size shapes write the origin without drawing from `random`.
pub fn write_particle_spawn_offset(
    out: &mut [f32],
    offset: usize,
    config: &ParticleEmitterConfig,
    random: &dyn Fn() -> f32,
) {
    let mut x = 0.0f32;
    let mut y = 0.0f32;
    let shape = config.emitter_shape;

    if shape == EmitterShape::Circle && config.emitter_radius > 0.0 {
        let radius = random().sqrt() * config.emitter_radius;
        let angle = random() * TWO_PI;
        x = angle.cos() * radius;
        y = angle.sin() * radius;
    } else if shape == EmitterShape::Line && config.emitter_width > 0.0 {
        x = (random() - 0.5) * config.emitter_width;
    } else if shape == EmitterShape::Rect
        && (config.emitter_width > 0.0 || config.emitter_height > 0.0)
    {
        let x_sample = random();
        let y_sample = random();
        x = (x_sample - 0.5) * config.emitter_width;
        y = (y_sample - 0.5) * config.emitter_height;
    } else if shape == EmitterShape::Ring && config.emitter_radius > 0.0 {
        let angle = random() * TWO_PI;
        x = angle.cos() * config.emitter_radius;
        y = angle.sin() * config.emitter_radius;
    }

    out[offset] = x;
    out[offset + 1] = y;
}

//! flight-compiler: target-native

use crate::{EmitterShape, ParticleEmitterConfig};

// flight-lint: allow(f64) the angle constant pairs with the f64 RandomSource samples
const TWO_PI: f64 = std::f64::consts::PI * 2.0;

/// Write a deterministic 2D spawn-shape offset at `offset` in `out`.
///
/// Point and zero-size shapes write the origin without drawing from `random`.
///
/// The offset is computed in f64 from the f64 random source and narrows once into the f32 particle
/// state storage `out`.
// flight-lint: allow(f64) the shared RandomSource is f64; shape math stays f64 until the f32 state store
pub fn write_particle_spawn_offset(
    out: &mut [f32],
    offset: usize,
    config: &ParticleEmitterConfig,
    random: &dyn Fn() -> f64,
) {
    let mut x = 0.0_f64;
    let mut y = 0.0_f64;
    let shape = config.emitter_shape;
    let radius_config = f64::from(config.emitter_radius);
    let width = f64::from(config.emitter_width);
    let height = f64::from(config.emitter_height);

    if shape == EmitterShape::Circle && config.emitter_radius > 0.0 {
        let radius = random().sqrt() * radius_config;
        let angle = random() * TWO_PI;
        x = angle.cos() * radius;
        y = angle.sin() * radius;
    } else if shape == EmitterShape::Line && config.emitter_width > 0.0 {
        x = (random() - 0.5) * width;
    } else if shape == EmitterShape::Rect
        && (config.emitter_width > 0.0 || config.emitter_height > 0.0)
    {
        let x_sample = random();
        let y_sample = random();
        x = (x_sample - 0.5) * width;
        y = (y_sample - 0.5) * height;
    } else if shape == EmitterShape::Ring && config.emitter_radius > 0.0 {
        let angle = random() * TWO_PI;
        x = angle.cos() * radius_config;
        y = angle.sin() * radius_config;
    }

    out[offset] = x as f32;
    out[offset + 1] = y as f32;
}

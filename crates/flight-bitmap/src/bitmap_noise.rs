use crate::bitmap::invalidate_bitmap;
use crate::types::*;

pub const BITMAP_NOISE_CHANNEL_A: u32 = 0x8;
pub const BITMAP_NOISE_CHANNEL_B: u32 = 0x4;
pub const BITMAP_NOISE_CHANNEL_G: u32 = 0x2;
pub const BITMAP_NOISE_CHANNEL_R: u32 = 0x1;

/// Fills the `dest` region with uniform random noise in [low, high],
/// derived deterministically from `seed`.
// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
pub fn fill_bitmap_noise(
    dest: &mut BitmapRegion,
    seed: u32,
    low: u8,
    high: u8,
    gray_scale: bool,
) {
    let mut state = if seed == 0 { 1u32 } else { seed };
    let lo = low.max(0) as f32;
    let span = high.max(low) as f32 - lo;
    let bitmap_width = dest.bitmap.width as i32;
    for py in 0..dest.height {
        let y = dest.y + py;
        for px in 0..dest.width {
            state = next_random_state(state);
            let r = lo + (state as f64 / 0x100000000u64 as f64) as f32 * span;
            let mut g = r;
            let mut b = r;
            if !gray_scale {
                state = next_random_state(state);
                g = lo + (state as f64 / 0x100000000u64 as f64) as f32 * span;
                state = next_random_state(state);
                b = lo + (state as f64 / 0x100000000u64 as f64) as f32 * span;
            }
            let x = dest.x + px;
            if y < 0 || y >= dest.bitmap.height as i32 || x < 0 || x >= bitmap_width {
                continue;
            }
            let i = (y as usize * bitmap_width as usize + x as usize) * 4;
            dest.bitmap.data[i] = r.round() as u8;
            dest.bitmap.data[i + 1] = g.round() as u8;
            dest.bitmap.data[i + 2] = b.round() as u8;
            dest.bitmap.data[i + 3] = 255;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Fills `dest` with fractal value noise summed over `octaves`.
// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
pub fn fill_bitmap_perlin_noise(
    dest: &mut BitmapRegion,
    base_x: f64,
    base_y: f64,
    octaves: i32,
    seed: i32,
    gray_scale: bool,
    stitch: bool,
    channel_options: u32,
) {
    let fx0 = if base_x > 0.0 { 1.0 / base_x } else { 0.0 };
    let fy0 = if base_y > 0.0 { 1.0 / base_y } else { 0.0 };
    let passes = octaves.max(1) as usize;
    let bitmap_width = dest.bitmap.width as i32;
    let w = dest.width as f64;
    let h = dest.height as f64;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 { continue; }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let di = (y as usize * bitmap_width as usize + x as usize) * 4;

            let nx = if stitch { stitched_coord(px as f64 * fx0, w * fx0) } else { px as f64 * fx0 };
            let ny = if stitch { stitched_coord(py as f64 * fy0, h * fy0) } else { py as f64 * fy0 };

            if gray_scale {
                let value = fractal_value_noise(nx, ny, passes, seed);
                let byte = (value * 255.0).round() as u8;
                if channel_options & BITMAP_NOISE_CHANNEL_R != 0 { dest.bitmap.data[di] = byte; }
                if channel_options & BITMAP_NOISE_CHANNEL_G != 0 { dest.bitmap.data[di + 1] = byte; }
                if channel_options & BITMAP_NOISE_CHANNEL_B != 0 { dest.bitmap.data[di + 2] = byte; }
            } else {
                if channel_options & BITMAP_NOISE_CHANNEL_R != 0 {
                    dest.bitmap.data[di] = (fractal_value_noise(nx, ny, passes, seed) * 255.0).round() as u8;
                }
                if channel_options & BITMAP_NOISE_CHANNEL_G != 0 {
                    dest.bitmap.data[di + 1] = (fractal_value_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b1u32 as i32)) * 255.0).round() as u8;
                }
                if channel_options & BITMAP_NOISE_CHANNEL_B != 0 {
                    dest.bitmap.data[di + 2] = (fractal_value_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b2u32 as i32)) * 255.0).round() as u8;
                }
            }
            if channel_options & BITMAP_NOISE_CHANNEL_A != 0 {
                dest.bitmap.data[di + 3] = (fractal_value_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b3u32 as i32)) * 255.0).round() as u8;
            } else {
                dest.bitmap.data[di + 3] = 255;
            }
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Fills `dest` with fractal turbulence (absolute-value fBm) value noise.
// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
pub fn fill_bitmap_turbulence(
    dest: &mut BitmapRegion,
    base_x: f64,
    base_y: f64,
    octaves: i32,
    seed: i32,
    gray_scale: bool,
    stitch: bool,
    channel_options: u32,
) {
    let fx0 = if base_x > 0.0 { 1.0 / base_x } else { 0.0 };
    let fy0 = if base_y > 0.0 { 1.0 / base_y } else { 0.0 };
    let passes = octaves.max(1) as usize;
    let bitmap_width = dest.bitmap.width as i32;
    let w = dest.width as f64;
    let h = dest.height as f64;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 { continue; }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= bitmap_width { continue; }
            let di = (y as usize * bitmap_width as usize + x as usize) * 4;

            let nx = if stitch { stitched_coord(px as f64 * fx0, w * fx0) } else { px as f64 * fx0 };
            let ny = if stitch { stitched_coord(py as f64 * fy0, h * fy0) } else { py as f64 * fy0 };

            if gray_scale {
                let value = turbulence_noise(nx, ny, passes, seed);
                let byte = (value * 255.0).round() as u8;
                if channel_options & BITMAP_NOISE_CHANNEL_R != 0 { dest.bitmap.data[di] = byte; }
                if channel_options & BITMAP_NOISE_CHANNEL_G != 0 { dest.bitmap.data[di + 1] = byte; }
                if channel_options & BITMAP_NOISE_CHANNEL_B != 0 { dest.bitmap.data[di + 2] = byte; }
            } else {
                if channel_options & BITMAP_NOISE_CHANNEL_R != 0 {
                    dest.bitmap.data[di] = (turbulence_noise(nx, ny, passes, seed) * 255.0).round() as u8;
                }
                if channel_options & BITMAP_NOISE_CHANNEL_G != 0 {
                    dest.bitmap.data[di + 1] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b1u32 as i32)) * 255.0).round() as u8;
                }
                if channel_options & BITMAP_NOISE_CHANNEL_B != 0 {
                    dest.bitmap.data[di + 2] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b2u32 as i32)) * 255.0).round() as u8;
                }
            }
            if channel_options & BITMAP_NOISE_CHANNEL_A != 0 {
                dest.bitmap.data[di + 3] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b3u32 as i32)) * 255.0).round() as u8;
            } else {
                dest.bitmap.data[di + 3] = 255;
            }
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn fractal_value_noise(x: f64, y: f64, octaves: usize, seed: i32) -> f64 {
    let mut sum = 0.0;
    let mut amplitude = 1.0;
    let mut amplitude_sum = 0.0;
    let mut frequency = 1.0;
    for o in 0..octaves {
        sum += value_noise(x * frequency, y * frequency, seed.wrapping_add((o as i32).wrapping_mul(0x85ebca6bu32 as i32))) * amplitude;
        amplitude_sum += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    if amplitude_sum > 0.0 { sum / amplitude_sum } else { 0.0 }
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn hash_lattice(ix: i32, iy: i32, seed: i32) -> f64 {
    let mut h = ix.wrapping_mul(374761393)
        .wrapping_add(iy.wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(0x9e3779b1u32 as i32));
    h = (h ^ (h as u32 >> 13) as i32).wrapping_mul(1274126177);
    ((h ^ (h as u32 >> 16) as i32) as u32) as f64 / 0x100000000u64 as f64
}

fn next_random_state(state: u32) -> u32 {
    let mut t = state.wrapping_add(0x6d2b79f5);
    t = (t ^ (t >> 15)).wrapping_mul(t | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    let result = t ^ (t >> 14);
    if result == 0 { 1 } else { result }
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn smooth_step(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn stitched_coord(t: f64, period: f64) -> f64 {
    if period <= 0.0 { return t; }
    ((t % period) + period) % period
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn turbulence_noise(x: f64, y: f64, octaves: usize, seed: i32) -> f64 {
    let mut sum = 0.0;
    let mut amplitude = 1.0;
    let mut amplitude_sum = 0.0;
    let mut frequency = 1.0;
    for o in 0..octaves {
        sum += (value_noise(x * frequency, y * frequency, seed.wrapping_add((o as i32).wrapping_mul(0x85ebca6bu32 as i32))) * 2.0 - 1.0).abs() * amplitude;
        amplitude_sum += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    if amplitude_sum > 0.0 { sum / amplitude_sum } else { 0.0 }
}

// flight-lint: allow(f64) value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1)
fn value_noise(x: f64, y: f64, seed: i32) -> f64 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let fx = smooth_step(x - x.floor());
    let fy = smooth_step(y - y.floor());
    let v00 = hash_lattice(ix, iy, seed);
    let v10 = hash_lattice(ix + 1, iy, seed);
    let v01 = hash_lattice(ix, iy + 1, seed);
    let v11 = hash_lattice(ix + 1, iy + 1, seed);
    let top = v00 + (v10 - v00) * fx;
    let bottom = v01 + (v11 - v01) * fx;
    top + (bottom - top) * fy
}

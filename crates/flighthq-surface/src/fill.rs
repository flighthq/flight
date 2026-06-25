//! Rectangular fill, noise, and flood fill operations on surfaces.

use flighthq_types::{Surface, SurfaceRegion};

/// Fills the rectangular `dest` region with a packed RGBA `color`. Pixels of
/// the region that fall outside the surface are skipped.
pub fn fill_surface_rectangle(dest: &mut SurfaceRegion, color: u32) {
    let r = ((color >> 24) & 0xff) as u8;
    let g = ((color >> 16) & 0xff) as u8;
    let b = ((color >> 8) & 0xff) as u8;
    let a = (color & 0xff) as u8;
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let i = ((y * s_width + x) * 4) as usize;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Fills `dest` region with uniform random noise in `[low, high]`, derived
/// deterministically from `seed`. When `gray_scale` is true, R, G, and B
/// share one value per pixel; otherwise each channel is independent. Alpha is
/// set fully opaque (255).
pub fn fill_surface_noise(
    dest: &mut SurfaceRegion,
    seed: u32,
    low: u8,
    high: u8,
    gray_scale: bool,
) {
    let mut state = if seed == 0 { 1 } else { seed };
    let lo = low as f32;
    let span = high as f32 - lo;
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        for px in 0..dest.width {
            // Advance the generator for every region pixel so the field stays
            // deterministic regardless of which pixels fall outside the surface.
            state = next_random_state(state);
            let r = lo + (state as f32 / 4294967296.0) * span;
            let mut g = r;
            let mut b = r;
            if !gray_scale {
                state = next_random_state(state);
                g = lo + (state as f32 / 4294967296.0) * span;
                state = next_random_state(state);
                b = lo + (state as f32 / 4294967296.0) * span;
            }
            let x = dest.x + px;
            if y >= s_height || x >= s_width {
                continue;
            }
            let i = ((y * s_width + x) * 4) as usize;
            data[i] = r.round() as u8;
            data[i + 1] = g.round() as u8;
            data[i + 2] = b.round() as u8;
            data[i + 3] = 255;
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Fills `dest` region with fractal value noise summed over `octaves`.
///
/// - `base_x`, `base_y`: wavelengths in pixels of the first octave (larger = smoother).
/// - `octaves`: number of frequency doublings (1 = smooth; higher = more detail).
/// - `seed`: deterministic integer seed.
/// - `stitch`: when `true`, the noise field tiles seamlessly at the region borders.
/// - `gray_scale`: when `true`, R=G=B share one noise channel. Overrides
///   `channel_options` for the RGB channels.
/// - `channel_options`: bitmask of channels to fill (default `0x7` = RGB, matching
///   OpenFL's `perlinNoise` default). Channels not selected are left unchanged in
///   `dest`, except alpha: when the A bit is not selected, alpha is set opaque
///   (255) rather than left as-is. Use the `SURFACE_NOISE_CHANNEL_*` constants.
///
/// Output range is normalized to 0..255. Alpha defaults to 255 unless the A bit
/// is explicitly included in `channel_options`. Deterministic in `seed`.
pub fn fill_surface_perlin_noise(
    dest: &mut SurfaceRegion,
    base_x: f32,
    base_y: f32,
    octaves: u32,
    seed: u32,
    gray_scale: bool,
    stitch: bool,
    channel_options: u32,
) {
    let fx0 = if base_x > 0.0 { 1.0 / base_x } else { 0.0 };
    let fy0 = if base_y > 0.0 { 1.0 / base_y } else { 0.0 };
    let passes = octaves.max(1);
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let w = dest.width;
    let h = dest.height;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let di = ((y * s_width + x) * 4) as usize;

            let nx = if stitch {
                stitched_coord(px as f32 * fx0, w as f32 * fx0)
            } else {
                px as f32 * fx0
            };
            let ny = if stitch {
                stitched_coord(py as f32 * fy0, h as f32 * fy0)
            } else {
                py as f32 * fy0
            };

            if gray_scale {
                let value = fractal_value_noise(nx, ny, passes, seed);
                let byte = (value * 255.0).round() as u8;
                if channel_options & SURFACE_NOISE_CHANNEL_R != 0 {
                    data[di] = byte;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_G != 0 {
                    data[di + 1] = byte;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_B != 0 {
                    data[di + 2] = byte;
                }
            } else {
                if channel_options & SURFACE_NOISE_CHANNEL_R != 0 {
                    data[di] = (fractal_value_noise(nx, ny, passes, seed) * 255.0).round() as u8;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_G != 0 {
                    data[di + 1] = (fractal_value_noise(
                        nx,
                        ny,
                        passes,
                        seed.wrapping_add(0x9e3779b1),
                    ) * 255.0)
                        .round() as u8;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_B != 0 {
                    data[di + 2] = (fractal_value_noise(
                        nx,
                        ny,
                        passes,
                        seed.wrapping_add(0x9e3779b2),
                    ) * 255.0)
                        .round() as u8;
                }
            }
            if channel_options & SURFACE_NOISE_CHANNEL_A != 0 {
                data[di + 3] = (fractal_value_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b3))
                    * 255.0)
                    .round() as u8;
            } else {
                data[di + 3] = 255;
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Fills `dest` with fractal **turbulence** (absolute-value fBm) value noise,
/// matching OpenFL's `BitmapData.perlinNoise` with `fractalNoise: false`.
/// Turbulence sums `abs(octave)` values, producing a more vigorous, ridge-like
/// texture than the smooth fractal sum.
///
/// Parameters are identical to `fill_surface_perlin_noise` except there is no
/// `fractal_noise` flag (this function _is_ the turbulence variant).
pub fn fill_surface_turbulence(
    dest: &mut SurfaceRegion,
    base_x: f32,
    base_y: f32,
    octaves: u32,
    seed: u32,
    gray_scale: bool,
    stitch: bool,
    channel_options: u32,
) {
    let fx0 = if base_x > 0.0 { 1.0 / base_x } else { 0.0 };
    let fy0 = if base_y > 0.0 { 1.0 / base_y } else { 0.0 };
    let passes = octaves.max(1);
    let s_width = dest.surface.width;
    let s_height = dest.surface.height;
    let w = dest.width;
    let h = dest.height;
    let data = &mut dest.surface.data;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y >= s_height {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x >= s_width {
                continue;
            }
            let di = ((y * s_width + x) * 4) as usize;

            let nx = if stitch {
                stitched_coord(px as f32 * fx0, w as f32 * fx0)
            } else {
                px as f32 * fx0
            };
            let ny = if stitch {
                stitched_coord(py as f32 * fy0, h as f32 * fy0)
            } else {
                py as f32 * fy0
            };

            if gray_scale {
                let value = turbulence_noise(nx, ny, passes, seed);
                let byte = (value * 255.0).round() as u8;
                if channel_options & SURFACE_NOISE_CHANNEL_R != 0 {
                    data[di] = byte;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_G != 0 {
                    data[di + 1] = byte;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_B != 0 {
                    data[di + 2] = byte;
                }
            } else {
                if channel_options & SURFACE_NOISE_CHANNEL_R != 0 {
                    data[di] = (turbulence_noise(nx, ny, passes, seed) * 255.0).round() as u8;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_G != 0 {
                    data[di + 1] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b1))
                        * 255.0)
                        .round() as u8;
                }
                if channel_options & SURFACE_NOISE_CHANNEL_B != 0 {
                    data[di + 2] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b2))
                        * 255.0)
                        .round() as u8;
                }
            }
            if channel_options & SURFACE_NOISE_CHANNEL_A != 0 {
                data[di + 3] = (turbulence_noise(nx, ny, passes, seed.wrapping_add(0x9e3779b3))
                    * 255.0)
                    .round() as u8;
            } else {
                data[di + 3] = 255;
            }
        }
    }
    dest.surface.version = dest.surface.version.wrapping_add(1);
}

/// Flood-fills a connected region of `out` starting at `(x, y)`.
pub fn flood_fill_surface(out: &mut Surface, x: u32, y: u32, color: u32) {
    if x >= out.width || y >= out.height {
        return;
    }
    let width = out.width;
    let height = out.height;

    let fill_r = ((color >> 24) & 0xff) as u8;
    let fill_g = ((color >> 16) & 0xff) as u8;
    let fill_b = ((color >> 8) & 0xff) as u8;
    let fill_a = (color & 0xff) as u8;

    let target_i = ((y * width + x) * 4) as usize;
    let target_r = out.data[target_i];
    let target_g = out.data[target_i + 1];
    let target_b = out.data[target_i + 2];
    let target_a = out.data[target_i + 3];

    if target_r == fill_r && target_g == fill_g && target_b == fill_b && target_a == fill_a {
        return;
    }

    let needed = (width * height) as usize;
    let mut visited = vec![false; needed];
    let mut stack: Vec<u32> = vec![x + y * width];

    while let Some(idx) = stack.pop() {
        let ui = idx as usize;
        if visited[ui] {
            continue;
        }
        visited[ui] = true;

        let px = idx % width;
        let py = idx / width;
        let i = ui * 4;

        if out.data[i] != target_r
            || out.data[i + 1] != target_g
            || out.data[i + 2] != target_b
            || out.data[i + 3] != target_a
        {
            continue;
        }

        out.data[i] = fill_r;
        out.data[i + 1] = fill_g;
        out.data[i + 2] = fill_b;
        out.data[i + 3] = fill_a;

        if px > 0 {
            stack.push(idx - 1);
        }
        if px < width - 1 {
            stack.push(idx + 1);
        }
        if py > 0 {
            stack.push(idx - width);
        }
        if py < height - 1 {
            stack.push(idx + width);
        }
    }
    out.version = out.version.wrapping_add(1);
}

/// Noise channel bitmask: alpha.
pub const SURFACE_NOISE_CHANNEL_A: u32 = 0x8;
/// Noise channel bitmask: blue.
pub const SURFACE_NOISE_CHANNEL_B: u32 = 0x4;
/// Noise channel bitmask: green.
pub const SURFACE_NOISE_CHANNEL_G: u32 = 0x2;
/// Noise channel bitmask: red.
pub const SURFACE_NOISE_CHANNEL_R: u32 = 0x1;

// Fractal sum of value noise: doubling frequency, halving amplitude per octave,
// normalized back to 0..1 by the total amplitude.
fn fractal_value_noise(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
    let mut sum = 0.0f32;
    let mut amplitude = 1.0f32;
    let mut amplitude_sum = 0.0f32;
    let mut frequency = 1.0f32;
    for o in 0..octaves {
        sum += value_noise(
            x * frequency,
            y * frequency,
            seed.wrapping_add(o.wrapping_mul(0x85ebca6b)),
        ) * amplitude;
        amplitude_sum += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    if amplitude_sum > 0.0 {
        sum / amplitude_sum
    } else {
        0.0
    }
}

// Integer hash to a deterministic 0..1 value; the lattice corners of value_noise.
fn hash_lattice(ix: i32, iy: i32, seed: u32) -> f32 {
    let mut h = (ix as u32)
        .wrapping_mul(374761393)
        .wrapping_add((iy as u32).wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(0x9e3779b1));
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    (h ^ (h >> 16)) as f32 / 4294967296.0
}

// Mulberry32 step: maps one 32-bit state to the next, used as an unsigned int.
fn next_random_state(state: u32) -> u32 {
    let mut t = state.wrapping_add(0x6d2b79f5);
    t = (t ^ (t >> 15)).wrapping_mul(t | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    let result = t ^ (t >> 14);
    if result == 0 { 1 } else { result }
}

// Smoothstep, so lattice cells blend without visible seams.
fn smooth_step(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

// Wraps t into [0, period) so that integer lattice indices repeat, producing seamless tiling.
fn stitched_coord(t: f32, period: f32) -> f32 {
    if period <= 0.0 {
        return t;
    }
    ((t % period) + period) % period
}

// Fractal turbulence: abs(2*v - 1) fBm, producing a more vigorous ridge-like texture than
// the smooth fractal sum (matches OpenFL perlinNoise with fractalNoise=false).
fn turbulence_noise(x: f32, y: f32, octaves: u32, seed: u32) -> f32 {
    let mut sum = 0.0f32;
    let mut amplitude = 1.0f32;
    let mut amplitude_sum = 0.0f32;
    let mut frequency = 1.0f32;
    for o in 0..octaves {
        sum += (value_noise(
            x * frequency,
            y * frequency,
            seed.wrapping_add(o.wrapping_mul(0x85ebca6b)),
        ) * 2.0
            - 1.0)
            .abs()
            * amplitude;
        amplitude_sum += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    if amplitude_sum > 0.0 {
        sum / amplitude_sum
    } else {
        0.0
    }
}

// Bilinearly-interpolated lattice hash — one octave of value noise in 0..1.
fn value_noise(x: f32, y: f32, seed: u32) -> f32 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let fx = smooth_step(x - ix as f32);
    let fy = smooth_step(y - iy as f32);
    let v00 = hash_lattice(ix, iy, seed);
    let v10 = hash_lattice(ix + 1, iy, seed);
    let v01 = hash_lattice(ix, iy + 1, seed);
    let v11 = hash_lattice(ix + 1, iy + 1, seed);
    let top = v00 + (v10 - v00) * fx;
    let bottom = v01 + (v11 - v01) * fx;
    top + (bottom - top) * fy
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::region::create_surface_region;
    use crate::surface::create_surface;

    #[test]
    fn fill_surface_rectangle_fills_color() {
        let surface = create_surface(4, 4, 0);
        let mut dest = create_surface_region(surface, 1, 1, 2, 2);
        fill_surface_rectangle(&mut dest, 0xff0000ff);
        // pixel inside region filled
        assert_eq!(
            crate::pixel::get_surface_pixel(&dest.surface, 1, 1),
            0xff0000ff
        );
        // pixel outside region untouched
        assert_eq!(crate::pixel::get_surface_pixel(&dest.surface, 0, 0), 0);
    }

    #[test]
    fn fill_surface_noise_deterministic() {
        let a = create_surface(8, 8, 0);
        let b = create_surface(8, 8, 0);
        let mut ra = create_surface_region(a, 0, 0, 8, 8);
        let mut rb = create_surface_region(b, 0, 0, 8, 8);
        fill_surface_noise(&mut ra, 42, 0, 255, false);
        fill_surface_noise(&mut rb, 42, 0, 255, false);
        assert_eq!(ra.surface.data, rb.surface.data);
        // alpha opaque
        assert_eq!(ra.surface.data[3], 255);
    }

    #[test]
    fn fill_surface_noise_grayscale_channels_equal() {
        let s = create_surface(4, 4, 0);
        let mut r = create_surface_region(s, 0, 0, 4, 4);
        fill_surface_noise(&mut r, 7, 0, 255, true);
        for i in (0..r.surface.data.len()).step_by(4) {
            assert_eq!(r.surface.data[i], r.surface.data[i + 1]);
            assert_eq!(r.surface.data[i], r.surface.data[i + 2]);
        }
    }

    #[test]
    fn fill_surface_perlin_noise_deterministic() {
        let a = create_surface(16, 16, 0);
        let b = create_surface(16, 16, 0);
        let mut ra = create_surface_region(a, 0, 0, 16, 16);
        let mut rb = create_surface_region(b, 0, 0, 16, 16);
        fill_surface_perlin_noise(&mut ra, 8.0, 8.0, 3, 99, false, false, 0x7);
        fill_surface_perlin_noise(&mut rb, 8.0, 8.0, 3, 99, false, false, 0x7);
        assert_eq!(ra.surface.data, rb.surface.data);
        assert_eq!(ra.surface.data[3], 255);
    }

    #[test]
    fn fill_surface_perlin_noise_selected_channels_only() {
        let surface = create_surface(8, 8, 0x000000ff);
        let mut r = create_surface_region(surface, 0, 0, 8, 8);
        fill_surface_perlin_noise(
            &mut r,
            8.0,
            8.0,
            2,
            5,
            false,
            false,
            SURFACE_NOISE_CHANNEL_R,
        );
        for i in (0..r.surface.data.len()).step_by(4) {
            // G and B were not selected, so they stay at their initial 0.
            assert_eq!(r.surface.data[i + 1], 0);
            assert_eq!(r.surface.data[i + 2], 0);
            // Alpha not selected -> forced opaque.
            assert_eq!(r.surface.data[i + 3], 255);
        }
    }

    #[test]
    fn fill_surface_turbulence_deterministic() {
        let a = create_surface(8, 8, 0);
        let b = create_surface(8, 8, 0);
        let mut ra = create_surface_region(a, 0, 0, 8, 8);
        let mut rb = create_surface_region(b, 0, 0, 8, 8);
        fill_surface_turbulence(&mut ra, 16.0, 16.0, 3, 42, false, false, 0x7);
        fill_surface_turbulence(&mut rb, 16.0, 16.0, 3, 42, false, false, 0x7);
        assert_eq!(ra.surface.data, rb.surface.data);
    }

    #[test]
    fn fill_surface_turbulence_in_range_and_alpha_opaque() {
        let s = create_surface(8, 8, 0);
        let mut r = create_surface_region(s, 0, 0, 8, 8);
        fill_surface_turbulence(&mut r, 8.0, 8.0, 2, 5, false, false, 0x7);
        for i in (0..r.surface.data.len()).step_by(4) {
            // u8 is inherently 0..=255; assert alpha opaque.
            assert_eq!(r.surface.data[i + 3], 255);
        }
    }

    #[test]
    fn fill_surface_turbulence_grayscale_channels_equal() {
        let s = create_surface(8, 8, 0);
        let mut r = create_surface_region(s, 0, 0, 8, 8);
        fill_surface_turbulence(&mut r, 8.0, 8.0, 2, 5, true, false, 0x7);
        for i in (0..r.surface.data.len()).step_by(4) {
            assert_eq!(r.surface.data[i], r.surface.data[i + 1]);
            assert_eq!(r.surface.data[i + 1], r.surface.data[i + 2]);
        }
    }

    #[test]
    fn fill_surface_turbulence_writes_noise_into_alpha() {
        let surface = create_surface(8, 8, 0x000000ff);
        let mut r = create_surface_region(surface, 0, 0, 8, 8);
        fill_surface_turbulence(
            &mut r,
            4.0,
            4.0,
            3,
            9,
            false,
            false,
            SURFACE_NOISE_CHANNEL_A,
        );
        let mut saw_non_opaque = false;
        for i in (0..r.surface.data.len()).step_by(4) {
            if r.surface.data[i + 3] != 255 {
                saw_non_opaque = true;
            }
        }
        assert!(saw_non_opaque);
    }

    #[test]
    fn fill_surface_turbulence_differs_from_fractal_sum() {
        let turbulent = create_surface(8, 8, 0);
        let fractal = create_surface(8, 8, 0);
        let mut rt = create_surface_region(turbulent, 0, 0, 8, 8);
        let mut rf = create_surface_region(fractal, 0, 0, 8, 8);
        fill_surface_turbulence(&mut rt, 8.0, 8.0, 3, 7, true, false, 0x7);
        fill_surface_perlin_noise(&mut rf, 8.0, 8.0, 3, 7, true, false, 0x7);
        assert_ne!(rt.surface.data, rf.surface.data);
    }

    #[test]
    fn fill_surface_turbulence_fills_only_subregion() {
        let surface = create_surface(2, 1, 0x010203ff);
        let mut r = create_surface_region(surface, 1, 0, 1, 1);
        fill_surface_turbulence(&mut r, 8.0, 8.0, 2, 3, false, false, 0x7);
        // Left pixel untouched.
        assert_eq!(r.surface.data[0], 1);
        assert_eq!(r.surface.data[1], 2);
        assert_eq!(r.surface.data[2], 3);
    }

    #[test]
    fn flood_fill_surface_fills_connected_region() {
        let mut s = create_surface(3, 3, 0x000000ff);
        // isolate one corner with a different color so fill stops
        set_surface_pixel(&mut s, 2, 2, 0xff0000ff);
        flood_fill_surface(&mut s, 0, 0, 0x00ff00ff);
        // the green fill reaches everything except the red pixel
        assert_eq!(crate::pixel::get_surface_pixel(&s, 0, 0), 0x00ff00ff);
        assert_eq!(crate::pixel::get_surface_pixel(&s, 2, 2), 0xff0000ff);
        assert_eq!(crate::pixel::get_surface_pixel(&s, 1, 1), 0x00ff00ff);
    }
}

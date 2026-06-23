//! General convolution filter with configurable edge modes.

use flighthq_types::SurfaceRegion;

/// How to handle kernel samples that fall outside the surface.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum SurfaceConvolutionEdge {
    /// Repeat the nearest edge pixel.
    #[default]
    Clamp,
    /// Use `fill_color` for out-of-bounds samples.
    Fill,
    /// Tile the surface toroidally.
    Wrap,
}

/// Options for `convolve_surface`.
#[derive(Clone, Debug)]
pub struct SurfaceConvolutionOptions {
    pub bias: f32,
    pub edge: SurfaceConvolutionEdge,
    /// Packed `0xRRGGBBAA` fill color used when `edge` is `Fill`. Default 0.
    pub fill_color: u32,
    /// Divisor applied after convolution. `0.0` means "auto": divide by the
    /// kernel sum (itself treated as `1.0` when the sum is zero).
    pub divisor: f32,
    /// Row-major convolution kernel of `matrix_x * matrix_y` entries.
    pub matrix: Vec<f32>,
    pub matrix_x: u32,
    pub matrix_y: u32,
    /// When true, the alpha channel is copied from the source unchanged.
    pub preserve_alpha: bool,
}

/// Applies a convolution filter to `source` and writes into `out`.
/// `out` must be at least `source.width * source.height * 4` bytes.
///
/// `out` must NOT alias `source.surface.data` — convolution reads neighboring
/// pixels during kernel evaluation.
///
/// Panics if `matrix_x` or `matrix_y` is zero, or if `matrix` is shorter
/// than `matrix_x * matrix_y`.
pub fn convolve_surface(
    out: &mut [u8],
    source: &SurfaceRegion,
    options: &SurfaceConvolutionOptions,
) {
    let matrix_x = options.matrix_x;
    let matrix_y = options.matrix_y;
    if matrix_x == 0 || matrix_y == 0 {
        panic!("Convolution filter matrix dimensions must be positive");
    }
    if (options.matrix.len() as u32) < matrix_x * matrix_y {
        panic!("Convolution filter matrix does not match its dimensions");
    }

    // A divisor of 0.0 stands in for "not provided" (the caller maps `None`
    // onto 0.0); compute it from the kernel sum instead.
    let raw_divisor = if options.divisor == 0.0 {
        get_convolution_divisor(&options.matrix, (matrix_x * matrix_y) as usize)
    } else {
        options.divisor
    };
    let divisor = if raw_divisor == 0.0 { 1.0 } else { raw_divisor };
    let bias = options.bias;
    let edge = options.edge;
    let preserve_alpha = options.preserve_alpha;
    let fill_color = options.fill_color;
    let offset_x = (matrix_x / 2) as i64;
    let offset_y = (matrix_y / 2) as i64;
    let surface_width = source.surface.width as i64;
    let surface_height = source.surface.height as i64;
    let data = &source.surface.data;
    let fill_r = ((fill_color >> 24) & 0xff) as f32;
    let fill_g = ((fill_color >> 16) & 0xff) as f32;
    let fill_b = ((fill_color >> 8) & 0xff) as f32;
    let fill_a = (fill_color & 0xff) as f32;

    for py in 0..source.height as i64 {
        for px in 0..source.width as i64 {
            let mut r = 0.0_f32;
            let mut g = 0.0_f32;
            let mut b = 0.0_f32;
            let mut a = 0.0_f32;
            for ky in 0..matrix_y as i64 {
                let raw_sample_y = source.y as i64 + py + ky - offset_y;
                let row_start = (ky * matrix_x as i64) as usize;
                for kx in 0..matrix_x as i64 {
                    let raw_sample_x = source.x as i64 + px + kx - offset_x;
                    let weight = options.matrix[row_start + kx as usize];
                    let sample_x;
                    let sample_y;

                    if raw_sample_y < 0
                        || raw_sample_y >= surface_height
                        || raw_sample_x < 0
                        || raw_sample_x >= surface_width
                    {
                        match edge {
                            SurfaceConvolutionEdge::Fill => {
                                r += fill_r * weight;
                                g += fill_g * weight;
                                b += fill_b * weight;
                                a += fill_a * weight;
                                continue;
                            }
                            SurfaceConvolutionEdge::Wrap => {
                                sample_x = raw_sample_x.rem_euclid(surface_width);
                                sample_y = raw_sample_y.rem_euclid(surface_height);
                            }
                            SurfaceConvolutionEdge::Clamp => {
                                sample_x = raw_sample_x.clamp(0, surface_width - 1);
                                sample_y = raw_sample_y.clamp(0, surface_height - 1);
                            }
                        }
                    } else {
                        sample_x = raw_sample_x;
                        sample_y = raw_sample_y;
                    }

                    let i = ((sample_y * surface_width + sample_x) * 4) as usize;
                    r += data[i] as f32 * weight;
                    g += data[i + 1] as f32 * weight;
                    b += data[i + 2] as f32 * weight;
                    a += data[i + 3] as f32 * weight;
                }
            }
            let di = ((py * source.width as i64 + px) * 4) as usize;
            out[di] = clamp_byte(r / divisor + bias);
            out[di + 1] = clamp_byte(g / divisor + bias);
            out[di + 2] = clamp_byte(b / divisor + bias);
            if preserve_alpha {
                let cy = (source.y as i64 + py).clamp(0, surface_height - 1);
                let cx = (source.x as i64 + px).clamp(0, surface_width - 1);
                out[di + 3] = data[((cy * surface_width + cx) * 4 + 3) as usize];
            } else {
                out[di + 3] = clamp_byte(a / divisor + bias);
            }
        }
    }
}

fn clamp_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

fn get_convolution_divisor(matrix: &[f32], length: usize) -> f32 {
    let sum: f32 = matrix.iter().take(length).sum();
    if sum == 0.0 { 1.0 } else { sum }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create_surface;
    use flighthq_types::SurfaceRegion;

    fn region(surface: flighthq_types::Surface) -> SurfaceRegion {
        let width = surface.width;
        let height = surface.height;
        SurfaceRegion {
            surface,
            x: 0,
            y: 0,
            width,
            height,
        }
    }

    fn opts(matrix: Vec<f32>, matrix_x: u32, matrix_y: u32) -> SurfaceConvolutionOptions {
        SurfaceConvolutionOptions {
            bias: 0.0,
            edge: SurfaceConvolutionEdge::Clamp,
            fill_color: 0,
            divisor: 0.0,
            matrix,
            matrix_x,
            matrix_y,
            preserve_alpha: true,
        }
    }

    #[test]
    fn convolve_surface_applies_matrix() {
        let mut source = create_surface(3, 1, 0);
        source.data[0] = 10;
        source.data[4] = 20;
        source.data[8] = 30;
        let mut out = vec![0_u8; 4];
        let r = SurfaceRegion {
            surface: source,
            x: 1,
            y: 0,
            width: 1,
            height: 1,
        };
        let mut o = opts(vec![1.0, 1.0, 1.0], 3, 1);
        o.preserve_alpha = false;
        convolve_surface(&mut out, &r, &o);
        assert_eq!(out[0], 20);
    }

    #[test]
    fn convolve_surface_identity_kernel() {
        let source = create_surface(2, 2, 0x336699ff);
        let mut out = vec![0_u8; 16];
        let mut o = opts(vec![1.0], 1, 1);
        o.divisor = 1.0;
        o.preserve_alpha = false;
        convolve_surface(&mut out, &region(source), &o);
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn convolve_surface_edge_fill() {
        let source = create_surface(1, 1, 0x000000ff);
        let mut out = vec![0_u8; 4];
        let mut o = opts(vec![1.0, 0.0, 0.0], 3, 1);
        o.edge = SurfaceConvolutionEdge::Fill;
        o.fill_color = 0xff0000ff;
        o.divisor = 1.0;
        o.preserve_alpha = false;
        convolve_surface(&mut out, &region(source), &o);
        assert_eq!(out[0], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn convolve_surface_edge_clamp() {
        let source = create_surface(1, 1, 0x606060ff);
        let mut out = vec![0_u8; 4];
        let mut o = opts(vec![1.0, 1.0, 1.0], 3, 1);
        o.divisor = 3.0;
        o.preserve_alpha = false;
        convolve_surface(&mut out, &region(source), &o);
        assert_eq!(out[0], 0x60);
    }

    #[test]
    fn convolve_surface_edge_wrap() {
        let mut source = create_surface(3, 1, 0);
        source.data[0] = 10;
        source.data[4] = 20;
        source.data[8] = 30;
        let mut out = vec![0_u8; 12];
        let mut o = opts(vec![1.0, 0.0, 0.0], 3, 1);
        o.edge = SurfaceConvolutionEdge::Wrap;
        o.divisor = 1.0;
        o.preserve_alpha = false;
        convolve_surface(&mut out, &region(source), &o);
        // px=0 left neighbor wraps to px=2 → value 30.
        assert_eq!(out[0], 30);
    }

    #[test]
    fn convolve_surface_preserves_alpha_by_default() {
        let source = create_surface(1, 1, 0x00000044);
        let mut out = vec![0_u8; 4];
        let mut o = opts(vec![1.0], 1, 1);
        o.bias = 255.0;
        convolve_surface(&mut out, &region(source), &o);
        assert_eq!(out[3], 0x44);
    }

    #[test]
    #[should_panic]
    fn convolve_surface_panics_on_zero_dimension() {
        let source = create_surface(1, 1, 0);
        let mut out = vec![0_u8; 4];
        convolve_surface(&mut out, &region(source), &opts(vec![], 0, 1));
    }

    #[test]
    #[should_panic]
    fn convolve_surface_panics_on_short_matrix() {
        let source = create_surface(1, 1, 0);
        let mut out = vec![0_u8; 4];
        convolve_surface(&mut out, &region(source), &opts(vec![1.0], 3, 3));
    }

    #[test]
    fn convolve_surface_auto_divisor_passthrough() {
        // divisor 0.0 → auto from a single-weight kernel summing to 1.
        let source = create_surface(1, 1, 0x804020ff);
        let mut out = vec![0_u8; 4];
        let mut o = opts(vec![1.0], 1, 1);
        o.preserve_alpha = false;
        convolve_surface(&mut out, &region(source), &o);
        assert_eq!(out[0], 0x80);
    }
}

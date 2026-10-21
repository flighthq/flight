use crate::contract::AdjustmentSignatureValue;
use crate::contract::ColorTransformFunction;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn sample_matches_sample_color_lut() {
        let lut = bake_color_lut(&[], Some(4));
        let mut a = [0.0; 3];
        let mut b = [0.0; 3];
        lut.sample(&mut a, 0.2, 0.4, 0.6);
        sample_color_lut(&lut, &mut b, 0.2, 0.4, 0.6);
        assert_eq!(a, b);
    }
}

/// Default per-axis LUT resolution. 32^3 balances quality against upload/memory; raise it to cut banding.
pub const COLOR_LUT_DEFAULT_SIZE: u32 = 32;

/// A 3D color lookup table. `samples` is `size^3 * 3` floats, R fastest then G then B: cell
/// `(ri, gi, bi)` starts at `((bi * size + gi) * size + ri) * 3`.
#[derive(Debug, Clone)]
pub struct ColorLut {
    pub size: u32,
    pub samples: Vec<f32>,
}

/// Bakes a run of rgb->rgb transforms into one `ColorLut` of `size` cells per axis (default
/// `COLOR_LUT_DEFAULT_SIZE`). The transforms apply left-to-right (index 0 first) at each cell's
/// unit-cube coordinate; an empty run yields the identity LUT.
pub fn bake_color_lut(transforms: &[ColorTransformFunction], size: Option<u32>) -> ColorLut {
    let size = size.unwrap_or(COLOR_LUT_DEFAULT_SIZE);
    let n = if size < 2 { 2 } else { size };
    let total = (n * n * n * 3) as usize;
    let mut samples = vec![0.0_f32; total];
    let denom = (n - 1) as f32;
    let mut cell: [f32; 3] = [0.0, 0.0, 0.0];
    let mut i: usize = 0;
    for bi in 0..n {
        let b_val = bi as f32 / denom;
        for gi in 0..n {
            let g_val = gi as f32 / denom;
            for ri in 0..n {
                cell[0] = ri as f32 / denom;
                cell[1] = g_val;
                cell[2] = b_val;
                for k in 0..transforms.len() {
                    let cr = cell[0];
                    let cg = cell[1];
                    let cb = cell[2];
                    (transforms[k])(&mut cell, cr, cg, cb);
                }
                samples[i] = clamp01(cell[0]);
                samples[i + 1] = clamp01(cell[1]);
                samples[i + 2] = clamp01(cell[2]);
                i += 3;
            }
        }
    }
    return ColorLut { size: n, samples };
}

fn clamp01(v: f32) -> f32 {
    return if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v };
}

/// Trilinearly samples `lut` at normalized `(r, g, b)` (clamped to the cube) and writes the RGB result
/// into `out`. The CPU counterpart of the GPU's hardware-filtered 3D texture tap. Alias-safe with
/// respect to `out`.
pub fn sample_color_lut(lut: &ColorLut, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
    let n = lut.size as usize;
    let s = &lut.samples;
    let max = n - 1;
    let fr = clamp01(r) * max as f32;
    let fg = clamp01(g) * max as f32;
    let fb = clamp01(b) * max as f32;
    let r0 = fr.floor() as usize;
    let g0 = fg.floor() as usize;
    let b0 = fb.floor() as usize;
    let r1 = if r0 + 1 > max { max } else { r0 + 1 };
    let g1 = if g0 + 1 > max { max } else { g0 + 1 };
    let b1 = if b0 + 1 > max { max } else { b0 + 1 };
    let dr = fr - r0 as f32;
    let dg = fg - g0 as f32;
    let db = fb - b0 as f32;
    for c in 0..3 {
        let c000 = s[((b0 * n + g0) * n + r0) * 3 + c];
        let c100 = s[((b0 * n + g0) * n + r1) * 3 + c];
        let c010 = s[((b0 * n + g1) * n + r0) * 3 + c];
        let c110 = s[((b0 * n + g1) * n + r1) * 3 + c];
        let c001 = s[((b1 * n + g0) * n + r0) * 3 + c];
        let c101 = s[((b1 * n + g0) * n + r1) * 3 + c];
        let c011 = s[((b1 * n + g1) * n + r0) * 3 + c];
        let c111 = s[((b1 * n + g1) * n + r1) * 3 + c];
        let c00 = c000 + (c100 - c000) * dr;
        let c10 = c010 + (c110 - c010) * dr;
        let c01 = c001 + (c101 - c001) * dr;
        let c11 = c011 + (c111 - c011) * dr;
        let c0 = c00 + (c10 - c00) * dg;
        let c1 = c01 + (c11 - c01) * dg;
        out[c] = c0 + (c1 - c0) * db;
    }
}

impl Default for ColorLut {
    fn default() -> Self {
        return Self {
            size: 0,
            samples: Vec::new(),
        };
    }
}

// flight-lint: allow(sugar-delegates) cache-signature serialization for impl_adjustment! (TS JSON.stringify of a ColorLut: size, then samples); runtime infrastructure, not sugar
impl AdjustmentSignatureValue for ColorLut {
    fn write_adjustment_signature_value(&self, out: &mut String) {
        out.push_str("{\"size\":");
        self.size.write_adjustment_signature_value(out);
        out.push_str(",\"samples\":[");
        for (i, v) in self.samples.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            v.write_adjustment_signature_value(out);
        }
        out.push_str("]}");
    }
}

impl ColorLut {
    pub fn sample(&self, out: &mut [f32; 3], r: f32, g: f32, b: f32) {
        sample_color_lut(self, out, r, g, b);
    }
}

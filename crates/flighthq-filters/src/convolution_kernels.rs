//! Convolution kernel builders for use with `ConvolutionFilter`.
//!
//! Each builder returns a `ConvolutionKernelData` — the fields needed to construct a
//! `ConvolutionFilter`. None performs rasterization; backends consume these values.
//!
//! Separable kernels can be applied as two independent 1-D passes (horizontal then vertical),
//! which reduces the per-pixel work from O(w×h) to O(w+h). Use `is_separable_kernel` to test
//! and `get_separable_kernel_factors` to obtain the two 1-D factor arrays.

/// Describes the shape of a convolution kernel returned by the builders.
#[derive(Clone, Debug, Default)]
pub struct ConvolutionKernelData {
    pub matrix: Vec<f32>,
    pub matrix_x: u32,
    pub matrix_y: u32,
    /// Recommended divisor. When `None`, use the kernel sum or 1 if the sum is 0.
    pub divisor: Option<f32>,
}

/// Returns a box (averaging) blur kernel of size `size` × `size`. `size` must be an odd integer
/// ≥ 1; out-of-range values are clamped. Allocates a new kernel.
pub fn create_box_blur_kernel(size: u32) -> ConvolutionKernelData {
    let s = (size.max(1)) | 1; // force odd, ≥ 1
    let n = s * s;
    let matrix = vec![1.0; n as usize];
    ConvolutionKernelData {
        matrix,
        matrix_x: s,
        matrix_y: s,
        divisor: Some(n as f32),
    }
}

/// Returns a 3×3 edge-detection kernel (Laplacian of Gaussian approximation). The kernel
/// highlights edges by subtracting the neighbourhood average from the centre. Allocates a new
/// kernel.
pub fn create_edge_detect_kernel() -> ConvolutionKernelData {
    #[rustfmt::skip]
    let matrix = vec![
        -1.0, -1.0, -1.0,
        -1.0, 8.0, -1.0,
        -1.0, -1.0, -1.0,
    ];
    ConvolutionKernelData {
        matrix,
        matrix_x: 3,
        matrix_y: 3,
        divisor: Some(1.0),
    }
}

/// Returns a 3×3 emboss kernel oriented at `angle` degrees (135° matches the classic north-west
/// emboss). Allocates a new kernel.
pub fn create_emboss_kernel(angle: f32) -> ConvolutionKernelData {
    let rad = angle.to_radians();
    let dx = rad.cos().round() as i32;
    let dy = rad.sin().round() as i32;
    // Centre = 1 (bias-neutral), opposite to (dx,dy) = -2, along (dx,dy) = 2, rest 0.
    let mut matrix = vec![0.0; 9];
    matrix[4] = 1.0; // centre
    let opp_row = 1 - dy;
    let opp_col = 1 - dx;
    let dir_row = 1 + dy;
    let dir_col = 1 + dx;
    matrix[(opp_row * 3 + opp_col) as usize] = -2.0;
    matrix[(dir_row * 3 + dir_col) as usize] = 2.0;
    ConvolutionKernelData {
        matrix,
        matrix_x: 3,
        matrix_y: 3,
        divisor: Some(1.0),
    }
}

/// Returns a separable 1D Gaussian kernel of length `size` (odd, ≥ 1) with standard deviation
/// `sigma`. When `sigma` is `None` it defaults to `(size - 1) / 6` (the common rule-of-thumb that
/// fits ~99.7% of the distribution within the kernel). Use the same kernel for both the
/// horizontal and vertical passes of a two-pass separable convolution. Allocates a new kernel.
pub fn create_gaussian_kernel(size: u32, sigma: Option<f32>) -> ConvolutionKernelData {
    let s = (size.max(1)) | 1;
    let sig = sigma.unwrap_or_else(|| ((s as f32 - 1.0) / 6.0).max(1.0));
    let half = (s / 2) as i32;
    let mut kernel = vec![0.0; s as usize];
    let mut sum = 0.0;
    for i in 0..s as i32 {
        let x = (i - half) as f32;
        let v = (-(x * x) / (2.0 * sig * sig)).exp();
        kernel[i as usize] = v;
        sum += v;
    }
    // Normalise so the kernel sums to 1 (stored un-scaled; divisor matches the sum).
    ConvolutionKernelData {
        matrix: kernel,
        matrix_x: s,
        matrix_y: 1,
        divisor: Some(sum),
    }
}

/// Returns a 3×3 Laplacian kernel. Equivalent to `create_edge_detect_kernel` in most backends.
/// Allocates a new kernel.
pub fn create_laplacian_kernel() -> ConvolutionKernelData {
    #[rustfmt::skip]
    let matrix = vec![
        0.0, -1.0, 0.0,
        -1.0, 4.0, -1.0,
        0.0, -1.0, 0.0,
    ];
    ConvolutionKernelData {
        matrix,
        matrix_x: 3,
        matrix_y: 3,
        divisor: Some(1.0),
    }
}

/// Returns a 3×3 outline kernel that highlights borders by subtracting the centre from its
/// neighbours. Allocates a new kernel.
pub fn create_outline_kernel() -> ConvolutionKernelData {
    #[rustfmt::skip]
    let matrix = vec![
        -1.0, -1.0, -1.0,
        -1.0, 8.0, -1.0,
        -1.0, -1.0, -1.0,
    ];
    ConvolutionKernelData {
        matrix,
        matrix_x: 3,
        matrix_y: 3,
        divisor: Some(1.0),
    }
}

/// Returns a 3×3 sharpen kernel with the given `amount`. Higher values produce a stronger
/// sharpening effect. Allocates a new kernel.
pub fn create_sharpen_kernel(amount: f32) -> ConvolutionKernelData {
    let c = 1.0 + 4.0 * amount; // centre weight
    #[rustfmt::skip]
    let matrix = vec![
        0.0, -amount, 0.0,
        -amount, c, -amount,
        0.0, -amount, 0.0,
    ];
    ConvolutionKernelData {
        matrix,
        matrix_x: 3,
        matrix_y: 3,
        divisor: Some(1.0),
    }
}

/// Computes the sum of all kernel values; use as the divisor for a unit-gain kernel. When the sum
/// is 0 (e.g. edge-detect kernels), returns 1 to avoid division by zero.
pub fn get_convolution_divisor(matrix: &[f32]) -> f32 {
    let sum: f32 = matrix.iter().sum();
    if sum == 0.0 { 1.0 } else { sum }
}

/// Returns `(row, col)` 1-D factor vectors when `kernel` is a rank-1 (separable) 2-D matrix, or
/// `None` when it is not separable. A kernel is separable when its 2-D matrix is the outer
/// product of two 1-D vectors, i.e. `kernel[i][j] = row[i] * col[j]`.
///
/// GPU backends can substitute two 1-D convolution passes for the 2-D pass, reducing per-pixel
/// work from O(w×h) to O(w+h). Allocates two new vectors when the kernel is separable.
pub fn get_separable_kernel_factors(
    kernel: &ConvolutionKernelData,
) -> Option<(Vec<f32>, Vec<f32>)> {
    let matrix = &kernel.matrix;
    let matrix_x = kernel.matrix_x;
    let matrix_y = kernel.matrix_y;
    if matrix_x == 1 {
        return Some((vec![1.0], matrix.clone()));
    }
    if matrix_y == 1 {
        return Some((matrix.clone(), vec![1.0]));
    }
    // Find the first non-zero element to establish the scale vector.
    let mut pivot_row: Option<usize> = None;
    let mut pivot_col: usize = 0;
    'outer: for r in 0..matrix_y as usize {
        for c in 0..matrix_x as usize {
            if matrix[r * matrix_x as usize + c] != 0.0 {
                pivot_row = Some(r);
                pivot_col = c;
                break 'outer;
            }
        }
    }
    // All-zero kernel: trivially separable as zero vectors.
    let pivot_row = match pivot_row {
        Some(r) => r,
        None => return Some((vec![0.0; matrix_y as usize], vec![0.0; matrix_x as usize])),
    };
    let pivot_value = matrix[pivot_row * matrix_x as usize + pivot_col];
    // Extract candidate column factor from the pivot row.
    let mut col_factor = vec![0.0; matrix_x as usize];
    for c in 0..matrix_x as usize {
        col_factor[c] = matrix[pivot_row * matrix_x as usize + c] / pivot_value;
    }
    // Extract candidate row factor from the pivot column.
    let mut row_factor = vec![0.0; matrix_y as usize];
    for r in 0..matrix_y as usize {
        row_factor[r] = matrix[r * matrix_x as usize + pivot_col];
    }
    // Verify: every element must equal row_factor[r] * col_factor[c].
    let eps = 1e-10;
    for r in 0..matrix_y as usize {
        for c in 0..matrix_x as usize {
            let expected = row_factor[r] * col_factor[c];
            let actual = matrix[r * matrix_x as usize + c];
            if (actual - expected).abs() > eps {
                return None;
            }
        }
    }
    Some((row_factor, col_factor))
}

/// Returns `true` when `kernel` is separable — i.e. can be decomposed into two independent 1-D
/// passes. Equivalent to `get_separable_kernel_factors(kernel).is_some()` but avoids allocating
/// the factor vectors when only the boolean answer is needed.
pub fn is_separable_kernel(kernel: &ConvolutionKernelData) -> bool {
    get_separable_kernel_factors(kernel).is_some()
}

/// Normalises `matrix` so the kernel sums to 1, writing the result into `out`. No-ops (writes
/// zeros) when the sum is 0. Alias-safe: `out` may be `matrix`.
pub fn normalize_convolution_kernel(out: &mut [f32], matrix: &[f32]) {
    let sum = get_convolution_divisor(matrix);
    for i in 0..matrix.len() {
        out[i] = matrix[i] / sum;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_box_blur_kernel_returns_a_3x3_kernel_for_size_3() {
        let k = create_box_blur_kernel(3);
        assert_eq!(k.matrix_x, 3);
        assert_eq!(k.matrix_y, 3);
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_box_blur_kernel_all_values_are_one() {
        let k = create_box_blur_kernel(3);
        assert!(k.matrix.iter().all(|&v| v == 1.0));
    }

    #[test]
    fn create_box_blur_kernel_divisor_equals_element_count() {
        let k = create_box_blur_kernel(3);
        assert_eq!(k.divisor, Some(9.0));
    }

    #[test]
    fn create_box_blur_kernel_forces_odd_size() {
        let k = create_box_blur_kernel(4);
        assert_eq!(k.matrix_x % 2, 1);
    }

    #[test]
    fn create_edge_detect_kernel_returns_a_3x3_kernel() {
        let k = create_edge_detect_kernel();
        assert_eq!(k.matrix_x, 3);
        assert_eq!(k.matrix_y, 3);
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_edge_detect_kernel_centre_value_is_eight() {
        assert_eq!(create_edge_detect_kernel().matrix[4], 8.0);
    }

    #[test]
    fn create_edge_detect_kernel_sum_is_zero() {
        let k = create_edge_detect_kernel();
        let sum: f32 = k.matrix.iter().sum();
        assert_eq!(sum, 0.0);
    }

    #[test]
    fn create_emboss_kernel_returns_a_3x3_kernel() {
        let k = create_emboss_kernel(135.0);
        assert_eq!(k.matrix_x, 3);
        assert_eq!(k.matrix_y, 3);
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_emboss_kernel_centre_value_is_one() {
        assert_eq!(create_emboss_kernel(135.0).matrix[4], 1.0);
    }

    #[test]
    fn create_emboss_kernel_angle_zero_east_positive_west_negative() {
        // angle=0: dx=1, dy=0 → dir=(row=1,col=2), opp=(row=1,col=0)
        let k = create_emboss_kernel(0.0);
        assert_eq!(k.matrix[5], 2.0); // east = positive (row 1, col 2)
        assert_eq!(k.matrix[3], -2.0); // west = negative (row 1, col 0)
    }

    #[test]
    fn create_emboss_kernel_angle_ninety_south_positive_north_negative() {
        // angle=90: dx=0, dy=1 → dir=(row=2,col=1), opp=(row=0,col=1)
        let k = create_emboss_kernel(90.0);
        assert_eq!(k.matrix[2 * 3 + 1], 2.0); // south = positive
        assert_eq!(k.matrix[1], -2.0); // north = negative
    }

    #[test]
    fn create_emboss_kernel_angle_135_default_southwest_positive_northeast_negative() {
        let k = create_emboss_kernel(135.0);
        assert_eq!(k.matrix[2 * 3], 2.0); // south-west = positive
        assert_eq!(k.matrix[2], -2.0); // north-east = negative
    }

    #[test]
    fn create_gaussian_kernel_returns_a_1d_kernel_of_correct_length() {
        let k = create_gaussian_kernel(5, None);
        assert_eq!(k.matrix.len(), 5);
        assert_eq!(k.matrix_x, 5);
        assert_eq!(k.matrix_y, 1);
    }

    #[test]
    fn create_gaussian_kernel_is_symmetric() {
        let k = create_gaussian_kernel(5, None);
        let m = &k.matrix;
        assert!((m[0] - m[4]).abs() < 1e-5);
        assert!((m[1] - m[3]).abs() < 1e-5);
    }

    #[test]
    fn create_gaussian_kernel_centre_value_is_the_largest() {
        let k = create_gaussian_kernel(5, None);
        let centre = k.matrix[2];
        for &v in &k.matrix {
            assert!(centre >= v);
        }
    }

    #[test]
    fn create_laplacian_kernel_returns_a_3x3_kernel() {
        let k = create_laplacian_kernel();
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_laplacian_kernel_centre_value_is_four() {
        assert_eq!(create_laplacian_kernel().matrix[4], 4.0);
    }

    #[test]
    fn create_outline_kernel_returns_a_3x3_kernel() {
        let k = create_outline_kernel();
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_sharpen_kernel_returns_a_3x3_kernel() {
        let k = create_sharpen_kernel(1.0);
        assert_eq!(k.matrix_x, 3);
        assert_eq!(k.matrix_y, 3);
        assert_eq!(k.matrix.len(), 9);
    }

    #[test]
    fn create_sharpen_kernel_default_divisor_is_one() {
        assert_eq!(create_sharpen_kernel(1.0).divisor, Some(1.0));
    }

    #[test]
    fn create_sharpen_kernel_larger_amount_increases_centre_weight() {
        let k1 = create_sharpen_kernel(1.0);
        let k2 = create_sharpen_kernel(2.0);
        assert!(k2.matrix[4] > k1.matrix[4]);
    }

    #[test]
    fn get_convolution_divisor_returns_sum_of_kernel_values() {
        assert_eq!(get_convolution_divisor(&[1.0; 9]), 9.0);
    }

    #[test]
    fn get_convolution_divisor_returns_one_when_sum_is_zero() {
        assert_eq!(get_convolution_divisor(&[-1.0, 0.0, 1.0]), 1.0);
    }

    #[test]
    fn get_separable_kernel_factors_returns_factors_for_box_blur() {
        let k = create_box_blur_kernel(3);
        let factors = get_separable_kernel_factors(&k);
        assert!(factors.is_some());
        let (row, col) = factors.unwrap();
        assert_eq!(row.len(), 3);
        assert_eq!(col.len(), 3);
    }

    #[test]
    fn get_separable_kernel_factors_returns_factors_for_1d_gaussian() {
        let k = create_gaussian_kernel(5, None);
        let factors = get_separable_kernel_factors(&k);
        assert!(factors.is_some());
        let (row, col) = factors.unwrap();
        assert_eq!(row.len(), 5);
        assert_eq!(col.len(), 1);
    }

    #[test]
    fn get_separable_kernel_factors_returns_none_for_laplacian() {
        let k = create_laplacian_kernel();
        assert!(get_separable_kernel_factors(&k).is_none());
    }

    #[test]
    fn get_separable_kernel_factors_returns_none_for_edge_detect() {
        let k = create_edge_detect_kernel();
        assert!(get_separable_kernel_factors(&k).is_none());
    }

    #[test]
    fn get_separable_kernel_factors_reconstructed_outer_product_matches_original() {
        let k = create_box_blur_kernel(3);
        let (row, col) = get_separable_kernel_factors(&k).unwrap();
        for (r, &row_value) in row.iter().enumerate() {
            for (c, &col_value) in col.iter().enumerate() {
                assert!((row_value * col_value - k.matrix[r * 3 + c]).abs() < 1e-5);
            }
        }
    }

    #[test]
    fn is_separable_kernel_true_for_box_blur() {
        assert!(is_separable_kernel(&create_box_blur_kernel(3)));
    }

    #[test]
    fn is_separable_kernel_true_for_1d_gaussian() {
        assert!(is_separable_kernel(&create_gaussian_kernel(7, None)));
    }

    #[test]
    fn is_separable_kernel_false_for_laplacian() {
        assert!(!is_separable_kernel(&create_laplacian_kernel()));
    }

    #[test]
    fn is_separable_kernel_false_for_edge_detect() {
        assert!(!is_separable_kernel(&create_edge_detect_kernel()));
    }

    #[test]
    fn normalize_convolution_kernel_normalises_to_unit_sum() {
        let m = [1.0, 2.0, 3.0];
        let mut out = [0.0; 3];
        normalize_convolution_kernel(&mut out, &m);
        let sum: f32 = out.iter().sum();
        assert!((sum - 1.0).abs() < 1e-5);
    }

    #[test]
    fn normalize_convolution_kernel_is_alias_safe_when_out_is_matrix() {
        let mut m = [2.0, 2.0, 2.0];
        let source = m;
        normalize_convolution_kernel(&mut m, &source);
        let sum: f32 = m.iter().sum();
        assert!((sum - 1.0).abs() < 1e-5);
    }
}

//! Color-matrix shared constants.

/// Number of elements in a Flash/OpenFL color matrix (4 rows × 5 columns).
pub const COLOR_MATRIX_LENGTH: usize = 20;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn color_matrix_length_is_twenty() {
        assert_eq!(COLOR_MATRIX_LENGTH, 20);
    }
}

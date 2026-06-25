//! Free functions for [`ColorTransform`] and [`ColorTransformLike`].

use flighthq_types::{ColorTransform, ColorTransformLike};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`ColorTransform`] that is a copy of `source`.
pub fn clone_color_transform(source: &ColorTransformLike) -> ColorTransform {
    create_color_transform_from(
        source.red_multiplier,
        source.green_multiplier,
        source.blue_multiplier,
        source.alpha_multiplier,
        source.red_offset,
        source.green_offset,
        source.blue_offset,
        source.alpha_offset,
    )
}

/// Composes `source` followed by `other` and writes the result into `out`.
///
/// The combined effect applies `source` first and then `other`:
/// - `out.multiplier = source.multiplier * other.multiplier`
/// - `out.offset = source.multiplier * other.offset + source.offset`
///
/// Safe when `out` aliases `source` or `other` — inputs are read before
/// any output field is written.
pub fn concat_color_transform(
    out: &mut ColorTransformLike,
    source: &ColorTransformLike,
    other: &ColorTransformLike,
) {
    let sr = source.red_multiplier;
    let sg = source.green_multiplier;
    let sb = source.blue_multiplier;
    let sa = source.alpha_multiplier;
    let s_ro = source.red_offset;
    let s_go = source.green_offset;
    let s_bo = source.blue_offset;
    let s_ao = source.alpha_offset;
    let o_ro = other.red_offset;
    let o_go = other.green_offset;
    let o_bo = other.blue_offset;
    let o_ao = other.alpha_offset;
    let o_rm = other.red_multiplier;
    let o_gm = other.green_multiplier;
    let o_bm = other.blue_multiplier;
    let o_am = other.alpha_multiplier;

    out.red_multiplier = sr * o_rm;
    out.green_multiplier = sg * o_gm;
    out.blue_multiplier = sb * o_bm;
    out.alpha_multiplier = sa * o_am;
    out.red_offset = sr * o_ro + s_ro;
    out.green_offset = sg * o_go + s_go;
    out.blue_offset = sb * o_bo + s_bo;
    out.alpha_offset = sa * o_ao + s_ao;
}

/// Copies all fields from `source` into `out`.
pub fn copy_color_transform(out: &mut ColorTransformLike, source: &ColorTransformLike) {
    out.red_multiplier = source.red_multiplier;
    out.green_multiplier = source.green_multiplier;
    out.blue_multiplier = source.blue_multiplier;
    out.alpha_multiplier = source.alpha_multiplier;
    out.red_offset = source.red_offset;
    out.green_offset = source.green_offset;
    out.blue_offset = source.blue_offset;
    out.alpha_offset = source.alpha_offset;
}

/// Writes the multipliers and offsets of `source` into the parallel slices
/// `out_multipliers` and `out_offsets`. Both slices must be at least length 4.
///
/// Layout: `[red, green, blue, alpha]` for each slice.
pub fn copy_color_transform_to_arrays(
    out_multipliers: &mut [f32],
    out_offsets: &mut [f32],
    source: &ColorTransformLike,
) {
    out_multipliers[0] = source.red_multiplier;
    out_multipliers[1] = source.green_multiplier;
    out_multipliers[2] = source.blue_multiplier;
    out_multipliers[3] = source.alpha_multiplier;
    out_offsets[0] = source.red_offset;
    out_offsets[1] = source.green_offset;
    out_offsets[2] = source.blue_offset;
    out_offsets[3] = source.alpha_offset;
}

/// Returns a new [`ColorTransform`] with identity values (all multipliers `1.0`,
/// all offsets `0.0`).
pub fn create_color_transform() -> ColorTransform {
    ColorTransform::default()
}

/// Returns a new [`ColorTransform`] initialised with the given component values.
pub fn create_color_transform_from(
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    alpha_multiplier: f32,
    red_offset: f32,
    green_offset: f32,
    blue_offset: f32,
    alpha_offset: f32,
) -> ColorTransform {
    ColorTransform {
        red_multiplier,
        green_multiplier,
        blue_multiplier,
        alpha_multiplier,
        red_offset,
        green_offset,
        blue_offset,
        alpha_offset,
    }
}

/// Returns `true` if all eight fields of `a` and `b` are equal.
pub fn equals_color_transform(a: &ColorTransformLike, b: &ColorTransformLike) -> bool {
    equals_color_transform_offsets(a, b, true) && equals_color_transform_multipliers(a, b, true)
}

/// Returns `true` if the multiplier channels of `a` and `b` are equal.
///
/// When `compare_alpha` is `false` the alpha multiplier is excluded from the
/// comparison.
pub fn equals_color_transform_multipliers(
    a: &ColorTransformLike,
    b: &ColorTransformLike,
    compare_alpha: bool,
) -> bool {
    a.red_multiplier == b.red_multiplier
        && a.green_multiplier == b.green_multiplier
        && a.blue_multiplier == b.blue_multiplier
        && (!compare_alpha || a.alpha_multiplier == b.alpha_multiplier)
}

/// Returns `true` if the offset channels of `a` and `b` are equal.
///
/// When `compare_alpha` is `false` the alpha offset is excluded from the
/// comparison.
pub fn equals_color_transform_offsets(
    a: &ColorTransformLike,
    b: &ColorTransformLike,
    compare_alpha: bool,
) -> bool {
    a.red_offset == b.red_offset
        && a.green_offset == b.green_offset
        && a.blue_offset == b.blue_offset
        && (!compare_alpha || a.alpha_offset == b.alpha_offset)
}

/// Packs the red, green, and blue offset channels of `source` into the lower 24
/// bits of a `u32` as `0x00RRGGBB`. Each channel is truncated to `u8`.
pub fn get_color_transform_offset_rgb(source: &ColorTransformLike) -> u32 {
    let r = source.red_offset as u32 & 0xff;
    let g = source.green_offset as u32 & 0xff;
    let b = source.blue_offset as u32 & 0xff;
    (r << 16) | (g << 8) | b
}

/// Packs all four offset channels of `source` into a `u32` as `0xRRGGBBAA`.
/// Each channel is truncated to `u8`.
pub fn get_color_transform_offset_rgba(source: &ColorTransformLike) -> u32 {
    let r = source.red_offset as u32 & 0xff;
    let g = source.green_offset as u32 & 0xff;
    let b = source.blue_offset as u32 & 0xff;
    let a = source.alpha_offset as u32 & 0xff;
    (r << 24) | (g << 16) | (b << 8) | a
}

/// Writes the inverse of `source` into `out`.
///
/// Each multiplier becomes its reciprocal (or `1.0` when the source value is
/// `0.0` to avoid division by zero). Each offset is negated.
///
/// Safe when `out` aliases `source`.
pub fn invert_color_transform(out: &mut ColorTransformLike, source: &ColorTransformLike) {
    let rm = if source.red_multiplier != 0.0 {
        1.0 / source.red_multiplier
    } else {
        1.0
    };
    let gm = if source.green_multiplier != 0.0 {
        1.0 / source.green_multiplier
    } else {
        1.0
    };
    let bm = if source.blue_multiplier != 0.0 {
        1.0 / source.blue_multiplier
    } else {
        1.0
    };
    let am = if source.alpha_multiplier != 0.0 {
        1.0 / source.alpha_multiplier
    } else {
        1.0
    };
    let ro = -source.red_offset;
    let go = -source.green_offset;
    let bo = -source.blue_offset;
    let ao = -source.alpha_offset;
    out.red_multiplier = rm;
    out.green_multiplier = gm;
    out.blue_multiplier = bm;
    out.alpha_multiplier = am;
    out.red_offset = ro;
    out.green_offset = go;
    out.blue_offset = bo;
    out.alpha_offset = ao;
}

/// Returns `true` if `source` is an identity transform (all multipliers `1.0`,
/// all offsets `0.0`).
///
/// When `compare_alpha_multiplier` is `false` the alpha multiplier is excluded
/// from the check, allowing a non-unit alpha multiplier to still be considered
/// identity for RGB purposes.
pub fn is_identity_color_transform(
    source: &ColorTransformLike,
    compare_alpha_multiplier: bool,
) -> bool {
    let identity = ColorTransformLike::default();
    equals_color_transform_offsets(source, &identity, true)
        && equals_color_transform_multipliers(source, &identity, compare_alpha_multiplier)
}

/// Sets all eight fields of `out`.
pub fn set_color_transform(
    out: &mut ColorTransformLike,
    red_multiplier: f32,
    green_multiplier: f32,
    blue_multiplier: f32,
    alpha_multiplier: f32,
    red_offset: f32,
    green_offset: f32,
    blue_offset: f32,
    alpha_offset: f32,
) {
    out.red_multiplier = red_multiplier;
    out.green_multiplier = green_multiplier;
    out.blue_multiplier = blue_multiplier;
    out.alpha_multiplier = alpha_multiplier;
    out.red_offset = red_offset;
    out.green_offset = green_offset;
    out.blue_offset = blue_offset;
    out.alpha_offset = alpha_offset;
}

/// Resets `out` to the identity transform (all multipliers `1.0`, all offsets `0.0`).
pub fn set_color_transform_identity(out: &mut ColorTransformLike) {
    set_color_transform(out, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
}

/// Unpacks the red, green, and blue channels from the lower 24 bits of `value`
/// (`0x00RRGGBB`) and writes them as offsets into `out`. RGB multipliers are set
/// to `0.0`; alpha multiplier is kept at `1.0`; alpha offset is set to `0.0`.
pub fn set_color_transform_offset_rgb(out: &mut ColorTransformLike, value: u32) {
    out.red_offset = ((value >> 16) & 0xff) as f32;
    out.green_offset = ((value >> 8) & 0xff) as f32;
    out.blue_offset = (value & 0xff) as f32;
    out.alpha_offset = 0.0;
    out.red_multiplier = 0.0;
    out.green_multiplier = 0.0;
    out.blue_multiplier = 0.0;
    out.alpha_multiplier = 1.0;
}

/// Unpacks all four channels from `value` (`0xRRGGBBAA`) and writes them as
/// offsets into `out`. All four multipliers are set to `0.0`.
pub fn set_color_transform_offset_rgba(out: &mut ColorTransformLike, value: u32) {
    out.red_offset = ((value >> 24) & 0xff) as f32;
    out.green_offset = ((value >> 16) & 0xff) as f32;
    out.blue_offset = ((value >> 8) & 0xff) as f32;
    out.alpha_offset = (value & 0xff) as f32;
    out.red_multiplier = 0.0;
    out.green_multiplier = 0.0;
    out.blue_multiplier = 0.0;
    out.alpha_multiplier = 0.0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> ColorTransformLike {
        ColorTransformLike::default()
    }

    fn ct(
        rm: f32,
        gm: f32,
        bm: f32,
        am: f32,
        ro: f32,
        go: f32,
        bo: f32,
        ao: f32,
    ) -> ColorTransformLike {
        ColorTransformLike {
            red_multiplier: rm,
            green_multiplier: gm,
            blue_multiplier: bm,
            alpha_multiplier: am,
            red_offset: ro,
            green_offset: go,
            blue_offset: bo,
            alpha_offset: ao,
        }
    }

    // clone_color_transform
    #[test]
    fn clone_color_transform_returns_equal_values() {
        let src = ct(0.5, 1.0, 1.0, 1.0, 64.0, 0.0, 0.0, 0.0);
        let c = clone_color_transform(&src);
        assert_eq!(c.red_multiplier, 0.5);
        assert_eq!(c.red_offset, 64.0);
    }

    #[test]
    fn clone_color_transform_is_independent() {
        let src = ct(1.0, 1.0, 1.0, 1.0, 10.0, 0.0, 0.0, 0.0);
        let mut c = clone_color_transform(&src);
        c.red_offset = 99.0;
        // Mutating the clone must not touch the source.
        assert_eq!(c.red_offset, 99.0);
        assert_eq!(src.red_offset, 10.0);
    }

    // concat_color_transform
    #[test]
    fn concat_color_transform_identity_identity() {
        let a = identity();
        let b = identity();
        let mut out = ct(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        concat_color_transform(&mut out, &a, &b);
        assert_eq!(out.red_multiplier, 1.0);
        assert_eq!(out.green_multiplier, 1.0);
        assert_eq!(out.blue_multiplier, 1.0);
        assert_eq!(out.alpha_multiplier, 1.0);
        assert_eq!(out.red_offset, 0.0);
        assert_eq!(out.green_offset, 0.0);
        assert_eq!(out.blue_offset, 0.0);
        assert_eq!(out.alpha_offset, 0.0);
    }

    #[test]
    fn concat_color_transform_multiplies_multipliers() {
        let a = ct(2.0, 0.5, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        let b = ct(3.0, 4.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        let mut out = identity();
        concat_color_transform(&mut out, &a, &b);
        assert_eq!(out.red_multiplier, 6.0);
        assert_eq!(out.green_multiplier, 2.0);
    }

    #[test]
    fn concat_color_transform_combines_offsets() {
        // out.offset = source.multiplier * other.offset + source.offset
        let source = ct(2.0, 1.0, 1.0, 1.0, 10.0, 0.0, 0.0, 0.0);
        let other = ct(1.0, 1.0, 1.0, 1.0, 5.0, 0.0, 0.0, 0.0);
        let mut out = identity();
        concat_color_transform(&mut out, &source, &other);
        assert_eq!(out.red_offset, 2.0 * 5.0 + 10.0);
    }

    #[test]
    fn concat_color_transform_safe_when_out_aliases_source() {
        let mut a = ct(2.0, 1.0, 1.0, 1.0, 10.0, 0.0, 0.0, 0.0);
        let b = ct(3.0, 1.0, 1.0, 1.0, 5.0, 0.0, 0.0, 0.0);
        // Copy a for later comparison
        let a_copy = a.clone();
        concat_color_transform(&mut a, &a_copy, &b);
        assert_eq!(a.red_multiplier, 6.0);
        assert_eq!(a.red_offset, 2.0 * 5.0 + 10.0);
    }

    // copy_color_transform
    #[test]
    fn copy_color_transform_copies_all_fields() {
        let source = ct(0.5, 1.0, 1.0, 0.8, 0.0, 128.0, 64.0, 0.0);
        let mut out = identity();
        copy_color_transform(&mut out, &source);
        assert_eq!(out.red_multiplier, 0.5);
        assert_eq!(out.green_multiplier, 1.0);
        assert_eq!(out.alpha_multiplier, 0.8);
        assert_eq!(out.green_offset, 128.0);
        assert_eq!(out.blue_offset, 64.0);
    }

    // copy_color_transform_to_arrays
    #[test]
    fn copy_color_transform_to_arrays_writes_all() {
        let source = ct(0.5, 0.25, 2.0, 0.8, 10.0, 20.0, 30.0, 40.0);
        let mut multipliers = [0.0f32; 4];
        let mut offsets = [0.0f32; 4];
        copy_color_transform_to_arrays(&mut multipliers, &mut offsets, &source);
        assert_eq!(multipliers, [0.5, 0.25, 2.0, 0.8]);
        assert_eq!(offsets, [10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn copy_color_transform_to_arrays_overwrites_existing() {
        let source = identity();
        let mut multipliers = [9.0f32; 4];
        let mut offsets = [9.0f32; 4];
        copy_color_transform_to_arrays(&mut multipliers, &mut offsets, &source);
        assert_eq!(multipliers, [1.0, 1.0, 1.0, 1.0]);
        assert_eq!(offsets, [0.0, 0.0, 0.0, 0.0]);
    }

    // create_color_transform
    #[test]
    fn create_color_transform_is_identity() {
        let c = create_color_transform();
        assert_eq!(c.red_multiplier, 1.0);
        assert_eq!(c.green_multiplier, 1.0);
        assert_eq!(c.blue_multiplier, 1.0);
        assert_eq!(c.alpha_multiplier, 1.0);
        assert_eq!(c.red_offset, 0.0);
        assert_eq!(c.green_offset, 0.0);
        assert_eq!(c.blue_offset, 0.0);
        assert_eq!(c.alpha_offset, 0.0);
    }

    // create_color_transform_from
    #[test]
    fn create_color_transform_from_stores_values() {
        let c = create_color_transform_from(0.1, 0.2, 0.3, 0.4, 10.0, 20.0, 30.0, 40.0);
        assert_eq!(c.red_multiplier, 0.1);
        assert_eq!(c.green_multiplier, 0.2);
        assert_eq!(c.blue_multiplier, 0.3);
        assert_eq!(c.alpha_multiplier, 0.4);
        assert_eq!(c.red_offset, 10.0);
        assert_eq!(c.green_offset, 20.0);
        assert_eq!(c.blue_offset, 30.0);
        assert_eq!(c.alpha_offset, 40.0);
    }

    // equals_color_transform
    #[test]
    fn equals_color_transform_two_identities() {
        assert!(equals_color_transform(&identity(), &identity()));
    }

    #[test]
    fn equals_color_transform_different_multiplier() {
        assert!(!equals_color_transform(
            &ct(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0),
            &identity()
        ));
    }

    #[test]
    fn equals_color_transform_different_offset() {
        assert!(!equals_color_transform(
            &ct(1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0),
            &identity()
        ));
    }

    #[test]
    fn equals_color_transform_same_non_identity() {
        let a = ct(0.5, 1.0, 1.0, 1.0, 0.0, 128.0, 0.0, 0.0);
        let b = ct(0.5, 1.0, 1.0, 1.0, 0.0, 128.0, 0.0, 0.0);
        assert!(equals_color_transform(&a, &b));
    }

    // equals_color_transform_multipliers
    #[test]
    fn equals_color_transform_multipliers_matching() {
        let a = ct(0.5, 0.25, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        let b = ct(0.5, 0.25, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(equals_color_transform_multipliers(&a, &b, true));
    }

    #[test]
    fn equals_color_transform_multipliers_different() {
        assert!(!equals_color_transform_multipliers(
            &ct(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0),
            &identity(),
            true
        ));
    }

    #[test]
    fn equals_color_transform_multipliers_ignores_alpha_when_false() {
        let a = ct(1.0, 1.0, 1.0, 0.5, 0.0, 0.0, 0.0, 0.0);
        let b = ct(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(equals_color_transform_multipliers(&a, &b, false));
    }

    #[test]
    fn equals_color_transform_multipliers_still_checks_rgb_when_alpha_skipped() {
        let a = ct(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        let b = ct(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(!equals_color_transform_multipliers(&a, &b, false));
    }

    // equals_color_transform_offsets
    #[test]
    fn equals_color_transform_offsets_matching() {
        let a = ct(1.0, 1.0, 1.0, 1.0, 64.0, 128.0, 0.0, 0.0);
        let b = ct(1.0, 1.0, 1.0, 1.0, 64.0, 128.0, 0.0, 0.0);
        assert!(equals_color_transform_offsets(&a, &b, true));
    }

    #[test]
    fn equals_color_transform_offsets_different() {
        assert!(!equals_color_transform_offsets(
            &ct(1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0),
            &identity(),
            true
        ));
    }

    #[test]
    fn equals_color_transform_offsets_ignores_alpha_when_false() {
        let a = ct(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 50.0);
        let b = ct(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(equals_color_transform_offsets(&a, &b, false));
    }

    #[test]
    fn equals_color_transform_offsets_still_checks_rgb_when_alpha_skipped() {
        let a = ct(1.0, 1.0, 1.0, 1.0, 50.0, 0.0, 0.0, 0.0);
        let b = ct(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(!equals_color_transform_offsets(&a, &b, false));
    }

    // get_color_transform_offset_rgb
    #[test]
    fn get_color_transform_offset_rgb_packs_channels() {
        let c = ct(
            1.0,
            1.0,
            1.0,
            1.0,
            0xff as f32,
            0x80 as f32,
            0x10 as f32,
            0.0,
        );
        let packed = get_color_transform_offset_rgb(&c);
        assert_eq!((packed >> 16) & 0xff, 0xff);
        assert_eq!((packed >> 8) & 0xff, 0x80);
        assert_eq!(packed & 0xff, 0x10);
    }

    #[test]
    fn get_color_transform_offset_rgb_zero_returns_zero() {
        assert_eq!(get_color_transform_offset_rgb(&identity()), 0);
    }

    // get_color_transform_offset_rgba
    #[test]
    fn get_color_transform_offset_rgba_packs_all_channels() {
        let c = ct(
            1.0,
            1.0,
            1.0,
            1.0,
            0x10 as f32,
            0x20 as f32,
            0x30 as f32,
            0x40 as f32,
        );
        let packed = get_color_transform_offset_rgba(&c);
        assert_eq!((packed >> 24) & 0xff, 0x10);
        assert_eq!((packed >> 16) & 0xff, 0x20);
        assert_eq!((packed >> 8) & 0xff, 0x30);
        assert_eq!(packed & 0xff, 0x40);
    }

    #[test]
    fn get_color_transform_offset_rgba_zero_returns_zero() {
        assert_eq!(get_color_transform_offset_rgba(&identity()), 0);
    }

    // invert_color_transform
    #[test]
    fn invert_color_transform_reciprocates_multipliers() {
        let source = ct(2.0, 4.0, 0.5, 0.25, 0.0, 0.0, 0.0, 0.0);
        let mut out = identity();
        invert_color_transform(&mut out, &source);
        assert_eq!(out.red_multiplier, 0.5);
        assert_eq!(out.green_multiplier, 0.25);
        assert_eq!(out.blue_multiplier, 2.0);
        assert_eq!(out.alpha_multiplier, 4.0);
    }

    #[test]
    fn invert_color_transform_negates_offsets() {
        let source = ct(1.0, 1.0, 1.0, 1.0, 64.0, -32.0, 128.0, -10.0);
        let mut out = identity();
        invert_color_transform(&mut out, &source);
        assert_eq!(out.red_offset, -64.0);
        assert_eq!(out.green_offset, 32.0);
        assert_eq!(out.blue_offset, -128.0);
        assert_eq!(out.alpha_offset, 10.0);
    }

    #[test]
    fn invert_color_transform_zero_multiplier_becomes_one() {
        let source = ct(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut out = identity();
        invert_color_transform(&mut out, &source);
        assert_eq!(out.red_multiplier, 1.0);
        assert_eq!(out.green_multiplier, 1.0);
        assert_eq!(out.blue_multiplier, 1.0);
        assert_eq!(out.alpha_multiplier, 1.0);
    }

    #[test]
    fn invert_color_transform_safe_when_out_aliases_source() {
        let mut c = ct(2.0, 1.0, 1.0, 1.0, 5.0, 0.0, 0.0, 0.0);
        let copy = c.clone();
        invert_color_transform(&mut c, &copy);
        assert_eq!(c.red_multiplier, 0.5);
        assert_eq!(c.red_offset, -5.0);
    }

    // is_identity_color_transform
    #[test]
    fn is_identity_color_transform_default_is_identity() {
        assert!(is_identity_color_transform(&identity(), true));
    }

    #[test]
    fn is_identity_color_transform_false_when_multiplier_differs() {
        let c = ct(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0);
        assert!(!is_identity_color_transform(&c, true));
    }

    #[test]
    fn is_identity_color_transform_false_when_offset_nonzero() {
        let c = ct(1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0);
        assert!(!is_identity_color_transform(&c, true));
    }

    #[test]
    fn is_identity_color_transform_ignores_alpha_multiplier_when_false() {
        let c = ct(1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(is_identity_color_transform(&c, false));
    }

    // set_color_transform
    #[test]
    fn set_color_transform_sets_all_fields() {
        let mut out = identity();
        set_color_transform(&mut out, 0.1, 0.2, 0.3, 0.4, 10.0, 20.0, 30.0, 40.0);
        assert_eq!(out.red_multiplier, 0.1);
        assert_eq!(out.green_multiplier, 0.2);
        assert_eq!(out.blue_multiplier, 0.3);
        assert_eq!(out.alpha_multiplier, 0.4);
        assert_eq!(out.red_offset, 10.0);
        assert_eq!(out.green_offset, 20.0);
        assert_eq!(out.blue_offset, 30.0);
        assert_eq!(out.alpha_offset, 40.0);
    }

    // set_color_transform_identity
    #[test]
    fn set_color_transform_identity_resets() {
        let mut out = ct(0.5, 0.0, 0.0, 0.0, 128.0, 64.0, 0.0, 0.0);
        set_color_transform_identity(&mut out);
        assert_eq!(out.red_multiplier, 1.0);
        assert_eq!(out.green_multiplier, 1.0);
        assert_eq!(out.blue_multiplier, 1.0);
        assert_eq!(out.alpha_multiplier, 1.0);
        assert_eq!(out.red_offset, 0.0);
        assert_eq!(out.green_offset, 0.0);
        assert_eq!(out.blue_offset, 0.0);
        assert_eq!(out.alpha_offset, 0.0);
    }

    // set_color_transform_offset_rgb
    #[test]
    fn set_color_transform_offset_rgb_unpacks_channels() {
        let mut out = identity();
        set_color_transform_offset_rgb(&mut out, (0xab << 16) | (0xcd << 8) | 0xef);
        assert_eq!(out.red_offset, 0xab as f32);
        assert_eq!(out.green_offset, 0xcd as f32);
        assert_eq!(out.blue_offset, 0xef as f32);
        assert_eq!(out.alpha_offset, 0.0);
    }

    #[test]
    fn set_color_transform_offset_rgb_zeroes_rgb_multipliers() {
        let mut out = identity();
        set_color_transform_offset_rgb(&mut out, 0x00ff_ffff);
        assert_eq!(out.red_multiplier, 0.0);
        assert_eq!(out.green_multiplier, 0.0);
        assert_eq!(out.blue_multiplier, 0.0);
        assert_eq!(out.alpha_multiplier, 1.0);
    }

    // set_color_transform_offset_rgba
    #[test]
    fn set_color_transform_offset_rgba_unpacks_all_channels() {
        let mut out = identity();
        set_color_transform_offset_rgba(&mut out, (0x10 << 24) | (0x20 << 16) | (0x30 << 8) | 0x40);
        assert_eq!(out.red_offset, 0x10 as f32);
        assert_eq!(out.green_offset, 0x20 as f32);
        assert_eq!(out.blue_offset, 0x30 as f32);
        assert_eq!(out.alpha_offset, 0x40 as f32);
    }

    #[test]
    fn set_color_transform_offset_rgba_zeroes_all_multipliers() {
        let mut out = identity();
        set_color_transform_offset_rgba(&mut out, 0xffff_ffff);
        assert_eq!(out.red_multiplier, 0.0);
        assert_eq!(out.green_multiplier, 0.0);
        assert_eq!(out.blue_multiplier, 0.0);
        assert_eq!(out.alpha_multiplier, 0.0);
    }
}

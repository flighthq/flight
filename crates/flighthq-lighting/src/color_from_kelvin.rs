//! Kelvin color-temperature to packed RGBA conversion.

/// Creates a packed sRGB-albedo RGBA color (`0xrrggbbaa`) from a color
/// temperature in Kelvin. Uses the Tanner Helland piecewise approximation
/// (accurate to within ~1% for 1000 K -- 40000 K), the same algorithm used in
/// Blender, three.js, and Filament's color-temperature helper.
///
/// Clamps to the 1000 -- 40000 K range. Common temperatures: 1800 K =
/// candlelight, 3000 K = warm bulb, 5500 K = noon sunlight, 6500 K = D65
/// white, 10000 K = overcast sky.
pub fn create_color_from_kelvin(kelvin: f32) -> u32 {
    let temp = kelvin.clamp(1000.0, 40000.0) / 100.0;

    // Red channel.
    let r = if temp <= 66.0 {
        255.0
    } else {
        329.698_727_446 * (temp - 60.0).powf(-0.133_204_759_2)
    };

    // Green channel.
    let g = if temp <= 66.0 {
        99.470_802_586_1 * temp.ln() - 161.119_568_166_1
    } else {
        288.122_169_528_3 * (temp - 60.0).powf(-0.075_514_849_2)
    };

    // Blue channel.
    let b = if temp >= 66.0 {
        255.0
    } else if temp <= 19.0 {
        0.0
    } else {
        138.517_731_223_1 * (temp - 10.0).ln() - 305.044_792_730_7
    };

    let ri = r.round().clamp(0.0, 255.0) as u32;
    let gi = g.round().clamp(0.0, 255.0) as u32;
    let bi = b.round().clamp(0.0, 255.0) as u32;

    // Pack as 0xrrggbbaa with fully opaque alpha.
    (ri << 24) | (gi << 16) | (bi << 8) | 0xff
}

#[cfg(test)]
mod tests {
    use super::*;

    mod create_color_from_kelvin {
        use super::*;

        #[test]
        fn returns_warm_orange_at_1800k_candlelight() {
            let color = create_color_from_kelvin(1800.0);
            let r = (color >> 24) & 0xff;
            let g = (color >> 16) & 0xff;
            let b = (color >> 8) & 0xff;
            let a = color & 0xff;
            assert_eq!(r, 255);
            assert!(g < 150, "green should be warm: {g}");
            assert!(b < 50, "blue should be very low: {b}");
            assert_eq!(a, 0xff);
        }

        #[test]
        fn returns_near_white_at_6500k_d65() {
            let color = create_color_from_kelvin(6500.0);
            let r = (color >> 24) & 0xff;
            let g = (color >> 16) & 0xff;
            let b = (color >> 8) & 0xff;
            assert_eq!(r, 255);
            assert!(g > 240, "green should be near white: {g}");
            assert!(b > 240, "blue should be near white: {b}");
        }

        #[test]
        fn returns_cool_blue_tint_at_10000k() {
            let color = create_color_from_kelvin(10000.0);
            let r = (color >> 24) & 0xff;
            let b = (color >> 8) & 0xff;
            assert!(r < 210, "red should drop at high temps: {r}");
            assert_eq!(b, 255);
        }

        #[test]
        fn clamps_below_1000k_to_1000k() {
            assert_eq!(
                create_color_from_kelvin(500.0),
                create_color_from_kelvin(1000.0)
            );
        }

        #[test]
        fn clamps_above_40000k_to_40000k() {
            assert_eq!(
                create_color_from_kelvin(50000.0),
                create_color_from_kelvin(40000.0)
            );
        }

        #[test]
        fn alpha_is_always_opaque() {
            for k in [1000.0, 3000.0, 5500.0, 6500.0, 10000.0, 40000.0] {
                let color = create_color_from_kelvin(k);
                assert_eq!(color & 0xff, 0xff, "alpha must be 0xff at {k} K");
            }
        }
    }
}

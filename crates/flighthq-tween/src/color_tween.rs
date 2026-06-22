//! Color tween — interpolates a packed 0xRRGGBB property through component space.
//!
//! Components are interpolated as `f32` (channels 0–255); the caller
//! reconstructs the packed integer on each update by reading `r`, `g`, `b`
//! from the deltas returned by `update_tweens` and recombining them with
//! `pack_color`.

use flighthq_types::{TweenManager, TweenOptions};

use crate::tween::create_tween;

/// Creates a tween that animates a packed `0xRRGGBB` color from `from_color`
/// to `to_color` over `duration` seconds.
///
/// The tween is stored in the manager under the `color_ptr` key. Property keys
/// are `"r"`, `"g"`, `"b"` (each `0–255` as `f32`). The caller supplies the
/// `from_color` components as the start snapshot when `update_tweens` first
/// initializes the tween (via its `current_values_fn`); use
/// [`color_start_values`] to build that list. On each update the caller reads
/// the three component deltas and recombines them with [`pack_color`].
///
/// `color_ptr` should be a stable identifier for the "color slot" being
/// animated. Returns the index within `manager.tweens[color_ptr]` at which the
/// tween was placed.
pub fn create_color_tween(
    manager: &mut TweenManager,
    color_ptr: u64,
    from_color: u32,
    to_color: u32,
    duration: f32,
    options: Option<TweenOptions>,
) -> usize {
    let _ = from_color; // start components are supplied at init via current_values_fn
    let goals = vec![
        ("r".to_owned(), ((to_color >> 16) & 0xff) as f32),
        ("g".to_owned(), ((to_color >> 8) & 0xff) as f32),
        ("b".to_owned(), (to_color & 0xff) as f32),
    ];
    create_tween(manager, color_ptr, duration, goals, options)
}

/// Builds the `(key, value)` start snapshot for a color tween from a packed
/// `0xRRGGBB` value, for use as the result of `update_tweens`'s
/// `current_values_fn`.
pub fn color_start_values(from_color: u32) -> Vec<(String, f32)> {
    vec![
        ("r".to_owned(), ((from_color >> 16) & 0xff) as f32),
        ("g".to_owned(), ((from_color >> 8) & 0xff) as f32),
        ("b".to_owned(), (from_color & 0xff) as f32),
    ]
}

/// Recombines interpolated `r`, `g`, `b` component values (each rounded and
/// clamped to `0–255`) into a packed `0xRRGGBB` integer.
pub fn pack_color(r: f32, g: f32, b: f32) -> u32 {
    let clamp = |v: f32| (v.round() as i32).clamp(0, 0xff) as u32;
    (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tween_manager::create_tween_manager;
    use crate::update_tweens::update_tweens;
    use flighthq_types::TweenOptions;
    use std::sync::Arc;

    fn linear() -> TweenOptions {
        TweenOptions {
            ease: Some(Arc::new(|t| t)),
            ..Default::default()
        }
    }

    fn packed_after(m: &mut TweenManager, ptr: u64, from: u32, delta: f32) -> u32 {
        let mut first = true;
        let applied = update_tweens(m, delta, &mut |_, _| {
            if first {
                first = false;
                color_start_values(from)
            } else {
                vec![]
            }
        });
        let get = |k: &str| {
            applied
                .iter()
                .rev()
                .find(|(p, key, _)| *p == ptr && key == k)
                .map(|(_, _, v)| *v)
                .unwrap_or(0.0)
        };
        pack_color(get("r"), get("g"), get("b"))
    }

    #[test]
    fn create_color_tween_has_rgb_properties() {
        let mut m = create_tween_manager(None);
        let idx = create_color_tween(&mut m, 42, 0x000000, 0xffffff, 1.0, None);
        let keys: Vec<&str> = m.tweens[&42][idx]
            .properties
            .iter()
            .map(|p| p.key.as_str())
            .collect();
        assert!(keys.contains(&"r"));
        assert!(keys.contains(&"g"));
        assert!(keys.contains(&"b"));
    }

    #[test]
    fn create_color_tween_reaches_target_color() {
        let mut m = create_tween_manager(None);
        create_color_tween(&mut m, 1, 0xff0000, 0x0000ff, 1.0, Some(linear()));
        let color = packed_after(&mut m, 1, 0xff0000, 1.0);
        assert_eq!(color, 0x0000ff);
    }

    #[test]
    fn create_color_tween_starts_from_current_color() {
        let mut m = create_tween_manager(None);
        create_color_tween(&mut m, 1, 0x00ff00, 0xff0000, 1.0, Some(linear()));
        let color = packed_after(&mut m, 1, 0x00ff00, 1.0);
        assert_eq!(color, 0xff0000);
    }

    #[test]
    fn create_color_tween_interpolates_midpoint() {
        let mut m = create_tween_manager(None);
        create_color_tween(&mut m, 1, 0xff0000, 0x0000ff, 1.0, Some(linear()));
        let color = packed_after(&mut m, 1, 0xff0000, 0.5);
        let r = (color >> 16) & 0xff;
        let b = color & 0xff;
        assert!((r as i32 - 128).abs() <= 1);
        assert!((b as i32 - 128).abs() <= 1);
    }
}

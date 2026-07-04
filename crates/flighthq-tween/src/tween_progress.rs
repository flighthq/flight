//! Tween progress queries.

use flighthq_types::Tween;

/// Returns the normalized 0..1 progress of a tween.
///
/// Progress is computed as `((elapsed - delay) / duration).clamp(0.0, 1.0)`.
/// Returns `0.0` if the tween's duration is zero.
pub fn get_tween_progress(tween: &Tween) -> f32 {
    if tween.duration == 0.0 {
        return 0.0;
    }
    ((tween.elapsed - tween.delay) / tween.duration).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_tween_progress_returns_zero_for_zero_duration() {
        let tween = Tween {
            duration: 0.0,
            ..Tween::default()
        };
        assert_eq!(get_tween_progress(&tween), 0.0);
    }

    #[test]
    fn get_tween_progress_returns_zero_before_delay() {
        let tween = Tween {
            duration: 1.0,
            delay: 0.5,
            elapsed: 0.25,
            ..Tween::default()
        };
        assert_eq!(get_tween_progress(&tween), 0.0);
    }

    #[test]
    fn get_tween_progress_returns_half_at_midpoint() {
        let tween = Tween {
            duration: 1.0,
            elapsed: 0.5,
            ..Tween::default()
        };
        assert!((get_tween_progress(&tween) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn get_tween_progress_clamps_to_one() {
        let tween = Tween {
            duration: 1.0,
            elapsed: 2.0,
            ..Tween::default()
        };
        assert_eq!(get_tween_progress(&tween), 1.0);
    }

    #[test]
    fn get_tween_progress_accounts_for_delay() {
        let tween = Tween {
            duration: 1.0,
            delay: 0.5,
            elapsed: 1.0,
            ..Tween::default()
        };
        assert!((get_tween_progress(&tween) - 0.5).abs() < 1e-6);
    }
}

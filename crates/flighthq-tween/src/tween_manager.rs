//! `TweenManager` construction.

use flighthq_easing::ease_out_expo;
use flighthq_types::{TweenManager, TweenManagerOptions};

/// Creates a new `TweenManager`.
///
/// An optional `options` value is reserved for future configuration; the
/// manager defaults its easing function to `ease_out_expo`, matching the
/// TypeScript reference.
pub fn create_tween_manager(_options: Option<TweenManagerOptions>) -> TweenManager {
    TweenManager {
        default_ease: std::sync::Arc::new(ease_out_expo),
        tweens: std::collections::HashMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_tween_manager_returns_empty_manager() {
        let m = create_tween_manager(None);
        assert!(m.tweens.is_empty());
    }

    #[test]
    fn create_tween_manager_defaults_ease_to_ease_out_expo() {
        let m = create_tween_manager(None);
        assert_eq!((m.default_ease)(0.0), 0.0);
        assert!(((m.default_ease)(1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn create_tween_manager_each_call_is_distinct() {
        let a = create_tween_manager(None);
        let b = create_tween_manager(None);
        // Distinct maps; mutating one does not affect the other.
        assert!(a.tweens.is_empty());
        assert!(b.tweens.is_empty());
    }
}

use std::sync::Arc;

/// A scalar easing function over the normalized unit interval.
pub type EasingFunction = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

/// A scalar remapping function over an arbitrary input domain.
pub type ScalarRemap = Arc<dyn Fn(f32) -> f32 + Send + Sync>;

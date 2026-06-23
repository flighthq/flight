//! `flighthq-tween` — tween animation system.
//!
//! Provides `TweenManager`, `Tween`, timer utilities, and color tweening.
//! Easing functions are in the separate `flighthq-easing` crate.
//!
//! # Quick start
//!
//! ```rust,ignore
//! use flighthq_tween::{
//!     TweenManager, TweenOptions,
//!     create_tween_manager, create_tween, update_tweens,
//! };
//!
//! let mut manager = create_tween_manager(None);
//! // target_ptr is your object's address cast to u64
//! let target_ptr = 0x1000u64;
//! create_tween(&mut manager, target_ptr, 1.0, vec![("x".to_owned(), 100.0)], None);
//! // Each frame:
//! let deltas = update_tweens(&mut manager, 0.016, &mut |_, _| vec![("x".to_owned(), 0.0)]);
//! ```

pub mod color_tween;
pub mod internal;
pub mod timer;
pub mod tween;
pub mod tween_manager;
pub mod update_tweens;

// color_tween
pub use color_tween::{color_start_values, create_color_tween, pack_color};

// timer
pub use timer::create_tween_timer;

// tween
pub use tween::{
    apply_tween, create_tween, pause_all_tweens, pause_tween, pause_tweens, reset_all_tweens,
    resume_all_tweens, resume_tween, resume_tweens, stop_all_tweens, stop_tween, stop_tweens,
};

// tween_manager
pub use tween_manager::create_tween_manager;

// update_tweens
pub use update_tweens::{complete_tween, update_tweens};

// Re-export types used in the public API surface.
pub use flighthq_types::{
    EasingFunction, StopTweenOptions, Tween, TweenManager, TweenManagerOptions, TweenOptions,
    TweenPropertyDetail,
};

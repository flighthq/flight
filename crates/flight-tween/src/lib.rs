mod color_tween;
mod internal;
mod timer;
mod tween;
mod tween_manager;
mod tween_progress;
mod tween_stagger;
mod types;
mod update_tweens;

pub mod contract;
mod sugar;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types and their
// constructors that the public signatures require. Contract-only seams (initialize_*, internal
// helpers, D18 sugar backing functions) stay in `contract`.

// types
pub use contract::ColorComponents;
pub use contract::StaggerFrom;
pub use contract::StopTweenOptions;
pub use contract::TimerTarget;
pub use contract::Tween;
pub use contract::TweenContext;
pub use contract::TweenManager;
pub use contract::TweenManagerData;
pub use contract::TweenManagerOptions;
pub use contract::TweenOptions;
pub use contract::TweenProp;
pub use contract::TweenPropertyDetail;
pub use contract::TweenStaggerOptions;

// types — free functions
pub use contract::create_tween_context;
pub use contract::equals_tween;
pub use contract::tween_with;

// colorTween — export *
pub use contract::create_color_tween;

// timer — export *
pub use contract::create_tween_timer;

// tween — export *
pub use contract::apply_tween;
pub use contract::create_tween;
pub use contract::create_tween_default;
pub use contract::get_active_tween_count;
pub use contract::get_tween_delay;
pub use contract::get_tween_duration;
pub use contract::get_tween_elapsed;
pub use contract::get_tween_on_complete;
pub use contract::get_tween_on_repeat;
pub use contract::get_tween_on_update;
pub use contract::get_tween_on_yoyo;
pub use contract::get_tween_property_keys;
pub use contract::get_tween_repeat;
pub use contract::get_tweens_of;
pub use contract::has_tweens_of;
pub use contract::is_tween_complete;
pub use contract::is_tween_initialized;
pub use contract::is_tween_paused;
pub use contract::is_tween_reflect;
pub use contract::is_tween_reverse;
pub use contract::is_tween_smart_rotation;
pub use contract::is_tween_snapping;
pub use contract::kill_tweens_of_property;
pub use contract::pause_all_tweens;
pub use contract::pause_tween;
pub use contract::pause_tweens;
pub use contract::reset_all_tweens;
pub use contract::resume_all_tweens;
pub use contract::resume_tween;
pub use contract::resume_tweens;
pub use contract::stop_all_tweens;
pub use contract::stop_tween;
pub use contract::stop_tweens;

// tweenManager — selective (createTweenManager + D5 context)
pub use contract::create_tween_manager;
pub use contract::default_manager;

// tweenProgress — selective
pub use contract::get_tween_progress;
pub use contract::restart_tween;
pub use contract::seek_tween;
pub use contract::set_tween_progress;

// tweenStagger — export *
pub use contract::create_tween_stagger;

// updateTweens — export *
pub use contract::complete_tween;
pub use contract::update_tweens;

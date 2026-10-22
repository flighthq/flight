//! MovieClip display node: a Node2D whose frames are driven by a timeline, plus the spritesheet
//! timeline source that feeds it and the opt-in guards for authored spritesheet semantics the
//! timeline source cannot carry.

mod enable_movie_clip_guards;
mod movie_clip;
mod spritesheet_timeline_source;
mod sugar;
mod types;

pub mod contract;

pub use contract::add_movie_clip_frame_script;
pub use contract::are_movie_clip_guards_enabled;
pub use contract::create_movie_clip;
pub use contract::create_movie_clip_data;
pub use contract::create_movie_clip_runtime;
pub use contract::create_spritesheet_timeline_source;
pub use contract::disable_movie_clip_guards;
pub use contract::dispose_movie_clip_signals;
pub use contract::enable_movie_clip_guards;
pub use contract::enable_movie_clip_signals;
pub use contract::explain_spritesheet_timeline_source;
pub use contract::get_movie_clip_current_frame;
pub use contract::get_movie_clip_current_label;
pub use contract::get_movie_clip_frame_script;
pub use contract::get_movie_clip_runtime;
pub use contract::get_movie_clip_signals;
pub use contract::get_movie_clip_total_frames;
pub use contract::get_spritesheet_timeline_source_unsupported_field_string;
pub use contract::goto_and_play_movie_clip;
pub use contract::goto_and_stop_movie_clip;
pub use contract::initialize_movie_clip;
pub use contract::initialize_movie_clip_data;
pub use contract::initialize_spritesheet_timeline_source;
pub use contract::is_movie_clip_playing;
pub use contract::next_frame_movie_clip;
pub use contract::parse_spritesheet_timeline_source_unsupported_field;
pub use contract::play_movie_clip;
pub use contract::prev_frame_movie_clip;
pub use contract::remove_movie_clip_frame_script;
pub use contract::set_movie_clip_source;
pub use contract::set_spritesheet_timeline_source_guard;
pub use contract::stop_movie_clip;
pub use contract::update_movie_clip;

pub use contract::MOVIE_CLIP_KIND;
pub use contract::MovieClip;
pub use contract::MovieClipData;
pub use contract::MovieClipGuardClock;
pub use contract::MovieClipGuardState;
pub use contract::MovieClipMethods;
pub use contract::MovieClipRuntime;
pub use contract::MovieClipSignals;
pub use contract::SpritesheetTimelineSourceExplanation;
pub use contract::SpritesheetTimelineSourceGuard;
pub use contract::SpritesheetTimelineSourceUnsupportedField;

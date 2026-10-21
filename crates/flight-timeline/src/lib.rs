//! Timeline playback: a playhead over a shareable source, with labels, per-frame scripts and
//! lifecycle signals. The source is what a frame is; playback state is per timeline.

mod sugar;
mod timeline;
mod types;

pub mod contract;

pub use contract::add_timeline_frame_script;
pub use contract::clear_timeline_frame_scripts;
pub use contract::create_timeline;
pub use contract::create_timeline_source;
pub use contract::dispose_timeline_signals;
pub use contract::enable_timeline_signals;
pub use contract::find_timeline_label;
pub use contract::get_timeline_current_label;
pub use contract::get_timeline_frame_script;
pub use contract::get_timeline_frame_script_frames;
pub use contract::get_timeline_labels;
pub use contract::goto_and_play_timeline;
pub use contract::goto_and_stop_timeline;
pub use contract::next_frame_timeline;
pub use contract::play_timeline;
pub use contract::prev_frame_timeline;
pub use contract::remove_timeline_frame_script;
pub use contract::stop_timeline;
pub use contract::update_timeline;

pub use contract::FrameScript;
pub use contract::Timeline;
pub use contract::TimelineFrameArg;
pub use contract::TimelineFrameEntryCause;
pub use contract::TimelineFrameEvent;
pub use contract::TimelineLabel;
pub use contract::TimelineMethods;
pub use contract::TimelinePlayMode;
pub use contract::TimelineRef;
pub use contract::TimelineSignals;
pub use contract::TimelineSource;
pub use contract::TimelineSourceRef;

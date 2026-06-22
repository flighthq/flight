//! `flighthq-interaction` — hit testing and pointer dispatch.
//!
//! Provides hit-testing over scene graph nodes (point-in-node tests, object
//! overlap detection) and an [`InteractionManager`] that translates normalized
//! [`flighthq_input`] events into high-level interaction signals dispatched
//! through the scene graph hierarchy.
//!
//! # Design notes
//!
//! - All functions operate over a [`flighthq_displayobject::DisplayObjectArena`]
//!   addressed by [`flighthq_node::NodeId`]; there is no implicit global graph.
//! - Hit-test functions are registered per node kind via
//!   [`register_hit_test_point`]. Unregistered kinds are skipped for self-hit
//!   but children are still traversed.
//! - The [`InteractionManager`] owns per-pointer state (over/down targets,
//!   double-click tracking), pointer captures, and the per-node
//!   [`InteractionSignals`]. The TS port stored signals on each node's runtime;
//!   the Rust scene graph node has no cross-kind runtime slot, so the manager
//!   owns them and dispatch takes both the manager and the arena.
//! - Signal dispatch bubbles from the hit target to the graph root.

pub mod display_hit_tests;
pub mod hit_tests;
pub mod manager;
pub mod signals;
pub mod sprite_hit_tests;

// hit_tests
pub use hit_tests::{
    HitTestFn, find_graph_hit_target, hit_test_display_objects, hit_test_graph_local_bounds,
    hit_test_graph_point, register_hit_test_point,
};

// display_hit_tests
pub use display_hit_tests::{
    default_bitmap_hit_test_point, default_display_object_hit_test_point,
    default_html_view_hit_test_point, default_movie_clip_hit_test_point,
    default_render_view_hit_test_point, default_rich_text_hit_test_point,
    default_shape_hit_test_point, default_stage_hit_test_point, default_text_hit_test_point,
    default_text_input_hit_test_point, default_video_hit_test_point,
};

// sprite_hit_tests
pub use sprite_hit_tests::{
    default_quad_batch_hit_test_point, default_sprite_hit_test_point,
    default_tilemap_hit_test_point,
};

// signals
pub use signals::{InteractionSignals, create_interaction_signals};

// manager
pub use manager::{
    InteractionManager, InteractionPointerState, capture_interaction_pointer,
    connect_input_to_interaction, connect_interaction_keyboard_signal, connect_interaction_signal,
    connect_keyboard_input_to_interaction, create_interaction_manager,
    disconnect_interaction_signal, dispatch_interaction_context_menu,
    dispatch_interaction_key_down, dispatch_interaction_key_up,
    dispatch_interaction_pointer_cancel, dispatch_interaction_pointer_down,
    dispatch_interaction_pointer_move, dispatch_interaction_pointer_up, dispatch_interaction_wheel,
    enable_interaction_signals, get_interaction_signals, release_interaction_pointer,
};

// Shared option types live in the types crate. (Pointer state is owned here,
// keyed by NodeId rather than the types-crate placeholder's u64.)
pub use flighthq_types::interaction::{InteractionManagerOptions, InteractionPointerOptions};

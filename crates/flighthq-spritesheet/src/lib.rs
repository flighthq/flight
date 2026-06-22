//! Animation layer built on raw resources and the sprite graph.
//!
//! Provides [`Spritesheet`], [`SpritesheetAnimation`], [`SpritesheetFrame`],
//! and [`SpritesheetPlayer`] (re-exported from `flighthq_types`) along with
//! the free functions that create, query, and advance them.
//!
//! # Quick start
//!
//! ```rust,no_run
//! use flighthq_spritesheet::{
//!     create_spritesheet, create_spritesheet_animation, create_spritesheet_player,
//!     play_spritesheet_animation, update_spritesheet_player,
//! };
//!
//! let sheet = create_spritesheet(Default::default());
//! let anim  = create_spritesheet_animation(Default::default());
//! let mut player = create_spritesheet_player(Default::default());
//! play_spritesheet_animation(&mut player, Some(&anim), true);
//! update_spritesheet_player(&mut player, 16.0);
//! ```

pub mod spritesheet;
pub mod spritesheet_animation;
pub mod spritesheet_data;
pub mod spritesheet_frame;
pub mod spritesheet_from;
pub mod spritesheet_player;
pub mod spritesheet_timeline_source;

pub use flighthq_types::{Spritesheet, SpritesheetAnimation, SpritesheetFrame, SpritesheetPlayer};

pub use spritesheet::{create_spritesheet, get_spritesheet_animation};
pub use spritesheet_animation::create_spritesheet_animation;
pub use spritesheet_data::{
    SpritesheetAnimationData, SpritesheetAnimationDirection, SpritesheetData, SpritesheetFrameData,
    create_spritesheet_animation_data, create_spritesheet_data, create_spritesheet_frame_data,
};
pub use spritesheet_frame::create_spritesheet_frame;
pub use spritesheet_from::create_spritesheet_from_tileset;
pub use spritesheet_player::{
    create_spritesheet_player, get_spritesheet_player_frame, play_spritesheet_animation,
    queue_spritesheet_animation, update_spritesheet_player,
};
pub use spritesheet_timeline_source::{
    SpritesheetFramePlacement, create_spritesheet_timeline_source,
};

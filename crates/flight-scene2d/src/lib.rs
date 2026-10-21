//! Display object tree for composited 2D rendering (TS `@flighthq/scene2d`): the Node2D family
//! fields, runtime tier and trait, display objects, sprites, nine-slice sprites, html views and the
//! Scene2D presentation context.

mod display_object;
mod display_object_animation;
mod html_view;
mod scale9_sprite;
mod scene2d;
mod scene_kind_usage;
mod sprite;
mod sugar;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` names its own exports and then re-exports every module with
// `export *` (initializers included), so the root is the whole contract lane, plus the D18
// extension traits for shared-handle receivers.
pub use contract::*;
pub use sugar::{HtmlViewRefMethods, Node2DRefMethods, Scene2DRefMethods};

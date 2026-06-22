//! `flighthq-displayobject-skia` -- portable software display-object renderer
//! built on tiny-skia.
//!
//! Rust-only crate (no TS counterpart): the in-box software-render path that
//! restores software-render parity without emulating Canvas2D. It rasterizes
//! shapes, bitmaps (and, pending the text-shaping seam, text) into a
//! `flighthq-surface` RGBA buffer whose layout matches tiny-skia's `Pixmap`
//! 1:1, so capture reads it with no GPU readback. Output is bit-deterministic
//! across machines, making this the conformance _reference_ the GPU backends are
//! checked against, and the universal web no-GPU fallback.
//!
//! Modeled on the behavior of TS `@flighthq/displayobject-canvas` (immediate-
//! mode software draw), but over tiny-skia rather than the absent Canvas2D
//! substrate, and structured like `flighthq-displayobject-wgpu`'s id-based draw
//! walk (closures supply graph topology and per-node data). CPU filters/effects
//! reuse `flighthq-surface-filters` / `flighthq-effects` / `flighthq-filters` and
//! are not reimplemented here; only shape/path/bitmap rasterization goes through
//! tiny-skia. Registration is opt-in (no module-load side effects).

pub mod skia_bitmap;
pub mod skia_blend;
pub mod skia_clip;
pub mod skia_color;
pub mod skia_display_object;
pub mod skia_path;
pub mod skia_render_state;
pub mod skia_shape;
pub mod skia_surface;
pub mod skia_text;
pub mod skia_transform;

pub use skia_bitmap::{SkiaBitmapTexture, create_premultiplied_pixmap, draw_skia_bitmap};
pub use skia_blend::resolve_skia_blend_mode;
pub use skia_clip::{SkiaClipRectangle, pop_skia_clip_rectangle, push_skia_clip_rectangle};
pub use skia_color::{create_skia_color, unpack_skia_rgba};
pub use skia_display_object::{
    SkiaShapeGeometry, draw_skia_display_object, register_skia_display_object_renderers,
    render_skia_display_object,
};
pub use skia_path::{build_skia_path, resolve_skia_fill_rule};
pub use skia_render_state::{
    SkiaRenderState, SkiaRendererSlot, create_skia_render_state, current_skia_clip,
};
pub use skia_shape::draw_skia_shape_fill;
pub use skia_surface::{clear_skia_pixmap, read_skia_surface};
pub use skia_text::draw_skia_text;
pub use skia_transform::create_skia_transform;

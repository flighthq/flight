//! `flighthq-textshaper` — the text-shaping seam.
//!
//! A registerable backend turns a text run + format into its horizontal advance, the single value
//! `flighthq-textlayout` needs to place each character. The seam is empty until a host installs a
//! backend via [`set_text_shaper_backend`]: there is no light default here because the canvas
//! backend needs DOM + font-string computation (it ships separately on the web), and the native
//! full-glyph backend is HarfBuzz/rustybuzz. This mirrors text-layout's historical measure
//! provider, which was `None` until a renderer registered one.
//!
//! Importing this crate is inert — the backend slot starts empty, matching the SDK's
//! side-effect-free rule.

mod text_shaper;
mod text_shaper_hooks;
mod text_shaper_run;

pub use text_shaper::{get_text_shaper_backend, set_text_shaper_backend, shape_text};
pub use text_shaper_hooks::{TextShaperBackendHook, set_text_shaper_backend_hook};
pub use text_shaper_run::{
    clear_shaped_run, create_shaped_run, get_code_point_for_glyph, get_font_metrics,
    get_font_metrics_into, get_font_unit_scale, get_glyph_extents, get_glyph_extents_batch,
    get_glyph_extents_into, get_glyph_index_for_code_point, get_glyph_name, shape_text_run,
    shape_text_run_into,
};

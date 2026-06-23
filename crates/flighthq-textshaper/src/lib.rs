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

pub use text_shaper::{get_text_shaper_backend, set_text_shaper_backend, shape_text};

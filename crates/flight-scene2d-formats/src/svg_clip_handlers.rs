use std::sync::{Arc, LazyLock};

use crate::svg_clip::svg_path_clip_handler;
use crate::svg_registry::register_svg_clip_handler;
use crate::types::*;

pub static SVG_ALL_CLIP_HANDLERS: LazyLock<Vec<SvgClipHandler>> =
    LazyLock::new(|| vec![Arc::new(svg_path_clip_handler)]);

pub fn register_svg_clip_handlers(registry: &mut SvgRegistry) {
    register_svg_clip_handler(
        registry,
        SVG_CLIP_KIND_PATH,
        SVG_ALL_CLIP_HANDLERS[0].clone(),
    );
}

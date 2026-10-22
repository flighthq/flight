use std::sync::LazyLock;

use crate::{SWF_JPEG_BITMAP_HANDLER, SWF_LOSSLESS_BITMAP_HANDLER, SwfTagHandlerRef};

pub static SWF_BITMAP_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> = LazyLock::new(|| {
    vec![
        SWF_JPEG_BITMAP_HANDLER.clone(),
        SWF_LOSSLESS_BITMAP_HANDLER.clone(),
    ]
});

use std::sync::LazyLock;

use crate::{SWF_DEFINE_MORPH_SHAPE_HANDLER, SWF_DEFINE_SHAPE_HANDLER, SwfTagHandlerRef};

pub static SWF_SHAPE_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> = LazyLock::new(|| {
    vec![
        SWF_DEFINE_SHAPE_HANDLER.clone(),
        SWF_DEFINE_MORPH_SHAPE_HANDLER.clone(),
    ]
});

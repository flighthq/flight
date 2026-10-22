use std::sync::LazyLock;

use crate::{SWF_EDIT_TEXT_HANDLER, SWF_STATIC_TEXT_HANDLER, SwfTagHandlerRef};

pub static SWF_TEXT_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> = LazyLock::new(|| {
    vec![
        SWF_STATIC_TEXT_HANDLER.clone(),
        SWF_EDIT_TEXT_HANDLER.clone(),
    ]
});

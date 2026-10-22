use std::sync::LazyLock;

use crate::{SWF_FONT_HANDLER, SwfTagHandlerRef};

pub static SWF_FONT_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_FONT_HANDLER.clone()]);

use std::sync::LazyLock;

use crate::{SWF_SPRITE_HANDLER, SwfTagHandlerRef};

pub static SWF_SPRITE_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_SPRITE_HANDLER.clone()]);

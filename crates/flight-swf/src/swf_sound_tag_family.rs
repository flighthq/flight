use std::sync::LazyLock;

use crate::{SWF_SOUND_HANDLER, SwfTagHandlerRef};

pub static SWF_SOUND_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_SOUND_HANDLER.clone()]);

use std::sync::LazyLock;

use crate::{SWF_VIDEO_HANDLER, SwfTagHandlerRef};

pub static SWF_VIDEO_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_VIDEO_HANDLER.clone()]);

use std::sync::LazyLock;

use crate::{SWF_CONTROL_HANDLER, SwfTagHandlerRef};

pub static SWF_CONTROL_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_CONTROL_HANDLER.clone()]);

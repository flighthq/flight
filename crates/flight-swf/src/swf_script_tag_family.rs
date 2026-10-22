use std::sync::LazyLock;

use crate::{SWF_SCRIPT_HANDLER, SwfTagHandlerRef};

pub static SWF_SCRIPT_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> =
    LazyLock::new(|| vec![SWF_SCRIPT_HANDLER.clone()]);

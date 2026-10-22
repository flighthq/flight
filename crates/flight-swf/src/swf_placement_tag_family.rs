use std::sync::LazyLock;

use crate::{SWF_PLACE_OBJECT_HANDLER, SWF_PLACE_OBJECT3_HANDLER, SwfTagHandlerRef};

pub static SWF_PLACEMENT_TAG_FAMILY: LazyLock<Vec<SwfTagHandlerRef>> = LazyLock::new(|| {
    vec![
        SWF_PLACE_OBJECT_HANDLER.clone(),
        SWF_PLACE_OBJECT3_HANDLER.clone(),
    ]
});

use std::sync::LazyLock;

use crate::{
    SWF_BITMAP_TAG_FAMILY, SWF_CONTROL_TAG_FAMILY, SWF_FONT_TAG_FAMILY, SWF_PLACEMENT_TAG_FAMILY,
    SWF_SCRIPT_TAG_FAMILY, SWF_SHAPE_TAG_FAMILY, SWF_SOUND_TAG_FAMILY, SWF_SPRITE_TAG_FAMILY,
    SWF_TEXT_TAG_FAMILY, SWF_VIDEO_TAG_FAMILY, SwfTagHandlerRef,
};

/// Every tag handler in the full-support preset, in placement-claim order.
pub static SWF_ALL_TAG_HANDLERS: LazyLock<Vec<SwfTagHandlerRef>> = LazyLock::new(|| {
    let mut handlers = Vec::new();
    handlers.extend(SWF_TEXT_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_BITMAP_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_VIDEO_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_SHAPE_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_SPRITE_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_CONTROL_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_FONT_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_PLACEMENT_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_SCRIPT_TAG_FAMILY.iter().cloned());
    handlers.extend(SWF_SOUND_TAG_FAMILY.iter().cloned());
    return handlers;
});

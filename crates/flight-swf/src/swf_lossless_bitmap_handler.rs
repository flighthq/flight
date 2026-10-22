use std::sync::{Arc, LazyLock, RwLock};

use crate::{
    SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE, SwfImageDefinition, SwfTagHandler,
    SwfTagHandlerRef,
};

pub static SWF_LOSSLESS_BITMAP_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, state, _timeline, _diagnostics| {
            return read_swf_lossless_bitmap_definition(
                body,
                state,
                tag == TAG_DEFINE_BITS_LOSSLESS_2,
            );
        }),
        resolve: None,
        tags: vec![TAG_DEFINE_BITS_LOSSLESS, TAG_DEFINE_BITS_LOSSLESS_2],
    })
});

fn read_swf_lossless_bitmap_definition(
    body: &mut crate::SwfReader,
    state: &mut crate::SwfTagParseState,
    has_alpha: bool,
) -> bool {
    let character_id = u32::from(body.read_uint16());
    let payload_start = body.pos;
    let format = body.read_uint8();
    let width = u32::from(body.read_uint16());
    let height = u32::from(body.read_uint16());
    if format == LOSSLESS_BITMAP_FORMAT_COLORMAPPED {
        body.read_uint8();
    }
    let valid_format = format == LOSSLESS_BITMAP_FORMAT_COLORMAPPED
        || format == LOSSLESS_BITMAP_FORMAT_32_BIT
        || (!has_alpha && format == LOSSLESS_BITMAP_FORMAT_15_BIT);
    if !body.valid
        || character_id == 0
        || width == 0
        || height == 0
        || state.defined_characters.contains(&character_id)
        || !valid_format
    {
        return false;
    }
    state.defined_characters.insert(character_id);
    state.character_bounds.insert(
        character_id,
        crate::SwfTagRectangle {
            height: height as f32,
            width: width as f32,
            x: 0.0,
            y: 0.0,
        },
    );
    let bytes = {
        let source = body.source.read().unwrap();
        source[payload_start..body.end].to_vec().into_boxed_slice()
    };
    state.images.insert(
        character_id,
        SwfImageDefinition {
            bytes: Arc::new(RwLock::new(bytes)),
            mime_type: if has_alpha {
                SWF_LOSSLESS_ALPHA_MIME_TYPE.to_string()
            } else {
                SWF_LOSSLESS_MIME_TYPE.to_string()
            },
        },
    );
    return true;
}

const LOSSLESS_BITMAP_FORMAT_15_BIT: u8 = 4;
const LOSSLESS_BITMAP_FORMAT_32_BIT: u8 = 5;
const LOSSLESS_BITMAP_FORMAT_COLORMAPPED: u8 = 3;
const TAG_DEFINE_BITS_LOSSLESS: u32 = 20;
const TAG_DEFINE_BITS_LOSSLESS_2: u32 = 36;

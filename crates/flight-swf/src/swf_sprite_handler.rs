use std::sync::{Arc, LazyLock};

use crate::{
    SwfReader, SwfTagHandler, SwfTagHandlerInstantiation, SwfTagHandlerRef, read_swf_timeline,
};

pub static SWF_SPRITE_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: None,
            create_resources: None,
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.sprites.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, _tag, state, _timeline, _diagnostics| {
            let sprite_id = u32::from(body.read_uint16());
            body.read_uint16();
            if !body.valid || sprite_id == 0 || state.defined_characters.contains(&sprite_id) {
                return false;
            }
            state.defined_characters.insert(sprite_id);
            let mut sprite_reader = SwfReader::new(body.source.clone(), body.pos, body.end);
            let Some(sprite_timeline) = read_swf_timeline(&mut sprite_reader, state) else {
                return false;
            };
            if sprite_reader.pos != sprite_reader.end {
                return false;
            }
            state.sprites.insert(sprite_id, sprite_timeline);
            return true;
        }),
        resolve: None,
        tags: vec![TAG_DEFINE_SPRITE],
    })
});

const TAG_DEFINE_SPRITE: u32 = 39;

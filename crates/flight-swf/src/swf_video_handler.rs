use std::sync::{Arc, LazyLock, RwLock};

use flight_scene2d::Node2DRef;
use flight_texture::{Texture, TextureFilter, create_sampler, create_texture_2d};

use crate::{
    SwfTagHandler, SwfTagHandlerInstantiation, SwfTagHandlerRef, SwfTagParseResult,
    SwfTagParseState, SwfVideoDefinition, create_swf_textured_sprite,
};

pub static SWF_VIDEO_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: Some(SwfTagHandlerInstantiation {
            create_placement_node: Some(Arc::new(|parsed, character_id, bounds, _diagnostics| {
                let video = parsed.state.videos.get(&character_id)?;
                let texture = acquire_swf_video_texture(parsed, character_id, video);
                let node: Node2DRef =
                    create_swf_textured_sprite(&parsed.state.node_state, &texture, bounds);
                return Some(node);
            })),
            create_resources: None,
            has_placement_content: Some(Arc::new(|parsed, character_id| {
                parsed.state.videos.contains_key(&character_id)
            })),
        }),
        parse: Arc::new(|body, _tag, state, _timeline, _diagnostics| {
            read_swf_video_definition(body, state)
        }),
        resolve: None,
        tags: vec![TAG_DEFINE_VIDEO_STREAM],
    })
});

fn acquire_swf_video_texture(
    parsed: &SwfTagParseResult,
    character_id: u32,
    definition: &SwfVideoDefinition,
) -> flight_entity::Ref<Texture> {
    let mut textures = parsed.state.video_textures.write().unwrap();
    if let Some(texture) = textures.get(&character_id) {
        return texture.clone();
    }
    let mut sampler = create_sampler();
    sampler.mag_filter = if definition.smoothing {
        TextureFilter::Linear
    } else {
        TextureFilter::Nearest
    };
    sampler.min_filter = sampler.mag_filter;
    sampler.mipmaps = false;
    let mut texture = create_texture_2d();
    texture.sampler = sampler;
    let texture = Arc::new(RwLock::new(Texture::Texture2D(texture)));
    textures.insert(character_id, texture.clone());
    return texture;
}

fn read_swf_video_definition(body: &mut crate::SwfReader, state: &mut SwfTagParseState) -> bool {
    let character_id = u32::from(body.read_uint16());
    let frame_count = body.read_uint16();
    let width = body.read_uint16();
    let height = body.read_uint16();
    let flags = body.read_uint8();
    let codec_id = body.read_uint8();
    if !body.valid
        || character_id == 0
        || width == 0
        || height == 0
        || state.defined_characters.contains(&character_id)
    {
        return false;
    }
    state.defined_characters.insert(character_id);
    state.character_bounds.insert(
        character_id,
        crate::SwfTagRectangle {
            height: f32::from(height),
            width: f32::from(width),
            x: 0.0,
            y: 0.0,
        },
    );
    state.videos.insert(
        character_id,
        SwfVideoDefinition {
            codec_id,
            deblocking: (flags >> 1) & 0x07,
            frame_count,
            height,
            smoothing: flags & 0x01 != 0,
            width,
        },
    );
    return true;
}

const TAG_DEFINE_VIDEO_STREAM: u32 = 60;

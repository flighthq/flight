use std::collections::HashMap;
use std::sync::LazyLock;

use flight_entity::Kind;
use flight_scene2d::{DISPLAY_OBJECT_KIND, SPRITE_KIND};
use flight_shape::contract::{MORPH_SHAPE_KIND, SCALE9_SHAPE_KIND, SHAPE_KIND};
use flight_text::RICH_TEXT_KIND;

pub static SWF_TAG_NODE_KINDS: LazyLock<HashMap<u32, Vec<Kind>>> = LazyLock::new(|| {
    HashMap::from([
        (
            2,
            vec![SHAPE_KIND.to_string(), SCALE9_SHAPE_KIND.to_string()],
        ),
        (
            22,
            vec![SHAPE_KIND.to_string(), SCALE9_SHAPE_KIND.to_string()],
        ),
        (
            32,
            vec![SHAPE_KIND.to_string(), SCALE9_SHAPE_KIND.to_string()],
        ),
        (
            83,
            vec![SHAPE_KIND.to_string(), SCALE9_SHAPE_KIND.to_string()],
        ),
        (46, vec![MORPH_SHAPE_KIND.to_string()]),
        (84, vec![MORPH_SHAPE_KIND.to_string()]),
        (6, vec![SPRITE_KIND.to_string()]),
        (8, vec![SPRITE_KIND.to_string()]),
        (21, vec![SPRITE_KIND.to_string()]),
        (35, vec![SPRITE_KIND.to_string()]),
        (90, vec![SPRITE_KIND.to_string()]),
        (60, vec![SPRITE_KIND.to_string()]),
        (37, vec![RICH_TEXT_KIND.to_string()]),
        (11, vec![SHAPE_KIND.to_string()]),
        (33, vec![SHAPE_KIND.to_string()]),
    ])
});

pub static SWF_DOCUMENT_NODE_KINDS: LazyLock<Vec<Kind>> =
    LazyLock::new(|| vec![DISPLAY_OBJECT_KIND.to_string()]);

use std::sync::{Arc, LazyLock};

use flight_materials::BLEND_MODE_NORMAL;

use crate::{
    EMPTY_ADJUSTMENTS, EMPTY_EFFECTS, IDENTITY_MATRIX, SwfColorTransform, SwfReader, SwfTagHandler,
    SwfTagHandlerRef, SwfTagPlacement, SwfTagPlacementsRef, read_swf_color_transform,
    read_swf_matrix,
};

pub static SWF_PLACE_OBJECT_HANDLER: LazyLock<SwfTagHandlerRef> = LazyLock::new(|| {
    Arc::new(SwfTagHandler {
        finish_timeline: None,
        instantiate: None,
        parse: Arc::new(|body, tag, _state, timeline, _diagnostics| {
            if tag == TAG_PLACE_OBJECT {
                read_legacy_place_object(body, &timeline.placements);
            } else if tag == TAG_REMOVE_OBJECT {
                read_legacy_remove_object(body, &timeline.placements);
            } else if tag == TAG_REMOVE_OBJECT_2 {
                remove_placement(&timeline.placements, u32::from(body.read_uint16()));
            } else {
                read_place_object_2(body, &timeline.placements);
            }
            return true;
        }),
        resolve: None,
        tags: vec![
            TAG_PLACE_OBJECT,
            TAG_REMOVE_OBJECT,
            TAG_PLACE_OBJECT_2,
            TAG_REMOVE_OBJECT_2,
        ],
    })
});

fn find_placement(placements: &SwfTagPlacementsRef, depth: u32) -> Option<SwfTagPlacement> {
    return placements
        .read()
        .unwrap()
        .iter()
        .find(|(key, _)| *key == depth)
        .map(|(_, placement)| placement.clone());
}

fn read_legacy_place_object(body: &mut SwfReader, placements: &SwfTagPlacementsRef) {
    let character_id = u32::from(body.read_uint16());
    let depth = u32::from(body.read_uint16());
    let matrix = read_swf_matrix(body);
    let color_transform = if body.pos < body.end {
        Some(read_swf_color_transform(body, 3))
    } else {
        None
    };
    if !body.valid || character_id == 0 {
        return;
    }
    let color_adjustments = color_transform.and_then(|transform| transform.color_adjustments);
    set_placement(
        placements,
        depth,
        SwfTagPlacement {
            advanced_blend_mode: None,
            alpha: 1.0,
            blend_mode: BLEND_MODE_NORMAL.to_string(),
            character_id,
            clip_depth: 0,
            color_adjustments: color_adjustments.clone(),
            color_transform_adjustments: color_adjustments,
            depth,
            direct_linkage: None,
            effects: EMPTY_EFFECTS.clone(),
            filter_adjustments: EMPTY_ADJUSTMENTS.clone(),
            matrix,
            name: None,
            ratio: 0.0,
        },
    );
}

fn read_legacy_remove_object(body: &mut SwfReader, placements: &SwfTagPlacementsRef) {
    let character_id = u32::from(body.read_uint16());
    let depth = u32::from(body.read_uint16());
    if !body.valid {
        return;
    }
    if find_placement(placements, depth)
        .is_some_and(|placement| placement.character_id == character_id)
    {
        remove_placement(placements, depth);
    }
}

fn read_place_object_2(body: &mut SwfReader, placements: &SwfTagPlacementsRef) {
    let flags = body.read_uint8();
    let depth = u32::from(body.read_uint16());
    let existing = find_placement(placements, depth);
    let is_move = flags & PLACE_MOVE != 0;
    let inherited = if is_move { existing.as_ref() } else { None };
    let has_character = flags & PLACE_HAS_CHARACTER != 0;
    let direct_linkage = inherited.and_then(|placement| placement.direct_linkage.clone());
    let character_id = if has_character {
        u32::from(body.read_uint16())
    } else {
        inherited.map_or(0, |placement| placement.character_id)
    };
    let matrix = if flags & PLACE_HAS_MATRIX != 0 {
        read_swf_matrix(body)
    } else {
        inherited.map_or(IDENTITY_MATRIX, |placement| placement.matrix)
    };
    let color_transform = if flags & PLACE_HAS_COLOR_TRANSFORM != 0 {
        read_swf_color_transform(body, 4)
    } else {
        SwfColorTransform {
            alpha: inherited.map_or(1.0, |placement| placement.alpha),
            color_adjustments: inherited
                .and_then(|placement| placement.color_transform_adjustments.clone()),
        }
    };
    let ratio = if flags & PLACE_HAS_RATIO != 0 {
        f32::from(body.read_uint16()) / MORPH_RATIO_ONE
    } else {
        inherited.map_or(0.0, |placement| placement.ratio)
    };
    let name = if flags & PLACE_HAS_NAME != 0 {
        Some(body.read_string())
    } else {
        inherited.and_then(|placement| placement.name.clone())
    };
    let clip_depth = if flags & PLACE_HAS_CLIP_DEPTH != 0 {
        u32::from(body.read_uint16())
    } else {
        inherited.map_or(0, |placement| placement.clip_depth)
    };

    if !body.valid
        || (is_move && existing.is_none())
        || (character_id == 0 && direct_linkage.is_none())
    {
        return;
    }
    set_placement(
        placements,
        depth,
        SwfTagPlacement {
            advanced_blend_mode: inherited
                .and_then(|placement| placement.advanced_blend_mode.clone()),
            alpha: color_transform.alpha,
            blend_mode: inherited.map_or_else(
                || BLEND_MODE_NORMAL.to_string(),
                |placement| placement.blend_mode.clone(),
            ),
            character_id,
            clip_depth,
            color_adjustments: color_transform.color_adjustments.clone(),
            color_transform_adjustments: color_transform.color_adjustments,
            depth,
            direct_linkage,
            effects: inherited.map_or_else(
                || EMPTY_EFFECTS.clone(),
                |placement| placement.effects.clone(),
            ),
            filter_adjustments: inherited.map_or_else(
                || EMPTY_ADJUSTMENTS.clone(),
                |placement| placement.filter_adjustments.clone(),
            ),
            matrix,
            name,
            ratio,
        },
    );
}

fn remove_placement(placements: &SwfTagPlacementsRef, depth: u32) {
    let mut placements = placements.write().unwrap();
    if let Some(index) = placements.iter().position(|(key, _)| *key == depth) {
        placements.remove(index);
    }
}

pub(crate) fn set_placement(
    placements: &SwfTagPlacementsRef,
    depth: u32,
    placement: SwfTagPlacement,
) {
    let mut placements = placements.write().unwrap();
    if let Some((_, existing)) = placements.iter_mut().find(|(key, _)| *key == depth) {
        *existing = placement;
    } else {
        placements.push((depth, placement));
    }
}

const MORPH_RATIO_ONE: f32 = 0xffff as f32;
const PLACE_HAS_CHARACTER: u8 = 0x02;
const PLACE_HAS_CLIP_DEPTH: u8 = 0x40;
const PLACE_HAS_COLOR_TRANSFORM: u8 = 0x08;
const PLACE_HAS_MATRIX: u8 = 0x04;
const PLACE_HAS_NAME: u8 = 0x20;
const PLACE_HAS_RATIO: u8 = 0x10;
const PLACE_MOVE: u8 = 0x01;
const TAG_PLACE_OBJECT: u32 = 4;
const TAG_PLACE_OBJECT_2: u32 = 26;
const TAG_REMOVE_OBJECT: u32 = 5;
const TAG_REMOVE_OBJECT_2: u32 = 28;

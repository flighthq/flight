use std::collections::HashSet;
use std::sync::Arc;

use flight_swf::contract::*;

fn exported_families() -> Vec<&'static Vec<SwfTagHandlerRef>> {
    return vec![
        &SWF_BITMAP_TAG_FAMILY,
        &SWF_CONTROL_TAG_FAMILY,
        &SWF_FONT_TAG_FAMILY,
        &SWF_PLACEMENT_TAG_FAMILY,
        &SWF_SCRIPT_TAG_FAMILY,
        &SWF_SHAPE_TAG_FAMILY,
        &SWF_SOUND_TAG_FAMILY,
        &SWF_SPRITE_TAG_FAMILY,
        &SWF_TEXT_TAG_FAMILY,
        &SWF_VIDEO_TAG_FAMILY,
    ];
}

#[test]
fn derives_the_family_list_from_the_package_exports() {
    let families = exported_families();
    assert!(families.iter().any(|family| {
        family
            .iter()
            .any(|handler| Arc::ptr_eq(handler, &SWF_DEFINE_SHAPE_HANDLER))
    }));
    assert!(families.iter().any(|family| {
        family
            .iter()
            .any(|handler| Arc::ptr_eq(handler, &SWF_PLACE_OBJECT_HANDLER))
    }));
    assert!(families.len() > 1);
}

#[test]
fn contains_every_tag_family_the_package_exports() {
    for family in exported_families() {
        for handler in family {
            assert!(
                SWF_ALL_TAG_HANDLERS
                    .iter()
                    .any(|candidate| Arc::ptr_eq(candidate, handler))
            );
        }
    }
}

#[test]
fn contains_nothing_that_is_not_part_of_an_exported_family() {
    let owned: Vec<SwfTagHandlerRef> = exported_families()
        .into_iter()
        .flat_map(|family| family.iter().cloned())
        .collect();
    for handler in SWF_ALL_TAG_HANDLERS.iter() {
        assert!(
            owned
                .iter()
                .any(|candidate| Arc::ptr_eq(candidate, handler))
        );
    }
}

#[test]
fn maps_every_tag_whose_handler_builds_a_placement_node() {
    for handler in SWF_ALL_TAG_HANDLERS.iter() {
        let Some(instantiate) = &handler.instantiate else {
            continue;
        };
        if instantiate.create_placement_node.is_none() {
            continue;
        }
        for code in &handler.tags {
            let kinds = SWF_TAG_NODE_KINDS
                .get(code)
                .unwrap_or_else(|| panic!("tag {code} builds a node but declares no kind"));
            assert!(!kinds.is_empty());
        }
    }
}

// flight-lint: allow(hashmap-iteration) membership is the only observable assertion and no output order is retained
#[test]
fn maps_only_tag_codes_some_handler_actually_claims() {
    let claimed: HashSet<u32> = SWF_ALL_TAG_HANDLERS
        .iter()
        .flat_map(|handler| handler.tags.iter().copied())
        .collect();
    for code in SWF_TAG_NODE_KINDS.keys() {
        assert!(claimed.contains(code), "tag {code} is mapped but unclaimed");
    }
}

#[test]
fn covers_both_directions_with_real_handlers() {
    let builders = SWF_ALL_TAG_HANDLERS
        .iter()
        .filter(|handler| {
            handler
                .instantiate
                .as_ref()
                .is_some_and(|value| value.create_placement_node.is_some())
        })
        .count();
    assert!(builders > 0);
    assert!(SWF_ALL_TAG_HANDLERS.len() > builders);
    assert!(!SWF_TAG_NODE_KINDS.is_empty());
}

use std::sync::Arc;

use flight_swf::{SWF_SOUND_HANDLER, SWF_SOUND_TAG_FAMILY};

#[test]
fn is_exactly_its_handlers_in_placement_order() {
    assert_eq!(SWF_SOUND_TAG_FAMILY.len(), 1);
    assert!(Arc::ptr_eq(&SWF_SOUND_TAG_FAMILY[0], &SWF_SOUND_HANDLER));
}

#[test]
fn claims_the_union_without_duplicates() {
    let mut claimed: Vec<u32> = SWF_SOUND_TAG_FAMILY
        .iter()
        .flat_map(|handler| handler.tags.iter().copied())
        .collect();
    let mut expected = SWF_SOUND_HANDLER.tags.clone();
    claimed.sort_unstable();
    expected.sort_unstable();
    assert_eq!(claimed, expected);
    claimed.dedup();
    assert_eq!(claimed.len(), expected.len());
}

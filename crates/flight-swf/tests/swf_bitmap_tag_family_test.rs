use std::sync::Arc;

use flight_swf::{SWF_BITMAP_TAG_FAMILY, SWF_JPEG_BITMAP_HANDLER, SWF_LOSSLESS_BITMAP_HANDLER};

#[test]
fn is_exactly_its_handlers_in_placement_order() {
    assert_eq!(SWF_BITMAP_TAG_FAMILY.len(), 2);
    assert!(Arc::ptr_eq(
        &SWF_BITMAP_TAG_FAMILY[0],
        &SWF_JPEG_BITMAP_HANDLER
    ));
    assert!(Arc::ptr_eq(
        &SWF_BITMAP_TAG_FAMILY[1],
        &SWF_LOSSLESS_BITMAP_HANDLER
    ));
}

#[test]
fn claims_the_union_without_duplicates() {
    let mut claimed: Vec<u32> = SWF_BITMAP_TAG_FAMILY
        .iter()
        .flat_map(|handler| handler.tags.iter().copied())
        .collect();
    let mut expected = SWF_JPEG_BITMAP_HANDLER.tags.clone();
    expected.extend(SWF_LOSSLESS_BITMAP_HANDLER.tags.iter().copied());
    claimed.sort_unstable();
    expected.sort_unstable();
    assert_eq!(claimed, expected);
    claimed.dedup();
    assert_eq!(claimed.len(), expected.len());
}

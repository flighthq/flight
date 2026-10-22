use flight_swf::SWF_JPEG_BITMAP_HANDLER;

#[test]
fn claims_the_jpeg_bitmap_tags_and_the_jpeg_tables_tag() {
    let mut tags = SWF_JPEG_BITMAP_HANDLER.tags.clone();
    tags.sort_unstable();
    assert_eq!(tags, vec![6, 8, 21, 35, 90]);
}

#[test]
fn provides_full_placement_and_resource_instantiation() {
    let instantiate = SWF_JPEG_BITMAP_HANDLER.instantiate.as_ref().unwrap();
    assert!(instantiate.create_placement_node.is_some());
    assert!(instantiate.create_resources.is_some());
    assert!(instantiate.has_placement_content.is_some());
}

#[test]
fn does_not_define_resolve_or_finish_timeline() {
    assert!(SWF_JPEG_BITMAP_HANDLER.resolve.is_none());
    assert!(SWF_JPEG_BITMAP_HANDLER.finish_timeline.is_none());
}

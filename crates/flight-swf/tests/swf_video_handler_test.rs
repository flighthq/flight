use flight_swf::SWF_VIDEO_HANDLER;

#[test]
fn claims_the_video_tag() {
    assert_eq!(SWF_VIDEO_HANDLER.tags, vec![60]);
}

#[test]
fn provides_full_placement_instantiation() {
    let instantiate = SWF_VIDEO_HANDLER.instantiate.as_ref().unwrap();
    assert!(instantiate.create_placement_node.is_some());
    assert!(instantiate.has_placement_content.is_some());
}

#[test]
fn does_not_define_resolve_finish_timeline_or_create_resources() {
    let instantiate = SWF_VIDEO_HANDLER.instantiate.as_ref().unwrap();
    assert!(SWF_VIDEO_HANDLER.resolve.is_none());
    assert!(SWF_VIDEO_HANDLER.finish_timeline.is_none());
    assert!(instantiate.create_resources.is_none());
}

use flight_swf::*;

mod swf_define_morph_shape_handler {
    use super::*;

    #[test]
    fn claims_the_two_morph_shape_tags() {
        let mut tags = SWF_DEFINE_MORPH_SHAPE_HANDLER.tags.clone();
        tags.sort_unstable();
        assert_eq!(tags, vec![46, 84]);
    }

    #[test]
    fn provides_placement_instantiation_but_no_resolution() {
        assert!(SWF_DEFINE_MORPH_SHAPE_HANDLER.resolve.is_none());
        assert!(SWF_DEFINE_MORPH_SHAPE_HANDLER.finish_timeline.is_none());
        let instantiate = SWF_DEFINE_MORPH_SHAPE_HANDLER.instantiate.as_ref().unwrap();
        assert!(instantiate.create_placement_node.is_some());
        assert!(instantiate.has_placement_content.is_some());
    }

    #[test]
    fn does_not_define_create_resources() {
        assert!(
            SWF_DEFINE_MORPH_SHAPE_HANDLER
                .instantiate
                .as_ref()
                .unwrap()
                .create_resources
                .is_none()
        );
    }
}

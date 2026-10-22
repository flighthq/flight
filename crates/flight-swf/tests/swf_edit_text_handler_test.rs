use flight_swf::*;

mod swf_edit_text_handler {
    use super::*;

    #[test]
    fn claims_the_edit_text_tag() {
        assert_eq!(SWF_EDIT_TEXT_HANDLER.tags, vec![37]);
    }

    #[test]
    fn provides_placement_instantiation() {
        let instantiate = SWF_EDIT_TEXT_HANDLER.instantiate.as_ref().unwrap();
        assert!(instantiate.create_placement_node.is_some());
        assert!(instantiate.has_placement_content.is_some());
    }

    #[test]
    fn does_not_define_resolution_or_resources() {
        assert!(SWF_EDIT_TEXT_HANDLER.resolve.is_none());
        assert!(SWF_EDIT_TEXT_HANDLER.finish_timeline.is_none());
        assert!(
            SWF_EDIT_TEXT_HANDLER
                .instantiate
                .as_ref()
                .unwrap()
                .create_resources
                .is_none()
        );
    }
}

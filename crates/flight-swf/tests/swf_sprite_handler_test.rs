use flight_swf::*;

mod swf_sprite_handler {
    use super::*;

    #[test]
    fn claims_the_sprite_tag() {
        assert_eq!(SWF_SPRITE_HANDLER.tags, vec![39]);
    }

    #[test]
    fn provides_has_placement_content_but_no_other_instantiation_hooks() {
        let instantiate = SWF_SPRITE_HANDLER.instantiate.as_ref().unwrap();
        assert!(instantiate.has_placement_content.is_some());
        assert!(instantiate.create_placement_node.is_none());
        assert!(instantiate.create_resources.is_none());
    }

    #[test]
    fn does_not_define_resolve_or_finish_timeline() {
        assert!(SWF_SPRITE_HANDLER.resolve.is_none());
        assert!(SWF_SPRITE_HANDLER.finish_timeline.is_none());
    }
}

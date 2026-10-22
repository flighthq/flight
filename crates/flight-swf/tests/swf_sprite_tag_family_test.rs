use std::collections::HashSet;
use std::sync::Arc;

use flight_swf::*;

mod swf_sprite_tag_family {
    use super::*;

    #[test]
    fn is_exactly_its_handlers_in_placement_order() {
        assert_eq!(SWF_SPRITE_TAG_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(&SWF_SPRITE_TAG_FAMILY[0], &SWF_SPRITE_HANDLER));
    }

    #[test]
    fn claims_the_union_without_duplicates() {
        let claimed: Vec<u32> = SWF_SPRITE_TAG_FAMILY
            .iter()
            .flat_map(|handler| handler.tags.iter().copied())
            .collect();
        assert_eq!(claimed, SWF_SPRITE_HANDLER.tags);
        assert_eq!(
            claimed.iter().copied().collect::<HashSet<_>>().len(),
            claimed.len()
        );
    }
}

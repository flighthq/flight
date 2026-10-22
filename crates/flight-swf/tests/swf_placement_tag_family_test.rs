use std::collections::HashSet;
use std::sync::Arc;

use flight_swf::*;

mod swf_placement_tag_family {
    use super::*;

    #[test]
    fn claims_the_exact_union_without_duplicates() {
        let claimed: Vec<u32> = SWF_PLACEMENT_TAG_FAMILY
            .iter()
            .flat_map(|handler| handler.tags.iter().copied())
            .collect();
        assert_eq!(claimed.len(), 6);
        assert_eq!(claimed.iter().copied().collect::<HashSet<_>>().len(), 6);
    }

    #[test]
    fn preserves_handler_order_and_identity() {
        assert_eq!(SWF_PLACEMENT_TAG_FAMILY.len(), 2);
        assert!(Arc::ptr_eq(
            &SWF_PLACEMENT_TAG_FAMILY[0],
            &SWF_PLACE_OBJECT_HANDLER
        ));
        assert!(Arc::ptr_eq(
            &SWF_PLACEMENT_TAG_FAMILY[1],
            &SWF_PLACE_OBJECT3_HANDLER
        ));
    }
}

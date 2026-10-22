use std::collections::HashSet;
use std::sync::Arc;

use flight_swf::*;

mod swf_shape_tag_family {
    use super::*;

    #[test]
    fn is_exactly_its_handlers_in_placement_order() {
        assert_eq!(SWF_SHAPE_TAG_FAMILY.len(), 2);
        assert!(Arc::ptr_eq(
            &SWF_SHAPE_TAG_FAMILY[0],
            &SWF_DEFINE_SHAPE_HANDLER
        ));
        assert!(Arc::ptr_eq(
            &SWF_SHAPE_TAG_FAMILY[1],
            &SWF_DEFINE_MORPH_SHAPE_HANDLER
        ));
    }

    #[test]
    fn claims_the_union_without_duplicates() {
        let claimed: Vec<u32> = SWF_SHAPE_TAG_FAMILY
            .iter()
            .flat_map(|handler| handler.tags.iter().copied())
            .collect();
        let mut actual = claimed.clone();
        actual.sort_unstable();
        let mut expected = SWF_DEFINE_SHAPE_HANDLER.tags.clone();
        expected.extend_from_slice(&SWF_DEFINE_MORPH_SHAPE_HANDLER.tags);
        expected.sort_unstable();
        assert_eq!(actual, expected);
        assert_eq!(
            claimed.iter().copied().collect::<HashSet<_>>().len(),
            claimed.len()
        );
    }
}

use flight_skeleton2d_formats::contract::*;

mod parse_spine_skeleton_binary {
    use super::*;

    #[test]
    fn rejects_unreadable_input() {
        assert!(parse_spine_skeleton_binary(&[], None).is_none());
    }
}

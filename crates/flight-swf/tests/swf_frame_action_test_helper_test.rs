use flight_swf::contract::*;

mod build_frame_script_abc {
    use super::*;

    #[test]
    fn builds_the_default_fixture_and_substitutes_the_requested_handler_name() {
        let default = build_frame_script_abc(None);
        let explicit = build_frame_script_abc(Some(3));
        let declined = build_frame_script_abc(Some(1));
        assert_eq!(default, explicit);
        assert_eq!(default.len(), declined.len());
        let differences: Vec<_> = default
            .iter()
            .zip(declined.iter())
            .enumerate()
            .filter_map(|(index, (a, b))| (a != b).then_some((index, *a, *b)))
            .collect();
        assert_eq!(differences.len(), 2);
        assert!(differences.iter().all(|(_, a, b)| *a == 3 && *b == 1));
        assert_eq!(&default[..4], &[16, 0, 46, 0]);
    }
}

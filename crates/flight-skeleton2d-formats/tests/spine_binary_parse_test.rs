use flight_skeleton2d_formats::contract::*;

use crate::support::minimal_spine_binary;

mod parse_spine_skeleton_binary_with_registry {
    use super::*;

    #[test]
    fn parses_a_minimal_supported_stream() {
        let mut registry = create_spine_binary_registry();
        register_all_spine_binary_handlers(&mut registry);
        let parsed = parse_spine_skeleton_binary_with_registry(
            &minimal_spine_binary("4.1.0"),
            &registry,
            None,
        )
        .unwrap();
        assert!(parsed.skeleton.bones.is_empty());
        assert!(parsed.animations.is_empty());
    }

    #[test]
    fn rejects_unsupported_versions_with_the_version_intact() {
        let mut diagnostics = Vec::new();
        assert!(
            parse_spine_skeleton_binary_with_registry(
                &minimal_spine_binary("4.2.0"),
                &create_spine_binary_registry(),
                Some(&mut diagnostics),
            )
            .is_none()
        );
        assert_eq!(diagnostics[0].kind, "spine.binary-version-unsupported");
    }
}

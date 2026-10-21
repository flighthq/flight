use flight_skeleton2d_formats::contract::*;

mod parse_dragon_bones_skeleton_with_registry {
    use super::*;

    #[test]
    fn rejects_missing_and_unsupported_versions_distinctly() {
        let registry = create_dragon_bones_registry();
        let mut missing = Vec::new();
        assert!(
            parse_dragon_bones_skeleton_with_registry(
                r#"{"armature":[{}]}"#,
                &registry,
                Some(&mut missing),
            )
            .is_none()
        );
        assert_eq!(missing[0].kind, "dragonbones.version-missing");

        let mut unsupported = Vec::new();
        assert!(
            parse_dragon_bones_skeleton_with_registry(
                r#"{"version":"5.6","armature":[{}]}"#,
                &registry,
                Some(&mut unsupported),
            )
            .is_none()
        );
        assert_eq!(unsupported[0].kind, "dragonbones.version-unsupported");
    }

    #[test]
    fn parses_the_first_armature_with_registered_handlers() {
        let mut registry = create_dragon_bones_registry();
        register_all_dragon_bones_handlers(&mut registry);
        let parsed = parse_dragon_bones_skeleton_with_registry(
            r#"{"version":"5.5","armature":[{"bone":[{"name":"root"}]},{"bone":[{"name":"ignored"}]}]}"#,
            &registry,
            None,
        )
        .unwrap();
        assert_eq!(parsed.skeleton.bones.len(), 1);
        assert_eq!(parsed.skeleton.bones[0].name.as_deref(), Some("root"));
    }
}

use flight_node::contract::*;

mod init_appearance_runtime_trait {
    use super::*;

    #[test]
    fn initializes_default_values_and_resets_a_resolved_cache() {
        let mut runtime = HasAppearanceRuntime {
            world_alpha: Some(0.25),
            world_alpha_using_appearance_id: 7,
            world_alpha_using_parent_appearance_id: 9,
            world_appearance_id: 11,
        };
        init_appearance_runtime_trait(&mut runtime);
        assert_eq!(runtime.world_alpha, None);
        assert_eq!(runtime.world_alpha_using_appearance_id, -1);
        assert_eq!(runtime.world_alpha_using_parent_appearance_id, -1);
        assert_eq!(runtime.world_appearance_id, 0);
    }
}

mod init_appearance_trait {
    use super::*;

    #[test]
    fn sets_default_values_when_called_with_no_options() {
        let mut target = HasAppearance {
            alpha: 0.5,
            visible: false,
        };
        init_appearance_trait(&mut target, None);
        assert_eq!(target.alpha, 1.0);
        assert!(target.visible);
    }

    #[test]
    fn applies_partial_overrides_and_overwrites_existing_values() {
        let mut target = HasAppearance {
            alpha: 1.0,
            visible: true,
        };
        let options = HasAppearanceOptions {
            alpha: Some(0.5),
            visible: Some(false),
        };
        init_appearance_trait(&mut target, Some(&options));
        assert_eq!(target.alpha, 0.5);
        assert!(!target.visible);
        let alpha_only = HasAppearanceOptions {
            alpha: Some(0.25),
            visible: None,
        };
        init_appearance_trait(&mut target, Some(&alpha_only));
        assert_eq!(target.alpha, 0.25);
        assert!(target.visible);
    }
}

use flight_node::contract::*;

mod init_blend_mode_trait {
    use super::*;

    #[test]
    fn defaults_blend_mode_to_null() {
        let mut target = HasBlendMode {
            blend_mode: Some(String::from("Add")),
        };
        init_blend_mode_trait(&mut target, None);
        assert_eq!(target.blend_mode, None);
    }

    #[test]
    fn applies_a_blend_mode_override() {
        let mut target = HasBlendMode { blend_mode: None };
        let options = HasBlendModeOptions {
            blend_mode: Some(String::from("Add")),
        };
        init_blend_mode_trait(&mut target, Some(&options));
        assert_eq!(target.blend_mode.as_deref(), Some("Add"));
    }
}

use super::*;

mod create_text_layout_context {
    use super::*;

    #[test]
    fn creates_an_empty_caller_owned_context() {
        let context = create_text_layout_context(None);
        let context = context.read().unwrap();
        assert!(context.guard.is_none());
        assert!(context.host_text_shaper.is_none());
    }
}

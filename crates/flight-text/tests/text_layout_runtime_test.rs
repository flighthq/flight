use std::sync::Arc;

use super::*;

mod clear_text_layout_result {
    use super::*;

    #[test]
    fn clears_the_attached_layout_result() {
        let mut runtime = create_text_label_runtime();
        get_text_layout_result(&mut runtime);
        clear_text_layout_result(&mut runtime);
        assert!(runtime.text_layout.is_none());
    }
}

mod get_text_layout_result {
    use super::*;

    #[test]
    fn attaches_a_layout_result_to_runtime_state() {
        let mut runtime = create_text_label_runtime();
        let result = get_text_layout_result(&mut runtime);
        assert!(Arc::ptr_eq(runtime.text_layout.as_ref().unwrap(), &result));
    }

    #[test]
    fn reuses_an_existing_layout_result() {
        let mut runtime = create_text_label_runtime();
        let result = get_text_layout_result(&mut runtime);
        assert!(Arc::ptr_eq(&get_text_layout_result(&mut runtime), &result));
    }
}

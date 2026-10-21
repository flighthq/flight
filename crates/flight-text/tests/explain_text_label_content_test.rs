use flight_node::NodeRef;

use super::*;

mod explain_text_label_content {
    use super::*;

    #[test]
    fn includes_the_content_revision() {
        let label = create_text_label(None);
        let r0 = explain_text_label_content(&*label.read().unwrap()).revision;
        set_text_label_string(&label, "bumped");
        let r1 = explain_text_label_content(&*label.read().unwrap()).revision;
        assert!(r1 > r0);
    }

    #[test]
    fn reports_agreement_after_set_text_label_string_and_layout() {
        let label = measured_text_label("");
        set_text_label_string(&label, "hello");
        let node: NodeRef = label.clone();
        ensure_text_layout(&node);
        let explanation = explain_text_label_content(&*label.read().unwrap());
        assert!(explanation.agreement);
        assert_eq!(explanation.live_string, "hello");
        assert_eq!(explanation.rasterized_string.as_deref(), Some("hello"));
    }

    #[test]
    fn reports_agreement_when_no_layout_has_been_computed_yet() {
        let label = measured_text_label("hello");
        let explanation = explain_text_label_content(&*label.read().unwrap());
        assert!(explanation.agreement);
        assert_eq!(explanation.live_string, "hello");
        assert!(explanation.rasterized_string.is_none());
    }

    #[test]
    fn reports_disagreement_when_data_text_is_mutated_without_setter() {
        let label = measured_text_label("");
        set_text_label_string(&label, "before");
        let node: NodeRef = label.clone();
        ensure_text_layout(&node);
        label.write().unwrap().data.text = "after".to_string();
        let explanation = explain_text_label_content(&*label.read().unwrap());
        assert!(!explanation.agreement);
        assert_eq!(explanation.live_string, "after");
        assert_eq!(explanation.rasterized_string.as_deref(), Some("before"));
    }
}

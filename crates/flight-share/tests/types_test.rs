use crate::common::*;
use flight_share::contract::*;

mod host_share_capabilities {
    use super::*;
    #[test]
    fn preserves_independent_optional_content_and_files_slots() {
        let absent = HostShareCapabilities {
            content: None,
            files: None,
        };
        assert!(absent.content.is_none() && absent.files.is_none());
        let content_only = HostShareCapabilities {
            content: Some(content_host()),
            files: None,
        };
        assert!(content_only.content.is_some() && content_only.files.is_none());
        let files_only = HostShareCapabilities {
            content: None,
            files: Some(files_host()),
        };
        assert!(files_only.content.is_none() && files_only.files.is_some());
    }
}

mod share_content {
    use super::*;
    #[test]
    fn preserves_absent_and_explicit_empty_optional_fields_in_every_arm() {
        let title = ShareTitleContent {
            text: None,
            title: "title".to_string(),
            url: Some(String::new()),
        };
        let text = ShareTextContent {
            text: "text".to_string(),
            title: None,
            url: Some(String::new()),
        };
        let url = ShareUrlContent {
            text: None,
            title: Some(String::new()),
            url: "url".to_string(),
        };
        assert!(title.text.is_none());
        assert_eq!(title.url.as_deref(), Some(""));
        assert!(text.title.is_none());
        assert_eq!(text.url.as_deref(), Some(""));
        assert!(url.text.is_none());
        assert_eq!(url.title.as_deref(), Some(""));
    }
}

mod share_files_content {
    use super::*;
    #[test]
    fn keeps_all_optional_vectors_and_descriptor_order() {
        let first = share_file();
        let second = share_file();
        let payload = ShareFilesContent {
            files: vec![first.clone(), second.clone()],
            text: Some(String::new()),
            title: None,
            url: Some("url".to_string()),
        };
        assert!(std::sync::Arc::ptr_eq(&payload.files[0], &first));
        assert!(std::sync::Arc::ptr_eq(&payload.files[1], &second));
        assert_eq!(payload.text.as_deref(), Some(""));
        assert!(payload.title.is_none());
        assert_eq!(payload.url.as_deref(), Some("url"));
    }
}

mod share_result {
    use super::*;
    #[test]
    fn keeps_source_null_distinct_from_an_empty_activity_name() {
        let null = ShareResult {
            completed: false,
            activity_type: None,
            dismissed: false,
        };
        let empty = ShareResult {
            completed: false,
            activity_type: Some(String::new()),
            dismissed: false,
        };
        assert_ne!(null, empty);
    }
}

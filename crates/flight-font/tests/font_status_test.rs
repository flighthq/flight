use std::sync::atomic::Ordering;

use flight_font::contract::*;

use crate::support::*;

mod is_font_loaded {
    use super::*;

    #[test]
    fn queries_the_backend_with_the_family_shorthand() {
        let (backend, record) = backend();
        assert!(is_font_loaded(&backend, "MyFont", None));
        assert_eq!(&*record.checked.lock().unwrap(), &["1em 'MyFont'"]);
    }

    #[test]
    fn includes_the_style_when_provided() {
        let (backend, record) = backend();
        assert!(is_font_loaded(&backend, "MyFont", Some("italic")));
        assert_eq!(&*record.checked.lock().unwrap(), &["italic 1em 'MyFont'"]);
    }

    #[test]
    fn escapes_single_quotes_in_the_family_name() {
        let (backend, record) = backend();
        assert!(is_font_loaded(&backend, "Josh's Font", None));
        assert_eq!(&*record.checked.lock().unwrap(), &["1em 'Josh\\'s Font'"]);
    }

    #[test]
    fn returns_false_when_the_font_is_not_available() {
        let (backend, _record) = backend();
        assert!(!is_font_loaded(&backend, "Absent", None));
    }
}

mod when_fonts_ready {
    use super::*;

    #[test]
    fn resolves_once_the_backend_reports_ready() {
        let (backend, record) = backend();
        block_on(when_fonts_ready(&backend)).unwrap();
        assert_eq!(record.ready_count.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn propagates_the_backends_rejection_unchanged() {
        let (backend, record) = backend();
        *record.ready_error.lock().unwrap() = Some(rejection("not ready"));
        let error = block_on(when_fonts_ready(&backend)).err().unwrap();
        assert_eq!(rejection_message(&error), Some("not ready"));
    }
}

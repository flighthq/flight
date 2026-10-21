use crate::common::response;
use flight_net::contract::*;
use std::sync::Arc;

mod explain_net_response {
    use super::*;
    #[test]
    fn derives_abort_and_timeout_reasons_from_transport_status_text() {
        for (text, expected) in [
            ("aborted", NetResponseExplanationReason::Aborted),
            ("timeout", NetResponseExplanationReason::Timeout),
        ] {
            let explanation = explain_net_response(&response(0, text, None)).unwrap();
            assert_eq!(explanation.reason, expected);
            assert_eq!(explanation.status, 0);
        }
    }
    #[test]
    fn distinguishes_generic_transport_and_decode_failures() {
        let transport = explain_net_response(&response(0, "Failed to fetch", None)).unwrap();
        assert_eq!(
            transport.reason,
            NetResponseExplanationReason::TransportFailure
        );
        assert_eq!(transport.status_text, "Failed to fetch");
        let decode = explain_net_response(&response(200, "OK", None)).unwrap();
        assert_eq!(decode.reason, NetResponseExplanationReason::DecodeFailure);
        assert_eq!(decode.status, 200);
    }
    #[test]
    fn returns_none_for_non_null_bodies_including_empty_text_false_and_zero() {
        for body in [
            Some(Arc::new("ok".to_string()) as Arc<dyn std::any::Any + Send + Sync>),
            Some(Arc::new(String::new())),
            Some(Arc::new(false)),
            Some(Arc::new(0u32)),
        ] {
            assert!(explain_net_response(&response(200, "OK", body)).is_none());
        }
    }
    #[test]
    fn gives_status_zero_precedence_and_retains_original_metadata() {
        let mut value = response(
            0,
            " \u{FEFF}TiMeOuT\u{3000} ",
            Some(Arc::new("body".to_string())),
        );
        value.url = "final-url".to_string();
        value.ok = true;
        let explanation = explain_net_response(&value).unwrap();
        assert_eq!(explanation.reason, NetResponseExplanationReason::Timeout);
        assert_eq!(explanation.status_text, value.status_text);
        assert_eq!(explanation.url, "final-url");
        assert!(value.ok);
    }
    #[test]
    fn uses_javascript_trim_instead_of_trimming_non_ecmascript_nel() {
        assert_eq!(
            explain_net_response(&response(0, "\u{0085}aborted\u{0085}", None))
                .unwrap()
                .reason,
            NetResponseExplanationReason::TransportFailure
        );
        assert_eq!(
            explain_net_response(&response(0, "\u{FEFF}ABORTED\u{FEFF}", None))
                .unwrap()
                .reason,
            NetResponseExplanationReason::Aborted
        );
    }
}

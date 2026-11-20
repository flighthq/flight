use flight_host_net::*;
use flight_net::{NetResponse, NetResponseBody};

use crate::support::create_headers;

fn create_response(status: u32, status_text: &str) -> NetResponse {
    return NetResponse {
        status,
        status_text: status_text.to_string(),
        ok: false,
        headers: create_headers(&[]),
        body: if status == 0 {
            None
        } else {
            Some(NetResponseBody::Text(String::new()))
        },
        url: "http://127.0.0.1/".to_string(),
    };
}

const REASONS: [NetHostResponseExplanationReason; 12] = [
    NetHostResponseExplanationReason::Aborted,
    NetHostResponseExplanationReason::Timeout,
    NetHostResponseExplanationReason::HostDestroyed,
    NetHostResponseExplanationReason::InvalidRequest,
    NetHostResponseExplanationReason::UnsupportedScheme,
    NetHostResponseExplanationReason::HostNotFound,
    NetHostResponseExplanationReason::ConnectionFailed,
    NetHostResponseExplanationReason::RedirectRejected,
    NetHostResponseExplanationReason::TooManyRedirects,
    NetHostResponseExplanationReason::TlsFailure,
    NetHostResponseExplanationReason::ProtocolError,
    NetHostResponseExplanationReason::NetworkError,
];

mod explain_net_host_response {
    use super::*;

    #[test]
    fn round_trips_every_reason_through_its_status_text() {
        for reason in REASONS {
            let response = create_response(0, get_net_host_response_status_text(reason));
            let explanation = explain_net_host_response(&response).unwrap();
            assert_eq!(explanation.reason, reason);
            assert_eq!(explanation.url, "http://127.0.0.1/");
        }
    }

    #[test]
    fn ignores_nonzero_statuses_and_foreign_status_texts() {
        assert_eq!(
            explain_net_host_response(&create_response(200, "aborted")),
            None
        );
        assert_eq!(
            explain_net_host_response(&create_response(0, "Failed to fetch")),
            None
        );
        assert_eq!(
            explain_net_host_response(&create_response(0, "Aborted")),
            None
        );
    }
}

mod get_net_host_response_status_text {
    use super::*;

    #[test]
    fn gives_each_reason_a_distinct_text() {
        let mut texts: Vec<&str> = REASONS
            .iter()
            .map(|reason| get_net_host_response_status_text(*reason))
            .collect();
        texts.sort_unstable();
        texts.dedup();
        assert_eq!(texts.len(), REASONS.len());
        assert_eq!(
            get_net_host_response_status_text(NetHostResponseExplanationReason::Aborted),
            "aborted"
        );
        assert_eq!(
            get_net_host_response_status_text(NetHostResponseExplanationReason::Timeout),
            "timeout"
        );
    }
}

//! Why a net host answered with a status-0 response: a separately importable explainer that reads
//! the canonical status text the host wrote.

use flight_net::NetResponse;

use crate::types::*;

/// Reports why `response` is a net host transport failure, or `None` when it is not one: a nonzero
/// status, or a status text no net host writes. The decode-failure sentinel (a nonzero status
/// with no body) is explained by `flight_net::explain_net_response`.
pub fn explain_net_host_response(response: &NetResponse) -> Option<NetHostResponseExplanation> {
    if response.status != 0 {
        return None;
    }
    let reason = NET_HOST_RESPONSE_REASONS
        .iter()
        .copied()
        .find(|reason| get_net_host_response_status_text(*reason) == response.status_text)?;
    return Some(NetHostResponseExplanation {
        reason,
        url: response.url.clone(),
    });
}

/// The canonical status text a net host writes for each failure reason. `aborted` and `timeout`
/// are the texts `flight_net::explain_net_response` recognizes.
pub fn get_net_host_response_status_text(reason: NetHostResponseExplanationReason) -> &'static str {
    return match reason {
        NetHostResponseExplanationReason::Aborted => "aborted",
        NetHostResponseExplanationReason::Timeout => "timeout",
        NetHostResponseExplanationReason::HostDestroyed => "host destroyed",
        NetHostResponseExplanationReason::InvalidRequest => "invalid request",
        NetHostResponseExplanationReason::UnsupportedScheme => "unsupported scheme",
        NetHostResponseExplanationReason::HostNotFound => "host not found",
        NetHostResponseExplanationReason::ConnectionFailed => "connection failed",
        NetHostResponseExplanationReason::RedirectRejected => "redirect rejected",
        NetHostResponseExplanationReason::TooManyRedirects => "too many redirects",
        NetHostResponseExplanationReason::TlsFailure => "tls failure",
        NetHostResponseExplanationReason::ProtocolError => "protocol error",
        NetHostResponseExplanationReason::NetworkError => "network error",
    };
}

const NET_HOST_RESPONSE_REASONS: [NetHostResponseExplanationReason; 12] = [
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

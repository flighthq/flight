/// Open source method domain, including vendor-defined verbs without normalization.
pub type NetMethod = String;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetCredentials {
    Omit,
    SameOrigin,
    Include,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetGuardOperation {
    SendNetRequest,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetGuardReason {
    BodyOnGetOrHead,
    NegativeTimeout,
    ProgressNotEmitted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetProgressPhase {
    Upload,
    Download,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetRedirect {
    Follow,
    Error,
    Manual,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetResponseExplanationReason {
    Aborted,
    DecodeFailure,
    Timeout,
    TransportFailure,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NetResponseType {
    Text,
    Json,
    ArrayBuffer,
    Blob,
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetCredentials; no source helper exists
pub fn get_net_credentials_string(value: NetCredentials) -> &'static str {
    return match value {
        NetCredentials::Omit => "omit",
        NetCredentials::SameOrigin => "same-origin",
        NetCredentials::Include => "include",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetGuardOperation; no source helper exists
pub fn get_net_guard_operation_string(value: NetGuardOperation) -> &'static str {
    return match value {
        NetGuardOperation::SendNetRequest => "sendNetRequest",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetGuardReason; no source helper exists
pub fn get_net_guard_reason_string(value: NetGuardReason) -> &'static str {
    return match value {
        NetGuardReason::BodyOnGetOrHead => "body-on-get-or-head",
        NetGuardReason::NegativeTimeout => "negative-timeout",
        NetGuardReason::ProgressNotEmitted => "progress-not-emitted",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetProgressPhase; no source helper exists
pub fn get_net_progress_phase_string(value: NetProgressPhase) -> &'static str {
    return match value {
        NetProgressPhase::Upload => "upload",
        NetProgressPhase::Download => "download",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetRedirect; no source helper exists
pub fn get_net_redirect_string(value: NetRedirect) -> &'static str {
    return match value {
        NetRedirect::Follow => "follow",
        NetRedirect::Error => "error",
        NetRedirect::Manual => "manual",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetResponseExplanationReason; no source helper exists
pub fn get_net_response_explanation_reason_string(
    value: NetResponseExplanationReason,
) -> &'static str {
    return match value {
        NetResponseExplanationReason::Aborted => "aborted",
        NetResponseExplanationReason::DecodeFailure => "decode-failure",
        NetResponseExplanationReason::Timeout => "timeout",
        NetResponseExplanationReason::TransportFailure => "transport-failure",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetResponseType; no source helper exists
pub fn get_net_response_type_string(value: NetResponseType) -> &'static str {
    return match value {
        NetResponseType::Text => "text",
        NetResponseType::Json => "json",
        NetResponseType::ArrayBuffer => "arraybuffer",
        NetResponseType::Blob => "blob",
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetCredentials; no source helper exists
pub fn parse_net_credentials(value: &str) -> Option<NetCredentials> {
    return match value {
        "omit" => Some(NetCredentials::Omit),
        "same-origin" => Some(NetCredentials::SameOrigin),
        "include" => Some(NetCredentials::Include),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetGuardOperation; no source helper exists
pub fn parse_net_guard_operation(value: &str) -> Option<NetGuardOperation> {
    return match value {
        "sendNetRequest" => Some(NetGuardOperation::SendNetRequest),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetGuardReason; no source helper exists
pub fn parse_net_guard_reason(value: &str) -> Option<NetGuardReason> {
    return match value {
        "body-on-get-or-head" => Some(NetGuardReason::BodyOnGetOrHead),
        "negative-timeout" => Some(NetGuardReason::NegativeTimeout),
        "progress-not-emitted" => Some(NetGuardReason::ProgressNotEmitted),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetProgressPhase; no source helper exists
pub fn parse_net_progress_phase(value: &str) -> Option<NetProgressPhase> {
    return match value {
        "upload" => Some(NetProgressPhase::Upload),
        "download" => Some(NetProgressPhase::Download),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetRedirect; no source helper exists
pub fn parse_net_redirect(value: &str) -> Option<NetRedirect> {
    return match value {
        "follow" => Some(NetRedirect::Follow),
        "error" => Some(NetRedirect::Error),
        "manual" => Some(NetRedirect::Manual),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetResponseExplanationReason; no source helper exists
pub fn parse_net_response_explanation_reason(value: &str) -> Option<NetResponseExplanationReason> {
    return match value {
        "aborted" => Some(NetResponseExplanationReason::Aborted),
        "decode-failure" => Some(NetResponseExplanationReason::DecodeFailure),
        "timeout" => Some(NetResponseExplanationReason::Timeout),
        "transport-failure" => Some(NetResponseExplanationReason::TransportFailure),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact string table for types/Net.ts NetResponseType; no source helper exists
pub fn parse_net_response_type(value: &str) -> Option<NetResponseType> {
    return match value {
        "text" => Some(NetResponseType::Text),
        "json" => Some(NetResponseType::Json),
        "arraybuffer" => Some(NetResponseType::ArrayBuffer),
        "blob" => Some(NetResponseType::Blob),
        _ => None,
    };
}

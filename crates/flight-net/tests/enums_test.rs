use flight_net::contract::*;

mod get_net_credentials_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(get_net_credentials_string(NetCredentials::Omit), "omit");
        assert_eq!(
            get_net_credentials_string(NetCredentials::SameOrigin),
            "same-origin"
        );
        assert_eq!(
            get_net_credentials_string(NetCredentials::Include),
            "include"
        );
    }
}

mod get_net_guard_operation_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_net_guard_operation_string(NetGuardOperation::SendNetRequest),
            "sendNetRequest"
        );
    }
}

mod get_net_guard_reason_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_net_guard_reason_string(NetGuardReason::BodyOnGetOrHead),
            "body-on-get-or-head"
        );
        assert_eq!(
            get_net_guard_reason_string(NetGuardReason::NegativeTimeout),
            "negative-timeout"
        );
        assert_eq!(
            get_net_guard_reason_string(NetGuardReason::ProgressNotEmitted),
            "progress-not-emitted"
        );
    }
}

mod get_net_progress_phase_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_net_progress_phase_string(NetProgressPhase::Upload),
            "upload"
        );
        assert_eq!(
            get_net_progress_phase_string(NetProgressPhase::Download),
            "download"
        );
    }
}

mod get_net_redirect_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(get_net_redirect_string(NetRedirect::Follow), "follow");
        assert_eq!(get_net_redirect_string(NetRedirect::Error), "error");
        assert_eq!(get_net_redirect_string(NetRedirect::Manual), "manual");
    }
}

mod get_net_response_explanation_reason_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(
            get_net_response_explanation_reason_string(NetResponseExplanationReason::Aborted),
            "aborted"
        );
        assert_eq!(
            get_net_response_explanation_reason_string(NetResponseExplanationReason::DecodeFailure),
            "decode-failure"
        );
        assert_eq!(
            get_net_response_explanation_reason_string(NetResponseExplanationReason::Timeout),
            "timeout"
        );
        assert_eq!(
            get_net_response_explanation_reason_string(
                NetResponseExplanationReason::TransportFailure
            ),
            "transport-failure"
        );
    }
}

mod get_net_response_type_string {
    use super::*;
    #[test]
    fn returns_every_exact_source_literal() {
        assert_eq!(get_net_response_type_string(NetResponseType::Text), "text");
        assert_eq!(get_net_response_type_string(NetResponseType::Json), "json");
        assert_eq!(
            get_net_response_type_string(NetResponseType::ArrayBuffer),
            "arraybuffer"
        );
        assert_eq!(get_net_response_type_string(NetResponseType::Blob), "blob");
    }
}

mod parse_net_credentials {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(parse_net_credentials("omit"), Some(NetCredentials::Omit));
        assert_eq!(
            parse_net_credentials("same-origin"),
            Some(NetCredentials::SameOrigin)
        );
        assert_eq!(
            parse_net_credentials("include"),
            Some(NetCredentials::Include)
        );
        for invalid in ["", "UNKNOWN", " omit", "omit "] {
            assert_eq!(parse_net_credentials(invalid), None);
        }
    }
}

mod parse_net_guard_operation {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_net_guard_operation("sendNetRequest"),
            Some(NetGuardOperation::SendNetRequest)
        );
        for invalid in ["", "UNKNOWN", " sendNetRequest", "sendNetRequest "] {
            assert_eq!(parse_net_guard_operation(invalid), None);
        }
    }
}

mod parse_net_guard_reason {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_net_guard_reason("body-on-get-or-head"),
            Some(NetGuardReason::BodyOnGetOrHead)
        );
        assert_eq!(
            parse_net_guard_reason("negative-timeout"),
            Some(NetGuardReason::NegativeTimeout)
        );
        assert_eq!(
            parse_net_guard_reason("progress-not-emitted"),
            Some(NetGuardReason::ProgressNotEmitted)
        );
        for invalid in [
            "",
            "UNKNOWN",
            " body-on-get-or-head",
            "body-on-get-or-head ",
        ] {
            assert_eq!(parse_net_guard_reason(invalid), None);
        }
    }
}

mod parse_net_progress_phase {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_net_progress_phase("upload"),
            Some(NetProgressPhase::Upload)
        );
        assert_eq!(
            parse_net_progress_phase("download"),
            Some(NetProgressPhase::Download)
        );
        for invalid in ["", "UNKNOWN", " upload", "upload "] {
            assert_eq!(parse_net_progress_phase(invalid), None);
        }
    }
}

mod parse_net_redirect {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(parse_net_redirect("follow"), Some(NetRedirect::Follow));
        assert_eq!(parse_net_redirect("error"), Some(NetRedirect::Error));
        assert_eq!(parse_net_redirect("manual"), Some(NetRedirect::Manual));
        for invalid in ["", "UNKNOWN", " follow", "follow "] {
            assert_eq!(parse_net_redirect(invalid), None);
        }
    }
}

mod parse_net_response_explanation_reason {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_net_response_explanation_reason("aborted"),
            Some(NetResponseExplanationReason::Aborted)
        );
        assert_eq!(
            parse_net_response_explanation_reason("decode-failure"),
            Some(NetResponseExplanationReason::DecodeFailure)
        );
        assert_eq!(
            parse_net_response_explanation_reason("timeout"),
            Some(NetResponseExplanationReason::Timeout)
        );
        assert_eq!(
            parse_net_response_explanation_reason("transport-failure"),
            Some(NetResponseExplanationReason::TransportFailure)
        );
        for invalid in ["", "UNKNOWN", " aborted", "aborted "] {
            assert_eq!(parse_net_response_explanation_reason(invalid), None);
        }
    }
}

mod parse_net_response_type {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(parse_net_response_type("text"), Some(NetResponseType::Text));
        assert_eq!(parse_net_response_type("json"), Some(NetResponseType::Json));
        assert_eq!(
            parse_net_response_type("arraybuffer"),
            Some(NetResponseType::ArrayBuffer)
        );
        assert_eq!(parse_net_response_type("blob"), Some(NetResponseType::Blob));
        for invalid in ["", "UNKNOWN", " text", "text "] {
            assert_eq!(parse_net_response_type(invalid), None);
        }
    }
}

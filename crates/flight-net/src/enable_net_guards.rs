use crate::NetGuardReason;

pub(crate) fn format_net_guard_message(method: &str, reason: NetGuardReason) -> String {
    return match reason {
        NetGuardReason::BodyOnGetOrHead => format!("sendNetRequest: {} requests do not carry a body — remove request.body or use a body-bearing method", method.to_uppercase()),
        NetGuardReason::NegativeTimeout => "sendNetRequest: timeoutMs is negative, so the capability cannot schedule a timeout — pass zero or a positive duration".to_string(),
        NetGuardReason::ProgressNotEmitted => "sendNetRequest: the capability completed successfully without emitting the supplied progress signal — use a capability that supports download progress".to_string(),
    };
}

#[cfg(test)]
mod message_tests {
    use super::*;

    #[test]
    fn retains_all_three_source_guidance_strings_and_normalizes_only_displayed_method() {
        assert_eq!(
            format_net_guard_message("gEt", NetGuardReason::BodyOnGetOrHead),
            "sendNetRequest: GET requests do not carry a body — remove request.body or use a body-bearing method"
        );
        assert_eq!(
            format_net_guard_message("HEAD", NetGuardReason::NegativeTimeout),
            "sendNetRequest: timeoutMs is negative, so the capability cannot schedule a timeout — pass zero or a positive duration"
        );
        assert_eq!(
            format_net_guard_message("vendor", NetGuardReason::ProgressNotEmitted),
            "sendNetRequest: the capability completed successfully without emitting the supplied progress signal — use a capability that supports download progress"
        );
    }
}

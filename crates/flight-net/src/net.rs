use crate::enums::NetResponseExplanationReason;
use crate::types::{NetResponse, NetResponseExplanation};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::Record;
    use std::sync::{Arc, RwLock};

    #[test]
    fn explain_matches_the_free_sentinel_and_preserves_original_metadata() {
        let response = NetResponse {
            status: 0,
            status_text: " AbOrTeD ".to_string(),
            ok: false,
            headers: Arc::new(RwLock::new(Record::default())),
            body: None,
            url: "original URL".to_string(),
        };
        assert_eq!(response.explain(), explain_net_response(&response));
        assert_eq!(
            response.explain().unwrap().reason,
            NetResponseExplanationReason::Aborted
        );
    }
}

pub fn explain_net_response(response: &NetResponse) -> Option<NetResponseExplanation> {
    let reason = if response.status == 0 {
        let status_text = response
            .status_text
            .trim_matches(is_javascript_whitespace)
            .to_lowercase();
        match status_text.as_str() {
            "aborted" => NetResponseExplanationReason::Aborted,
            "timeout" => NetResponseExplanationReason::Timeout,
            _ => NetResponseExplanationReason::TransportFailure,
        }
    } else if response.body.is_none() {
        NetResponseExplanationReason::DecodeFailure
    } else {
        return None;
    };
    return Some(NetResponseExplanation {
        reason,
        status: response.status,
        status_text: response.status_text.clone(),
        url: response.url.clone(),
    });
}

fn is_javascript_whitespace(character: char) -> bool {
    return matches!(character, '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}');
}

impl NetResponse {
    pub fn explain(&self) -> Option<NetResponseExplanation> {
        return explain_net_response(self);
    }
}

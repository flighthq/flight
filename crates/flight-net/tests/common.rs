use flight_entity::{Record, Unknown, set_record_value};
use flight_net::contract::*;
use std::sync::{Arc, RwLock};

// flight-lint: allow(test-default-call) canonical Record is plain dictionary data with no Entity factory
pub(crate) fn fields(pairs: &[(&str, &str)]) -> Record<String> {
    let mut fields = Record::default();
    for (key, value) in pairs {
        set_record_value(&mut fields, key.to_string(), value.to_string());
    }
    return fields;
}

// flight-lint: allow(test-default-call) canonical headers are a plain Record with no Entity allocation
pub(crate) fn response(status: u32, status_text: &str, body: Unknown) -> NetResponse {
    return NetResponse {
        status,
        status_text: status_text.to_string(),
        ok: status >= 200 && status < 300,
        headers: Arc::new(RwLock::new(Record::default())),
        body,
        url: "u".to_string(),
    };
}

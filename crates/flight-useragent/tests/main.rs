use std::sync::Arc;

use flight_entity::{Record, Unknown, set_record_value};

fn record(entries: Vec<(&str, Unknown)>) -> Record<Unknown> {
    let mut out = Record::default();
    for (key, value) in entries {
        set_record_value(&mut out, key.to_string(), value);
    }
    return out;
}

fn object(entries: Vec<(&str, Unknown)>) -> Unknown {
    return Some(Arc::new(record(entries)));
}

fn text(value: &str) -> Unknown {
    return Some(Arc::new(value.to_string()));
}

#[path = "user_agent_native_test.rs"]
mod flight_useragent_user_agent_native_test;
#[path = "user_agent_parse_test.rs"]
mod flight_useragent_user_agent_parse_test;
#[path = "user_agent_test.rs"]
mod flight_useragent_user_agent_test;

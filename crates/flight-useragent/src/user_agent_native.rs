//! flight-compiler: target-native
//! Target-specific byte-order probe used by the otherwise portable user-agent parser.

use flight_entity::get_record_value;
pub(crate) use flight_entity::{Record, Unknown};
pub(crate) use flight_platform::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime,
};

pub(crate) type UserAgentRuntimeWindow<'a> = Option<&'a Record<Unknown>>;

pub(crate) fn detect_endianness_native() -> PlatformEndianness {
    let bytes = 0x0102_u16.to_ne_bytes();
    if bytes[0] == 0x01 {
        return PlatformEndianness::Big;
    }
    if bytes[0] == 0x02 {
        return PlatformEndianness::Little;
    }
    return PlatformEndianness::Unknown;
}

fn get_property<'a>(value: Option<&'a Unknown>, key: &str) -> Option<&'a Unknown> {
    let value = value?.as_ref()?;
    let record = value.downcast_ref::<Record<Unknown>>()?;
    return get_record_value(record, key);
}

// flight-lint: allow(f64) TS `number` values in an `unknown` slot arrive as f64; NaN and 0 are falsy as in JS
fn is_truthy(value: Option<&Unknown>) -> bool {
    let Some(Some(value)) = value else {
        return false;
    };
    if let Some(b) = value.downcast_ref::<bool>() {
        return *b;
    }
    if let Some(s) = value.downcast_ref::<String>() {
        return !s.is_empty();
    }
    if let Some(s) = value.downcast_ref::<&'static str>() {
        return !s.is_empty();
    }
    if let Some(n) = value.downcast_ref::<f64>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<f32>() {
        return *n != 0.0 && !n.is_nan();
    }
    if let Some(n) = value.downcast_ref::<i32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<i64>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u32>() {
        return *n != 0;
    }
    if let Some(n) = value.downcast_ref::<u64>() {
        return *n != 0;
    }
    return true;
}

pub(crate) fn parse_user_agent_runtime_native(win: UserAgentRuntimeWindow<'_>) -> PlatformRuntime {
    let Some(win) = win else {
        return PlatformRuntime::Unknown;
    };
    let versions = get_property(get_record_value(win, "process"), "versions");
    if is_truthy(versions) && is_truthy(get_property(versions, "electron")) {
        return PlatformRuntime::Electron;
    }
    if is_truthy(get_record_value(win, "__TAURI__")) {
        return PlatformRuntime::Tauri;
    }
    if is_truthy(get_record_value(win, "Capacitor")) {
        return PlatformRuntime::Capacitor;
    }
    return PlatformRuntime::Web;
}

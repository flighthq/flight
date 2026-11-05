//! Target-specific byte-order probe used by the otherwise portable user-agent parser.

use flight_entity::get_record_value;
pub(crate) use flight_entity::{Record, Unknown};
pub(crate) use flight_platform::{
    PlatformEndianness, PlatformEngine, PlatformKind, PlatformName, PlatformRuntime,
};

use crate::user_agent_truthy::is_truthy;

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

pub(crate) fn parse_user_agent_runtime_native(win: UserAgentRuntimeWindow<'_>) -> PlatformRuntime {
    let Some(win) = win else {
        return PlatformRuntime::Unknown;
    };
    let versions = get_property(get_record_value(win, "process"), "versions");
    if is_truthy(versions.cloned()) && is_truthy(get_property(versions, "electron").cloned()) {
        return PlatformRuntime::Electron;
    }
    if is_truthy(get_record_value(win, "__TAURI__").cloned()) {
        return PlatformRuntime::Tauri;
    }
    if is_truthy(get_record_value(win, "Capacitor").cloned()) {
        return PlatformRuntime::Capacitor;
    }
    return PlatformRuntime::Web;
}

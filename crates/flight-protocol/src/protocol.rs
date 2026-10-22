use std::sync::Arc;

use flight_entity::{Record, allocate_entity, entries, set_record_value};
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Mutex;

    use flight_host::ProviderRef;
    use flight_signals::{connect_signal, has_signal_slots};

    use super::*;

    fn default_capability() -> HostProtocolDefaultCapability {
        return HostProtocolDefaultCapability {
            provider: provider_ref(),
            is_default: Arc::new(|scheme: &str| scheme == "flight"),
            remove_as_default: Arc::new(|scheme: &str| scheme == "flight"),
            set_as_default: Arc::new(|scheme: &str| scheme == "flight"),
        };
    }

    fn open_capability(count: Arc<Mutex<usize>>) -> HostProtocolOpenCapability {
        return HostProtocolOpenCapability {
            provider: provider_ref(),
            subscribe: Arc::new(move |_listener: ProtocolOpenListener| {
                *count.lock().unwrap() += 1;
                let release: ProtocolUnsubscribe = Arc::new(|| {});
                return release;
            }),
        };
    }

    fn provider_ref() -> ProviderRef {
        return Arc::new(());
    }

    fn registration_capability() -> HostProtocolRegistrationCapability {
        return HostProtocolRegistrationCapability {
            provider: provider_ref(),
            get_registered_schemes: Arc::new(|| vec!["flight".to_string()]),
            register: Arc::new(|scheme: &str| scheme != "fail"),
        };
    }

    fn unregistration_capability() -> HostProtocolUnregistrationCapability {
        return HostProtocolUnregistrationCapability {
            provider: provider_ref(),
            unregister: Arc::new(|scheme: &str| scheme != "fail"),
        };
    }

    #[test]
    fn host_protocol_default_capability_is_scheme_default_matches_free_function() {
        let capability = default_capability();
        assert_eq!(
            capability.is_scheme_default("flight"),
            is_protocol_scheme_default(&capability, "flight")
        );
        assert!(capability.is_scheme_default("flight"));
    }

    #[test]
    fn host_protocol_default_capability_remove_scheme_as_default_matches_free_function() {
        let capability = default_capability();
        assert_eq!(
            capability.remove_scheme_as_default("flight"),
            remove_protocol_scheme_as_default(&capability, "flight")
        );
        assert!(capability.remove_scheme_as_default("flight"));
    }

    #[test]
    fn host_protocol_default_capability_set_scheme_as_default_matches_free_function() {
        let capability = default_capability();
        assert_eq!(
            capability.set_scheme_as_default("flight"),
            set_protocol_scheme_as_default(&capability, "flight")
        );
        assert!(capability.set_scheme_as_default("flight"));
    }

    #[test]
    fn host_protocol_launch_capability_launch_url_matches_free_function() {
        let capability = HostProtocolLaunchCapability {
            provider: provider_ref(),
            get_launch_url: Arc::new(|| Some("flight://open".to_string())),
        };
        assert_eq!(
            capability.launch_url(),
            get_protocol_launch_url(&capability)
        );
        assert_eq!(capability.launch_url(), Some("flight://open".to_string()));
    }

    #[test]
    fn host_protocol_open_capability_attach_handler_matches_free_function() {
        let count = Arc::new(Mutex::new(0));
        let capability = open_capability(count.clone());
        let mut a = create_protocol_handler();
        let mut b = create_protocol_handler();
        capability.attach_handler(&mut a);
        attach_protocol_handler(&capability, &mut b);
        assert_eq!(a.subscription.is_some(), b.subscription.is_some());
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn host_protocol_registration_capability_register_scheme_matches_free_function() {
        let capability = registration_capability();
        assert_eq!(
            capability.register_scheme("flight"),
            register_protocol_scheme(&capability, "flight")
        );
        assert!(capability.register_scheme("flight"));
    }

    #[test]
    fn host_protocol_registration_capability_register_schemes_matches_free_function() {
        let capability = registration_capability();
        let schemes = vec!["flight".to_string(), "fail".to_string()];
        assert_eq!(
            capability.register_schemes(&schemes),
            register_protocol_schemes(&capability, &schemes)
        );
        assert!(!capability.register_schemes(&schemes));
    }

    #[test]
    fn host_protocol_registration_capability_registered_schemes_matches_free_function() {
        let capability = registration_capability();
        let (mut method, mut free) = (Vec::new(), Vec::new());
        capability.registered_schemes(&mut method);
        get_registered_protocol_schemes(&mut free, &capability);
        assert_eq!(method, free);
        assert_eq!(method, vec!["flight".to_string()]);
    }

    #[test]
    fn host_protocol_registration_query_capability_is_scheme_registered_matches_free_function() {
        let capability = HostProtocolRegistrationQueryCapability {
            provider: provider_ref(),
            is_registered: Arc::new(|scheme: &str| scheme == "flight"),
        };
        assert_eq!(
            capability.is_scheme_registered("flight"),
            is_protocol_scheme_registered(&capability, "flight")
        );
        assert!(capability.is_scheme_registered("flight"));
    }

    #[test]
    fn host_protocol_unregistration_capability_unregister_scheme_matches_free_function() {
        let capability = unregistration_capability();
        assert_eq!(
            capability.unregister_scheme("flight"),
            unregister_protocol_scheme(&capability, "flight")
        );
        assert!(capability.unregister_scheme("flight"));
    }

    #[test]
    fn host_protocol_unregistration_capability_unregister_schemes_matches_free_function() {
        let capability = unregistration_capability();
        let schemes = vec!["flight".to_string(), "fail".to_string()];
        assert_eq!(
            capability.unregister_schemes(&schemes),
            unregister_protocol_schemes(&capability, &schemes)
        );
        assert!(!capability.unregister_schemes(&schemes));
    }

    #[test]
    fn protocol_handler_detach_matches_free_function() {
        let count = Arc::new(Mutex::new(0));
        let capability = open_capability(count);
        let mut a = create_protocol_handler();
        let mut b = create_protocol_handler();
        attach_protocol_handler(&capability, &mut a);
        attach_protocol_handler(&capability, &mut b);
        a.detach();
        detach_protocol_handler(&mut b);
        assert_eq!(a.subscription.is_some(), b.subscription.is_some());
        assert!(!a.subscription.is_some());
    }

    #[test]
    fn protocol_handler_dispose_matches_free_function() {
        let mut a = create_protocol_handler();
        let mut b = create_protocol_handler();
        connect_signal(&a.on_open_url, Arc::new(|_url: &String| {}), None);
        connect_signal(&b.on_open_url, Arc::new(|_url: &String| {}), None);
        a.dispose();
        dispose_protocol_handler(&mut b);
        assert_eq!(
            has_signal_slots(&a.on_open_url),
            has_signal_slots(&b.on_open_url)
        );
        assert!(!has_signal_slots(&a.on_open_url));
    }

    #[test]
    fn protocol_handler_new_matches_create_protocol_handler() {
        assert_eq!(
            format!("{:?}", ProtocolHandler::new()),
            format!("{:?}", create_protocol_handler())
        );
    }
}

pub fn create_protocol_handler() -> ProtocolHandler {
    let mut out: ProtocolHandler = allocate_entity();
    initialize_protocol_handler(&mut out);
    return out;
}

pub fn create_protocol_url(parts: &ProtocolUrlParts) -> String {
    let scheme = parts.scheme.as_deref().unwrap_or("unknown");
    let host = parts.host.as_deref().unwrap_or("");
    let path = parts.path.as_deref().unwrap_or("");
    let authority = if host.is_empty() {
        String::new()
    } else {
        format!("//{host}")
    };
    let normalized_path = if !path.is_empty() && !path.starts_with('/') {
        format!("/{path}")
    } else {
        path.to_string()
    };
    let mut url = format!("{scheme}:{authority}{normalized_path}");
    if let Some(query) = &parts.query {
        let mut pairs = Vec::new();
        entries(&mut pairs, query);
        let encoded: Vec<String> = pairs
            .into_iter()
            .filter(|(key, _)| !key.is_empty())
            .map(|(key, value)| {
                format!(
                    "{}={}",
                    encode_protocol_component(key),
                    encode_protocol_component(value)
                )
            })
            .collect();
        if !encoded.is_empty() {
            url.push('?');
            url.push_str(&encoded.join("&"));
        }
    }
    return url;
}

pub fn initialize_protocol_handler(out: &mut ProtocolHandler) {
    out.on_open_url = create_signal();
    out.subscription = None;
}

pub fn attach_protocol_handler(
    host_protocol_open: &HostProtocolOpenCapability,
    handler: &mut ProtocolHandler,
) {
    detach_protocol_handler(handler);
    let on_open_url = handler.on_open_url.clone();
    let listener: ProtocolOpenListener =
        Arc::new(move |url: &str| emit_signal(&on_open_url, &url.to_string()));
    handler.subscription = Some((host_protocol_open.subscribe)(listener));
}

fn decode_protocol_component(value: &str) -> String {
    let replaced = value.replace('+', " ");
    let bytes = replaced.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'%' {
            decoded.push(bytes[index]);
            index += 1;
            continue;
        }
        if index + 2 >= bytes.len() {
            return value.to_string();
        }
        let Some(high) = protocol_hex_value(bytes[index + 1]) else {
            return value.to_string();
        };
        let Some(low) = protocol_hex_value(bytes[index + 2]) else {
            return value.to_string();
        };
        decoded.push((high << 4) | low);
        index += 3;
    }
    return String::from_utf8(decoded).unwrap_or_else(|_| value.to_string());
}

pub fn detach_protocol_handler(handler: &mut ProtocolHandler) {
    let Some(unsubscribe) = handler.subscription.take() else {
        return;
    };
    unsubscribe();
}

pub fn dispose_protocol_handler(handler: &mut ProtocolHandler) {
    detach_protocol_handler(handler);
    clear_signal(&handler.on_open_url);
}

fn encode_protocol_component(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
    }
    return encoded;
}

pub fn get_protocol_launch_url(
    host_protocol_launch: &HostProtocolLaunchCapability,
) -> Option<String> {
    return (host_protocol_launch.get_launch_url)();
}

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the result fills a caller-owned out, cleared first
pub fn get_registered_protocol_schemes(
    out: &mut Vec<String>,
    host_protocol_registration: &HostProtocolRegistrationCapability,
) {
    out.clear();
    out.extend((host_protocol_registration.get_registered_schemes)());
}

pub fn is_protocol_scheme_default(
    host_protocol_default: &HostProtocolDefaultCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme) && (host_protocol_default.is_default)(scheme);
}

pub fn is_protocol_scheme_registered(
    host_protocol_registration_query: &HostProtocolRegistrationQueryCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme)
        && (host_protocol_registration_query.is_registered)(scheme);
}

fn is_protocol_scheme_syntax(scheme: &str) -> bool {
    let mut characters = scheme.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }
    return characters.all(|character| {
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || matches!(character, '+' | '-' | '.')
    });
}

pub fn is_valid_protocol_scheme(scheme: &str) -> bool {
    if scheme.is_empty() {
        return false;
    }
    let lower = scheme.to_lowercase();
    if matches!(
        lower.as_str(),
        "file" | "ftp" | "ftps" | "http" | "https" | "mailto"
    ) {
        return false;
    }
    return is_protocol_scheme_syntax(&lower);
}

pub fn parse_protocol_url(url: &str) -> Option<ParsedProtocolUrl> {
    if url.is_empty() {
        return None;
    }
    let colon_index = url.find(':')?;
    if colon_index == 0 {
        return None;
    }
    let scheme = url[..colon_index].to_lowercase();
    if !is_protocol_scheme_syntax(&scheme) {
        return None;
    }

    let mut rest = &url[colon_index + 1..];
    let mut host = String::new();
    if rest.starts_with("//") {
        rest = &rest[2..];
        let slash_index = rest.find('/');
        let query_index = rest.find('?');
        let host_end = match (slash_index, query_index) {
            (Some(slash), Some(query)) if slash < query => slash,
            (_, Some(query)) => query,
            (Some(slash), None) => slash,
            (None, None) => rest.len(),
        };
        host = rest[..host_end].to_string();
        rest = &rest[host_end..];
    }

    let query_index = rest.find('?');
    let path = query_index.map_or(rest, |index| &rest[..index]);
    let query_string = query_index.map_or("", |index| &rest[index + 1..]);
    let mut query: Record<String> = Record::default();
    if !query_string.is_empty() {
        for pair in query_string.split('&') {
            if let Some(equals_index) = pair.find('=') {
                let key = decode_protocol_component(&pair[..equals_index]);
                if !key.is_empty() {
                    let value = decode_protocol_component(&pair[equals_index + 1..]);
                    set_record_value(&mut query, key, value);
                }
            } else {
                let key = decode_protocol_component(pair);
                if !key.is_empty() {
                    set_record_value(&mut query, key, String::new());
                }
            }
        }
    }
    return Some(ParsedProtocolUrl {
        scheme,
        host,
        path: path.to_string(),
        query,
    });
}

fn protocol_hex_value(value: u8) -> Option<u8> {
    return match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    };
}

pub fn register_protocol_scheme(
    host_protocol_registration: &HostProtocolRegistrationCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme) && (host_protocol_registration.register)(scheme);
}

pub fn register_protocol_schemes(
    host_protocol_registration: &HostProtocolRegistrationCapability,
    schemes: &[String],
) -> bool {
    if !schemes
        .iter()
        .all(|scheme| is_valid_protocol_scheme(scheme))
    {
        return false;
    }
    let mut all_succeeded = true;
    for scheme in schemes {
        if !(host_protocol_registration.register)(scheme) {
            all_succeeded = false;
        }
    }
    return all_succeeded;
}

pub fn remove_protocol_scheme_as_default(
    host_protocol_default: &HostProtocolDefaultCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme) && (host_protocol_default.remove_as_default)(scheme);
}

pub fn set_protocol_scheme_as_default(
    host_protocol_default: &HostProtocolDefaultCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme) && (host_protocol_default.set_as_default)(scheme);
}

pub fn unregister_protocol_scheme(
    host_protocol_unregistration: &HostProtocolUnregistrationCapability,
    scheme: &str,
) -> bool {
    return is_valid_protocol_scheme(scheme) && (host_protocol_unregistration.unregister)(scheme);
}

pub fn unregister_protocol_schemes(
    host_protocol_unregistration: &HostProtocolUnregistrationCapability,
    schemes: &[String],
) -> bool {
    if !schemes
        .iter()
        .all(|scheme| is_valid_protocol_scheme(scheme))
    {
        return false;
    }
    let mut all_succeeded = true;
    for scheme in schemes {
        if !(host_protocol_unregistration.unregister)(scheme) {
            all_succeeded = false;
        }
    }
    return all_succeeded;
}

impl ProtocolHandler {
    pub fn new() -> Self {
        return create_protocol_handler();
    }

    pub fn detach(&mut self) {
        detach_protocol_handler(self);
    }

    pub fn dispose(&mut self) {
        dispose_protocol_handler(self);
    }
}

impl HostProtocolDefaultCapability {
    pub fn is_scheme_default(&self, scheme: &str) -> bool {
        return is_protocol_scheme_default(self, scheme);
    }

    pub fn remove_scheme_as_default(&self, scheme: &str) -> bool {
        return remove_protocol_scheme_as_default(self, scheme);
    }

    pub fn set_scheme_as_default(&self, scheme: &str) -> bool {
        return set_protocol_scheme_as_default(self, scheme);
    }
}

impl HostProtocolLaunchCapability {
    pub fn launch_url(&self) -> Option<String> {
        return get_protocol_launch_url(self);
    }
}

impl HostProtocolOpenCapability {
    pub fn attach_handler(&self, handler: &mut ProtocolHandler) {
        attach_protocol_handler(self, handler);
    }
}

impl HostProtocolRegistrationCapability {
    pub fn register_scheme(&self, scheme: &str) -> bool {
        return register_protocol_scheme(self, scheme);
    }

    pub fn register_schemes(&self, schemes: &[String]) -> bool {
        return register_protocol_schemes(self, schemes);
    }

    pub fn registered_schemes(&self, out: &mut Vec<String>) {
        get_registered_protocol_schemes(out, self);
    }
}

impl HostProtocolRegistrationQueryCapability {
    pub fn is_scheme_registered(&self, scheme: &str) -> bool {
        return is_protocol_scheme_registered(self, scheme);
    }
}

impl HostProtocolUnregistrationCapability {
    pub fn unregister_scheme(&self, scheme: &str) -> bool {
        return unregister_protocol_scheme(self, scheme);
    }

    pub fn unregister_schemes(&self, schemes: &[String]) -> bool {
        return unregister_protocol_schemes(self, schemes);
    }
}

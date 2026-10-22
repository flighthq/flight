use std::fmt;
use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Record};
use flight_host::ProviderRef;
use flight_signals::Signal;

/// The optional fields accepted by `create_protocol_url` (TS
/// `Readonly<Partial<ParsedProtocolUrl>>`). Missing scheme, host and path fields use the exact
/// source defaults; a missing query is distinct from an empty record only during construction.
#[derive(Clone, Debug, Default)]
pub struct ProtocolUrlParts {
    pub scheme: Option<String>,
    pub host: Option<String>,
    pub path: Option<String>,
    pub query: Option<Record<String>>,
}

/// A custom-protocol URL decomposed by the source's manual parser (TS `ParsedProtocolUrl`). This is
/// plain data, not an Entity. `query` retains JavaScript own-property enumeration order.
#[derive(Clone, Debug)]
pub struct ParsedProtocolUrl {
    pub scheme: String,
    pub host: String,
    pub path: String,
    pub query: Record<String>,
}

/// A raw custom-protocol open listener.
pub type ProtocolOpenListener = Arc<dyn Fn(&str) + Send + Sync>;

/// The exact release returned by an open subscription.
pub type ProtocolUnsubscribe = Arc<dyn Fn() + Send + Sync>;

/// Default-handler operations (TS `HostProtocolDefaultCapability`).
#[derive(Clone)]
pub struct HostProtocolDefaultCapability {
    pub provider: ProviderRef,
    pub is_default: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub remove_as_default: Arc<dyn Fn(&str) -> bool + Send + Sync>,
    pub set_as_default: Arc<dyn Fn(&str) -> bool + Send + Sync>,
}

/// Launch URL query (TS `HostProtocolLaunchCapability`). `None` is the exact no-launch sentinel.
#[derive(Clone)]
pub struct HostProtocolLaunchCapability {
    pub provider: ProviderRef,
    pub get_launch_url: Arc<dyn Fn() -> Option<String> + Send + Sync>,
}

/// Raw open-event delivery (TS `HostProtocolOpenCapability`).
#[derive(Clone)]
pub struct HostProtocolOpenCapability {
    pub provider: ProviderRef,
    pub subscribe: Arc<dyn Fn(ProtocolOpenListener) -> ProtocolUnsubscribe + Send + Sync>,
}

/// Scheme registration and enumeration (TS `HostProtocolRegistrationCapability`).
#[derive(Clone)]
pub struct HostProtocolRegistrationCapability {
    pub provider: ProviderRef,
    pub get_registered_schemes: Arc<dyn Fn() -> Vec<String> + Send + Sync>,
    pub register: Arc<dyn Fn(&str) -> bool + Send + Sync>,
}

/// Scheme registration query (TS `HostProtocolRegistrationQueryCapability`).
#[derive(Clone)]
pub struct HostProtocolRegistrationQueryCapability {
    pub provider: ProviderRef,
    pub is_registered: Arc<dyn Fn(&str) -> bool + Send + Sync>,
}

/// Scheme unregistration (TS `HostProtocolUnregistrationCapability`).
#[derive(Clone)]
pub struct HostProtocolUnregistrationCapability {
    pub provider: ProviderRef,
    pub unregister: Arc<dyn Fn(&str) -> bool + Send + Sync>,
}

/// The optional protocol capability group (TS `HostProtocolCapabilities`). Every populated facet
/// carries its originating provider identity; facets supplied by one provider clone the same token.
#[derive(Clone, Default)]
pub struct HostProtocolCapabilities {
    pub default: Option<HostProtocolDefaultCapability>,
    pub launch: Option<HostProtocolLaunchCapability>,
    pub open: Option<HostProtocolOpenCapability>,
    pub registration: Option<HostProtocolRegistrationCapability>,
    pub registration_query: Option<HostProtocolRegistrationQueryCapability>,
    pub unregistration: Option<HostProtocolUnregistrationCapability>,
}

/// Deep-link event entity (TS `ProtocolHandler`). The private subscription is the exact release for
/// this handler's current source, replacing the TS module WeakMap with explicit per-entity state.
#[derive(Default)]
pub struct ProtocolHandler {
    runtime: EntityRuntimeSlot,
    pub on_open_url: Signal<String>,
    pub(crate) subscription: Option<ProtocolUnsubscribe>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the subscription is a closure, so Debug reports only whether the handler is attached
impl fmt::Debug for ProtocolHandler {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("ProtocolHandler")
            .field("on_open_url", &self.on_open_url)
            .field("attached", &self.subscription.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(ProtocolHandler);

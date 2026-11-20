//! Net host lifetime and capability getters.

use std::sync::{Arc, RwLock};

use flight_net::{HostNetCapabilities, HostNetCapability};

use crate::net_host_request::send_net_host_request;
use crate::net_transport::{close_net_transport, create_net_transport};
use crate::types::*;

/// The provider value behind a net host's capabilities: identity only, no state.
struct NetHostProvider;

/// Creates a net host with its own connection pool. Creation opens no connection and cannot fail.
pub fn create_net_host(options: Option<&NetHostOptions>) -> NetHost {
    let options = options.copied().unwrap_or_else(create_net_host_options);
    let transport = Arc::new(RwLock::new(Some(create_net_transport(
        options.max_idle_connections,
        options.redirect_limit,
    ))));
    let request_transport = transport.clone();
    let provider: flight_host::ProviderRef = Arc::new(NetHostProvider);
    let http = HostNetCapability {
        provider: provider.clone(),
        send_net_request: Arc::new(move |request, options| {
            return send_net_host_request(&request_transport, request, options);
        }),
    };
    return NetHost {
        capabilities: HostNetCapabilities {
            http: Some(http.clone()),
        },
        http,
        provider,
        transport,
    };
}

/// The default options: 20 redirects, matching the Fetch standard's limit, and 10 idle connections.
pub fn create_net_host_options() -> NetHostOptions {
    return NetHostOptions {
        max_idle_connections: 10,
        redirect_limit: 20,
    };
}

/// Closes the host's idle pooled connections now. Requests already in flight finish on their own
/// connection; requests sent afterwards resolve to the `host destroyed` sentinel. Repeat calls are
/// no-ops.
pub fn destroy_net_host(host: &mut NetHost) {
    let transport = host.transport.write().unwrap().take();
    if let Some(transport) = transport {
        close_net_transport(transport);
    }
}

/// The net capability group, with its `http` slot filled, for consumers that take the group.
pub fn get_net_host_capabilities(host: &NetHost) -> &HostNetCapabilities {
    return &host.capabilities;
}

/// The HTTP capability. Borrowed: clones share the host's connection pool.
pub fn get_net_host_capability(host: &NetHost) -> &HostNetCapability {
    return &host.http;
}

/// The provider identity every capability this host fills carries.
pub fn get_net_host_provider(host: &NetHost) -> &flight_host::ProviderRef {
    return &host.provider;
}

pub fn is_net_host_destroyed(host: &NetHost) -> bool {
    return host.transport.read().unwrap().is_none();
}

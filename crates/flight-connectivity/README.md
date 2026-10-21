# flight-connectivity

Connectivity status, change diff signals and reachability probes routed through host capabilities (TS `@flighthq/connectivity`). The crate never touches the network, browser events or the OS. It reads `HostConnectivityStatusCapability`, subscribes through `HostConnectivityChangeCapability`, and probes through `HostConnectivityReachabilityCapability`; mock or native providers supply those.

`attach_connectivity` replaces any prior subscription first, keeps the exact release the provider returned in the `Connectivity` entity itself (no global registry), and turns each raw change into synchronous `on_change` / `on_online` / `on_offline` / `on_connection_type_change` / `on_metered_change` emissions. No lock is held while those signals run. `online: None` means not yet measured, never offline. `detect_connectivity_reachability` is executor-neutral (D15). It passes a provider rejection through as `Err(FlightError)`, and dropping its future aborts the probe, which stands in for TS's `AbortSignal`.

## Precision

Rates and times (`downlink`, `downlink_max`, `rtt`, `latency`, `timeout`) are `f32`. They are reported estimates in Mbps or milliseconds, read and compared for change, and never accumulated.

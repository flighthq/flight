// The native host seam: a feature-gated section of the C surface through which a native host crate
// hands C its carriers. A host is an opaque owned handle (a registry token, never dereferenced);
// the SDK carriers it produces are borrowed pointers into storage the live host owns, so the SDK
// functions that consume those carriers become reachable while nothing is constructed from C.
//
// A host feature is scanned exactly: every public function of its crate is lowered here, and the
// build fails when the crate gains or loses one. Its wrappers carry a section tag, and the header
// and HashLink shim wrap that section in the feature's guard macro, so one header serves every
// feature combination and a consumer opts into the declarations its library was built with.

/// A cargo feature of flight-ffi that links and scans one native host crate.
pub struct HostFeature {
    /// The flight-ffi cargo feature, as Cargo names it to build scripts.
    pub feature: &'static str,
    /// The environment variable Cargo sets for a build script when the feature is enabled.
    pub feature_env: &'static str,
    /// The host crate's directory under `crates/`.
    pub crate_dir: &'static str,
    /// The C preprocessor macro that guards the feature's header section.
    pub guard: &'static str,
    /// The Rust type the opaque host handle points to, and its C name.
    pub handle: &'static str,
    pub c_handle: &'static str,
    /// Every public function of the host crate and the C function that lowers it.
    pub lowerings: &'static [(&'static str, &'static str)],
}

/// The section tag a host wrapper carries: `flight-ffi section|<guard>`.
pub const SECTION_DOC_PREFIX: &str = "flight-ffi section|";

pub const HOST_FEATURES: &[HostFeature] = &[HostFeature {
    feature: "host-headless",
    feature_env: "CARGO_FEATURE_HOST_HEADLESS",
    crate_dir: "flight-host-headless",
    guard: "FLIGHT_HOST_HEADLESS",
    handle: "FfiHeadlessHostHandle",
    c_handle: "FlightHeadlessHost",
    lowerings: &[
        (
            "create_bitmap_from_headless_screen_render_target",
            "flight_create_bitmap_from_headless_screen_render_target",
        ),
        ("create_headless_host", "flight_create_headless_host"),
        (
            "create_headless_host_options",
            "flight_create_headless_host_options",
        ),
        (
            "create_headless_host_render_target",
            "flight_create_headless_host_render_target",
        ),
        (
            "create_headless_host_surface",
            "flight_create_headless_host_surface",
        ),
        ("destroy_headless_host", "flight_destroy_headless_host"),
        ("explain_headless_host", "flight_explain_headless_host"),
        (
            "explain_headless_screen_render_target_read_back",
            "flight_explain_headless_screen_render_target_read_back",
        ),
        (
            "get_headless_host_adapter_backend",
            "flight_get_headless_host_adapter_backend",
        ),
        (
            "get_headless_host_adapter_name",
            "flight_get_headless_host_adapter_name",
        ),
        (
            "get_headless_host_wgpu_capability",
            "flight_get_headless_host_wgpu_capability",
        ),
        (
            "get_headless_host_wgpu_device",
            "flight_get_headless_host_wgpu_device",
        ),
        (
            "is_headless_host_destroyed",
            "flight_is_headless_host_destroyed",
        ),
        (
            "is_headless_host_software_adapter",
            "flight_is_headless_host_software_adapter",
        ),
    ],
}];

/// The generated wrappers of one enabled host feature, and the names that join the reachability
/// surface: every lowered crate function and value accessor, not the release functions.
pub struct HostSection {
    pub output: String,
    pub surface: Vec<String>,
    pub report: Vec<String>,
}

/// Checks that `exports`, the public functions of the feature's crate, are exactly the functions
/// the feature lowers. Returns the exports nothing lowers and the lowerings no export backs.
pub fn check_host_scan_membership(
    feature: &HostFeature,
    exports: &std::collections::BTreeSet<String>,
) -> Result<(), String> {
    let lowered: std::collections::BTreeSet<String> = feature
        .lowerings
        .iter()
        .map(|(source, _)| source.to_string())
        .collect();
    let unlowered: Vec<_> = exports.difference(&lowered).cloned().collect();
    let unbacked: Vec<_> = lowered.difference(exports).cloned().collect();
    if unlowered.is_empty() && unbacked.is_empty() {
        return Ok(());
    }
    return Err(format!(
        "the {} feature must lower exactly the public functions of {}: unlowered {unlowered:?}, unbacked {unbacked:?}",
        feature.feature, feature.crate_dir
    ));
}

/// The public functions of a host crate: every `pub fn` declared at module level in its `src`
/// files outside tests. A host crate re-exports its modules from the crate root, so these are its
/// public functions.
pub fn collect_host_exports(source_files: &[String]) -> std::collections::BTreeSet<String> {
    let mut out = std::collections::BTreeSet::new();
    for content in source_files {
        let file = syn::parse_file(content).expect("a host crate source file parses");
        for item in file.items {
            if let syn::Item::Fn(function) = item
                && matches!(function.vis, syn::Visibility::Public(_))
            {
                out.insert(function.sig.ident.to_string());
            }
        }
    }
    return out;
}

/// The wrappers for `feature`, each carrying the feature's section tag.
pub fn generate_host_section(feature: &HostFeature) -> HostSection {
    assert_eq!(
        feature.feature, "host-headless",
        "a host feature needs its own lowering"
    );
    let section = format!("#[doc = \"{SECTION_DOC_PREFIX}{}\"]\n", feature.guard);
    let mut output = String::new();
    output.push_str(HEADLESS_SUPPORT_TEMPLATE);
    let mut surface = Vec::new();
    for wrapper in HEADLESS_WRAPPERS {
        output.push_str(&section);
        output.push_str(wrapper.source);
        output.push('\n');
        if wrapper.surface {
            surface.push(wrapper.name.to_string());
        }
    }
    let lowered: std::collections::BTreeSet<&str> =
        feature.lowerings.iter().map(|(_, c)| *c).collect();
    let emitted: std::collections::BTreeSet<&str> = HEADLESS_WRAPPERS
        .iter()
        .map(|wrapper| wrapper.name)
        .collect();
    let missing: Vec<_> = lowered.difference(&emitted).collect();
    assert!(
        missing.is_empty(),
        "lowerings without a wrapper: {missing:?}"
    );
    let report = feature
        .lowerings
        .iter()
        .map(|(source, c)| format!("{} {c} <- {source}", feature.feature))
        .collect();
    return HostSection {
        output,
        surface,
        report,
    };
}

/// The header contract every SDK wrapper that consumes a headless-lent carrier carries.
pub const LENT_CARRIER_CONTRACT: &str = "With a host section built in, a device, wgpu capability, surface or render target argument that is a registry token must be one a live host lent of that kind: it is resolved before use, and a forged, stale or other-family token, or one of a destroyed host, returns the failure value without being read. Any other argument keeps the contract of the carrier it points to.";

/// The carrier types a headless host lends and the resolver that turns a lent handle back into the
/// carrier its live host holds.
pub const LENT_CARRIERS: &[(&str, &str)] = &[
    (
        "*const flight_sdk::HostWgpuCapability",
        "ffi_resolve_headless_lent_capability",
    ),
    (
        "*const flight_sdk::SurfaceRef",
        "ffi_resolve_headless_lent_surface",
    ),
    (
        "*const flight_sdk::WgpuDevice",
        "ffi_resolve_headless_lent_device",
    ),
    (
        "*const flight_sdk::WgpuRenderTarget",
        "ffi_resolve_headless_lent_render_target",
    ),
];

/// Rewrites every generated wrapper outside the host section that takes a headless-lent carrier so
/// that it resolves each such argument to the carrier its live host holds before anything else
/// reads it, returning its failure value otherwise, and borrows the resolved clone in place of the
/// caller's pointer. Returns the rewritten source and the rewritten wrapper names.
pub fn guard_lent_carrier_consumers(generated: &str) -> (String, Vec<String>) {
    let mut out = String::with_capacity(generated.len());
    let mut guarded = Vec::new();
    let mut rest = generated;
    let marker = "pub unsafe extern \"C\" fn ";
    let line_marker = format!("\n{marker}");
    while let Some(at) = rest.find(&line_marker).map(|index| index + 1) {
        let (before, from) = rest.split_at(at);
        let end = from.find("\n}\n").map_or(from.len(), |index| index + 3);
        let (wrapper, after) = from.split_at(end);
        rest = after;
        out.push_str(before);
        let signature = wrapper.lines().next().unwrap_or_default();
        let (Some(open), Some(close)) = (signature.find('('), signature.rfind(')')) else {
            out.push_str(wrapper);
            continue;
        };
        let name = &signature[marker.len()..open];
        let lent: Vec<(String, &str)> = signature[open + 1..close]
            .split(", ")
            .filter_map(|param| param.split_once(": "))
            .filter_map(|(param, ty)| {
                return LENT_CARRIERS
                    .iter()
                    .find(|(carrier, _)| *carrier == ty)
                    .map(|(_, resolver)| (param.to_string(), *resolver));
            })
            .collect();
        if lent.is_empty() || name.contains("headless") {
            out.push_str(wrapper);
            continue;
        }
        let returns = signature[close + 1..].trim().trim_end_matches('{').trim();
        let failure = match returns.strip_prefix("-> ").map(str::trim) {
            None => "return;".to_string(),
            Some("bool") => "return false;".to_string(),
            Some(ty) if ty.starts_with("*mut ") => "return std::ptr::null_mut();".to_string(),
            Some(ty) if ty.starts_with("*const ") => "return std::ptr::null();".to_string(),
            Some(_) => "return Default::default();".to_string(),
        };
        let mut lines: Vec<String> = wrapper.lines().map(str::to_string).collect();
        let mut insert_at = 1;
        while lines.get(insert_at).is_some_and(|line| {
            return line
                .trim_start()
                .starts_with("let Some(_bracket_state_claim)");
        }) {
            insert_at += 1;
        }
        let mut body = lines.split_off(insert_at).join("\n");
        for (param, resolver) in &lent {
            let borrow = format!("unsafe {{ &*{param} }}");
            assert_eq!(
                body.matches(&borrow).count(),
                1,
                "{name}: the lent {param} must be borrowed exactly once"
            );
            body = body.replace(
                &borrow,
                &format!("match &lent_{param} {{ Some(lent) => lent, None => {borrow} }}"),
            );
            lines.push(format!(
                "    let lent_{param} = if ffi_is_registry_token_shaped({param}.addr()) {{ let Some(lent) = {resolver}({param}) else {{ {failure} }}; Some(lent) }} else {{ None }};"
            ));
        }
        lines.push(body);
        let attribute = "#[unsafe(no_mangle)]\n";
        if out.ends_with(attribute) {
            out.truncate(out.len() - attribute.len());
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|{LENT_CARRIER_CONTRACT}\"]\n"
            ));
            out.push_str(attribute);
        }
        out.push_str(&lines.join("\n"));
        if wrapper.ends_with('\n') {
            out.push('\n');
        }
        guarded.push(name.to_string());
    }
    out.push_str(rest);
    return (out, guarded);
}

/// Whether the build script for flight-ffi has `feature` enabled.
pub fn is_host_feature_enabled(feature: &HostFeature) -> bool {
    return std::env::var_os(feature.feature_env).is_some();
}

struct HostWrapper {
    name: &'static str,
    surface: bool,
    source: &'static str,
}

// The registry of live headless hosts and of the carriers each one lends to C. Every handle is a
// registry token of its own family (registry_tokens.rs) and is never dereferenced: a host handle
// names a host entry, and a lent device, capability, surface or render target handle names a lent
// carrier the host still holds. A consumer resolves a lent handle to a clone of the carrier, which
// owns its shared GPU handles for the length of the call, so nothing reads through a pointer the
// caller supplied. Destroying a host first removes every handle it lent, then frees its resources,
// so a handle used afterwards, or one forged, stale, of another family or of another host's
// destroyed carrier, resolves to nothing and the call returns its failure value.
const HEADLESS_SUPPORT_TEMPLATE: &str = r#"// native host: flight-host-headless
pub struct FfiHeadlessHostHandle {
    _token_only: [u8; 0],
}
// A carrier a live host lends, held by the registry under its lent handle.
#[derive(Clone)]
enum FfiHeadlessLent {
    Capability(flight_sdk::HostWgpuCapability),
    Device(flight_sdk::WgpuDevice),
    RenderTarget(flight_sdk::WgpuRenderTarget),
    Surface(flight_sdk::SurfaceRef),
}
struct FfiHeadlessHostEntry {
    host: Box<flight_host_headless::HeadlessHost>,
    capability: usize,
    device: usize,
    lent: Vec<usize>,
}
struct FfiHeadlessHostRegistry {
    hosts: std::collections::BTreeMap<usize, FfiHeadlessHostEntry>,
    lent: std::collections::BTreeMap<usize, FfiHeadlessLent>,
}
static FFI_HEADLESS_HOSTS: std::sync::Mutex<FfiHeadlessHostRegistry> = std::sync::Mutex::new(FfiHeadlessHostRegistry {
    hosts: std::collections::BTreeMap::new(),
    lent: std::collections::BTreeMap::new(),
});
// A critical section only inserts, removes or reads plain values and clones, so a lock poisoned by a
// contained panic still guards a consistent registry and is recovered.
fn ffi_headless_hosts() -> std::sync::MutexGuard<'static, FfiHeadlessHostRegistry> {
    return FFI_HEADLESS_HOSTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
}
// Runs `body` with the live host `host` names, under the registry lock and inside a panic boundary;
// `None` for NULL, a handle of another family, a handle no live host holds, or a contained panic.
fn ffi_with_headless_host<R>(host: *mut FfiHeadlessHostHandle, body: impl FnOnce(&mut FfiHeadlessHostRegistry, usize) -> R) -> Option<R> {
    let token = host.addr();
    if !ffi_is_registry_token(token, FFI_HEADLESS_HOST_TOKEN_TAG) {
        return None;
    }
    let mut registry = ffi_headless_hosts();
    if !registry.hosts.contains_key(&token) {
        return None;
    }
    return std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        inject_headless_host_fault("host");
        return body(&mut registry, token);
    }))
    .ok();
}
// Lends `carrier` from the host `token` names under a new handle of the family `tag`; None when the
// token sequence is exhausted.
fn ffi_lend_headless_carrier(registry: &mut FfiHeadlessHostRegistry, token: usize, tag: usize, carrier: FfiHeadlessLent) -> Option<usize> {
    let handle = ffi_mint_registry_token(tag)?;
    registry.lent.insert(handle, carrier);
    registry.hosts.get_mut(&token)?.lent.push(handle);
    return Some(handle);
}
// The carrier a lent handle of the family `tag` names, while its host lives.
fn ffi_resolve_headless_lent(handle: usize, tag: usize) -> Option<FfiHeadlessLent> {
    if !ffi_is_registry_token(handle, tag) {
        return None;
    }
    return ffi_headless_hosts().lent.get(&handle).cloned();
}
fn ffi_resolve_headless_lent_capability(handle: *const flight_sdk::HostWgpuCapability) -> Option<flight_sdk::HostWgpuCapability> {
    return match ffi_resolve_headless_lent(handle.addr(), FFI_HEADLESS_CAPABILITY_TOKEN_TAG)? {
        FfiHeadlessLent::Capability(capability) => Some(capability),
        _ => None,
    };
}
fn ffi_resolve_headless_lent_device(handle: *const flight_sdk::WgpuDevice) -> Option<flight_sdk::WgpuDevice> {
    return match ffi_resolve_headless_lent(handle.addr(), FFI_HEADLESS_DEVICE_TOKEN_TAG)? {
        FfiHeadlessLent::Device(device) => Some(device),
        _ => None,
    };
}
fn ffi_resolve_headless_lent_render_target(handle: *const flight_sdk::WgpuRenderTarget) -> Option<flight_sdk::WgpuRenderTarget> {
    return match ffi_resolve_headless_lent(handle.addr(), FFI_HEADLESS_RENDER_TARGET_TOKEN_TAG)? {
        FfiHeadlessLent::RenderTarget(target) => Some(target),
        _ => None,
    };
}
fn ffi_resolve_headless_lent_surface(handle: *const flight_sdk::SurfaceRef) -> Option<flight_sdk::SurfaceRef> {
    return match ffi_resolve_headless_lent(handle.addr(), FFI_HEADLESS_SURFACE_TOKEN_TAG)? {
        FfiHeadlessLent::Surface(surface) => Some(surface),
        _ => None,
    };
}
// The screen target behind a render target handle a live host lent.
fn ffi_find_headless_screen_render_target(target: *const flight_sdk::WgpuRenderTarget) -> Option<flight_sdk::Ref<flight_sdk::WgpuScreenRenderTarget>> {
    return match ffi_resolve_headless_lent_render_target(target)? {
        flight_sdk::WgpuRenderTarget::Screen(screen) => Some(screen),
        flight_sdk::WgpuRenderTarget::Texture(_) => None,
    };
}
// Removes the host `token` names and every handle it lent, in one critical section, so no handle of
// it resolves after this returns; the removed entry and carriers are freed by the caller.
fn ffi_take_headless_host(token: usize) -> Option<(FfiHeadlessHostEntry, Vec<FfiHeadlessLent>)> {
    if !ffi_is_registry_token(token, FFI_HEADLESS_HOST_TOKEN_TAG) {
        return None;
    }
    let mut registry = ffi_headless_hosts();
    let entry = registry.hosts.remove(&token)?;
    let carriers = entry.lent.iter().filter_map(|handle| registry.lent.remove(handle)).collect();
    return Some((entry, carriers));
}
// Frees what a destroyed host lent and then its device: each screen target releases its GPU
// textures now, every other carrier drops, and the host destroys its device. Clones a call still
// holds keep their shared handles alive until that call returns.
fn ffi_destroy_headless_host_entry(mut entry: FfiHeadlessHostEntry, carriers: Vec<FfiHeadlessLent>) {
    for carrier in carriers {
        if let FfiHeadlessLent::RenderTarget(flight_sdk::WgpuRenderTarget::Screen(screen)) = carrier {
            flight_sdk::destroy_wgpu_screen_render_target(&mut screen.write().unwrap_or_else(std::sync::PoisonError::into_inner));
        }
    }
    flight_host_headless::destroy_headless_host(&mut entry.host);
}
fn ffi_owned_c_string(text: &str) -> *mut std::ffi::c_char {
    return std::ffi::CString::new(text.replace('\0', "")).map_or(std::ptr::null_mut(), std::ffi::CString::into_raw);
}
// A C read-back timeout: negative waits without limit, and a timeout longer than u32::MAX
// milliseconds waits u32::MAX.
fn ffi_optional_timeout_ms(timeout_ms: i64) -> Option<u32> {
    if timeout_ms < 0 {
        return None;
    }
    return Some(u32::try_from(timeout_ms).unwrap_or(u32::MAX));
}
#[cfg(test)]
std::thread_local! {
    static FFI_HEADLESS_HOST_FAULT: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) };
}
// Panics at `point` once when a test asked for it, inside the call's panic boundary, so a test can
// prove every host call contains a panic and returns its failure value.
#[cfg(test)]
fn inject_headless_host_fault(point: &'static str) {
    if FFI_HEADLESS_HOST_FAULT.with(|fault| fault.get()) == Some(point) {
        FFI_HEADLESS_HOST_FAULT.with(|fault| fault.set(None));
        panic!("injected headless host {point} fault");
    }
}
#[cfg(not(test))]
fn inject_headless_host_fault(_point: &'static str) {}
#[cfg(test)]
fn set_headless_host_fault(point: Option<&'static str>) {
    FFI_HEADLESS_HOST_FAULT.with(|fault| fault.set(point));
}
#[cfg(test)]
fn count_headless_host_carriers(host: *mut FfiHeadlessHostHandle) -> Option<(usize, usize)> {
    let registry = ffi_headless_hosts();
    let entry = registry.hosts.get(&host.addr())?;
    let mut counts = (0, 0);
    for handle in &entry.lent {
        match registry.lent.get(handle) {
            Some(FfiHeadlessLent::Surface(_)) => counts.0 += 1,
            Some(FfiHeadlessLent::RenderTarget(_)) => counts.1 += 1,
            _ => {}
        }
    }
    return Some(counts);
}
"#;

const HEADLESS_WRAPPERS: &[HostWrapper] = &[
    HostWrapper {
        name: "flight_create_bitmap_from_headless_screen_render_target",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Reads the last frame submitted to target back to an owned RGBA bitmap through the SDK's screen-target capture, blocking until it settles; a negative timeout_ms waits without limit, and one longer than 4294967295 milliseconds waits that long. Returns NULL for NULL, for a target no live headless host lent (a destroyed host's targets included), when no frame was captured, or when the read-back fails or outlives timeout_ms; flight_explain_headless_screen_render_target_read_back says which. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_bitmap|flight_sdk::Bitmap"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_bitmap_from_headless_screen_render_target(target: *const flight_sdk::WgpuRenderTarget, timeout_ms: i64) -> *mut flight_sdk::Bitmap {
    let Some(screen) = ffi_find_headless_screen_render_target(target) else {
        return std::ptr::null_mut();
    };
    let read = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        inject_headless_host_fault("read_back");
        return flight_host_headless::create_bitmap_from_headless_screen_render_target(&screen, ffi_optional_timeout_ms(timeout_ms));
    }));
    return match read {
        Ok(Some(bitmap)) => Box::into_raw(Box::new(bitmap)),
        _ => std::ptr::null_mut(),
    };
}"#,
    },
    HostWrapper {
        name: "flight_create_headless_host",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Opens a real wgpu device on the adapter options choose (NULL takes flight_create_headless_host_options defaults) and returns an owned opaque host; release it with flight_destroy_headless_host. Returns NULL when no acceptable adapter exists or the device request fails; flight_explain_headless_host says which. options is borrowed for this call only. The handle is a registry token, never a pointer to memory, and no registry ever reissues one: a destroyed, unknown, forged or other-family handle, a render pass handle included, makes every host call fail closed. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_destroy_headless_host|FfiHeadlessHostHandle"]
#[doc = "flight-ffi nullable|options"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host(options: *const flight_host_headless::HeadlessHostOptions) -> *mut FfiHeadlessHostHandle {
    let options = unsafe { options.as_ref() }.copied();
    let created = std::panic::catch_unwind(|| {
        inject_headless_host_fault("create");
        return flight_host_headless::create_headless_host(options.as_ref());
    });
    let Ok(Some(host)) = created else {
        return std::ptr::null_mut();
    };
    let lent = [
        FfiHeadlessLent::Device(flight_host_headless::get_headless_host_wgpu_device(&host).clone()),
        FfiHeadlessLent::Capability(flight_host_headless::get_headless_host_wgpu_capability(&host).clone()),
    ];
    let mut entry = FfiHeadlessHostEntry {
        host: Box::new(host),
        capability: 0,
        device: 0,
        lent: Vec::new(),
    };
    let tokens = (
        ffi_mint_registry_token(FFI_HEADLESS_HOST_TOKEN_TAG),
        ffi_mint_registry_token(FFI_HEADLESS_DEVICE_TOKEN_TAG),
        ffi_mint_registry_token(FFI_HEADLESS_CAPABILITY_TOKEN_TAG),
    );
    let (Some(token), Some(device), Some(capability)) = tokens else {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| ffi_destroy_headless_host_entry(entry, Vec::new())));
        return std::ptr::null_mut();
    };
    entry.device = device;
    entry.capability = capability;
    entry.lent = vec![device, capability];
    let mut registry = ffi_headless_hosts();
    let [device_carrier, capability_carrier] = lent;
    registry.lent.insert(device, device_carrier);
    registry.lent.insert(capability, capability_carrier);
    registry.hosts.insert(token, entry);
    return std::ptr::without_provenance_mut(token);
}"#,
    },
    HostWrapper {
        name: "flight_create_headless_host_options",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns owned default headless host options: every platform backend, no power preference, and a software adapter accepted when no hardware adapter exists. Set fields with the flight_set_headless_host_options_* accessors."]
#[doc = "flight-ffi ownership|owned-return|flight_free_headless_host_options|flight_host_headless::HeadlessHostOptions"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host_options() -> *mut flight_host_headless::HeadlessHostOptions {
    return Box::into_raw(Box::new(flight_host_headless::create_headless_host_options()));
}"#,
    },
    HostWrapper {
        name: "flight_create_headless_host_render_target",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Creates a width x height RGBA render target with capture read-back enabled, the SDK's own screen render target over a new headless surface, and lends it: the returned target is what flight_begin_wgpu_render_pass draws into and flight_create_bitmap_from_headless_screen_render_target reads back. Every lent handle is a registry token, never a pointer: the SDK functions that take it resolve it to the carrier the live host still holds, and after flight_destroy_headless_host, or for a forged, stale or other-family handle, they return their failure value without reading it. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed; flight_destroy_headless_host frees it"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host_render_target(host: *mut FfiHeadlessHostHandle, width: u32, height: u32) -> *const flight_sdk::WgpuRenderTarget {
    let lent = ffi_with_headless_host(host, |registry, token| {
        let target = flight_host_headless::create_headless_host_render_target(&registry.hosts[&token].host, width, height);
        return ffi_lend_headless_carrier(registry, token, FFI_HEADLESS_RENDER_TARGET_TOKEN_TAG, FfiHeadlessLent::RenderTarget(target));
    });
    return lent.flatten().map_or(std::ptr::null(), std::ptr::without_provenance);
}"#,
    },
    HostWrapper {
        name: "flight_create_headless_host_surface",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Creates a windowless width x height surface (an empty extent is one pixel) and lends it: the returned SurfaceRef is the drawable the SDK's surface and screen-target functions take; its frames are never shown. Every lent handle is a registry token, never a pointer: the SDK functions that take it resolve it to the carrier the live host still holds, and after flight_destroy_headless_host, or for a forged, stale or other-family handle, they return their failure value without reading it. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed; flight_destroy_headless_host frees it"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host_surface(host: *mut FfiHeadlessHostHandle, width: u32, height: u32) -> *const flight_sdk::SurfaceRef {
    let lent = ffi_with_headless_host(host, |registry, token| {
        let surface = flight_host_headless::create_headless_host_surface(&registry.hosts[&token].host, width, height);
        return ffi_lend_headless_carrier(registry, token, FFI_HEADLESS_SURFACE_TOKEN_TAG, FfiHeadlessLent::Surface(surface));
    });
    return lent.flatten().map_or(std::ptr::null(), std::ptr::without_provenance);
}"#,
    },
    HostWrapper {
        name: "flight_destroy_headless_host",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Frees the host now: every surface and render target it lent is released (each target's GPU textures at once) and then its device is destroyed. Every handle it lent stops resolving before anything is freed, so a lent device, capability, surface or target used afterwards makes its consumer return its failure value; render states built over the device stay valid values that observe device loss. NULL, a destroyed, unknown or foreign handle is a no-op, so destroying twice is safe. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_destroy_headless_host(host: *mut FfiHeadlessHostHandle) {
    let Some((entry, carriers)) = ffi_take_headless_host(host.addr()) else {
        return;
    };
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        inject_headless_host_fault("destroy");
        ffi_destroy_headless_host_entry(entry, carriers);
    }));
}"#,
    },
    HostWrapper {
        name: "flight_explain_headless_host",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Re-runs the adapter choice and device request flight_create_headless_host would make for options (NULL takes the defaults) and returns an owned explanation: Ready with the adapter creation would open, or why creation returns NULL. The probe device is dropped before returning. Returns NULL only when the host panics. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_headless_host_explanation|flight_host_headless::HeadlessHostExplanation"]
#[doc = "flight-ffi nullable|options"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_explain_headless_host(options: *const flight_host_headless::HeadlessHostOptions) -> *mut flight_host_headless::HeadlessHostExplanation {
    let options = unsafe { options.as_ref() }.copied();
    let explained = std::panic::catch_unwind(|| {
        inject_headless_host_fault("explain");
        return flight_host_headless::explain_headless_host(options.as_ref());
    });
    return explained.map_or(std::ptr::null_mut(), |explanation| Box::into_raw(Box::new(explanation)));
}"#,
    },
    HostWrapper {
        name: "flight_explain_headless_screen_render_target_read_back",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Explains why flight_create_bitmap_from_headless_screen_render_target would return NULL for target and timeout_ms, re-running the same read-back, and returns an owned explanation. Returns NULL for NULL or for a target no live headless host lent. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_headless_read_back_explanation|flight_host_headless::HeadlessReadBackExplanation"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_explain_headless_screen_render_target_read_back(target: *const flight_sdk::WgpuRenderTarget, timeout_ms: i64) -> *mut flight_host_headless::HeadlessReadBackExplanation {
    let Some(screen) = ffi_find_headless_screen_render_target(target) else {
        return std::ptr::null_mut();
    };
    let explained = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        inject_headless_host_fault("explain_read_back");
        return flight_host_headless::explain_headless_screen_render_target_read_back(&screen, ffi_optional_timeout_ms(timeout_ms));
    }));
    return explained.map_or(std::ptr::null_mut(), |explanation| Box::into_raw(Box::new(explanation)));
}"#,
    },
    HostWrapper {
        name: "flight_free_headless_host_explanation",
        surface: false,
        source: r#"#[doc = "flight-ffi contract|Releases an owned headless host explanation. NULL is a no-op."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_headless_host_explanation(ptr: *mut flight_host_headless::HeadlessHostExplanation) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)); }
    }
}"#,
    },
    HostWrapper {
        name: "flight_free_headless_host_options",
        surface: false,
        source: r#"#[doc = "flight-ffi contract|Releases owned headless host options. NULL is a no-op."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_headless_host_options(ptr: *mut flight_host_headless::HeadlessHostOptions) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)); }
    }
}"#,
    },
    HostWrapper {
        name: "flight_free_headless_read_back_explanation",
        surface: false,
        source: r#"#[doc = "flight-ffi contract|Releases an owned headless read-back explanation. NULL is a no-op."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_free_headless_read_back_explanation(ptr: *mut flight_host_headless::HeadlessReadBackExplanation) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)); }
    }
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_adapter_backend",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the backend name of the adapter the host opened (vulkan, metal or dx12), or NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_adapter_backend(host: *mut FfiHeadlessHostHandle) -> *mut std::ffi::c_char {
    let name = ffi_with_headless_host(host, |registry, token| flight_host_headless::get_headless_host_adapter_backend(&registry.hosts[&token].host).to_string());
    return name.map_or(std::ptr::null_mut(), |name| ffi_owned_c_string(&name));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_adapter_name",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the name the driver reports for the adapter the host opened, or NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_adapter_name(host: *mut FfiHeadlessHostHandle) -> *mut std::ffi::c_char {
    let name = ffi_with_headless_host(host, |registry, token| flight_host_headless::get_headless_host_adapter_name(&registry.hosts[&token].host).to_string());
    return name.map_or(std::ptr::null_mut(), |name| ffi_owned_c_string(&name));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_explanation_adapter_backend",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the backend of the adapter the explained creation chose (empty when none was chosen), or NULL for NULL."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_explanation_adapter_backend(ptr: *const flight_host_headless::HeadlessHostExplanation) -> *mut std::ffi::c_char {
    return unsafe { ptr.as_ref() }.map_or(std::ptr::null_mut(), |explanation| ffi_owned_c_string(&explanation.adapter_backend));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_explanation_adapter_name",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the name of the adapter the explained creation chose (empty when none was chosen), or NULL for NULL."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_explanation_adapter_name(ptr: *const flight_host_headless::HeadlessHostExplanation) -> *mut std::ffi::c_char {
    return unsafe { ptr.as_ref() }.map_or(std::ptr::null_mut(), |explanation| ffi_owned_c_string(&explanation.adapter_name));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_explanation_message",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the platform's own words for a failed device request (empty otherwise), or NULL for NULL."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_explanation_message(ptr: *const flight_host_headless::HeadlessHostExplanation) -> *mut std::ffi::c_char {
    return unsafe { ptr.as_ref() }.map_or(std::ptr::null_mut(), |explanation| ffi_owned_c_string(&explanation.message));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_explanation_reason",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns why the explained creation would fail: 0 Ready, 1 NoAdapter, 2 SoftwareAdapterRejected, 3 DeviceRequestFailed; NULL returns NoAdapter."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_explanation_reason(ptr: *const flight_host_headless::HeadlessHostExplanation) -> u32 {
    return unsafe { ptr.as_ref() }.map_or(flight_host_headless::HeadlessHostExplanationReason::NoAdapter, |explanation| explanation.reason) as u32;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_options_allow_dx12",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the options allow a DirectX 12 adapter."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_options_allow_dx12(ptr: *const flight_host_headless::HeadlessHostOptions) -> bool {
    return unsafe { &*ptr }.allow_dx12;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_options_allow_metal",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the options allow a Metal adapter."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_options_allow_metal(ptr: *const flight_host_headless::HeadlessHostOptions) -> bool {
    return unsafe { &*ptr }.allow_metal;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_options_allow_software_adapter",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the options accept a CPU (software) adapter such as Mesa lavapipe when no hardware adapter is available."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_options_allow_software_adapter(ptr: *const flight_host_headless::HeadlessHostOptions) -> bool {
    return unsafe { &*ptr }.allow_software_adapter;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_options_allow_vulkan",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the options allow a Vulkan adapter."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_options_allow_vulkan(ptr: *const flight_host_headless::HeadlessHostOptions) -> bool {
    return unsafe { &*ptr }.allow_vulkan;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_options_power_preference",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns the hardware adapter preference: 0 None, 1 LowPower, 2 HighPerformance."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_options_power_preference(ptr: *const flight_host_headless::HeadlessHostOptions) -> u32 {
    return unsafe { &*ptr }.power_preference as u32;
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_wgpu_capability",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Lends the host's wgpu capability: acquisition resolves at once with the host's own device, and surface attachment configures a surface from flight_create_headless_host_surface. Every lent handle is a registry token, never a pointer: the SDK functions that take it resolve it to the carrier the live host still holds, and after flight_destroy_headless_host, or for a forged, stale or other-family handle, they return their failure value without reading it. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_wgpu_capability(host: *mut FfiHeadlessHostHandle) -> *const flight_sdk::HostWgpuCapability {
    let lent = ffi_with_headless_host(host, |registry, token| registry.hosts[&token].capability);
    return lent.map_or(std::ptr::null(), std::ptr::without_provenance);
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_wgpu_device",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Lends the host's device, the carrier the SDK's render-state and screen-target functions take. Every lent handle is a registry token, never a pointer: the SDK functions that take it resolve it to the carrier the live host still holds, and after flight_destroy_headless_host, or for a forged, stale or other-family handle, they return their failure value without reading it. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_wgpu_device(host: *mut FfiHeadlessHostHandle) -> *const flight_sdk::WgpuDevice {
    let lent = ffi_with_headless_host(host, |registry, token| registry.hosts[&token].device);
    return lent.map_or(std::ptr::null(), std::ptr::without_provenance);
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_read_back_explanation_message",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns an owned copy of the SDK's own words for a failed map (empty otherwise), or NULL for NULL."]
#[doc = "flight-ffi ownership|owned-return|flight_free_string|std::ffi::c_char"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_read_back_explanation_message(ptr: *const flight_host_headless::HeadlessReadBackExplanation) -> *mut std::ffi::c_char {
    return unsafe { ptr.as_ref() }.map_or(std::ptr::null_mut(), |explanation| ffi_owned_c_string(&explanation.message));
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_read_back_explanation_reason",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns why the explained read-back would fail: 0 Ready, 1 CaptureNotEnabled, 2 NoCapturedFrame, 3 MapFailed; NULL returns CaptureNotEnabled."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_read_back_explanation_reason(ptr: *const flight_host_headless::HeadlessReadBackExplanation) -> u32 {
    return unsafe { ptr.as_ref() }.map_or(flight_host_headless::HeadlessReadBackExplanationReason::CaptureNotEnabled, |explanation| explanation.reason) as u32;
}"#,
    },
    HostWrapper {
        name: "flight_is_headless_host_destroyed",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether host no longer names a live host: true after flight_destroy_headless_host, and for NULL, unknown or foreign handles. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_is_headless_host_destroyed(host: *mut FfiHeadlessHostHandle) -> bool {
    return ffi_with_headless_host(host, |registry, token| flight_host_headless::is_headless_host_destroyed(&registry.hosts[&token].host)).unwrap_or(true);
}"#,
    },
    HostWrapper {
        name: "flight_is_headless_host_software_adapter",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the host opened a CPU (software) adapter, whose rasterization may differ from hardware within a pixel comparison's tolerance; false for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_is_headless_host_software_adapter(host: *mut FfiHeadlessHostHandle) -> bool {
    return ffi_with_headless_host(host, |registry, token| flight_host_headless::is_headless_host_software_adapter(&registry.hosts[&token].host)).unwrap_or(false);
}"#,
    },
    HostWrapper {
        name: "flight_set_headless_host_options_allow_dx12",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Sets whether the options allow a DirectX 12 adapter and returns the value set."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_headless_host_options_allow_dx12(ptr: *mut flight_host_headless::HeadlessHostOptions, value: bool) -> bool {
    unsafe { &mut *ptr }.allow_dx12 = value;
    return value;
}"#,
    },
    HostWrapper {
        name: "flight_set_headless_host_options_allow_metal",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Sets whether the options allow a Metal adapter and returns the value set."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_headless_host_options_allow_metal(ptr: *mut flight_host_headless::HeadlessHostOptions, value: bool) -> bool {
    unsafe { &mut *ptr }.allow_metal = value;
    return value;
}"#,
    },
    HostWrapper {
        name: "flight_set_headless_host_options_allow_software_adapter",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Sets whether the options accept a CPU (software) adapter and returns the value set."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_headless_host_options_allow_software_adapter(ptr: *mut flight_host_headless::HeadlessHostOptions, value: bool) -> bool {
    unsafe { &mut *ptr }.allow_software_adapter = value;
    return value;
}"#,
    },
    HostWrapper {
        name: "flight_set_headless_host_options_allow_vulkan",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Sets whether the options allow a Vulkan adapter and returns the value set."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_headless_host_options_allow_vulkan(ptr: *mut flight_host_headless::HeadlessHostOptions, value: bool) -> bool {
    unsafe { &mut *ptr }.allow_vulkan = value;
    return value;
}"#,
    },
    HostWrapper {
        name: "flight_set_headless_host_options_power_preference",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Sets the hardware adapter preference (0 None, 1 LowPower, 2 HighPerformance) and returns the preference the options now hold; any other value leaves it unchanged."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_set_headless_host_options_power_preference(ptr: *mut flight_host_headless::HeadlessHostOptions, value: u32) -> u32 {
    let options = unsafe { &mut *ptr };
    options.power_preference = match value {
        0 => flight_host_headless::HeadlessHostPowerPreference::None,
        1 => flight_host_headless::HeadlessHostPowerPreference::LowPower,
        2 => flight_host_headless::HeadlessHostPowerPreference::HighPerformance,
        _ => options.power_preference,
    };
    return options.power_preference as u32;
}"#,
    },
];

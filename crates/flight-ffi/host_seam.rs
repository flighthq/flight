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

/// Whether the build script for flight-ffi has `feature` enabled.
pub fn is_host_feature_enabled(feature: &HostFeature) -> bool {
    return std::env::var_os(feature.feature_env).is_some();
}

struct HostWrapper {
    name: &'static str,
    surface: bool,
    source: &'static str,
}

// The registry of live headless hosts and the storage of the carriers each one lends to C. A host
// handle is an odd registry token that is never reissued and never dereferenced; an unknown,
// destroyed or foreign handle finds no entry and every call fails closed. Borrowed carriers are
// boxed in their host's entry, so their addresses are stable until `flight_destroy_headless_host`
// frees them, and a carrier passed back to a host call is accepted only when its address is one a
// live host lent: nothing a caller passes is dereferenced before that check.
const HEADLESS_SUPPORT_TEMPLATE: &str = r#"// native host: flight-host-headless
pub struct FfiHeadlessHostHandle {
    _token_only: [u8; 0],
}
struct FfiHeadlessHostEntry {
    host: Box<flight_host_headless::HeadlessHost>,
    surfaces: Vec<Box<flight_sdk::SurfaceRef>>,
    targets: Vec<Box<flight_sdk::WgpuRenderTarget>>,
}
struct FfiHeadlessHostRegistry {
    issued: usize,
    hosts: std::collections::BTreeMap<usize, FfiHeadlessHostEntry>,
}
static FFI_HEADLESS_HOSTS: std::sync::Mutex<FfiHeadlessHostRegistry> = std::sync::Mutex::new(FfiHeadlessHostRegistry {
    issued: 0,
    hosts: std::collections::BTreeMap::new(),
});
// A critical section only inserts, removes or reads plain values and boxes, so a lock poisoned by
// a contained panic still guards a consistent registry and is recovered.
fn ffi_headless_hosts() -> std::sync::MutexGuard<'static, FfiHeadlessHostRegistry> {
    return FFI_HEADLESS_HOSTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
}
// Runs `body` with the live host `host` names, under the registry lock; `None` for NULL or a handle
// no live host holds.
fn ffi_with_headless_host<R>(host: *mut FfiHeadlessHostHandle, body: impl FnOnce(&mut FfiHeadlessHostEntry) -> R) -> Option<R> {
    if host.is_null() {
        return None;
    }
    let mut registry = ffi_headless_hosts();
    let entry = registry.hosts.get_mut(&host.addr())?;
    return std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| body(entry))).ok();
}
// The screen target behind a render target a live host lent, found by address alone.
fn ffi_find_headless_screen_render_target(target: *const flight_sdk::WgpuRenderTarget) -> Option<flight_sdk::Ref<flight_sdk::WgpuScreenRenderTarget>> {
    if target.is_null() {
        return None;
    }
    let registry = ffi_headless_hosts();
    for entry in registry.hosts.values() {
        for lent in &entry.targets {
            if std::ptr::eq(&**lent, target)
                && let flight_sdk::WgpuRenderTarget::Screen(screen) = &**lent
            {
                return Some(screen.clone());
            }
        }
    }
    return None;
}
// Frees a host's lent carriers and then its device: each screen target releases its GPU textures
// now, the surfaces drop, and the host destroys its device.
fn ffi_destroy_headless_host_entry(mut entry: FfiHeadlessHostEntry) {
    for target in entry.targets.drain(..) {
        if let flight_sdk::WgpuRenderTarget::Screen(screen) = &*target {
            flight_sdk::destroy_wgpu_screen_render_target(&mut screen.write().unwrap_or_else(std::sync::PoisonError::into_inner));
        }
    }
    entry.surfaces.clear();
    flight_host_headless::destroy_headless_host(&mut entry.host);
}
fn ffi_owned_c_string(text: &str) -> *mut std::ffi::c_char {
    return std::ffi::CString::new(text.replace('\0', "")).map_or(std::ptr::null_mut(), std::ffi::CString::into_raw);
}
fn ffi_optional_timeout_ms(timeout_ms: i64) -> Option<u32> {
    return u32::try_from(timeout_ms).ok();
}
#[cfg(test)]
fn count_headless_host_carriers(host: *mut FfiHeadlessHostHandle) -> Option<(usize, usize)> {
    return ffi_headless_hosts().hosts.get(&host.addr()).map(|entry| (entry.surfaces.len(), entry.targets.len()));
}
"#;

const HEADLESS_WRAPPERS: &[HostWrapper] = &[
    HostWrapper {
        name: "flight_create_bitmap_from_headless_screen_render_target",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Reads the last frame submitted to target back to an owned RGBA bitmap through the SDK's screen-target capture, blocking until it settles; a negative timeout_ms waits without limit. Returns NULL for NULL, for a target no live headless host lent (a destroyed host's targets included), when no frame was captured, or when the read-back fails or outlives timeout_ms; flight_explain_headless_screen_render_target_read_back says which. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_free_bitmap|flight_sdk::Bitmap"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_bitmap_from_headless_screen_render_target(target: *const flight_sdk::WgpuRenderTarget, timeout_ms: i64) -> *mut flight_sdk::Bitmap {
    let Some(screen) = ffi_find_headless_screen_render_target(target) else {
        return std::ptr::null_mut();
    };
    let read = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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
        source: r#"#[doc = "flight-ffi contract|Opens a real wgpu device on the adapter options choose (NULL takes flight_create_headless_host_options defaults) and returns an owned opaque host; release it with flight_destroy_headless_host. Returns NULL when no acceptable adapter exists or the device request fails; flight_explain_headless_host says which. options is borrowed for this call only. The handle is a registry token, never a pointer to memory: a destroyed, unknown or foreign handle makes every host call fail closed. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|owned-return|flight_destroy_headless_host|FfiHeadlessHostHandle"]
#[doc = "flight-ffi nullable|options"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host(options: *const flight_host_headless::HeadlessHostOptions) -> *mut FfiHeadlessHostHandle {
    let options = unsafe { options.as_ref() }.copied();
    let created = std::panic::catch_unwind(|| flight_host_headless::create_headless_host(options.as_ref()));
    let Ok(Some(host)) = created else {
        return std::ptr::null_mut();
    };
    let entry = FfiHeadlessHostEntry {
        host: Box::new(host),
        surfaces: Vec::new(),
        targets: Vec::new(),
    };
    let mut registry = ffi_headless_hosts();
    let token = registry.issued.checked_add(1).and_then(|issued| Some((issued, issued.checked_mul(2)?.checked_add(1)?)));
    let Some((issued, token)) = token else {
        drop(registry);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| ffi_destroy_headless_host_entry(entry)));
        return std::ptr::null_mut();
    };
    registry.issued = issued;
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
        source: r#"#[doc = "flight-ffi contract|Creates a width x height RGBA render target with capture read-back enabled, the SDK's own screen render target over a new headless surface, and lends it: the returned target is what flight_begin_wgpu_render_pass draws into and flight_create_bitmap_from_headless_screen_render_target reads back. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed; flight_destroy_headless_host frees it"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host_render_target(host: *mut FfiHeadlessHostHandle, width: u32, height: u32) -> *const flight_sdk::WgpuRenderTarget {
    let lent = ffi_with_headless_host(host, |entry| {
        let target = Box::new(flight_host_headless::create_headless_host_render_target(&entry.host, width, height));
        let address: *const flight_sdk::WgpuRenderTarget = &*target;
        entry.targets.push(target);
        return address;
    });
    return lent.unwrap_or(std::ptr::null());
}"#,
    },
    HostWrapper {
        name: "flight_create_headless_host_surface",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Creates a windowless width x height surface (an empty extent is one pixel) and lends it: the returned SurfaceRef is the drawable the SDK's surface and screen-target functions take; its frames are never shown. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed; flight_destroy_headless_host frees it"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_create_headless_host_surface(host: *mut FfiHeadlessHostHandle, width: u32, height: u32) -> *const flight_sdk::SurfaceRef {
    let lent = ffi_with_headless_host(host, |entry| {
        let surface = Box::new(flight_host_headless::create_headless_host_surface(&entry.host, width, height));
        let address: *const flight_sdk::SurfaceRef = &*surface;
        entry.surfaces.push(surface);
        return address;
    });
    return lent.unwrap_or(std::ptr::null());
}"#,
    },
    HostWrapper {
        name: "flight_destroy_headless_host",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Frees the host now: every surface and render target it lent is released (each target's GPU textures at once) and then its device is destroyed. Every lent device, capability, surface and target pointer is invalid afterwards; render states built over the device stay valid values that observe device loss, and should be released first. NULL, a destroyed, unknown or foreign handle is a no-op, so destroying twice is safe. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_destroy_headless_host(host: *mut FfiHeadlessHostHandle) {
    if host.is_null() {
        return;
    }
    let Some(entry) = ffi_headless_hosts().hosts.remove(&host.addr()) else {
        return;
    };
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| ffi_destroy_headless_host_entry(entry)));
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
    let explained = std::panic::catch_unwind(|| flight_host_headless::explain_headless_host(options.as_ref()));
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
    let name = ffi_with_headless_host(host, |entry| flight_host_headless::get_headless_host_adapter_backend(&entry.host).to_string());
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
    let name = ffi_with_headless_host(host, |entry| flight_host_headless::get_headless_host_adapter_name(&entry.host).to_string());
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
        source: r#"#[doc = "flight-ffi contract|Lends the host's wgpu capability: acquisition resolves at once with the host's own device, and surface attachment configures a surface from flight_create_headless_host_surface. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_wgpu_capability(host: *mut FfiHeadlessHostHandle) -> *const flight_sdk::HostWgpuCapability {
    let lent = ffi_with_headless_host(host, |entry| {
        let capability: *const flight_sdk::HostWgpuCapability = flight_host_headless::get_headless_host_wgpu_capability(&entry.host);
        return capability;
    });
    return lent.unwrap_or(std::ptr::null());
}"#,
    },
    HostWrapper {
        name: "flight_get_headless_host_wgpu_device",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Lends the host's device, the carrier the SDK's render-state and screen-target functions take. Returns NULL for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[doc = "flight-ffi ownership|borrowed|the host is not destroyed"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_get_headless_host_wgpu_device(host: *mut FfiHeadlessHostHandle) -> *const flight_sdk::WgpuDevice {
    let lent = ffi_with_headless_host(host, |entry| {
        let device: *const flight_sdk::WgpuDevice = flight_host_headless::get_headless_host_wgpu_device(&entry.host);
        return device;
    });
    return lent.unwrap_or(std::ptr::null());
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
    return ffi_with_headless_host(host, |entry| flight_host_headless::is_headless_host_destroyed(&entry.host)).unwrap_or(true);
}"#,
    },
    HostWrapper {
        name: "flight_is_headless_host_software_adapter",
        surface: true,
        source: r#"#[doc = "flight-ffi contract|Returns whether the host opened a CPU (software) adapter, whose rasterization may differ from hardware within a pixel comparison's tolerance; false for a destroyed, unknown or foreign host. Headless host calls may come from any thread: one registry lock serializes them, and read-back blocks only its caller. A Rust panic inside the host is contained and returns the call's failure value."]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn flight_is_headless_host_software_adapter(host: *mut FfiHeadlessHostHandle) -> bool {
    return ffi_with_headless_host(host, |entry| flight_host_headless::is_headless_host_software_adapter(&entry.host)).unwrap_or(false);
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

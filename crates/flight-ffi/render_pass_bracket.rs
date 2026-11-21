//! Borrow-erased `begin`/`end` brackets. A bracket's `begin` returns a value borrowing its
//! state; C cannot hold that borrow, so the generator emits an opaque lifecycle token instead. The
//! token is a key into one process-wide registry that records the state's address and entity
//! identity, the pushed record's index (location only) and entity identity, and a phase. The token
//! is never a pointer to memory and is never reissued, so a stale, freed, foreign or forged handle
//! is only ever looked up. Every call claims its state in the registry for the call's duration,
//! re-validates the token in a fixed order, rebuilds one short-lived borrow for the SDK call, and
//! contains a panic from it. The table is exact: no other function is lowered this way, and a
//! signature that drifts from the table fails the build.

/// One function a bracket's open borrow is passed to, with its exact source signature and the
/// bool-returning FFI wrapper the generator emits for it.
pub struct BracketConsumer {
    pub crate_dir: &'static str,
    pub function: &'static str,
    pub signature: &'static str,
    pub ffi_name: &'static str,
}

/// A begin/end pair whose begin borrows `state` mutably for the life of the returned `borrowed`
/// value, the opaque handle that stands in for it across C, and the consumers that take the borrow.
pub struct BorrowErasedBracket {
    pub crate_dir: &'static str,
    pub begin: &'static str,
    pub begin_signature: &'static str,
    pub end: &'static str,
    pub end_signature: &'static str,
    pub state: &'static str,
    pub borrowed: &'static str,
    pub handle: &'static str,
    pub ffi_begin: &'static str,
    pub ffi_end: &'static str,
    pub ffi_free: &'static str,
    pub consumers: &'static [BracketConsumer],
    /// The state wrappers that tear the state down. Each runs its SDK call inside a panic boundary,
    /// so a state a contained draw panic left poisoned or half-written is still destroyed and freed
    /// through its own verbs instead of unwinding into C.
    pub teardowns: &'static [&'static str],
}

/// One non-handle parameter after ordinary lowering: its C parameters, the bindings that convert
/// them, the Rust call argument, and the C parameters that must be non-NULL.
pub struct LoweredParam {
    pub ffi_params: Vec<(String, String)>,
    pub bindings: Vec<String>,
    pub call_expr: String,
    pub required: Vec<String>,
    pub nullable: Vec<String>,
}

/// The exact signature of `function` among `signatures` (each one `pub fn` collected up to its
/// opening brace), checked against `expected`. A missing, duplicated or drifted signature is an
/// error naming the function and what was found.
pub fn check_bracket_signature(
    signatures: &[String],
    function: &str,
    expected: &str,
) -> Result<(), String> {
    let found: Vec<String> = signatures
        .iter()
        .map(|signature| normalize_signature(signature))
        .filter(|signature| {
            let rest = signature.strip_prefix("pub fn ").unwrap_or("");
            rest.strip_prefix(function)
                .is_some_and(|after| after.starts_with('(') || after.starts_with('<'))
        })
        .collect();
    if found.len() != 1 {
        return Err(format!(
            "borrow-erased bracket function `{function}` must be defined exactly once, found {}",
            found.len()
        ));
    }
    if found[0] != normalize_signature(expected) {
        return Err(format!(
            "borrow-erased bracket function `{function}` drifted: expected `{}`, found `{}`",
            normalize_signature(expected),
            found[0]
        ));
    }
    return Ok(());
}

/// Checks the emitted bracket links its owned begin to its free: the begin's ownership metadata
/// names the table's free and handle, and exactly one free takes the handle and returns nothing.
pub fn check_bracket_free_link(
    generated: &str,
    bracket: &BorrowErasedBracket,
) -> Result<(), String> {
    let ownership = format!(
        "#[doc = \"flight-ffi ownership|owned-return|{}|{}\"]",
        bracket.ffi_free, bracket.handle
    );
    let begin = format!("pub unsafe extern \"C\" fn {}(", bracket.ffi_begin);
    let Some(begin_at) = generated.find(&begin) else {
        return Err(format!("{} is not emitted", bracket.ffi_begin));
    };
    let attributes = &generated[..begin_at];
    let attributes = &attributes[attributes.rfind("\n}\n").map_or(0, |at| at + 3)..];
    if !attributes.contains(&ownership) {
        return Err(format!(
            "{} does not declare owned-return ownership released by {}",
            bracket.ffi_begin, bracket.ffi_free
        ));
    }
    let free = format!(
        "pub unsafe extern \"C\" fn {}(pass: *mut {}) {{",
        bracket.ffi_free, bracket.handle
    );
    if generated.matches(&free).count() != 1 {
        return Err(format!(
            "{} must be emitted once, taking only *mut {} and returning nothing",
            bracket.ffi_free, bracket.handle
        ));
    }
    return Ok(());
}

/// The bool wrapper for one consumer: required arguments are checked first, then the call claims
/// the handle and its state, then the relation is validated, and only an Open handle on the exact
/// top record reaches the SDK call, inside a panic boundary.
pub fn generate_bracket_consumer(
    bracket: &BorrowErasedBracket,
    consumer: &BracketConsumer,
    params: &[LoweredParam],
) -> String {
    let mut ffi_params = vec![format!("pass: *mut {}", bracket.handle)];
    let mut required = vec!["pass".to_string()];
    let mut nullable = Vec::new();
    let mut bindings = Vec::new();
    let mut call_args = vec!["&mut ffi_pass".to_string()];
    for param in params {
        for (name, ty) in &param.ffi_params {
            ffi_params.push(format!("{name}: {ty}"));
        }
        required.extend(param.required.iter().cloned());
        nullable.extend(param.nullable.iter().cloned());
        bindings.extend(param.bindings.iter().cloned());
        call_args.push(param.call_expr.clone());
    }
    let bindings: String = bindings
        .iter()
        .map(|binding| format!("{binding}\n"))
        .collect();
    return CONSUMER_TEMPLATE
        .replace("{notes}", &get_nullable_notes(&nullable))
        .replace("{contract}", CONSUMER_CONTRACT)
        .replace("{ffi}", consumer.ffi_name)
        .replace("{params}", &ffi_params.join(", "))
        .replace("{null_check}", &get_null_check(&required))
        .replace("{bindings}", &bindings)
        .replace("{function}", consumer.function)
        .replace("{args}", &call_args.join(", "))
        .replace("{borrowed}", bracket.borrowed)
        .replace("{state}", bracket.state)
        .replace("{qualifier}", QUALIFIER);
}

/// The handle, registry, claims, validator, begin, end and free for one bracket. `target` and
/// `clear` are the begin's ordinarily lowered borrowed arguments.
pub fn generate_bracket_support(
    bracket: &BorrowErasedBracket,
    target: &LoweredParam,
    clear: &LoweredParam,
) -> String {
    let mut begin_params = vec![format!("state: *mut {QUALIFIER}::{}", bracket.state)];
    let mut required = vec!["state".to_string()];
    let mut nullable = Vec::new();
    let mut bindings = Vec::new();
    for param in [target, clear] {
        for (name, ty) in &param.ffi_params {
            begin_params.push(format!("{name}: {ty}"));
        }
        required.extend(param.required.iter().cloned());
        nullable.extend(param.nullable.iter().cloned());
        bindings.extend(param.bindings.iter().cloned());
    }
    let bindings: String = bindings
        .iter()
        .map(|binding| format!("{binding}\n"))
        .collect();
    let mut out = format!(
        "// Borrow-erased bracket {}/{}: the handle is a registry token, never a borrow.\n",
        bracket.begin, bracket.end
    );
    out.push_str(SUPPORT_TEMPLATE);
    out.push_str(
        &BEGIN_TEMPLATE
            .replace("{notes}", &get_nullable_notes(&nullable))
            .replace("{contract}", BEGIN_CONTRACT)
            .replace("{free}", bracket.ffi_free)
            .replace("{ffi_begin}", bracket.ffi_begin)
            .replace("{params}", &begin_params.join(", "))
            .replace("{null_check}", &get_null_check(&required))
            .replace("{bindings}", &bindings)
            .replace("{begin}", bracket.begin)
            .replace("{target}", &target.call_expr)
            .replace("{clear}", &clear.call_expr),
    );
    out.push_str(
        &END_TEMPLATE
            .replace("{contract}", END_CONTRACT)
            .replace("{ffi_end}", bracket.ffi_end),
    );
    out.push_str(
        &FREE_TEMPLATE
            .replace("{contract}", FREE_CONTRACT)
            .replace("{ffi_free}", bracket.ffi_free),
    );
    return out
        .replace("{handle}", bracket.handle)
        .replace("{borrowed}", bracket.borrowed)
        .replace("{state}", bracket.state)
        .replace("{qualifier}", QUALIFIER);
}

/// Every wrapper in `generated` that takes the bracket's state outside the bracket, with a state
/// claim inserted at the top of its body and the state contract added to its documentation. A
/// guarded wrapper refuses a NULL state, a state inside another call and a state an open pass
/// borrows, returning its failure value. A teardown wrapper also runs the rest of its body inside a
/// panic boundary and carries the teardown contract. Returns the guarded text and the guarded
/// wrapper names.
pub fn guard_bracket_state_wrappers(
    generated: &str,
    bracket: &BorrowErasedBracket,
) -> (String, Vec<String>) {
    let state_types = [
        format!("*mut {QUALIFIER}::{}", bracket.state),
        format!("*const {QUALIFIER}::{}", bracket.state),
    ];
    let mut out = String::with_capacity(generated.len());
    let mut guarded = Vec::new();
    let mut in_teardown = false;
    for line in generated.split_inclusive('\n') {
        if in_teardown && line == "}\n" {
            out.push_str("    }));\n");
            in_teardown = false;
        }
        let Some(signature) = line.strip_prefix("pub unsafe extern \"C\" fn ") else {
            out.push_str(line);
            continue;
        };
        let Some(open) = signature.find('(') else {
            out.push_str(line);
            continue;
        };
        let Some(close) = signature.rfind(')') else {
            out.push_str(line);
            continue;
        };
        let name = &signature[..open];
        let state_param = signature[open + 1..close]
            .split(", ")
            .filter_map(|param| param.split_once(": "))
            .find(|(_, ty)| state_types.iter().any(|state_type| ty == state_type))
            .map(|(param, _)| param.to_string());
        let Some(state_param) = state_param else {
            out.push_str(line);
            continue;
        };
        let returns = signature[close + 1..].trim().trim_end_matches('{').trim();
        let failure = match returns.strip_prefix("-> ").map(str::trim) {
            None => "return;".to_string(),
            Some("bool") => "return false;".to_string(),
            Some(ty) if ty.starts_with("*mut ") => "return std::ptr::null_mut();".to_string(),
            Some(ty) if ty.starts_with("*const ") => "return std::ptr::null();".to_string(),
            Some(_) => "return Default::default();".to_string(),
        };
        let teardown = returns.is_empty() && bracket.teardowns.contains(&name);
        let attribute = "#[unsafe(no_mangle)]\n";
        if out.ends_with(attribute) {
            out.truncate(out.len() - attribute.len());
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|{STATE_CONTRACT}\"]\n"
            ));
            if teardown {
                out.push_str(&format!(
                    "#[doc = \"flight-ffi contract|{TEARDOWN_CONTRACT}\"]\n"
                ));
            }
            out.push_str(attribute);
        }
        out.push_str(line);
        out.push_str(&format!(
            "    let Some(_bracket_state_claim) = ffi_claim_wgpu_render_state({state_param}, true) else {{ {failure} }};\n"
        ));
        if teardown {
            out.push_str(
                "    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n",
            );
            in_teardown = true;
        }
        guarded.push(name.to_string());
    }
    return (out, guarded);
}

/// `signature` on one line with single spaces and no padding inside brackets, cut at its body.
pub fn normalize_signature(signature: &str) -> String {
    let head = signature.split('{').next().unwrap_or("");
    let collapsed = head.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = collapsed
        .replace("( ", "(")
        .replace(" )", ")")
        .replace("< ", "<")
        .replace(" >", ">")
        .replace(" ,", ",")
        .replace(",)", ")");
    while out.ends_with(' ') {
        out.pop();
    }
    return out;
}

fn get_null_check(required: &[String]) -> String {
    return required
        .iter()
        .map(|name| format!("{name}.is_null()"))
        .collect::<Vec<_>>()
        .join(" || ");
}

fn get_nullable_notes(nullable: &[String]) -> String {
    return nullable
        .iter()
        .map(|name| format!("#[doc = \"flight-ffi nullable|{name}\"]\n"))
        .collect();
}

/// The one bracket the generator lowers: the WGPU render pass and its three draw consumers.
pub const BORROW_ERASED_BRACKETS: &[BorrowErasedBracket] = &[BorrowErasedBracket {
    crate_dir: "flight-render-wgpu",
    begin: "begin_wgpu_render_pass",
    begin_signature: "pub fn begin_wgpu_render_pass<'a>(state: &'a mut WgpuRenderState, target: &WgpuRenderTarget, clear: Option<&RenderTargetClear>) -> WgpuRenderPass<'a>",
    end: "end_wgpu_render_pass",
    end_signature: "pub fn end_wgpu_render_pass(pass: WgpuRenderPass<'_>)",
    state: "WgpuRenderState",
    borrowed: "WgpuRenderPass",
    handle: "FfiWgpuRenderPassHandle",
    ffi_begin: "flight_begin_wgpu_render_pass",
    ffi_end: "flight_end_wgpu_render_pass",
    ffi_free: "flight_free_wgpu_render_pass_handle",
    consumers: &[
        BracketConsumer {
            crate_dir: "flight-scene2d-wgpu",
            function: "render_wgpu_scene2d",
            signature: "pub fn render_wgpu_scene2d(pass: &mut WgpuRenderPass<'_>, proxies: &mut RenderProxies2D<WgpuRenderState>, source: &NodeRef, render_transform: Option<&Matrix>)",
            ffi_name: "flight_render_wgpu_scene2d",
        },
        BracketConsumer {
            crate_dir: "flight-scene3d-wgpu",
            function: "render_wgpu_scene3d",
            signature: "pub fn render_wgpu_scene3d(pass: &mut WgpuRenderPass<'_>, scene: &NodeRef, camera: &Camera3D, lights: &Scene3DLightsLike, forward_lights: Option<&WgpuScene3DForwardLightList>)",
            ffi_name: "flight_render_wgpu_scene3d",
        },
        BracketConsumer {
            crate_dir: "flight-scene3d-wgpu",
            function: "render_wgpu_environment_skybox",
            signature: "pub fn render_wgpu_environment_skybox(render_pass: &mut WgpuRenderPass<'_>, environment: &Environment, camera: &Camera3D, aspect: f64)",
            ffi_name: "flight_render_wgpu_environment_skybox",
        },
    ],
    teardowns: &[
        "flight_destroy_wgpu_render_state",
        "flight_destroy_wgpu_scene_2d_render",
    ],
}];

/// The header contract the begin wrapper carries.
pub const BEGIN_CONTRACT: &str = "Opens a render pass on state into target and returns an owned opaque pass handle; release it with flight_free_wgpu_render_pass_handle. NULL state or target, a pass already open on state, or a state another call holds returns NULL without changing state; NULL clear loads every aspect. target and clear are borrowed for this call only. The handle is a registry token, never a pointer to memory, and holds the open bracket, never the state. Until the pass is ended or freed, state must stay alive at the same address, and nothing may read, mutate, submit, replace, destroy, move or free it except through this handle. Calls may come from any thread: each call on a state claims the state for its duration, and a call that finds the state claimed returns its failure value at once instead of waiting. A Rust panic inside the SDK begin is contained and returns NULL; the state may then keep a partially opened pass, which refuses later begins. A non-local jump or foreign exception must not cross any call.";

/// The header contract each consumer wrapper carries.
pub const CONSUMER_CONTRACT: &str = "Draws through an open pass handle and returns true. Returns false without drawing or changing the pass when pass or a required argument is NULL, the handle is unknown, freed, ended or stale, another call holds the handle's state (including a call on the same handle from inside a draw), its original pass was replaced, or a pass opened natively on the same state is still open above it. A Rust panic inside the draw is contained: the call returns false and the pass stays open, so it can be drawn through again or ended. Every other argument keeps its ordinary borrow contract.";

/// The header contract the end wrapper carries.
pub const END_CONTRACT: &str = "Ends the open pass, restoring the state and submitting the frame the pass opened, and returns true. The handle becomes an ended tombstone that still needs exactly one flight_free_wgpu_render_pass_handle. Returns false and changes nothing for NULL, an unknown, freed, ended or stale handle, a state another call holds, or a pass opened natively above this one; an absent or replaced original pass marks the handle stale and is never ended. A Rust panic inside the SDK end is contained: the call returns false and the handle becomes stale.";

/// The header contract the free wrapper carries.
pub const FREE_CONTRACT: &str = "Releases a pass handle. NULL, an unknown or already released handle, or a pointer that is not a pass handle is a no-op: handles are registry tokens that are never reissued and never dereferenced. An open handle whose original pass is the innermost is ended first. Freeing is a no-op, and the handle stays open, while another call holds its state (including a call on the same handle from inside a draw) or while a pass opened natively is still open above it. An absent or replaced original pass is never ended; only the handle is released. A Rust panic inside the SDK end is contained and the handle is still released.";

/// The header contract a teardown wrapper carries besides the state contract.
pub const TEARDOWN_CONTRACT: &str = "Teardown completes even after a contained draw panic or device loss: a resource lock a panic poisoned is recovered, and a Rust panic inside the teardown is contained. Teardown runs once; a state it already tore down is left as it is, and the state is still freed by its own free function.";

/// The header contract every other wrapper that takes the bracket's state carries.
pub const STATE_CONTRACT: &str = "Returns without touching state, with its failure value where it returns one, when state is NULL, another call on any thread holds state, or an open render pass handle borrows state.";

const QUALIFIER: &str = "flight_sdk";

// The phase, relation, handle type, registry, claims and validator shared by every wrapper of the
// bracket. The validation trace, the fault points and the registry probes exist in test builds
// only, so tests can observe the validator's order and drive panics and poisoning.
const SUPPORT_TEMPLATE: &str = r#"#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FfiWgpuRenderPassPhase {
    Open,
    Busy,
    Ended,
    Stale,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FfiWgpuRenderPassRelation {
    ExactTop,
    ExactBelowTop,
    Stale,
}
// The C-visible pass handle type. No value of it is ever allocated or dereferenced: a handle
// pointer is a render pass registry token, never reissued in any family.
pub struct {handle} {
    _token_only: [u8; 0],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FfiWgpuRenderPassEntry {
    state: usize,
    state_id: u64,
    index: usize,
    record_id: u64,
    phase: FfiWgpuRenderPassPhase,
}
// Every live handle by token, every state address inside a call, and each state's open bracket.
// The one lock makes each check-and-transition indivisible; SDK calls run outside it under a state
// claim. A critical section only inserts, removes or assigns plain values, so a lock poisoned by a
// panic elsewhere still guards a consistent registry and is recovered.
struct FfiWgpuRenderPassRegistry {
    entries: std::collections::BTreeMap<usize, FfiWgpuRenderPassEntry>,
    claimed: std::collections::BTreeSet<usize>,
    open: std::collections::BTreeMap<usize, usize>,
}
static FFI_WGPU_RENDER_PASSES: std::sync::Mutex<FfiWgpuRenderPassRegistry> = std::sync::Mutex::new(FfiWgpuRenderPassRegistry {
    entries: std::collections::BTreeMap::new(),
    claimed: std::collections::BTreeSet::new(),
    open: std::collections::BTreeMap::new(),
});
fn ffi_wgpu_render_passes() -> std::sync::MutexGuard<'static, FfiWgpuRenderPassRegistry> {
    return FFI_WGPU_RENDER_PASSES.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
}
// A state held by one call. Dropping it, also while unwinding, releases the state.
struct FfiWgpuRenderStateClaim(usize);
impl Drop for FfiWgpuRenderStateClaim {
    fn drop(&mut self) {
        ffi_wgpu_render_passes().claimed.remove(&self.0);
    }
}
// Claims a state no other call holds. With `require_closed`, a state an open pass borrows is
// refused too: outside the bracket nothing may touch a state while its pass is open.
fn ffi_claim_wgpu_render_state(state: *const {qualifier}::{state}, require_closed: bool) -> Option<FfiWgpuRenderStateClaim> {
    if state.is_null() {
        return None;
    }
    let address = state.addr();
    let mut registry = ffi_wgpu_render_passes();
    if require_closed && registry.open.contains_key(&address) {
        return None;
    }
    if !registry.claimed.insert(address) {
        return None;
    }
    return Some(FfiWgpuRenderStateClaim(address));
}
// One call through an Open handle: the handle is Busy and its state claimed until the call drops.
// Dropping it, on return or while unwinding, settles the handle to `settle`, for a terminal phase
// releases the state's open bracket, and releases the state claim, all in one critical section.
struct FfiWgpuRenderPassCall {
    token: usize,
    entry: FfiWgpuRenderPassEntry,
    settle: FfiWgpuRenderPassPhase,
}
impl Drop for FfiWgpuRenderPassCall {
    fn drop(&mut self) {
        let mut registry = ffi_wgpu_render_passes();
        if let Some(entry) = registry.entries.get_mut(&self.token) {
            entry.phase = self.settle;
        }
        let terminal = matches!(self.settle, FfiWgpuRenderPassPhase::Ended | FfiWgpuRenderPassPhase::Stale);
        if terminal && registry.open.get(&self.entry.state) == Some(&self.token) {
            registry.open.remove(&self.entry.state);
        }
        registry.claimed.remove(&self.entry.state);
    }
}
// Starts a call on `pass`: the token must name a live Open handle whose state no other call holds.
fn ffi_start_wgpu_render_pass_call(pass: *mut {handle}) -> Option<FfiWgpuRenderPassCall> {
    return ffi_start_locked_wgpu_render_pass_call(&mut ffi_wgpu_render_passes(), pass.addr());
}
// Free's one critical section: an ended or stale handle is released, and an Open one whose state
// no other call holds starts the call that ends it. Any other handle, a Busy one included, is left
// exactly as it is.
fn ffi_start_wgpu_render_pass_release(pass: *mut {handle}) -> Option<FfiWgpuRenderPassCall> {
    let token = pass.addr();
    if !ffi_is_registry_token(token, FFI_RENDER_PASS_TOKEN_TAG) {
        return None;
    }
    let mut registry = ffi_wgpu_render_passes();
    let phase = registry.entries.get(&token)?.phase;
    if matches!(phase, FfiWgpuRenderPassPhase::Ended | FfiWgpuRenderPassPhase::Stale) {
        registry.entries.remove(&token);
        return None;
    }
    return ffi_start_locked_wgpu_render_pass_call(&mut registry, token);
}
// The phase check, the claim and the Busy transition of a call start, under the registry lock the
// caller holds, so no other call can change the handle between the check and the transition.
fn ffi_start_locked_wgpu_render_pass_call(registry: &mut FfiWgpuRenderPassRegistry, token: usize) -> Option<FfiWgpuRenderPassCall> {
    if !ffi_is_registry_token(token, FFI_RENDER_PASS_TOKEN_TAG) {
        return None;
    }
    let entry = *registry.entries.get(&token)?;
    if entry.phase != FfiWgpuRenderPassPhase::Open {
        return None;
    }
    if !registry.claimed.insert(entry.state) {
        return None;
    }
    if let Some(live) = registry.entries.get_mut(&token) {
        live.phase = FfiWgpuRenderPassPhase::Busy;
    }
    return Some(FfiWgpuRenderPassCall {
        token,
        entry,
        settle: FfiWgpuRenderPassPhase::Open,
    });
}
// Issues a render pass token for a newly opened pass and records it as its state's open bracket.
// When the token sequence is exhausted none is issued.
fn ffi_register_wgpu_render_pass(entry: FfiWgpuRenderPassEntry) -> Option<usize> {
    let mut registry = ffi_wgpu_render_passes();
    let token = ffi_mint_registry_token(FFI_RENDER_PASS_TOKEN_TAG)?;
    registry.entries.insert(token, entry);
    registry.open.insert(entry.state, token);
    return Some(token);
}
// Before a begin on a state the caller has claimed: the open bracket recorded at this address is
// released when its state or record no longer matches, and keeps the state refused when it does.
// Returns whether the state is free of an open bracket. The lookup, the classification and the
// release are one critical section; classifying only reads the claimed state.
unsafe fn ffi_settle_wgpu_render_state_bracket(state: usize) -> bool {
    let mut registry = ffi_wgpu_render_passes();
    let Some(token) = registry.open.get(&state).copied() else {
        return true;
    };
    if let Some(entry) = registry.entries.get(&token)
        && unsafe { ffi_classify_wgpu_render_pass(entry) } != FfiWgpuRenderPassRelation::Stale
    {
        return false;
    }
    if let Some(live) = registry.entries.get_mut(&token) {
        live.phase = FfiWgpuRenderPassPhase::Stale;
    }
    registry.open.remove(&state);
    return true;
}
#[cfg(test)]
std::thread_local! {
    static FFI_WGPU_RENDER_PASS_TRACE: std::cell::RefCell<Vec<&'static str>> = const { std::cell::RefCell::new(Vec::new()) };
    static FFI_WGPU_RENDER_PASS_FAULT: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) };
    static FFI_WGPU_RENDER_PASS_HOOK: std::cell::RefCell<Option<(&'static str, Box<dyn FnOnce()>)>> = const { std::cell::RefCell::new(None) };
}
#[cfg(test)]
fn trace_wgpu_render_pass_validation(step: &'static str) {
    FFI_WGPU_RENDER_PASS_TRACE.with(|trace| trace.borrow_mut().push(step));
}
#[cfg(not(test))]
fn trace_wgpu_render_pass_validation(_step: &'static str) {}
#[cfg(test)]
fn take_wgpu_render_pass_validation_trace() -> Vec<&'static str> {
    return FFI_WGPU_RENDER_PASS_TRACE.with(|trace| std::mem::take(&mut *trace.borrow_mut()));
}
#[cfg(test)]
fn inject_wgpu_render_pass_fault(point: &'static str) {
    if FFI_WGPU_RENDER_PASS_FAULT.with(|fault| fault.get()) == Some(point) {
        FFI_WGPU_RENDER_PASS_FAULT.with(|fault| fault.set(None));
        panic!("injected {point} fault");
    }
}
#[cfg(not(test))]
fn inject_wgpu_render_pass_fault(_point: &'static str) {}
// Runs, once, the test hook set for `point` on this thread, so a test can act at an exact point
// between a wrapper's registry decision and what it does with it.
#[cfg(test)]
fn run_wgpu_render_pass_hook(point: &'static str) {
    let hook = FFI_WGPU_RENDER_PASS_HOOK.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.as_ref().is_some_and(|(at, _)| *at == point) {
            return slot.take().map(|(_, hook)| hook);
        }
        return None;
    });
    if let Some(hook) = hook {
        hook();
    }
}
#[cfg(not(test))]
fn run_wgpu_render_pass_hook(_point: &'static str) {}
#[cfg(test)]
fn set_wgpu_render_pass_hook(point: &'static str, hook: Box<dyn FnOnce()>) {
    FFI_WGPU_RENDER_PASS_HOOK.with(|slot| *slot.borrow_mut() = Some((point, hook)));
}
#[cfg(test)]
fn set_wgpu_render_pass_fault(point: Option<&'static str>) {
    FFI_WGPU_RENDER_PASS_FAULT.with(|fault| fault.set(point));
}
#[cfg(test)]
fn inspect_wgpu_render_pass(pass: *mut {handle}) -> Option<FfiWgpuRenderPassEntry> {
    return ffi_wgpu_render_passes().entries.get(&pass.addr()).copied();
}
#[cfg(test)]
fn is_wgpu_render_state_claimed(state: *const {qualifier}::{state}) -> bool {
    return ffi_wgpu_render_passes().claimed.contains(&state.addr());
}
#[cfg(test)]
fn get_wgpu_render_state_open_pass(state: *const {qualifier}::{state}) -> Option<usize> {
    return ffi_wgpu_render_passes().open.get(&state.addr()).copied();
}
#[cfg(test)]
fn poison_wgpu_render_passes() {
    let poisoner = std::thread::spawn(|| {
        let _registry = FFI_WGPU_RENDER_PASSES.lock();
        panic!("poison the render pass registry");
    });
    let _ = poisoner.join();
}
#[cfg(test)]
fn is_wgpu_render_pass_registry_poisoned() -> bool {
    return FFI_WGPU_RENDER_PASSES.is_poisoned();
}
// Classifies a handle's entry in a fixed order: the state's identity first, then the original
// record at the captured index, then whether it is the innermost pass. Nothing past a failed step
// is read. The caller holds the state's claim, so no FFI call mutates the state meanwhile.
unsafe fn ffi_classify_wgpu_render_pass(entry: &FfiWgpuRenderPassEntry) -> FfiWgpuRenderPassRelation {
    let state: &{qualifier}::{state} = unsafe { &*std::ptr::with_exposed_provenance::<{qualifier}::{state}>(entry.state) };
    trace_wgpu_render_pass_validation("state_id");
    if {qualifier}::entity::contract::get_entity_id(state) != entry.state_id {
        return FfiWgpuRenderPassRelation::Stale;
    }
    trace_wgpu_render_pass_validation("pass_stack");
    let pass_stack = &{qualifier}::render_wgpu::contract::get_wgpu_render_state_runtime(state).pass_stack;
    trace_wgpu_render_pass_validation("record_id");
    let is_original = pass_stack.get(entry.index).is_some_and(|record| {qualifier}::entity::contract::get_entity_id(record) == entry.record_id);
    if !is_original {
        return FfiWgpuRenderPassRelation::Stale;
    }
    trace_wgpu_render_pass_validation("top");
    if entry.index + 1 == pass_stack.len() {
        return FfiWgpuRenderPassRelation::ExactTop;
    }
    return FfiWgpuRenderPassRelation::ExactBelowTop;
}
// Ends the exact top record of a call's pass through the ordinary end, inside a panic boundary.
// The call settles Ended after a completed end and Stale after a contained panic.
unsafe fn ffi_end_exact_wgpu_render_pass(call: &mut FfiWgpuRenderPassCall) -> bool {
    let state = std::ptr::with_exposed_provenance_mut::<{qualifier}::{state}>(call.entry.state);
    let index = call.entry.index;
    call.settle = FfiWgpuRenderPassPhase::Stale;
    let ended = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        inject_wgpu_render_pass_fault("end");
        {qualifier}::render_wgpu::contract::end_wgpu_render_pass({qualifier}::render_wgpu::contract::{borrowed} { state: unsafe { &mut *state }, index });
    }));
    if ended.is_err() {
        return false;
    }
    call.settle = FfiWgpuRenderPassPhase::Ended;
    return true;
}
"#;

const BEGIN_TEMPLATE: &str = r#"{notes}#[doc = "flight-ffi contract|{contract}"]
#[doc = "flight-ffi ownership|owned-return|{free}|{handle}"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn {ffi_begin}({params}) -> *mut {handle} {
    if {null_check} {
        return std::ptr::null_mut();
    }
    let Some(claim) = ffi_claim_wgpu_render_state(state, false) else {
        return std::ptr::null_mut();
    };
    if !unsafe { ffi_settle_wgpu_render_state_bracket(state.addr()) } {
        return std::ptr::null_mut();
    }
    if {qualifier}::render_wgpu::contract::get_wgpu_active_render_pass(unsafe { &*state }).is_some() {
        return std::ptr::null_mut();
    }
{bindings}    let opened = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let {qualifier}::render_wgpu::contract::{borrowed} { state: begun, index } = {qualifier}::render_wgpu::contract::{begin}(unsafe { &mut *state }, {target}, {clear});
        inject_wgpu_render_pass_fault("begin");
        let state_id = {qualifier}::entity::contract::get_entity_id(&*begun);
        let record_id = {qualifier}::entity::contract::get_entity_id(&{qualifier}::render_wgpu::contract::get_wgpu_render_state_runtime(begun).pass_stack[index]);
        (state_id, index, record_id)
    }));
    let Ok((state_id, index, record_id)) = opened else {
        return std::ptr::null_mut();
    };
    let entry = FfiWgpuRenderPassEntry {
        state: state.expose_provenance(),
        state_id,
        index,
        record_id,
        phase: FfiWgpuRenderPassPhase::Open,
    };
    let Some(token) = ffi_register_wgpu_render_pass(entry) else {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            {qualifier}::render_wgpu::contract::end_wgpu_render_pass({qualifier}::render_wgpu::contract::{borrowed} { state: unsafe { &mut *state }, index });
        }));
        return std::ptr::null_mut();
    };
    drop(claim);
    return std::ptr::without_provenance_mut(token);
}
"#;

const END_TEMPLATE: &str = r#"#[doc = "flight-ffi contract|{contract}"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn {ffi_end}(pass: *mut {handle}) -> bool {
    if pass.is_null() {
        return false;
    }
    let Some(mut call) = ffi_start_wgpu_render_pass_call(pass) else {
        return false;
    };
    match unsafe { ffi_classify_wgpu_render_pass(&call.entry) } {
        FfiWgpuRenderPassRelation::ExactTop => {}
        FfiWgpuRenderPassRelation::ExactBelowTop => return false,
        FfiWgpuRenderPassRelation::Stale => {
            call.settle = FfiWgpuRenderPassPhase::Stale;
            return false;
        }
    }
    return unsafe { ffi_end_exact_wgpu_render_pass(&mut call) };
}
"#;

const FREE_TEMPLATE: &str = r#"#[doc = "flight-ffi contract|{contract}"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn {ffi_free}(pass: *mut {handle}) {
    if pass.is_null() {
        return;
    }
    let started = ffi_start_wgpu_render_pass_release(pass);
    run_wgpu_render_pass_hook("free");
    let Some(mut call) = started else {
        return;
    };
    match unsafe { ffi_classify_wgpu_render_pass(&call.entry) } {
        FfiWgpuRenderPassRelation::ExactBelowTop => return,
        FfiWgpuRenderPassRelation::Stale => call.settle = FfiWgpuRenderPassPhase::Stale,
        FfiWgpuRenderPassRelation::ExactTop => {
            unsafe { ffi_end_exact_wgpu_render_pass(&mut call) };
        }
    }
    let token = call.token;
    drop(call);
    ffi_wgpu_render_passes().entries.remove(&token);
}
"#;

const CONSUMER_TEMPLATE: &str = r#"{notes}#[doc = "flight-ffi contract|{contract}"]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn {ffi}({params}) -> bool {
    if {null_check} {
        return false;
    }
    let Some(mut call) = ffi_start_wgpu_render_pass_call(pass) else {
        return false;
    };
    match unsafe { ffi_classify_wgpu_render_pass(&call.entry) } {
        FfiWgpuRenderPassRelation::ExactTop => {}
        FfiWgpuRenderPassRelation::ExactBelowTop => return false,
        FfiWgpuRenderPassRelation::Stale => {
            call.settle = FfiWgpuRenderPassPhase::Stale;
            return false;
        }
    }
    let state = std::ptr::with_exposed_provenance_mut::<{qualifier}::{state}>(call.entry.state);
    let index = call.entry.index;
{bindings}    let drawn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut ffi_pass = {qualifier}::render_wgpu::contract::{borrowed} { state: unsafe { &mut *state }, index };
        {qualifier}::{function}({args});
    }));
    return drawn.is_ok();
}
"#;

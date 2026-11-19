//! Borrow-erased `begin`/`end` brackets. A bracket's `begin` returns a value borrowing its
//! state; C cannot hold that borrow, so the generator emits an opaque lifecycle token instead: the
//! state's stable address and entity identity, the pushed record's index (location only) and entity
//! identity, and a phase. Every operation re-validates the token, in a fixed order, before it
//! rebuilds one short-lived borrow for the duration of a single wrapper call. The table is exact:
//! no other function is lowered this way, and a signature that drifts from the table fails the
//! build.

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

/// The bool wrapper for one consumer: required arguments are checked first, then the handle's
/// phase and relation, and only an Open handle on the exact top record reaches the SDK call.
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
    let null_check = required
        .iter()
        .map(|name| format!("{name}.is_null()"))
        .collect::<Vec<_>>()
        .join(" || ");
    let notes: String = nullable
        .iter()
        .map(|name| format!("#[doc = \"flight-ffi nullable|{name}\"]\n"))
        .collect();
    let bindings: String = bindings
        .iter()
        .map(|binding| format!("{binding}\n"))
        .collect();
    return format!(
        "{notes}#[doc = \"flight-ffi contract|{contract}\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi}({params}) -> bool {{\n    if {null_check} {{\n        return false;\n    }}\n    if unsafe {{ (*pass).phase }} != FfiWgpuRenderPassPhase::Open {{\n        return false;\n    }}\n    if unsafe {{ ffi_classify_wgpu_render_pass(pass) }} != FfiWgpuRenderPassRelation::ExactTop {{\n        return false;\n    }}\n    let (state, index) = unsafe {{ ((*pass).state, (*pass).index) }};\n    {{\n{bindings}        unsafe {{ (*pass).phase = FfiWgpuRenderPassPhase::Busy }};\n        let mut ffi_pass = {qualifier}::render_wgpu::contract::{borrowed} {{ state: unsafe {{ &mut *state.as_ptr() }}, index }};\n        {qualifier}::{function}({args});\n    }}\n    unsafe {{ (*pass).phase = FfiWgpuRenderPassPhase::Open }};\n    return true;\n}}\n",
        contract = CONSUMER_CONTRACT,
        ffi = consumer.ffi_name,
        params = ffi_params.join(", "),
        qualifier = QUALIFIER,
        borrowed = bracket.borrowed,
        function = consumer.function,
        args = call_args.join(", "),
    );
}

/// The handle, phase, validator, begin, end and free for one bracket. `target` and `clear` are the
/// begin's ordinarily lowered borrowed arguments.
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
    let null_check = required
        .iter()
        .map(|name| format!("{name}.is_null()"))
        .collect::<Vec<_>>()
        .join(" || ");
    let notes: String = nullable
        .iter()
        .map(|name| format!("#[doc = \"flight-ffi nullable|{name}\"]\n"))
        .collect();
    let bindings: String = bindings
        .iter()
        .map(|binding| format!("{binding}\n"))
        .collect();
    let contract = |text: &str| format!("#[doc = \"flight-ffi contract|{text}\"]\n");
    let mut out = String::new();
    out.push_str(&format!(
        "// Borrow-erased bracket {begin}/{end}: the handle carries identities, never a borrow.\n",
        begin = bracket.begin,
        end = bracket.end
    ));
    out.push_str(
        SUPPORT
            .replace("{handle}", bracket.handle)
            .replace("{qualifier}", QUALIFIER)
            .replace("{state}", bracket.state)
            .as_str(),
    );
    out.push_str(&format!(
        "{notes}{contract}#[doc = \"flight-ffi ownership|owned-return|{free}|{handle}\"]\n#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_begin}({params}) -> *mut {handle} {{\n    if {null_check} {{\n        return std::ptr::null_mut();\n    }}\n    if {qualifier}::render_wgpu::contract::get_wgpu_active_render_pass(unsafe {{ &*state }}).is_some() {{\n        return std::ptr::null_mut();\n    }}\n{bindings}    let {qualifier}::render_wgpu::contract::{borrowed} {{ state: begun, index }} = {qualifier}::render_wgpu::contract::{begin}(unsafe {{ &mut *state }}, {target}, {clear});\n    let state_id = {qualifier}::entity::contract::get_entity_id(&*begun);\n    let record_id = {qualifier}::entity::contract::get_entity_id(&{qualifier}::render_wgpu::contract::get_wgpu_render_state_runtime(begun).pass_stack[index]);\n    let handle = {handle} {{\n        state: std::ptr::NonNull::from(begun),\n        state_id,\n        index,\n        record_id,\n        phase: FfiWgpuRenderPassPhase::Open,\n        _thread_bound: std::marker::PhantomData,\n    }};\n    return Box::into_raw(Box::new(handle));\n}}\n",
        contract = contract(BEGIN_CONTRACT),
        free = bracket.ffi_free,
        handle = bracket.handle,
        ffi_begin = bracket.ffi_begin,
        params = begin_params.join(", "),
        qualifier = QUALIFIER,
        borrowed = bracket.borrowed,
        begin = bracket.begin,
        target = target.call_expr,
        clear = clear.call_expr,
    ));
    out.push_str(&format!(
        "{contract}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_end}(pass: *mut {handle}) -> bool {{\n    if pass.is_null() || unsafe {{ (*pass).phase }} != FfiWgpuRenderPassPhase::Open {{\n        return false;\n    }}\n    if unsafe {{ ffi_classify_wgpu_render_pass(pass) }} != FfiWgpuRenderPassRelation::ExactTop {{\n        return false;\n    }}\n    unsafe {{ ffi_end_exact_wgpu_render_pass(pass) }};\n    return true;\n}}\n",
        contract = contract(END_CONTRACT),
        ffi_end = bracket.ffi_end,
        handle = bracket.handle,
    ));
    out.push_str(&format!(
        "{contract}#[unsafe(no_mangle)]\npub unsafe extern \"C\" fn {ffi_free}(pass: *mut {handle}) {{\n    if pass.is_null() {{\n        return;\n    }}\n    match unsafe {{ (*pass).phase }} {{\n        FfiWgpuRenderPassPhase::Busy => return,\n        FfiWgpuRenderPassPhase::Ended | FfiWgpuRenderPassPhase::Stale => {{}}\n        FfiWgpuRenderPassPhase::Open => match unsafe {{ ffi_classify_wgpu_render_pass(pass) }} {{\n            FfiWgpuRenderPassRelation::ExactBelowTop => return,\n            FfiWgpuRenderPassRelation::Stale => {{}}\n            FfiWgpuRenderPassRelation::ExactTop => unsafe {{ ffi_end_exact_wgpu_render_pass(pass) }},\n        }},\n    }}\n    unsafe {{ drop(Box::from_raw(pass)) }};\n}}\n",
        contract = contract(FREE_CONTRACT),
        ffi_free = bracket.ffi_free,
        handle = bracket.handle,
    ));
    return out;
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
}];

/// The header contract the begin wrapper carries.
pub const BEGIN_CONTRACT: &str = "Opens a render pass on state into target and returns an owned opaque pass handle; release it with flight_free_wgpu_render_pass_handle. NULL state or target, or a pass already open on state, returns NULL without changing state; NULL clear loads every aspect. target and clear are borrowed for this call only. The handle holds the open bracket and its own allocation, never the state. Until the pass is ended or freed, state must stay alive at the same address, and no alias may read, mutate, submit, replace, destroy, move or free it except through this handle. All calls on the handle and state are serialized on one thread; nothing enforces this for C. A non-local jump or foreign exception must not cross any call, and a Rust panic aborts the process rather than returning.";

/// The header contract each consumer wrapper carries.
pub const CONSUMER_CONTRACT: &str = "Draws through an open pass handle and returns true. Returns false without drawing or changing the pass when pass or a required argument is NULL, the handle is ended, stale or already inside a call on this handle (same-handle reentry), its original pass was replaced, or a pass opened natively on the same state is still open above it. Re-entering through a separately retained state pointer is forbidden. Every other argument keeps its ordinary borrow contract.";

/// The header contract the end wrapper carries.
pub const END_CONTRACT: &str = "Ends the open pass, restoring the state and submitting the frame the pass opened, and returns true. The handle becomes an ended tombstone that still needs exactly one flight_free_wgpu_render_pass_handle. Returns false and changes nothing for NULL, an ended or stale handle, a call on the same handle that is still running, or a pass opened natively above this one; an absent or replaced original pass marks the handle stale and is never ended.";

/// The header contract the free wrapper carries.
pub const FREE_CONTRACT: &str = "Releases a pass handle; NULL is a no-op. An open handle whose original pass is the innermost is ended first. Freeing is a no-op, and the handle stays open, while a call on the same handle is running or while a pass opened natively is still open above it. An absent or replaced original pass is never ended; only the handle is released. After a successful free every copy of the pointer is invalid: a second free or any later call is undefined behaviour.";

const QUALIFIER: &str = "flight_sdk";

// The phase, relation and validator shared by every wrapper of the bracket. The validation trace
// records each inspection step in test builds only, so tests can observe the validator's order.
const SUPPORT: &str = "#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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
pub struct {handle} {
    state: std::ptr::NonNull<{qualifier}::{state}>,
    state_id: u64,
    index: usize,
    record_id: u64,
    phase: FfiWgpuRenderPassPhase,
    _thread_bound: std::marker::PhantomData<std::rc::Rc<()>>,
}
#[cfg(test)]
std::thread_local! {
    static FFI_WGPU_RENDER_PASS_TRACE: std::cell::RefCell<Vec<&'static str>> = const { std::cell::RefCell::new(Vec::new()) };
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
// Classifies an Open handle in a fixed order: the state's identity first, then the original
// record at the captured index, then whether it is the innermost pass. Nothing past a failed step
// is read. A failed identity marks the handle Stale. No reference outlives the call.
unsafe fn ffi_classify_wgpu_render_pass(pass: *mut {handle}) -> FfiWgpuRenderPassRelation {
    let (state, state_id, index, record_id) = unsafe { ((*pass).state, (*pass).state_id, (*pass).index, (*pass).record_id) };
    let state: &{qualifier}::{state} = unsafe { state.as_ref() };
    trace_wgpu_render_pass_validation(\"state_id\");
    if {qualifier}::entity::contract::get_entity_id(state) != state_id {
        unsafe { (*pass).phase = FfiWgpuRenderPassPhase::Stale };
        return FfiWgpuRenderPassRelation::Stale;
    }
    trace_wgpu_render_pass_validation(\"pass_stack\");
    let pass_stack = &{qualifier}::render_wgpu::contract::get_wgpu_render_state_runtime(state).pass_stack;
    trace_wgpu_render_pass_validation(\"record_id\");
    let is_original = pass_stack.get(index).is_some_and(|record| {qualifier}::entity::contract::get_entity_id(record) == record_id);
    if !is_original {
        unsafe { (*pass).phase = FfiWgpuRenderPassPhase::Stale };
        return FfiWgpuRenderPassRelation::Stale;
    }
    trace_wgpu_render_pass_validation(\"top\");
    if index + 1 == pass_stack.len() {
        return FfiWgpuRenderPassRelation::ExactTop;
    }
    return FfiWgpuRenderPassRelation::ExactBelowTop;
}
// Ends the exact top record of a validated Open handle through the ordinary end: Busy while the
// SDK runs, Ended after it returns. The pass borrow lives only for this call.
unsafe fn ffi_end_exact_wgpu_render_pass(pass: *mut {handle}) {
    let (state, index) = unsafe { ((*pass).state, (*pass).index) };
    unsafe { (*pass).phase = FfiWgpuRenderPassPhase::Busy };
    {qualifier}::render_wgpu::contract::end_wgpu_render_pass({qualifier}::render_wgpu::contract::WgpuRenderPass { state: unsafe { &mut *state.as_ptr() }, index });
    unsafe { (*pass).phase = FfiWgpuRenderPassPhase::Ended };
}
";

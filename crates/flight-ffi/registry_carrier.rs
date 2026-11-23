// Registry-guarded canonical carriers. A canonical carrier crosses C as one shared `Ref` handle; a
// registry-guarded one also never lets C hold a pointer: its handle is a family-tagged registry
// token, minted from the process-wide sequence that is never reissued. Every wrapper resolves the
// token against the live registry before use, so a NULL, freed (stale), forged or other-family
// (foreign) handle is refused with the wrapper's failure value instead of being dereferenced, and
// the one free releases exactly the handle it names.
//
// The pass rewrites the generated canonical-carrier code for each registry carrier: every handle
// read (`&*(p as *const flight_sdk::Ref<T>)`) becomes a registry lookup, every issued handle
// (`Box::into_raw(Box::new(v)) as *mut std::ffi::c_void` in a wrapper whose ownership is that
// carrier) becomes a minted token, and the free removes the token. Generation fails if any raw read
// survives.

/// A registry carrier: the SDK type and its token family's tag constant.
pub struct RegistryCarrier {
    pub ty: &'static str,
    pub snake: &'static str,
    pub tag_const: &'static str,
}

pub const REGISTRY_CARRIERS: &[RegistryCarrier] = &[RegistryCarrier {
    ty: "TextFormat",
    snake: "text_format",
    tag_const: "FFI_TEXT_FORMAT_TOKEN_TAG",
}];

pub const REGISTRY_CONTRACT: &str = "Handles are registry tokens, never pointers, and no token is ever reissued: a NULL, freed, forged or other-family handle is refused with the failure value and nothing is read or changed.";

fn failure(returns: &str) -> &'static str {
    return match returns.strip_prefix("-> ").map(str::trim) {
        None => "return;",
        Some("bool") => "return false;",
        Some(ty) if ty.starts_with("*mut ") => "return std::ptr::null_mut();",
        Some(ty) if ty.starts_with("*const ") => "return std::ptr::null();",
        Some(_) => "return Default::default();",
    };
}

/// The registry support for every registry carrier, emitted once.
pub fn generate_support() -> String {
    let mut out = String::new();
    for carrier in REGISTRY_CARRIERS {
        let RegistryCarrier {
            ty,
            snake,
            tag_const,
            ..
        } = carrier;
        let registry = format!("FFI_{}_HANDLES", snake.to_uppercase());
        out.push_str(&format!(
            "// Live {ty} handles by token. A critical section only inserts, removes or clones an Arc.
// Each shared handle is boxed so its address stays fixed while it is live.
static {registry}: std::sync::Mutex<std::collections::BTreeMap<usize, Box<flight_sdk::Ref<flight_sdk::{ty}>>>> =
    std::sync::Mutex::new(std::collections::BTreeMap::new());
// Issues a fresh token for a shared {ty}; NULL when the token sequence is exhausted.
fn ffi_issue_{snake}(value: flight_sdk::Ref<flight_sdk::{ty}>) -> *mut std::ffi::c_void {{
    let Some(token) = ffi_mint_registry_token({tag_const}) else {{
        return std::ptr::null_mut();
    }};
    {registry}.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(token, Box::new(value));
    return std::ptr::without_provenance_mut(token);
}}
// The live shared {ty} a handle names; None for NULL, stale or foreign handles. The handle stays
// live until its one free, which the caller must not race with a call that uses it.
fn ffi_resolve_{snake}(handle: *const std::ffi::c_void) -> Option<*const flight_sdk::Ref<flight_sdk::{ty}>> {{
    let token = handle.addr();
    if !ffi_is_registry_token(token, {tag_const}) {{
        return None;
    }}
    let registry = {registry}.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    return registry.get(&token).map(|shared| {{
        let pointer: *const flight_sdk::Ref<flight_sdk::{ty}> = &**shared;
        pointer
    }});
}}
// Releases the one handle `token` names; anything else is refused without effect.
fn ffi_release_{snake}(handle: *const std::ffi::c_void) -> bool {{
    let token = handle.addr();
    if !ffi_is_registry_token(token, {tag_const}) {{
        return false;
    }}
    let removed = {registry}.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&token);
    return removed.is_some();
}}

"
        ));
    }
    return out;
}

/// Rewrites every wrapper's use of each registry carrier; returns the source and the rewritten names.
pub fn guard_registry_carriers(generated: &str) -> (String, Vec<String>) {
    let mut out = String::with_capacity(generated.len());
    let mut rewritten = Vec::new();
    let mut pending_docs = String::new();
    let mut current: Option<(String, &'static str, Vec<&RegistryCarrier>)> = None;
    let mut skipping = false;
    for line in generated.split_inclusive('\n') {
        if skipping {
            skipping = line != "}\n";
            continue;
        }
        if let Some((name, refusal, issuing)) = &current {
            if line == "}\n" {
                out.push_str(line);
                current = None;
                continue;
            }
            let mut line = line.to_string();
            let mut touched = false;
            for carrier in REGISTRY_CARRIERS {
                // `(handle as *const flight_sdk::Ref<T>)` in any position becomes the resolved
                // registry pointer, or the wrapper's refusal.
                let marker = format!(" as *const flight_sdk::Ref<flight_sdk::{}>)", carrier.ty);
                while let Some(end) = line.find(&marker) {
                    let Some(open) = line[..end].rfind('(') else {
                        break;
                    };
                    let handle = line[open + 1..end].to_string();
                    let replacement = format!(
                        "(match ffi_resolve_{}({handle} as *const std::ffi::c_void) {{ Some(shared) => shared, None => {{ {refusal} }} }})",
                        carrier.snake
                    );
                    line.replace_range(open..end + marker.len(), &replacement);
                    touched = true;
                }
            }
            for carrier in issuing {
                let boxed = "Box::into_raw(Box::new(";
                let tail = ")) as *mut std::ffi::c_void";
                while let (Some(start), Some(end)) = (line.find(boxed), line.find(tail)) {
                    if end < start {
                        break;
                    }
                    let value = line[start + boxed.len()..end].to_string();
                    line.replace_range(
                        start..end + tail.len(),
                        &format!("ffi_issue_{}({value})", carrier.snake),
                    );
                    touched = true;
                }
            }
            if touched && !rewritten.contains(name) {
                rewritten.push(name.clone());
            }
            out.push_str(&line);
            continue;
        }
        if line.starts_with("#[doc") || line.starts_with("#[unsafe(no_mangle)]") {
            pending_docs.push_str(line);
            continue;
        }
        let Some(signature) = line.strip_prefix("pub unsafe extern \"C\" fn ") else {
            out.push_str(&pending_docs);
            pending_docs.clear();
            out.push_str(line);
            continue;
        };
        let (Some(open), Some(close)) = (signature.find('('), signature.rfind(')')) else {
            out.push_str(&pending_docs);
            pending_docs.clear();
            out.push_str(line);
            continue;
        };
        let name = signature[..open].to_string();
        let returns = signature[close + 1..].trim().trim_end_matches('{').trim();
        let refusal = failure(returns);
        let issuing: Vec<&RegistryCarrier> = REGISTRY_CARRIERS
            .iter()
            .filter(|carrier| {
                pending_docs.contains(&format!("|flight_sdk::Ref<flight_sdk::{}>\"]", carrier.ty))
            })
            .collect();
        // The one free releases a token instead of a box.
        if let Some(carrier) = REGISTRY_CARRIERS
            .iter()
            .find(|carrier| name == format!("flight_free_{}_ref", carrier.snake))
        {
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|Releases exactly the {} handle it names; NULL, freed, forged and other-family handles are ignored.\"]\n",
                carrier.ty
            ));
            out.push_str(&pending_docs);
            pending_docs.clear();
            out.push_str(&format!(
                "pub unsafe extern \"C\" fn {name}(ptr: *mut flight_sdk::Ref<flight_sdk::{}>) {{\n    let _ = ffi_release_{}(ptr as *const std::ffi::c_void);\n}}\n",
                carrier.ty, carrier.snake
            ));
            rewritten.push(name);
            skipping = true;
            continue;
        }
        let touches = REGISTRY_CARRIERS.iter().any(|carrier| {
            signature.contains(&format!("flight_sdk::Ref<flight_sdk::{}>", carrier.ty))
        }) || !issuing.is_empty();
        if touches {
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|{REGISTRY_CONTRACT}\"]\n"
            ));
        }
        out.push_str(&pending_docs);
        pending_docs.clear();
        out.push_str(line);
        current = Some((name, refusal, issuing));
    }
    out.push_str(&pending_docs);
    return (out, rewritten);
}

/// A registry carrier read the pass did not rewrite: each is a pointer C could forge.
pub fn find_raw_registry_reads(generated: &str) -> Vec<String> {
    let mut found = Vec::new();
    for carrier in REGISTRY_CARRIERS {
        let marker = format!("as *const flight_sdk::Ref<flight_sdk::{}>)", carrier.ty);
        let mut current = "";
        for line in generated.lines() {
            if let Some(signature) = line.strip_prefix("pub unsafe extern \"C\" fn ") {
                current = signature.split('(').next().unwrap_or("");
            }
            if line.contains(&marker) {
                found.push(current.to_string());
            }
        }
    }
    found.sort();
    found.dedup();
    return found;
}

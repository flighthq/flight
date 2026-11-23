// Claim-guarded carriers: plain owned C handles whose SDK value holds caller callbacks. A callback
// may call back into flight-ffi with the same handle while the SDK is still using it, which would
// create a second reference to an object the running call holds, and a callback may free the
// handle under the running call. Every wrapper that takes such a handle, its free included,
// therefore claims the handle for the duration of the call: a handle another call holds (a reentrant
// call from inside a callback, or a call on another thread) is refused with the wrapper's sentinel,
// and NULL is refused the same way. The call body runs inside a panic boundary, so a panic in the
// SDK never unwinds into C; it returns the sentinel and the claim is released.

pub const CLAIM_CONTRACT: &str = "The handle is claimed for the duration of the call: a call made with it from inside one of its own callbacks, or concurrently on another thread, is refused and returns the failure value without effect. NULL is refused the same way. A panic inside the call returns the failure value.";

/// The SDK carriers guarded this way, by their qualified Rust path in generated signatures.
pub const CLAIM_GUARDED_CARRIERS: &[&str] = &["flight_sdk::interaction::contract::HitTestContext"];

/// The claim registry every guarded wrapper uses, emitted once.
pub const CLAIM_SUPPORT: &str = "// Addresses of claim-guarded carriers inside a call. A critical section only inserts or removes,
// so a lock poisoned elsewhere still guards a consistent set and is recovered.
static FFI_CARRIER_CLAIMS: std::sync::Mutex<std::collections::BTreeSet<usize>> =
    std::sync::Mutex::new(std::collections::BTreeSet::new());
// A carrier held by one call. Dropping it, also while unwinding, releases the carrier.
struct FfiCarrierClaim(usize);
impl Drop for FfiCarrierClaim {
    fn drop(&mut self) {
        FFI_CARRIER_CLAIMS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(&self.0);
    }
}
// Claims a non-NULL carrier no other call holds.
fn ffi_claim_carrier(address: usize) -> Option<FfiCarrierClaim> {
    if address == 0 {
        return None;
    }
    let inserted = FFI_CARRIER_CLAIMS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(address);
    // Never `then_some(FfiCarrierClaim(..))`: that builds the claim eagerly, and dropping the
    // refused one would release the claim the running call holds.
    if !inserted {
        return None;
    }
    return Some(FfiCarrierClaim(address));
}

";

fn failure(returns: &str) -> (&'static str, &'static str) {
    return match returns.strip_prefix("-> ").map(str::trim) {
        None => ("return;", "()"),
        Some("bool") => ("return false;", "false"),
        Some(ty) if ty.starts_with("*mut ") => {
            ("return std::ptr::null_mut();", "std::ptr::null_mut()")
        }
        Some(ty) if ty.starts_with("*const ") => ("return std::ptr::null();", "std::ptr::null()"),
        Some(_) => ("return Default::default();", "Default::default()"),
    };
}

/// Guards every wrapper in `generated` that takes a claim-guarded carrier; returns the rewritten
/// source and the guarded wrapper names.
pub fn guard_claimed_carriers(generated: &str) -> (String, Vec<String>) {
    let mut out = String::with_capacity(generated.len());
    let mut guarded = Vec::new();
    let mut in_body: Option<&'static str> = None;
    for line in generated.split_inclusive('\n') {
        if let Some(value) = in_body {
            if line == "}\n" {
                out.push_str(&format!(
                    "    }})) {{\n        Ok(value) => value,\n        Err(_) => {value},\n    }};\n}}\n"
                ));
                in_body = None;
                continue;
            }
            out.push_str("    ");
            out.push_str(line);
            continue;
        }
        let Some(signature) = line.strip_prefix("pub unsafe extern \"C\" fn ") else {
            out.push_str(line);
            continue;
        };
        let (Some(open), Some(close)) = (signature.find('('), signature.rfind(')')) else {
            out.push_str(line);
            continue;
        };
        let carriers: Vec<&str> = signature[open + 1..close]
            .split(", ")
            .filter_map(|param| param.split_once(": "))
            .filter(|(_, ty)| {
                CLAIM_GUARDED_CARRIERS.iter().any(|carrier| {
                    *ty == format!("*mut {carrier}") || *ty == format!("*const {carrier}")
                })
            })
            .map(|(name, _)| name)
            .collect();
        if carriers.is_empty() {
            out.push_str(line);
            continue;
        }
        let returns = signature[close + 1..].trim().trim_end_matches('{').trim();
        let (refusal, value) = failure(returns);
        let attribute = "#[unsafe(no_mangle)]\n";
        if out.ends_with(attribute) {
            out.truncate(out.len() - attribute.len());
            out.push_str(&format!(
                "#[doc = \"flight-ffi contract|{CLAIM_CONTRACT}\"]\n"
            ));
            out.push_str(attribute);
        }
        out.push_str(line);
        for carrier in &carriers {
            out.push_str(&format!(
                "    let Some(_ffi_claim_{carrier}) = ffi_claim_carrier({carrier}.addr()) else {{ {refusal} }};\n"
            ));
        }
        out.push_str(
            "    return match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n",
        );
        guarded.push(signature[..open].to_string());
        in_body = Some(value);
    }
    return (out, guarded);
}

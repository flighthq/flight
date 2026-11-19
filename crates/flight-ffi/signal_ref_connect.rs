//! How a generated ref-connect wrapper reaches the signal field it connects to. The wrapper holds
//! the owner's read guard (`guard`) for the whole connect, and the connection is made on the
//! owner's own field in place, never on a `Signal` clone: a clone carries its own emit cell, so a
//! connect through one could not re-arm a signal whose emitter a once call or a last disconnect
//! reset. A `Ref<Signal<T>>` field is reached through its own read guard (`inner`), which is held
//! until the connect returns and released before the owner's guard.

/// The statements that bind `signal` (a `*const Signal<T>` into the owner's field) and the
/// statements that release what they locked, in the order the wrapper runs them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RefConnectReach {
    pub bind: String,
    pub release: String,
}

/// The reach for `field`, declared as `Signal<T>`, `Ref<Signal<T>>`, or either inside `Option`.
/// An absent optional field returns NULL from the wrapper before anything is retained.
pub fn get_ref_connect_reach(
    field: &str,
    optional: bool,
    shared: bool,
    signal_ty: &str,
) -> RefConnectReach {
    let absent = "None => return std::ptr::null_mut()";
    return match (optional, shared) {
        (false, false) => RefConnectReach {
            bind: format!("let signal = &guard.{field} as *const {signal_ty};"),
            release: String::new(),
        },
        (true, false) => RefConnectReach {
            bind: format!(
                "let signal = match &guard.{field} {{ Some(signal) => signal as *const {signal_ty}, {absent} }};"
            ),
            release: String::new(),
        },
        (false, true) => RefConnectReach {
            bind: format!(
                "let inner = guard.{field}.read().unwrap();\n    let signal = &*inner as *const {signal_ty};"
            ),
            release: "drop(inner);".to_string(),
        },
        (true, true) => RefConnectReach {
            bind: format!(
                "let inner = match &guard.{field} {{ Some(signal) => signal.read().unwrap(), {absent} }};\n    let signal = &*inner as *const {signal_ty};"
            ),
            release: "drop(inner);".to_string(),
        },
    };
}

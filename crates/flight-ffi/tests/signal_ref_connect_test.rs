//! Pins how a ref-connect wrapper reaches its signal: in place on the owner's field under the
//! owner's read guard, through the field's own guard for `Ref<Signal<T>>`, and never on a clone.

#[path = "../signal_ref_connect.rs"]
mod signal_ref_connect;

use signal_ref_connect::{RefConnectReach, get_ref_connect_reach};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const INVENTORY: &str = include_str!("../signal_inventory.txt");

mod generated_ref_connect_wrappers {
    use super::*;

    #[test]
    fn hold_the_owner_guard_and_connect_the_field_in_place_without_a_clone() {
        let wrappers = z_ref_connect_wrappers();
        let expected = INVENTORY
            .lines()
            .filter(|line| line.starts_with("producer|") && line.ends_with("|ref-connect"))
            .count();
        assert_eq!(
            wrappers.len(),
            expected,
            "one wrapper per ref-connect inventory row"
        );
        assert!(expected > 0);
        for (name, body) in wrappers {
            let locked = body.find("let guard = owner.read().unwrap();");
            let connected = body.find("ffi_connect_signal(signal, ");
            let released = body.find("drop(guard);");
            assert!(
                locked.is_some() && connected.is_some() && released.is_some(),
                "{name} does not lock, connect and release:\n{body}"
            );
            assert!(
                locked < connected && connected < released,
                "{name} order:\n{body}"
            );
            assert!(
                !body.contains(".clone()"),
                "{name} connects through a clone:\n{body}"
            );
            assert!(
                body.contains("&guard.") || body.contains("&*inner"),
                "{name} does not reach the owner's own field:\n{body}"
            );
        }
    }
}

mod get_ref_connect_reach {
    use super::*;

    #[test]
    fn reaches_a_plain_field_in_place_under_the_owner_guard() {
        assert_eq!(
            get_ref_connect_reach("on_tick", false, false, "S"),
            RefConnectReach {
                bind: "let signal = &guard.on_tick as *const S;".to_string(),
                release: String::new(),
            }
        );
        let optional = get_ref_connect_reach("on_tick", true, false, "S");
        assert!(optional.bind.contains("match &guard.on_tick"));
        assert!(
            optional
                .bind
                .contains("None => return std::ptr::null_mut()")
        );
        assert!(optional.release.is_empty());
    }

    #[test]
    fn holds_a_shared_field_guard_until_the_connect_returns() {
        for optional in [false, true] {
            let reach = get_ref_connect_reach("on_change", optional, true, "S");
            assert!(reach.bind.contains("let inner = "), "{reach:?}");
            assert!(reach.bind.contains(".read().unwrap()"), "{reach:?}");
            assert!(
                reach.bind.ends_with("let signal = &*inner as *const S;"),
                "{reach:?}"
            );
            assert_eq!(reach.release, "drop(inner);");
        }
    }

    #[test]
    fn never_clones_the_signal() {
        for optional in [false, true] {
            for shared in [false, true] {
                let reach = get_ref_connect_reach("field", optional, shared, "S");
                assert!(!reach.bind.contains("clone"), "{reach:?}");
            }
        }
    }
}

// Every generated ref-connect wrapper (`owner` handle first, then the callback), by name, with
// its body.
fn z_ref_connect_wrappers() -> Vec<(&'static str, &'static str)> {
    let marker = "(owner: *const std::ffi::c_void, callback_fn: ";
    let mut wrappers = Vec::new();
    for (start, _) in GENERATED.match_indices("pub unsafe extern \"C\" fn flight_connect_") {
        let rest = &GENERATED[start..];
        let open = rest.find('(').unwrap();
        if !rest[open..].starts_with(marker) {
            continue;
        }
        let name = &rest["pub unsafe extern \"C\" fn ".len()..open];
        let end = rest.find("\n}").unwrap();
        wrappers.push((name, &rest[..end]));
    }
    return wrappers;
}

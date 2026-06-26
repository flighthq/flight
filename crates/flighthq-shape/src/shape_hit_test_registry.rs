//! Per-command hit-test function registry for `ShapeNode`.
//!
//! Each drawing command that can participate in hit testing registers a
//! [`ShapeHitTestCommand`] descriptor. [`hit_test_shape_command_point`] looks
//! up the descriptor for the command at a given buffer position and delegates
//! to its `hit_test` function, passing the slice of the buffer beginning at the
//! command's first argument (the Rust analogue of the TS `buf, i + 2` pair).
//!
//! Registration is explicit and opt-in — commands without a registered
//! function return `None` from [`hit_test_shape_command_point`].

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::command_buffer::AnyBox;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Opaque identifier for a shape command verb, matching the string keys used
/// in the command buffer (e.g. `"drawCircle"`, `"drawRectangle"`).
pub type ShapeCommandKey = String;

/// A hit-test descriptor for one shape command verb.
///
/// `key` names the command verb. `hit_test` tests whether the point
/// `(x, y)` falls within the primitive described by the arguments in `args`,
/// the slice of the raw command buffer beginning at the command's first
/// argument (after the key and arg-count slots).
pub struct ShapeHitTestCommand {
    /// The command verb key this descriptor handles.
    pub key: ShapeCommandKey,
    /// Tests whether `(x, y)` is inside the primitive.
    pub hit_test: Box<dyn Fn(f32, f32, &[AnyBox]) -> bool + Send + Sync>,
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Tests the command at `buf[i]` against the point `(x, y)`.
///
/// `buf[i]` must be the command key slot; arguments begin at `buf[i + 2]`
/// (after key and arg-count). Returns `None` when no hit-test function has
/// been registered for the command's key.
pub fn hit_test_shape_command_point(buf: &[AnyBox], i: usize, x: f32, y: f32) -> Option<bool> {
    let key = buf[i].downcast_ref::<&'static str>().expect("key slot");
    let registry = registry().lock().expect("hit-test registry lock");
    let func = registry.get(*key)?;
    Some(func(x, y, &buf[i + 2..]))
}

/// Registers a hit-test command descriptor so its verb participates in
/// [`hit_test_shape_command_point`] lookups.
///
/// A later call with the same `command.key` replaces the previous registration.
pub fn register_shape_hit_test_command(command: ShapeHitTestCommand) {
    registry()
        .lock()
        .expect("hit-test registry lock")
        .insert(command.key, command.hit_test);
}

// ---------------------------------------------------------------------------
// Module-level registry
// ---------------------------------------------------------------------------

type HitTestFn = Box<dyn Fn(f32, f32, &[AnyBox]) -> bool + Send + Sync>;

fn registry() -> &'static Mutex<HashMap<String, HitTestFn>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, HitTestFn>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    // hit_test_shape_command_point

    #[test]
    fn hit_test_shape_command_point_returns_none_for_unknown_key() {
        let buf: Vec<AnyBox> = vec![Box::new("__unregistered__"), Box::new(0i32)];
        assert_eq!(hit_test_shape_command_point(&buf, 0, 0.0, 0.0), None);
    }

    #[test]
    fn hit_test_shape_command_point_delegates_to_registered_fn() {
        let called = Arc::new(AtomicBool::new(false));
        let flag = called.clone();
        register_shape_hit_test_command(ShapeHitTestCommand {
            key: "moveTo".to_string(),
            hit_test: Box::new(move |x, y, args| {
                flag.store(true, Ordering::SeqCst);
                // Args slice begins at the command's first argument.
                assert_eq!(x, 5.0);
                assert_eq!(y, 7.0);
                assert_eq!(*args[0].downcast_ref::<f32>().unwrap(), 10.0);
                false
            }),
        });
        let buf: Vec<AnyBox> = vec![
            Box::new("moveTo"),
            Box::new(2i32),
            Box::new(10.0f32),
            Box::new(20.0f32),
        ];
        assert_eq!(hit_test_shape_command_point(&buf, 0, 5.0, 7.0), Some(false));
        assert!(called.load(Ordering::SeqCst));
    }

    #[test]
    fn hit_test_shape_command_point_returns_handler_value() {
        register_shape_hit_test_command(ShapeHitTestCommand {
            key: "endFill".to_string(),
            hit_test: Box::new(|_, _, _| true),
        });
        let buf: Vec<AnyBox> = vec![Box::new("endFill"), Box::new(0i32)];
        assert_eq!(hit_test_shape_command_point(&buf, 0, 0.0, 0.0), Some(true));
    }

    // register_shape_hit_test_command

    #[test]
    fn register_shape_hit_test_command_replaces_existing() {
        register_shape_hit_test_command(ShapeHitTestCommand {
            key: "drawCircle".to_string(),
            hit_test: Box::new(|_, _, _| false),
        });
        register_shape_hit_test_command(ShapeHitTestCommand {
            key: "drawCircle".to_string(),
            hit_test: Box::new(|_, _, _| true),
        });
        let buf: Vec<AnyBox> = vec![
            Box::new("drawCircle"),
            Box::new(3i32),
            Box::new(50.0f32),
            Box::new(50.0f32),
            Box::new(25.0f32),
        ];
        assert_eq!(
            hit_test_shape_command_point(&buf, 0, 50.0, 50.0),
            Some(true)
        );
    }
}

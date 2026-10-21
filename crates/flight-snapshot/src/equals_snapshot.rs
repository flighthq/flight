use std::sync::Arc;

use crate::types::*;

/// Deep structural equality between two snapshots. The same capture compares equal at once (the
/// source's `a === b` fast path, by `Arc` identity); otherwise the values are compared with
/// `PartialEq`, under which float leaves follow `===`: `NaN` never equals itself and `-0` equals
/// `+0`.
// flight-lint: allow(contract-vocabulary) Principal f1f482ec batch10 item7: typed snapshot equality is PartialEq
pub fn equals_snapshot<T: PartialEq>(a: &Snapshot<T>, b: &Snapshot<T>) -> bool {
    return Arc::ptr_eq(a, b) || **a == **b;
}

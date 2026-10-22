use crate::resolve_bidi_levels::resolve_bidi_levels;
use crate::types::BidiClassKernel;
use crate::types::BidiDirection;
use crate::types::BidiRun;
use crate::types::BidiRunDirection;

// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned run collection clears/fills retained capacity in original logical order
pub fn get_bidi_runs(
    out: &mut Vec<BidiRun>,
    bidi_class_kernel: &BidiClassKernel,
    text: &str,
    base_direction: BidiDirection,
) {
    out.clear();
    let mut levels = Vec::new();
    resolve_bidi_levels(&mut levels, bidi_class_kernel, text, base_direction);
    let length = levels.len();
    let mut start: usize = 0;
    let mut i: usize = 1;
    while i <= length {
        if i == length || levels[i] != levels[start] {
            let level = levels[start];
            out.push(BidiRun {
                start,
                end: i,
                level,
                direction: if level % 2 == 0 {
                    BidiRunDirection::Ltr
                } else {
                    BidiRunDirection::Rtl
                },
            });
            start = i;
        }
        i += 1;
    }
    return;
}

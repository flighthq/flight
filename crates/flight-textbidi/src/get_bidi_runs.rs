use crate::resolve_bidi_levels::resolve_bidi_levels;
use crate::types::BidiClassKernel;
use crate::types::BidiDirection;
use crate::types::BidiRun;
use crate::types::BidiRunDirection;

pub fn get_bidi_runs(
    bidi_class_kernel: &BidiClassKernel,
    text: &str,
    base_direction: BidiDirection,
) -> Vec<BidiRun> {
    let levels = resolve_bidi_levels(bidi_class_kernel, text, base_direction);
    let mut runs: Vec<BidiRun> = Vec::new();
    let length = levels.len();
    let mut start: usize = 0;
    let mut i: usize = 1;
    while i <= length {
        if i == length || levels[i] != levels[start] {
            let level = levels[start];
            runs.push(BidiRun {
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
    return runs;
}

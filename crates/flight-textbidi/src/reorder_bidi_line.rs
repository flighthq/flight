//! flight-compiler: target-native

use flight_entity::{Uint8Array, throw_range_error};

pub fn reorder_bidi_line(levels: &Uint8Array, start: usize, end: usize, out: &mut Vec<usize>) {
    if end < start {
        throw_range_error("Invalid array length");
    }
    let count = end - start;
    out.resize(count, 0);
    if count == 0 {
        return;
    }

    let mut highest: u8 = 0;
    let mut lowest_odd: u8 = 255;
    for i in start..end {
        let level = levels[i];
        out[i - start] = i;
        if level > highest {
            highest = level;
        }
        if level % 2 == 1 && level < lowest_odd {
            lowest_odd = level;
        }
    }

    let mut level = highest;
    while level >= lowest_odd {
        let mut k: usize = 0;
        while k < count {
            if levels[out[k]] >= level {
                let mut j = k;
                while j < count && levels[out[j]] >= level {
                    j += 1;
                }
                let mut lo = k;
                let mut hi = j - 1;
                while lo < hi {
                    out.swap(lo, hi);
                    lo += 1;
                    hi -= 1;
                }
                k = j;
            } else {
                k += 1;
            }
        }
        if level == 0 {
            break;
        }
        level -= 1;
    }
}

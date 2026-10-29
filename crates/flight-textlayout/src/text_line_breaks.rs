//! flight-compiler: root-only getTextLineBreakIndex getTextLineBreaks

use crate::text_units::find_utf16_unit;

pub fn get_text_line_break_index(line_breaks: &[usize], start_index: Option<usize>) -> i32 {
    if line_breaks.is_empty() {
        return -1;
    }
    let start_index = start_index.unwrap_or(0);
    let mut low = 0;
    let mut high = line_breaks.len();
    while low < high {
        let middle = (low + high) >> 1;
        if line_breaks[middle] >= start_index {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    return if low < line_breaks.len() {
        line_breaks[low] as i32
    } else {
        -1
    };
}

pub fn get_text_line_breaks(out: &mut Vec<usize>, text: &str) {
    out.clear();
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut start = 0;
    while start < units.len() {
        let lf = find_utf16_unit(&units, 0x000a, start);
        let cr = find_utf16_unit(&units, 0x000d, start);
        if lf.is_none() && cr.is_none() {
            break;
        }
        let mut index = lf.unwrap_or(units.len());
        if let Some(cr_index) = cr {
            index = index.min(cr_index);
        }
        out.push(index);
        start = index + 1;
    }
}

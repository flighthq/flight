use crate::text_units::find_utf16_unit;

pub fn get_text_line_break_index(line_breaks: &[usize], start_index: Option<usize>) -> i32 {
    if line_breaks.is_empty() {
        return -1;
    }
    let start_index = start_index.unwrap_or(0);
    let mut low = 0;
    let mut high = line_breaks.len();
    while low < high {
        let middle = low + (high - low) / 2;
        if line_breaks[middle] >= start_index {
            high = middle;
        } else {
            low = middle + 1;
        }
    }
    return line_breaks.get(low).map_or(-1, |index| *index as i32);
}

pub fn get_text_line_breaks(out: &mut Vec<usize>, text: &str) {
    out.clear();
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut start = 0;
    while start < units.len() {
        let lf = find_utf16_unit(&units, 0x000a, start);
        let cr = find_utf16_unit(&units, 0x000d, start);
        let index = match (lf, cr) {
            (None, None) => break,
            (Some(lf), None) => lf,
            (None, Some(cr)) => cr,
            (Some(lf), Some(cr)) => lf.min(cr),
        };
        out.push(index);
        start = index + 1;
    }
}

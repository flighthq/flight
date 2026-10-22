use crate::SWF_KNOWN_TAG_MASKS;

pub fn is_known_swf_tag(code: i32) -> bool {
    if !(0..=94).contains(&code) {
        return false;
    }
    let code = code as u32;
    return SWF_KNOWN_TAG_MASKS[(code >> 5) as usize] & (1_u32 << (code & 31)) != 0;
}

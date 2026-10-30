use crate::awd2_types::{Awd2BlockHandler, Awd2ParseOptions, Awd2ParseOptionsFragment};
use flight_entity::Ref;

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first output, snapshot source fragments before writing for alias safety
pub fn merge_awd2_parse_options(out: &mut Awd2ParseOptions, options: &[Awd2ParseOptionsFragment]) {
    let mut blocks: Vec<Ref<Awd2BlockHandler>> = Vec::new();
    let mut deflate = None;
    let mut lzma = None;
    for fragment in options {
        if let Some(source_blocks) = &fragment.blocks {
            blocks.extend(source_blocks.iter().cloned());
        }
        if fragment.deflate.is_some() {
            deflate = fragment.deflate.clone();
        }
        if fragment.lzma.is_some() {
            lzma = fragment.lzma.clone();
        }
    }
    let out_blocks: &mut Vec<Ref<Awd2BlockHandler>> = &mut out.blocks;
    out_blocks.clear();
    out_blocks.extend(blocks);
    out.deflate = deflate;
    out.lzma = lzma;
    return;
}

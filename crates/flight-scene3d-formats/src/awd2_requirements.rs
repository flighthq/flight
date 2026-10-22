use crate::awd2_block_census::collect_awd2_block_counts;
use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::Uint8Array;
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

pub const AWD2_REQUIREMENT_KEY_NAMESPACE: &str = "awd2";

pub fn parse_awd2_requirements(
    source: &Uint8Array,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> RequirementSet {
    let mut requirements = Vec::new();
    let mut counts = Vec::new();
    if collect_awd2_block_counts(&mut counts, source, deflate, lzma) {
        for entry in counts {
            requirements.push(Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: format!("{AWD2_REQUIREMENT_KEY_NAMESPACE}.{}", entry.name),
            });
        }
    }
    return create_requirement_set(&[RequirementFacet::DocumentFormat], &requirements);
}

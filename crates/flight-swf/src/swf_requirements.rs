use flight_compression::{HostDecompressDeflateCapability, HostDecompressLzmaCapability};
use flight_entity::{Ref, Uint8Array};
use flight_requirement::{Requirement, RequirementFacet, RequirementSet, create_requirement_set};

use crate::{SWF_NON_CONTENT_TAGS, collect_swf_content_capabilities, get_swf_tag_name};

fn has_any_tag(tag_counts: &std::collections::HashMap<u32, u32>, tags: &[u32]) -> bool {
    for code in tags {
        if tag_counts.contains_key(code) {
            return true;
        }
    }
    return false;
}

pub fn parse_swf_requirements(
    source: &Ref<Box<Uint8Array>>,
    deflate: Option<&HostDecompressDeflateCapability>,
    lzma: Option<&HostDecompressLzmaCapability>,
) -> RequirementSet {
    let capabilities = collect_swf_content_capabilities(source, deflate, lzma);
    let mut requirements = Vec::new();
    let mut facets = vec![RequirementFacet::DocumentFormat];
    if let Some(capabilities) = capabilities {
        for code in 0..=SWF_MAX_TAG_CODE {
            if !capabilities.tag_counts.contains_key(&code)
                || SWF_NON_CONTENT_TAGS.contains(&code)
                || SWF_STRUCTURAL_TAGS.contains(&code)
            {
                continue;
            }
            requirements.push(Requirement {
                facet: RequirementFacet::DocumentFormat,
                key: format!(
                    "{}.{}",
                    SWF_REQUIREMENT_KEY_NAMESPACE,
                    get_swf_tag_name(code)
                ),
            });
        }

        let has_shape_tags = has_any_tag(&capabilities.tag_counts, SWF_SHAPE_TAGS);
        if has_shape_tags || capabilities.uses_blend_mode || capabilities.uses_bitmap_fills {
            facets.push(RequirementFacet::SceneShapeCommand);
        }
        if has_shape_tags {
            for key in SWF_CORE_SHAPE_COMMANDS {
                requirements.push(Requirement {
                    facet: RequirementFacet::SceneShapeCommand,
                    key: (*key).to_string(),
                });
            }
        }
        if capabilities.uses_bitmap_fills {
            for key in SWF_TEXTURE_SHAPE_COMMANDS {
                requirements.push(Requirement {
                    facet: RequirementFacet::SceneShapeCommand,
                    key: (*key).to_string(),
                });
            }
        }
        if capabilities.uses_blend_mode {
            facets.push(RequirementFacet::SceneBlendMode);
            requirements.push(Requirement {
                facet: RequirementFacet::SceneBlendMode,
                key: "standard".to_string(),
            });
        }
    }
    return create_requirement_set(&facets, &requirements);
}

pub const SWF_REQUIREMENT_KEY_NAMESPACE: &str = "swf";

const SWF_CORE_SHAPE_COMMANDS: &[&str] = &[
    "beginFill",
    "beginGradientFill",
    "cubicCurveTo",
    "drawCircle",
    "drawEllipse",
    "drawPath",
    "drawRectangle",
    "drawRoundedRectangle",
    "endFill",
    "lineGradientStyle",
    "lineStyle",
    "lineTo",
    "moveTo",
    "quadraticCurveTo",
];
const SWF_MAX_TAG_CODE: u32 = 1023;
const SWF_SHAPE_TAGS: &[u32] = &[2, 22, 32, 46, 83, 84];
const SWF_STRUCTURAL_TAGS: &[u32] = &[0, 1];
const SWF_TEXTURE_SHAPE_COMMANDS: &[&str] = &["beginTextureFill", "lineTextureStyle"];

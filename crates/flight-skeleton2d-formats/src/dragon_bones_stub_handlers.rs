use crate::dragon_bones_parse_helpers::skip_crumb_dragon_bones_group;
use crate::types::{DragonBonesSectionContext, DragonBonesTimelineContext, JsonRecord};

pub fn dragon_bones_deform_timeline_handler(
    context: &mut DragonBonesTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    skip_crumb_dragon_bones_group(
        context.section.diagnostics.as_deref_mut(),
        anim_entry.get("ffd"),
        "dragonbones.deform-timeline-unsupported",
    );
}

pub fn dragon_bones_ik_constraints_section_handler(context: &mut DragonBonesSectionContext<'_>) {
    skip_crumb_dragon_bones_group(
        context.diagnostics.as_deref_mut(),
        context.armature.get("ik"),
        "dragonbones.ik-constraint-unsupported",
    );
}

pub fn dragon_bones_ik_timeline_handler(
    context: &mut DragonBonesTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    skip_crumb_dragon_bones_group(
        context.section.diagnostics.as_deref_mut(),
        anim_entry.get("ik"),
        "dragonbones.ik-timeline-unsupported",
    );
}

pub fn dragon_bones_z_order_timeline_handler(
    context: &mut DragonBonesTimelineContext<'_, '_>,
    _anim_name: &str,
    anim_entry: &JsonRecord,
) {
    skip_crumb_dragon_bones_group(
        context.section.diagnostics.as_deref_mut(),
        anim_entry.get("zOrder"),
        "dragonbones.zorder-timeline-unsupported",
    );
}

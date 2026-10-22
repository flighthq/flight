use crate::types::WgpuPbrDefineKey;

pub fn build_wgpu_pbr_define_key(key: &WgpuPbrDefineKey) -> String {
    return format!(
        "{}{}{}{}{}{}{}{}{}{}{}",
        if key.has_base_color_map { 'b' } else { '-' },
        if key.has_metallic_roughness_map { 'r' } else { '-' },
        if key.has_normal_map { 'n' } else { '-' },
        if key.has_occlusion_map { 'o' } else { '-' },
        if key.has_emissive_map { 'e' } else { '-' },
        if key.has_alpha_mask { 'm' } else { '-' },
        if key.has_ibl { 'i' } else { '-' },
        if key.has_shadow { 's' } else { '-' },
        if key.has_color_matrix {
            'x'
        } else if key.has_color_adjustment {
            'c'
        } else {
            '-'
        },
        if key.has_skin { 'k' } else { '-' },
        if key.modifier_define_key.is_empty() {
            String::new()
        } else {
            format!("|{}", key.modifier_define_key)
        },
    );
}

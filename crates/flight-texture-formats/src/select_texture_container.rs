use crate::types::{TextureContainer, TextureContainerFormat};

pub fn select_texture_container<'a>(
    containers: &'a [TextureContainer],
    supported_formats: &[TextureContainerFormat],
) -> Option<&'a TextureContainer> {
    for container in containers {
        if supported_formats.contains(&container.format) {
            return Some(container);
        }
    }
    return None;
}

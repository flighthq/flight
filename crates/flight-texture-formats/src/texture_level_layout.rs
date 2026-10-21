use crate::types::{TextureContainerFormat, TextureContainerLevel, TextureContainerLevels};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn compute_levels_matches_compute_texture_container_levels() {
        assert_eq!(
            TextureContainerFormat::Bc1.compute_levels(8, 8, 4, 1, 1, 100),
            compute_texture_container_levels(TextureContainerFormat::Bc1, 8, 8, 4, 1, 1, 100)
        );
    }

    #[test]
    fn level_byte_length_matches_get_texture_container_level_byte_length() {
        assert_eq!(
            TextureContainerFormat::Bc7.level_byte_length(5, 5),
            get_texture_container_level_byte_length(TextureContainerFormat::Bc7, 5, 5)
        );
    }
}

#[derive(Clone, Copy)]
struct TextureFormatBlockInfo {
    block_width: usize,
    block_height: usize,
    bytes_per_block: usize,
}

fn compressed_block(
    block_width: usize,
    block_height: usize,
    bytes_per_block: usize,
) -> Option<TextureFormatBlockInfo> {
    return Some(TextureFormatBlockInfo {
        block_height,
        block_width,
        bytes_per_block,
    });
}

pub fn compute_texture_container_levels(
    format: TextureContainerFormat,
    base_width: usize,
    base_height: usize,
    mip_levels: usize,
    layers: usize,
    faces: usize,
    start_offset: usize,
) -> Option<TextureContainerLevels> {
    get_texture_container_format_block_info(format)?;

    let mut levels = Vec::new();
    let mut offset = start_offset;
    for _layer in 0..layers {
        for _face in 0..faces {
            for mip in 0..mip_levels {
                let width = shifted_dimension(base_width, mip);
                let height = shifted_dimension(base_height, mip);
                let byte_length = get_texture_container_level_byte_length(format, width, height);
                if byte_length < 0 {
                    return None;
                }
                let byte_length = usize::try_from(byte_length).ok()?;
                levels.push(TextureContainerLevel {
                    byte_offset: offset,
                    byte_length,
                    height,
                    width,
                });
                offset = offset.checked_add(byte_length)?;
            }
        }
    }
    return Some(TextureContainerLevels {
        end_offset: offset,
        levels,
    });
}

fn get_texture_container_format_block_info(
    format: TextureContainerFormat,
) -> Option<TextureFormatBlockInfo> {
    return match format {
        TextureContainerFormat::Astc4x4 => compressed_block(4, 4, 16),
        TextureContainerFormat::Astc5x4 => compressed_block(5, 4, 16),
        TextureContainerFormat::Astc5x5 => compressed_block(5, 5, 16),
        TextureContainerFormat::Astc6x5 => compressed_block(6, 5, 16),
        TextureContainerFormat::Astc6x6 => compressed_block(6, 6, 16),
        TextureContainerFormat::Astc8x5 => compressed_block(8, 5, 16),
        TextureContainerFormat::Astc8x6 => compressed_block(8, 6, 16),
        TextureContainerFormat::Astc8x8 => compressed_block(8, 8, 16),
        TextureContainerFormat::Astc10x5 => compressed_block(10, 5, 16),
        TextureContainerFormat::Astc10x6 => compressed_block(10, 6, 16),
        TextureContainerFormat::Astc10x8 => compressed_block(10, 8, 16),
        TextureContainerFormat::Astc10x10 => compressed_block(10, 10, 16),
        TextureContainerFormat::Astc12x10 => compressed_block(12, 10, 16),
        TextureContainerFormat::Astc12x12 => compressed_block(12, 12, 16),
        TextureContainerFormat::Bc1 | TextureContainerFormat::Bc1Srgb => compressed_block(4, 4, 8),
        TextureContainerFormat::Bc2
        | TextureContainerFormat::Bc2Srgb
        | TextureContainerFormat::Bc3
        | TextureContainerFormat::Bc3Srgb
        | TextureContainerFormat::Bc5
        | TextureContainerFormat::Bc5Snorm
        | TextureContainerFormat::Bc6hSfloat
        | TextureContainerFormat::Bc6hUfloat
        | TextureContainerFormat::Bc7
        | TextureContainerFormat::Bc7Srgb => compressed_block(4, 4, 16),
        TextureContainerFormat::Bc4 | TextureContainerFormat::Bc4Snorm => compressed_block(4, 4, 8),
        TextureContainerFormat::Bgra8Srgb
        | TextureContainerFormat::Bgra8Unorm
        | TextureContainerFormat::Rgba8Srgb
        | TextureContainerFormat::Rgba8Unorm => pixel_block(4),
        TextureContainerFormat::EacR11 | TextureContainerFormat::EacR11Snorm => {
            compressed_block(4, 4, 8)
        }
        TextureContainerFormat::EacRg11 | TextureContainerFormat::EacRg11Snorm => {
            compressed_block(4, 4, 16)
        }
        TextureContainerFormat::Etc1
        | TextureContainerFormat::Etc2Rgb
        | TextureContainerFormat::Etc2RgbA1
        | TextureContainerFormat::Etc2RgbA1Srgb
        | TextureContainerFormat::Etc2RgbSrgb => compressed_block(4, 4, 8),
        TextureContainerFormat::Etc1s => None,
        TextureContainerFormat::Etc2Rgba | TextureContainerFormat::Etc2RgbaSrgb => {
            compressed_block(4, 4, 16)
        }
        TextureContainerFormat::Pvrtc2bppRgb | TextureContainerFormat::Pvrtc2bppRgba => {
            compressed_block(8, 4, 8)
        }
        TextureContainerFormat::Pvrtc4bppRgb | TextureContainerFormat::Pvrtc4bppRgba => {
            compressed_block(4, 4, 8)
        }
        TextureContainerFormat::R8Unorm => pixel_block(1),
        TextureContainerFormat::Rg8Unorm => pixel_block(2),
        TextureContainerFormat::Rgba16f => pixel_block(8),
        TextureContainerFormat::Rgba32f => pixel_block(16),
        TextureContainerFormat::Uastc => compressed_block(4, 4, 16),
    };
}

// flight-lint: allow(contract-vocabulary) a level byte length can exceed 32 bits; valid JS number results remain within the exact signed range through 2^53 - 1, with -1 reserved as the source sentinel
pub fn get_texture_container_level_byte_length(
    format: TextureContainerFormat,
    width: usize,
    height: usize,
) -> i64 {
    let Some(block) = get_texture_container_format_block_info(format) else {
        return -1;
    };
    let blocks_wide = width.div_ceil(block.block_width);
    let blocks_high = height.div_ceil(block.block_height);
    let Some(length) = blocks_wide
        .checked_mul(blocks_high)
        .and_then(|count| count.checked_mul(block.bytes_per_block))
    else {
        return -1;
    };
    return i64::try_from(length).unwrap_or(-1);
}

fn pixel_block(bytes_per_pixel: usize) -> Option<TextureFormatBlockInfo> {
    return compressed_block(1, 1, bytes_per_pixel);
}

fn shifted_dimension(base: usize, shift: usize) -> usize {
    return if shift >= usize::BITS as usize {
        1
    } else {
        (base >> shift).max(1)
    };
}

impl TextureContainerFormat {
    pub fn compute_levels(
        self,
        base_width: usize,
        base_height: usize,
        mip_levels: usize,
        layers: usize,
        faces: usize,
        start_offset: usize,
    ) -> Option<TextureContainerLevels> {
        return compute_texture_container_levels(
            self,
            base_width,
            base_height,
            mip_levels,
            layers,
            faces,
            start_offset,
        );
    }

    // flight-lint: allow(contract-vocabulary) a level byte length can exceed 32 bits; valid JS number results remain within the exact signed range through 2^53 - 1, with -1 reserved as the source sentinel
    pub fn level_byte_length(self, width: usize, height: usize) -> i64 {
        return get_texture_container_level_byte_length(self, width, height);
    }
}

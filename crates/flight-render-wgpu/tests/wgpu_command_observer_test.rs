use std::sync::{Arc, Mutex};

use flight_render_wgpu::*;

use crate::support::*;

fn write_one_texel(native: &WgpuNativeDevice) {
    let texture = native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    upload_wgpu_texture_data(native, &texture, wgpu::Origin3d::ZERO, 1, 1, &[1, 2, 3, 4]);
}

// A state with an open screen pass and a command recorder on its device.
fn open_recorded_pass() -> (WgpuRenderState, Arc<Mutex<Vec<WgpuCommandRecord>>>) {
    let mut state = create_wgpu_render_state_for_test(None);
    begin_wgpu_screen_render_pass_for_test(&mut state, None, None, false);
    let native = get_wgpu_render_state_native_device(&state);
    let records = record_test_commands(&native);
    return (state, records);
}

fn uniform_layout_entry() -> wgpu::BindGroupLayoutEntry {
    return wgpu::BindGroupLayoutEntry {
        binding: 0,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    };
}

const TEST_WGSL: &str = "@vertex fn vs_main(@location(0) position : vec3f) -> @builtin(position) vec4f {\n  return vec4f(position, 1.0);\n}\n@fragment fn fs_main() -> @location(0) vec4f {\n  return vec4f(1.0);\n}\n";

mod create_wgpu_bind_group {
    use super::*;

    #[test]
    fn creates_the_group_and_records_every_entry_in_order() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let layout = create_wgpu_bind_group_layout(&native, &[uniform_layout_entry()]);
        let buffer = create_wgpu_buffer(&native, 16, wgpu::BufferUsages::UNIFORM);
        let group = create_wgpu_bind_group(
            &native,
            &layout,
            &[wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer.as_entire_binding(),
            }],
        );
        let recorded = records
            .lock()
            .unwrap()
            .iter()
            .find_map(|record| match record {
                WgpuCommandRecord::CreateBindGroupEntries(entries) => Some(entries.clone()),
                _ => None,
            })
            .unwrap();
        assert_eq!(recorded.bind_group, group);
        assert_eq!(recorded.layout, layout);
        assert_eq!(recorded.entries.len(), 1);
        assert_eq!(recorded.entries[0].binding, 0);
        assert!(matches!(
            &recorded.entries[0].resource,
            WgpuBindingResourceRecord::Buffer(binding) if binding.buffer == buffer && binding.size.is_none()
        ));
    }
}

mod create_wgpu_bind_group_layout {
    use super::*;

    #[test]
    fn creates_the_layout_and_records_its_entries() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let layout = create_wgpu_bind_group_layout(&native, &[uniform_layout_entry()]);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::CreateBindGroupLayout(recorded)
                if recorded.layout == layout && recorded.entries == vec![uniform_layout_entry()]
        )));
    }
}

mod create_wgpu_buffer {
    use super::*;

    #[test]
    fn creates_the_buffer_and_records_its_size_and_usage() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let buffer = create_wgpu_buffer(&native, 64, wgpu::BufferUsages::VERTEX);
        assert_eq!(buffer.size(), 64);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::CreateBuffer(recorded)
                if recorded.buffer == buffer && recorded.size == 64 && recorded.usage == wgpu::BufferUsages::VERTEX
        )));
    }
}

mod create_wgpu_pipeline_layout_recorded {
    use super::*;

    #[test]
    fn creates_the_layout_and_records_its_group_layouts_in_order() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let first = create_wgpu_bind_group_layout(&native, &[]);
        let second = create_wgpu_bind_group_layout(&native, &[uniform_layout_entry()]);
        let layout =
            create_wgpu_pipeline_layout_recorded(&native, &[first.clone(), second.clone()]);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::CreatePipelineLayout(recorded)
                if recorded.layout == layout && recorded.bind_group_layouts == vec![first.clone(), second.clone()]
        )));
    }
}

mod create_wgpu_render_pipeline {
    use super::*;

    #[test]
    fn creates_the_pipeline_and_records_its_descriptor() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let module = create_wgpu_shader_module(&native, TEST_WGSL);
        let layout = create_wgpu_pipeline_layout_recorded(&native, &[]);
        let attributes = [wgpu::VertexAttribute {
            shader_location: 0,
            offset: 0,
            format: wgpu::VertexFormat::Float32x3,
        }];
        let buffers = [Some(wgpu::VertexBufferLayout {
            array_stride: 12,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &attributes,
        })];
        let targets = [Some(wgpu::ColorTargetState {
            format: wgpu::TextureFormat::Rgba8Unorm,
            blend: None,
            write_mask: wgpu::ColorWrites::ALL,
        })];
        let pipeline = create_wgpu_render_pipeline(
            &native,
            &wgpu::RenderPipelineDescriptor {
                label: None,
                layout: Some(&layout),
                vertex: wgpu::VertexState {
                    module: &module,
                    entry_point: Some("vs_main"),
                    compilation_options: test_default(),
                    buffers: &buffers,
                },
                fragment: Some(wgpu::FragmentState {
                    module: &module,
                    entry_point: Some("fs_main"),
                    compilation_options: test_default(),
                    targets: &targets,
                }),
                primitive: wgpu::PrimitiveState {
                    cull_mode: Some(wgpu::Face::Back),
                    ..test_default()
                },
                depth_stencil: None,
                multisample: test_default(),
                multiview_mask: None,
                cache: None,
            },
        );
        let recorded = records
            .lock()
            .unwrap()
            .iter()
            .find_map(|record| match record {
                WgpuCommandRecord::CreateRenderPipelineDescriptor(descriptor) => {
                    Some(descriptor.clone())
                }
                _ => None,
            })
            .unwrap();
        assert_eq!(recorded.pipeline, pipeline);
        assert_eq!(recorded.layout, Some(layout));
        assert_eq!(recorded.vertex_entry_point.as_deref(), Some("vs_main"));
        assert_eq!(recorded.fragment_entry_point.as_deref(), Some("fs_main"));
        assert_eq!(recorded.primitive.cull_mode, Some(wgpu::Face::Back));
        assert_eq!(recorded.vertex_buffers[0].as_ref().unwrap().array_stride, 12);
        assert_eq!(recorded.targets, targets.to_vec());
    }
}

mod create_wgpu_shader_module {
    use super::*;

    #[test]
    fn compiles_the_module_and_records_its_exact_source() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let module = create_wgpu_shader_module(&native, TEST_WGSL);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::CreateShaderModule(recorded)
                if recorded.module == module && recorded.source == TEST_WGSL
        )));
    }
}

mod create_wgpu_texture {
    use super::*;

    #[test]
    fn creates_the_texture_and_records_its_descriptor() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let texture = create_wgpu_texture(
            &native,
            &wgpu::TextureDescriptor {
                label: None,
                size: wgpu::Extent3d {
                    width: 4,
                    height: 2,
                    depth_or_array_layers: 6,
                },
                mip_level_count: 2,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba16Float,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            },
        );
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::CreateTexture(recorded)
                if recorded.texture == texture
                    && recorded.size == [4, 2, 6]
                    && recorded.mip_level_count == 2
                    && recorded.format == wgpu::TextureFormat::Rgba16Float
        )));
    }
}

mod draw_wgpu_render_pass {
    use super::*;

    #[test]
    fn records_the_draw_on_an_open_pass_and_nothing_outside_one() {
        let (mut state, records) = open_recorded_pass();
        draw_wgpu_render_pass(&mut state, 3, 2, 0, 0);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::Draw(WgpuDrawRecord {
                instance_count: 2,
                vertex_count: 3
            })
        )));

        let mut idle = create_wgpu_render_state_for_test(None);
        let idle_records = record_test_commands(&get_wgpu_render_state_native_device(&idle));
        draw_wgpu_render_pass(&mut idle, 3, 1, 0, 0);
        assert!(idle_records.lock().unwrap().is_empty());
    }
}

mod draw_wgpu_render_pass_indexed {
    use super::*;

    #[test]
    fn records_the_indexed_draw_with_its_ranges() {
        let (mut state, records) = open_recorded_pass();
        draw_wgpu_render_pass_indexed(&mut state, 6, 1, 3, 0, 0);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::DrawIndexed(WgpuDrawIndexedRecord {
                base_vertex: 0,
                first_index: 3,
                first_instance: 0,
                index_count: 6,
                instance_count: 1
            })
        )));
    }
}

mod record_wgpu_command {
    use super::*;

    #[test]
    fn reports_a_layered_package_record_to_the_installed_observer() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        record_wgpu_command(&native, || {
            return WgpuCommandRecord::Draw(WgpuDrawRecord {
                instance_count: 1,
                vertex_count: 6,
            });
        });
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::Draw(WgpuDrawRecord {
                instance_count: 1,
                vertex_count: 6
            })
        )));
    }

    #[test]
    fn builds_no_record_without_an_observer() {
        let native = create_test_native_device();
        let built = Arc::new(Mutex::new(false));
        let flag = built.clone();
        record_wgpu_command(&native, move || {
            *flag.lock().unwrap() = true;
            return WgpuCommandRecord::Submit(1);
        });
        assert!(!*built.lock().unwrap());
    }
}

mod set_wgpu_native_device_command_observer {
    use super::*;

    #[test]
    fn records_the_exact_commands_while_installed_and_nothing_once_cleared() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        write_one_texel(&native);
        assert_eq!(recorded_texture_writes(&records).len(), 1);
        assert_eq!(recorded_texture_writes(&records)[0].data, vec![1, 2, 3, 4]);

        set_wgpu_native_device_command_observer(&native, None);
        write_one_texel(&native);
        assert_eq!(recorded_texture_writes(&records).len(), 1);
    }

    // The observer lives on the payload, so every clone (every state on the device) reports to it.
    #[test]
    fn is_shared_by_every_clone_of_the_device_payload() {
        let native = create_test_native_device();
        let alias = native.clone();
        let seen = Arc::new(Mutex::new(0));
        let counter = seen.clone();
        set_wgpu_native_device_command_observer(
            &native,
            Some(Arc::new(move |_record: &WgpuCommandRecord| {
                *counter.lock().unwrap() += 1;
            })),
        );
        write_one_texel(&alias);
        assert_eq!(*seen.lock().unwrap(), 1);
    }
}

mod set_wgpu_render_pass_bind_group {
    use super::*;

    #[test]
    fn records_the_group_index_and_offsets() {
        let (mut state, records) = open_recorded_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let layout = create_wgpu_bind_group_layout(&native, &[]);
        let group = create_wgpu_bind_group(&native, &layout, &[]);
        set_wgpu_render_pass_bind_group(&mut state, 2, &group, &[]);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::SetBindGroup(set) if set.index == 2 && set.bind_group == group && set.offsets.is_empty()
        )));
    }
}

mod set_wgpu_render_pass_index_buffer {
    use super::*;

    #[test]
    fn records_the_buffer_and_its_index_format() {
        let (mut state, records) = open_recorded_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let buffer = create_wgpu_buffer(&native, 8, wgpu::BufferUsages::INDEX);
        set_wgpu_render_pass_index_buffer(&mut state, &buffer, wgpu::IndexFormat::Uint16);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::SetIndexBuffer(set) if set.buffer == buffer && set.format == wgpu::IndexFormat::Uint16
        )));
    }
}

mod set_wgpu_render_pass_pipeline {
    use super::*;

    #[test]
    fn records_the_pipeline_it_sets() {
        let (mut state, records) = open_recorded_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let module = create_wgpu_shader_module(&native, TEST_WGSL);
        let attributes = [wgpu::VertexAttribute {
            shader_location: 0,
            offset: 0,
            format: wgpu::VertexFormat::Float32x3,
        }];
        let buffers = [Some(wgpu::VertexBufferLayout {
            array_stride: 12,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &attributes,
        })];
        let targets = [Some(wgpu::ColorTargetState {
            format: state.format,
            blend: None,
            write_mask: wgpu::ColorWrites::ALL,
        })];
        let pipeline = native.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: None,
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                compilation_options: test_default(),
                buffers: &buffers,
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                compilation_options: test_default(),
                targets: &targets,
            }),
            primitive: test_default(),
            depth_stencil: None,
            multisample: test_default(),
            multiview_mask: None,
            cache: None,
        });
        set_wgpu_render_pass_pipeline(&mut state, &pipeline);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::SetPipeline(set) if *set == pipeline
        )));
    }
}

mod set_wgpu_render_pass_vertex_buffer {
    use super::*;

    #[test]
    fn records_the_buffer_at_its_slot() {
        let (mut state, records) = open_recorded_pass();
        let native = get_wgpu_render_state_native_device(&state);
        let buffer = create_wgpu_buffer(&native, 48, wgpu::BufferUsages::VERTEX);
        set_wgpu_render_pass_vertex_buffer(&mut state, 1, &buffer);
        assert!(records.lock().unwrap().iter().any(|record| matches!(
            record,
            WgpuCommandRecord::SetVertexBuffer(set) if set.slot == 1 && set.buffer == buffer
        )));
    }
}

mod write_wgpu_buffer {
    use super::*;

    #[test]
    fn writes_through_the_queue_and_records_the_exact_bytes_and_offset() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let buffer = native.device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 16,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::UNIFORM,
            mapped_at_creation: false,
        });
        write_wgpu_buffer(&native, &buffer, 4, &[1, 2, 3, 4]);
        let writes: Vec<WgpuBufferWriteRecord> = records
            .lock()
            .unwrap()
            .iter()
            .filter_map(|record| match record {
                WgpuCommandRecord::WriteBuffer(write) => Some(write.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].offset, 4);
        assert_eq!(writes[0].data, vec![1, 2, 3, 4]);
        assert_eq!(writes[0].buffer, buffer);
    }
}

mod write_wgpu_texture {
    use super::*;

    #[test]
    fn writes_through_the_queue_and_records_the_layout_and_bytes() {
        let native = create_test_native_device();
        let records = record_test_commands(&native);
        let texture = native.device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        write_wgpu_texture(
            &native,
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &[9, 8, 7, 6],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let writes = recorded_texture_writes(&records);
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].data, vec![9, 8, 7, 6]);
        assert_eq!(writes[0].bytes_per_row, Some(4));
        assert_eq!(writes[0].size, [1, 1, 1]);
        assert_eq!(writes[0].texture, texture);
    }
}

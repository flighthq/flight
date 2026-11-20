/* Strict C binding of built-in renderers through the kind-taking registrar. Render states and
 * targets come from the `stand-in-wgpu-host` build (wgpu's noop backend, which records commands but
 * does not rasterize); its report shows whether the 2D shape renderer drew, through the shape-mesh
 * pipeline that renderer creates on its first draw. A built-in renderer is bound to a standard kind
 * read from a node, and to a caller's own kind; a node of the custom kind draws only once its kind
 * is bound. Handles of the other backend, another family, forged or NULL, a NULL kind, a kind that
 * is not UTF-8 and a NULL GL state are refused under the sanitizers; invalid bytes never become the
 * empty kind, which binds only on purpose. Each family's borrowed handle is its own C type, and a
 * built-in forced through the owned quad material free by a cast is not freed.
 *
 * The checks run on a worker thread the main thread joins. Under FLIGHT_FFI_DELIBERATE_LEAK the
 * custom-kind scene root is never freed; once the worker has exited no live stack can hold a stale
 * copy of its address, so LeakSanitizer's conservative scan finds the root unreferenced and reports
 * it, whatever the stack layout. */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "flight_ffi.h"

typedef struct FlightStandInWgpuRenderReport {
  uint32_t pass_depth;
  bool encoder_open;
  bool render_pass_open;
  bool target_bound;
  uint64_t encoder_serial;
  uint32_t uniform_offset;
  uint32_t quad_batch_count;
  uint64_t uniform_hash;
  uint32_t shape_mesh_pipeline_count;
  uint32_t proxy_count;
  uint64_t proxy_hash;
} FlightStandInWgpuRenderReport;

void *flight_stand_in_create_wgpu_render_state(void);
void *flight_stand_in_create_wgpu_texture_target(const void *state, double width, double height);
void flight_stand_in_destroy_wgpu_render_state(void *state);
void flight_stand_in_destroy_wgpu_render_target(void *target);
bool flight_stand_in_report_wgpu_render_state(const void *state, const void *proxies,
                                              FlightStandInWgpuRenderReport *out);
FlightNode *flight_stand_in_create_solid_shape(uint32_t color, double x, double y, double width,
                                              double height);

#define CUSTOM_KIND "vendor.Outline"
#define INVALID_KIND "\xff\xfe"

static int check(int ok, const char *what) {
  if (!ok) {
    printf("flight-ffi renderer binding: FAILED %s\n", what);
  }
  return ok;
}

typedef struct Frame {
  void *state;
  void *target;
  void *proxies;
} Frame;

static Frame create_frame(void) {
  Frame frame;
  frame.state = flight_stand_in_create_wgpu_render_state();
  frame.target = flight_stand_in_create_wgpu_texture_target(frame.state, 16.0, 16.0);
  frame.proxies = flight_create_wgpu_scene_2d_render_proxies();
  flight_register_wgpu_standard_material(frame.state);
  flight_register_standard_wgpu_texture_resolvers(frame.state);
  return frame;
}

static void destroy_frame(Frame *frame) {
  flight_destroy_wgpu_render_state(frame->state, frame->proxies);
  flight_free_wgpu_scene_2d_render_proxies(frame->proxies);
  flight_stand_in_destroy_wgpu_render_target(frame->target);
  flight_stand_in_destroy_wgpu_render_state(frame->state);
}

/* Prepares, begins, draws, ends and submits one frame of root; returns the shape pipeline count. */
static uint32_t draw_frame(const Frame *frame, const FlightNode *root) {
  if (!flight_prepare_wgpu_scene_2d_render(frame->state, frame->proxies, root)) {
    return UINT32_MAX;
  }
  FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(frame->state, frame->target, NULL);
  if (pass == NULL) {
    return UINT32_MAX;
  }
  bool drawn = flight_render_wgpu_scene2d(pass, frame->proxies, root, NULL);
  bool ended = flight_end_wgpu_render_pass(pass);
  flight_free_wgpu_render_pass_handle(pass);
  flight_submit_wgpu_frame(frame->state);
  FlightStandInWgpuRenderReport report;
  memset(&report, 0, sizeof report);
  if (!drawn || !ended || !flight_stand_in_report_wgpu_render_state(frame->state, frame->proxies, &report)) {
    return UINT32_MAX;
  }
  return report.shape_mesh_pipeline_count;
}

static int run_binding(void) {
  int ok = 1;
  const FlightBuiltinWgpuNodeRenderer *scene_renderer = flight_get_wgpu_scene2d_renderer();
  const FlightBuiltinWgpuNodeRenderer *shape_renderer = flight_get_wgpu_shape_renderer();
  ok &= check(scene_renderer != NULL && shape_renderer != NULL && scene_renderer != shape_renderer,
              "built-in renderer handles");
  ok &= check(flight_get_wgpu_morph_shape_renderer() == shape_renderer,
              "the morph shape alias lends the shape renderer itself");

  /* A custom kind draws only once a built-in renderer is bound to it. */
  FlightNode *root = flight_create_display_object();
  FlightNode *outline = flight_stand_in_create_solid_shape(0x3366ccffu, 2.0, 2.0, 8.0, 6.0);
  ok &= check(root != NULL && outline != NULL, "scene nodes");
  ok &= check(flight_set_node_kind(outline, CUSTOM_KIND), "custom kind");
  flight_free_node(flight_add_node_child(root, outline));
  char *root_kind = flight_get_node_kind(root);
  Frame custom = create_frame();
  flight_register_wgpu_node_renderer(custom.state, root_kind, scene_renderer);
  /* Another family's handle reaches this registrar only through an explicit cast. */
  flight_register_wgpu_node_renderer(
      custom.state, CUSTOM_KIND, (const FlightBuiltinWgpuNodeRenderer *)flight_get_gl_shape_renderer());
  flight_register_wgpu_node_renderer(
      custom.state, CUSTOM_KIND,
      (const FlightBuiltinWgpuNodeRenderer *)flight_get_wgpu_unlit_mesh_material_renderer());
  flight_register_wgpu_node_renderer(
      custom.state, CUSTOM_KIND,
      (const FlightBuiltinWgpuNodeRenderer *)flight_get_wgpu_scene2d_render_preset());
  flight_register_wgpu_node_renderer(
      custom.state, CUSTOM_KIND,
      (const FlightBuiltinWgpuNodeRenderer *)((const char *)shape_renderer + 1));
  flight_register_wgpu_node_renderer(custom.state, CUSTOM_KIND, NULL);
  flight_register_wgpu_node_renderer(custom.state, NULL, shape_renderer);
  flight_register_wgpu_node_renderer(NULL, CUSTOM_KIND, shape_renderer);
  ok &= check(draw_frame(&custom, root) == 0, "an unbound custom kind does not draw");
  flight_register_wgpu_node_renderer(custom.state, CUSTOM_KIND, shape_renderer);
  ok &= check(draw_frame(&custom, root) == 1, "the custom kind draws with the bound shape renderer");
  destroy_frame(&custom);

  /* The same built-in bound to the standard kind a node reports. */
  FlightNode *standard_root = flight_create_display_object();
  FlightNode *shape = flight_stand_in_create_solid_shape(0xcc3333ffu, 1.0, 1.0, 5.0, 5.0);
  flight_free_node(flight_add_node_child(standard_root, shape));
  char *shape_kind = flight_get_node_kind(shape);
  ok &= check(shape_kind != NULL && strcmp(shape_kind, CUSTOM_KIND) != 0, "standard shape kind");
  Frame standard = create_frame();
  flight_register_wgpu_node_renderer(standard.state, root_kind, scene_renderer);
  ok &= check(draw_frame(&standard, standard_root) == 0, "an unbound standard kind does not draw");
  flight_register_wgpu_node_renderer(standard.state, shape_kind, shape_renderer);
  ok &= check(draw_frame(&standard, standard_root) == 1, "the standard kind draws");
  destroy_frame(&standard);

  /* A kind that is not UTF-8 never becomes the empty kind: a node of the empty kind stays unbound
   * until the empty kind is bound on purpose. */
  FlightNode *empty_root = flight_create_display_object();
  FlightNode *unnamed = flight_stand_in_create_solid_shape(0x33cc33ffu, 3.0, 3.0, 4.0, 4.0);
  ok &= check(flight_set_node_kind(unnamed, ""), "empty kind");
  ok &= check(!flight_set_node_kind(unnamed, INVALID_KIND), "a node refuses a kind that is not UTF-8");
  flight_free_node(flight_add_node_child(empty_root, unnamed));
  Frame empty = create_frame();
  flight_register_wgpu_node_renderer(empty.state, root_kind, scene_renderer);
  flight_register_wgpu_node_renderer(empty.state, INVALID_KIND, shape_renderer);
  ok &= check(draw_frame(&empty, empty_root) == 0, "invalid kind bytes bind nothing");
  flight_register_wgpu_node_renderer(empty.state, "", shape_renderer);
  ok &= check(draw_frame(&empty, empty_root) == 1, "the empty kind binds on purpose");
  const FlightBuiltinWgpuMeshMaterialRenderer *unlit = flight_get_wgpu_unlit_mesh_material_renderer();
  flight_register_wgpu_mesh_material_renderer(empty.state, INVALID_KIND, unlit);
  ok &= check(flight_get_wgpu_mesh_material_renderer(empty.state, "") == NULL,
              "invalid mesh kind bytes bind nothing");
  ok &= check(flight_get_wgpu_mesh_material_renderer(empty.state, INVALID_KIND) == NULL,
              "a lookup of invalid kind bytes finds nothing");
  flight_register_wgpu_mesh_material_renderer(empty.state, "", unlit);
  ok &= check(flight_get_wgpu_mesh_material_renderer(empty.state, "") == unlit,
              "the empty mesh kind binds on purpose");
  destroy_frame(&empty);

  /* C cannot make a GL render state, so NULL is the one a caller can pass: refused before use. */
  flight_register_gl_node_renderer(NULL, "probe.Gl", flight_get_gl_sprite_renderer());
  flight_register_gl_node_renderer(NULL, INVALID_KIND, flight_get_gl_sprite_renderer());

  /* A built-in forced through the owned quad material free by a cast is refused, not freed. */
  const FlightBuiltinWgpuQuadMaterialRenderer *quad = flight_get_standard_wgpu_quad_material_renderer();
  flight_free_wgpu_quad_material_renderer((void *)quad);
  flight_free_wgpu_quad_material_renderer((void *)quad);
  ok &= check(flight_get_standard_wgpu_quad_material_renderer() == quad, "the quad material static survives");

  /* A built-in preset, and refusal of a handle of another family. */
  Frame preset = create_frame();
  flight_register_wgpu_render_preset(preset.state, (const FlightBuiltinWgpuRenderPreset *)shape_renderer);
  flight_register_wgpu_render_preset(preset.state, NULL);
  ok &= check(draw_frame(&preset, standard_root) == 0, "refused preset handles bind nothing");
  flight_register_wgpu_render_preset(preset.state, flight_get_wgpu_scene2d_render_preset());
  ok &= check(draw_frame(&preset, standard_root) == 1, "the 2D preset binds the shape kind");
  destroy_frame(&preset);

  flight_free_string(shape_kind);
  flight_free_string(root_kind);
  flight_free_node(shape);
  flight_free_node(standard_root);
  flight_free_node(unnamed);
  flight_free_node(empty_root);
  flight_free_node(outline);
#ifndef FLIGHT_FFI_DELIBERATE_LEAK
  flight_free_node(root);
#endif
  return ok;
}

static void *run_on_worker(void *result) {
  *(int *)result = run_binding();
  return NULL;
}

int main(void) {
  int ok = 0;
  pthread_t worker;
  if (pthread_create(&worker, NULL, run_on_worker, &ok) != 0 || pthread_join(worker, NULL) != 0) {
    printf("flight-ffi renderer binding: FAILED worker thread\n");
    return 1;
  }
  if (!ok) {
    return 1;
  }
  /* LeakSanitizer ends the process without flushing stdio, so the result is flushed here. */
  printf("flight-ffi renderer binding: ok\n");
  fflush(stdout);
  return 0;
}

/* Strict C offscreen render on the headless host: the scene is built through the generated
 * externs (a display-object root holding an SVG-imported shape subtree, offset through the node
 * transform), rendered on a render state over the device the host lends, into the render target
 * the host lends, and read back through the host's read-back of the SDK screen-target capture.
 *
 * usage: headless_render <scene.svg> <pixels.rgba>
 * Writes the read-back frame as width * height packed RGBA pixels, row by row, for the test that
 * renders the same scene through Rust to compare. Prints a skip line when no adapter exists. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include "flight_ffi.h"

#define SCENE_WIDTH 48u
#define SCENE_HEIGHT 32u
#define SCENE_OFFSET_X 4.0
#define SCENE_OFFSET_Y 2.0

#define CHECK(condition)                                                                          \
  do {                                                                                            \
    if (!(condition)) {                                                                           \
      fprintf(stderr, "check failed at line %d: %s\n", __LINE__, #condition);                    \
      return 1;                                                                                   \
    }                                                                                             \
  } while (0)

static char *read_text(const char *path) {
  FILE *file = fopen(path, "rb");
  if (file == NULL) {
    return NULL;
  }
  char *text = calloc(1, 65536);
  size_t length = text == NULL ? 0 : fread(text, 1, 65535, file);
  fclose(file);
  if (text != NULL && length == 0) {
    free(text);
    return NULL;
  }
  return text;
}

int main(int argc, char **argv) {
  CHECK(argc == 3);
  char *svg = read_text(argv[1]);
  CHECK(svg != NULL);

  FlightHeadlessHost *host = flight_create_headless_host(NULL);
  if (host == NULL) {
    free(svg);
    printf("flight-ffi headless render: skipped (no adapter)\n");
    return 0;
  }
  void *device = flight_get_headless_host_wgpu_device(host);
  void *target = flight_create_headless_host_render_target(host, SCENE_WIDTH, SCENE_HEIGHT);
  CHECK(device != NULL && target != NULL);

  void *state = flight_create_wgpu_render_state(device, NULL);
  CHECK(state != NULL);
  flight_register_wgpu_standard_material(state);
  flight_register_standard_wgpu_texture_resolvers(state);
  flight_register_wgpu_scene2d_render_preset(state);

  FlightNode *root = flight_create_display_object();
  FlightNode *shapes = flight_create_scene2d_from_svg_document(svg, NULL, NULL);
  free(svg);
  CHECK(root != NULL && shapes != NULL);
  CHECK(flight_set_node2d_x(shapes, SCENE_OFFSET_X));
  CHECK(flight_set_node2d_y(shapes, SCENE_OFFSET_Y));
  FlightNode *added = flight_add_node_child(root, shapes);
  flight_free_node(added);
  flight_free_node(shapes);

  void *proxies = flight_create_wgpu_scene_2d_render_proxies();
  CHECK(proxies != NULL);
  CHECK(flight_prepare_wgpu_scene_2d_render(state, proxies, root));
  FlightWgpuRenderPassHandle *pass = flight_begin_wgpu_render_pass(state, target, NULL);
  CHECK(pass != NULL);
  CHECK(flight_render_wgpu_scene2d(pass, proxies, root, NULL));
  CHECK(flight_end_wgpu_render_pass(pass));
  flight_free_wgpu_render_pass_handle(pass);
  flight_submit_wgpu_frame(state);

  void *bitmap = flight_create_bitmap_from_headless_screen_render_target(target, 10000);
  CHECK(bitmap != NULL);
  FILE *out = fopen(argv[2], "wb");
  CHECK(out != NULL);
  for (uint32_t y = 0; y < SCENE_HEIGHT; ++y) {
    for (uint32_t x = 0; x < SCENE_WIDTH; ++x) {
      uint32_t pixel = flight_get_bitmap_pixel(bitmap, x, y);
      unsigned char bytes[4] = {(unsigned char)(pixel >> 24), (unsigned char)(pixel >> 16),
                                (unsigned char)(pixel >> 8), (unsigned char)pixel};
      CHECK(fwrite(bytes, 1, 4, out) == 4);
    }
  }
  CHECK(fclose(out) == 0);
  flight_free_bitmap_ref(bitmap);

  /* Destroy the host while the render state still holds its device: the lent target is freed
   * with the host and refused afterwards, and the state stays a valid value to release. */
  flight_destroy_headless_host(host);
  CHECK(flight_create_bitmap_from_headless_screen_render_target(target, 1000) == NULL);
  flight_destroy_headless_host(host);
  flight_destroy_wgpu_render_state(state, proxies);
  flight_free_wgpu_scene_2d_render_proxies(proxies);
  flight_free_wgpu_render_state(state);
  flight_free_node(root);
#ifdef FLIGHT_FFI_DELIBERATE_LEAK
  CHECK(flight_create_display_object() != NULL);
#endif
  printf("flight-ffi headless render: ok\n");
  return 0;
}

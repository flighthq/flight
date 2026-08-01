// Keep build and dev example pages on one failure-reporting path. The capture verifier reads #ft-error
// when a module exception prevents it from publishing a terminal result, so startup failures must be
// painted into the page rather than collapsing into a generic verifier-stalled message.
export function buildExamplesWebEntryHtml(
  name: string,
  render: string,
  scriptSrc: string,
  options: Readonly<{ assetBase?: string; viteClient?: boolean }> = {},
): string {
  const assetBase = options.assetBase === undefined ? '' : `  <base href="${options.assetBase}" />\n`;
  const viteClient = options.viteClient ? '  <script type="module" src="/@vite/client"></script>\n' : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
${assetBase}  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} · ${render}</title>
  <link rel="icon" href="data:," />
  <style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { overflow: hidden; }</style>
  <script>
    function __ftShowError(msg) {
      var el = document.getElementById('ft-error');
      if (!el) {
        el = document.createElement('pre');
        el.id = 'ft-error';
        el.style.cssText = 'position:fixed;inset:0;margin:0;padding:1em;background:#1a0000;color:#ff6b6b;font-size:13px;font-family:monospace;overflow:auto;z-index:9999;white-space:pre-wrap;word-break:break-word;';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      try { window.parent.console.error(${JSON.stringify(`[${name}/${render}]`)}, msg); } catch (_) {}
    }
    window.addEventListener('error', function(e) {
      __ftShowError((e.error && e.error.stack) || e.message || String(e));
    });
    window.addEventListener('unhandledrejection', function(e) {
      __ftShowError((e.reason && e.reason.stack) || String(e.reason));
    });
    window.addEventListener('pagehide', function() {
      document.querySelectorAll('canvas').forEach(function(c) {
        var gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
      });
    });
  </script>
</head>
<body>
  <div id="app"></div>
${viteClient}  <script type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

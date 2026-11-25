// Luminance circular wipe, drawn on the GPU with WebGL2.
//
// Every pixel of the finishing image gets an "arrival time": its distance from the origin,
// minus a head start proportional to its brightness (forward) or plus a delay (backward).
// A soft-edged wave front sweeps across those arrival times, so bright detail appears first
// when wiping forward and is covered first when wiping backward.
//
// The GPU does the per-pixel work, so a frame costs almost nothing on the CPU. That removes
// the PNG round trip through a CSS mask and the Firefox-only canvas path: every browser now
// gets the same canvas (`canvasTwo`) that app.js and admin.js already know how to show.
//
// The only CPU work is a one-off analysis on a small grid (ANALYSIS_EDGE px at most) that
// finds when the wave reaches its first and last pixel, so the wipe starts moving at
// progress 0 and is complete at progress 1. If the browser blocks pixel reads (privacy
// modes), safe bounds are used instead and the wipe simply finishes a little early.
// Without hardware-accelerated WebGL2 it falls back to a plain circular wipe.

const MAX_TEXTURE_EDGE = 4096;             // longest edge of the image texture uploaded to the GPU
const MAX_DRAWING_PIXELS = 4096 * 2304;    // cap on the output canvas (the browser scales it up)
const ANALYSIS_EDGE = 960;                 // longest edge of the grid used to find the wave's range
// Software-only WebGL (remote desktops, VMs, GPU acceleration switched off) runs the shader on
// the CPU, which is slower than the old approach. With this on, such machines get the plain
// circular wipe instead. Set to false to accept software rendering anyway.
const REQUIRE_HARDWARE_GL = true;

const VERTEX_SHADER = `#version 300 es
void main() {
  // One oversized triangle that covers the whole canvas; no vertex buffer needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uImg;
uniform vec2  uRes;      // drawing buffer size, device pixels
uniform vec2  uImgSize;  // texture size, texels
uniform vec2  uOrigin;   // wipe origin, device pixels, y down
uniform float uFeather;  // soft edge width, device pixels
uniform float uWave;     // wave front position, device pixels
uniform float uForward;  // 1.0 = forward, 0.0 = backward
uniform float uLumLod;   // mip level at which brightness is measured (about one CSS pixel)

out vec4 outColor;

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // y down, like the page

  // 'cover' fit, centred: same as background-size: cover
  float s = max(uRes.x / uImgSize.x, uRes.y / uImgSize.y);
  vec2 fitted = uImgSize * s;
  vec2 uv = (px - (uRes - fitted) * 0.5) / fitted;

  vec4 c = texture(uImg, uv);
  float lum = dot(textureLod(uImg, uv, uLumLod).rgb, vec3(0.299, 0.587, 0.114));

  float d = distance(px, uOrigin);
  float arrival = uForward > 0.5 ? max(0.0, d - lum * uFeather) : d + lum * uFeather;
  float dist = uForward > 0.5 ? uWave - arrival : arrival - uWave;
  float alpha = clamp(dist / uFeather, 0.0, 1.0) * c.a;

  outColor = vec4(c.rgb * alpha, alpha);   // the canvas expects premultiplied alpha
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
  }
  return shader;
}

export const lumaCircularWipe = {
  id: 'luma-circle',
  name: 'Luminance Circular',
  supportsOrigin: true,
  supportsFeather: true,
  supportsFinish: true, // honors options.endRadius (wipe stops early)
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 8v8m-4-4h8" stroke="currentColor" stroke-width="1.5"/></svg>`,

  imageObj: null,
  imageUrl: null,

  _loadToken: 0,       // lets a newer init() win if an older load finishes late
  _pending: null,      // promise of the load in progress
  _failedUrl: null,    // image we gave up on (render error); uses the plain wipe for it

  // GPU state
  _canvas: null,
  _gl: null,
  _program: null,
  _u: null,            // uniform locations
  _texture: null,
  _texW: 0,
  _texH: 0,
  _texDirty: true,     // the texture does not hold the current image yet
  _ready: false,       // WebGL objects exist and the context is not lost
  _glFailed: false,    // WebGL2 is unavailable or the shaders did not compile

  // One-off analysis state
  _readable: null,     // can this browser read canvas pixels? (null = not tested yet)
  _grid: null,         // small brightness grid for the current image and aspect ratio
  _boundsKey: '',
  _bounds: null,       // { minA, maxA } for the current parameters

  async init(imageTwoUrl) {
    if (imageTwoUrl === this.imageUrl) {
      if (this.imageObj) return;
      if (this._pending) return this._pending;
    }
    this.imageUrl = imageTwoUrl;
    this.imageObj = null;
    this._texDirty = true;
    this._grid = null;
    this._boundsKey = '';
    const token = ++this._loadToken;

    this._pending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Ignore a load that has been overtaken by a newer init() call
        if (token === this._loadToken) this.imageObj = img;
        resolve();
      };
      img.onerror = () => {
        console.warn('[luma-circle] could not load', imageTwoUrl);
        resolve();
      };
      img.src = imageTwoUrl;
    }).finally(() => {
      if (token === this._loadToken) this._pending = null;
    });
    return this._pending;
  },

  // ---- WebGL setup -------------------------------------------------------------------

  _setupGL() {
    if (this._glFailed) return false;
    if (!this._canvas) {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power', // a slow wipe never needs the discrete GPU
        failIfMajorPerformanceCaveat: REQUIRE_HARDWARE_GL,
      });
      if (!gl) {
        console.warn('[luma-circle] Hardware-accelerated WebGL2 is not available. Using the plain circular wipe instead.');
        this._glFailed = true;
        return false;
      }
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault(); // allows the browser to restore the context
        this._ready = false;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this._ready = this._buildGL();
        this._texDirty = true;
      });
      this._canvas = canvas;
      this._gl = gl;
      this._ready = this._buildGL();
    }
    return this._ready;
  },

  _buildGL() {
    const gl = this._gl;
    try {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
      }
      this._program = program;
      this._u = {};
      for (const name of ['uImg', 'uRes', 'uImgSize', 'uOrigin', 'uFeather', 'uWave', 'uForward', 'uLumLod']) {
        this._u[name] = gl.getUniformLocation(program, name);
      }
      this._texture = gl.createTexture();
      return true;
    } catch (err) {
      console.warn('[luma-circle] WebGL setup failed. Using the plain circular wipe instead.', err);
      this._glFailed = true;
      return false;
    }
  },

  _uploadTexture() {
    const gl = this._gl;
    const img = this.imageObj;
    const maxEdge = Math.min(MAX_TEXTURE_EDGE, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    let source = img;
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    // Very large images (and images with no intrinsic size) go through a canvas first.
    if (!w || !h || Math.max(w, h) > maxEdge) {
      const k = w && h ? Math.min(1, maxEdge / Math.max(w, h)) : 1;
      const c = document.createElement('canvas');
      c.width = w = Math.max(1, Math.round((w || 1024) * k));
      c.height = h = Math.max(1, Math.round((h || 1024) * k));
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      source = c;
    }

    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._texW = w;
    this._texH = h;
    this._texDirty = false;
  },

  // ---- One-off analysis: when does the wave reach the first and last pixel? ----------

  // Some browsers (e.g. Firefox with resistFingerprinting) blank or randomize canvas pixel
  // reads. Detect that with a pixel of known colour.
  _canReadPixels() {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = 'rgb(200, 100, 50)';
      x.fillRect(0, 0, 4, 4);
      const d = x.getImageData(0, 0, 1, 1).data;
      return Math.abs(d[0] - 200) < 12 && Math.abs(d[1] - 100) < 12 &&
             Math.abs(d[2] - 50) < 12 && d[3] === 255;
    } catch (err) {
      return false;
    }
  },

  // Brightness (0..255) of the 'cover'-fitted image on a small grid with the canvas's aspect ratio
  _brightnessGrid(width, height) {
    const k = Math.min(1, ANALYSIS_EDGE / Math.max(width, height));
    const gw = Math.max(1, Math.round(width * k));
    const gh = Math.max(1, Math.round(height * k));
    const key = `${this.imageUrl}|${gw}x${gh}`;
    if (this._grid && this._grid.key === key) return this._grid;

    const canvas = document.createElement('canvas');
    canvas.width = gw;
    canvas.height = gh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const natW = this.imageObj.naturalWidth || gw;
    const natH = this.imageObj.naturalHeight || gh;
    const scale = Math.max(gw / natW, gh / natH);
    const fw = natW * scale;
    const fh = natH * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.imageObj, (gw - fw) / 2, (gh - fh) / 2, fw, fh);

    const px = ctx.getImageData(0, 0, gw, gh).data;
    const lum = new Uint8Array(gw * gh);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      lum[i] = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2] + 0.5) | 0;
    }
    this._grid = { key, gw, gh, lum };
    return this._grid;
  },

  // Earliest and latest arrival times over the whole image, in CSS pixels. Cached until the
  // image, size, origin, feather or direction changes.
  _waveRange(cx, cy, width, height, f, forward) {
    const key = `${this.imageUrl}|${width}x${height}|${cx.toFixed(1)},${cy.toFixed(1)}|${f}|${forward}`;
    if (this._boundsKey === key) return this._bounds;

    if (this._readable === null) this._readable = this._canReadPixels();

    let grid = null;
    if (this._readable) {
      try {
        grid = this._brightnessGrid(width, height);
      } catch (err) {
        this._readable = false; // e.g. a tainted canvas
      }
    }

    let minA;
    let maxA;
    if (grid) {
      const { gw, gh, lum } = grid;
      const sx = width / gw;
      const sy = height / gh;
      const dx2 = new Float32Array(gw);
      for (let x = 0; x < gw; x++) {
        const dx = (x + 0.5) * sx - cx;
        dx2[x] = dx * dx;
      }
      const perLum = f / 255;
      minA = Infinity;
      maxA = -Infinity;
      let i = 0;
      for (let y = 0; y < gh; y++) {
        const dy = (y + 0.5) * sy - cy;
        const dy2 = dy * dy;
        for (let x = 0; x < gw; x++, i++) {
          const d = Math.sqrt(dx2[x] + dy2);
          const a = forward ? Math.max(0, d - lum[i] * perLum) : d + lum[i] * perLum;
          if (a < minA) minA = a;
          if (a > maxA) maxA = a;
        }
      }
      // The grid is coarser than the screen: leave half a cell of slack at both ends
      const slack = 0.5 * Math.hypot(sx, sy);
      minA -= slack;
      maxA += slack;
    } else {
      // Brightness unknown: assume the widest range it could produce (0 = dark, 1 = bright)
      const nearest = Math.hypot(Math.max(0, -cx, cx - width), Math.max(0, -cy, cy - height));
      const farthest = Math.max(
        Math.hypot(cx, cy), Math.hypot(width - cx, cy),
        Math.hypot(cx, height - cy), Math.hypot(width - cx, height - cy)
      );
      minA = forward ? Math.max(0, nearest - f) : nearest;
      maxA = forward ? farthest : farthest + f;
    }

    this._boundsKey = key;
    this._bounds = { minA, maxA };
    return this._bounds;
  },

  // ---- Rendering ---------------------------------------------------------------------

  _fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) {
    // Plain circular wipe: soft edge travels from fully hidden to fully covered
    const maxD = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    );
    const r = p * (hasEnd ? endRadius : maxD + f);
    return `radial-gradient(circle at ${cx}px ${cy}px, #000 ${r - f}px, transparent ${r}px)`;
  },

  render(progress, { cx, cy, width, height, direction = 'forward', feather = 60, endRadius = null }) {
    width = Math.round(width);
    height = Math.round(height);
    const f = Math.max(1, feather);
    const p = Math.min(1, Math.max(0, progress));
    // endRadius (pixels) = where the soft edge stops. null/0 = wipe the whole image.
    const hasEnd = Number.isFinite(endRadius) && endRadius > 0;

    if (!this.imageObj || this._failedUrl === this.imageUrl || width <= 0 || height <= 0 || !this._setupGL()) {
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }

    try {
      const forward = direction === 'forward';
      const { minA, maxA } = this._waveRange(cx, cy, width, height, f, forward);

      // The wave travels exactly the range that is needed:
      //  - the first pixel begins changing at progress 0+ (no dead time)
      //  - the last pixel is fully opaque at progress 1 (no pop), unless a finish
      //    radius is set, in which case the wave stops there and the soft edge
      //    ends at endRadius.
      let waveStart;
      let waveEnd;
      if (forward) {
        waveStart = minA;
        waveEnd = hasEnd ? Math.min(endRadius, maxA + f) : maxA + f;
        waveEnd = Math.max(waveEnd, minA + 1);
      } else {
        waveStart = maxA;
        waveEnd = hasEnd ? Math.max(endRadius - f, minA - f) : minA - f;
        waveEnd = Math.min(waveEnd, maxA - 1);
      }
      const wave = waveStart + (waveEnd - waveStart) * p;

      this._draw(cx, cy, width, height, f, wave, forward);
      return { canvasTwo: this._canvas };
    } catch (err) {
      console.warn('[luma-circle] render failed, using plain circular wipe for this image:', err);
      this._failedUrl = this.imageUrl;
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }
  },

  _draw(cx, cy, width, height, f, wave, forward) {
    const gl = this._gl;
    if (this._texDirty) this._uploadTexture();

    // Output at the screen's real pixel density (capped for very large displays)
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const k = Math.min(dpr, Math.sqrt(MAX_DRAWING_PIXELS / (width * height)));
    const w = Math.max(1, Math.round(width * k));
    const h = Math.max(1, Math.round(height * k));
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    // Measure brightness at about one CSS pixel, however large the texture is
    const coverScale = Math.max(w / this._texW, h / this._texH); // device px per texel
    const lumLod = Math.log2(Math.max(1, k / coverScale));

    const u = this._u;
    gl.useProgram(this._program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.uniform1i(u.uImg, 0);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uImgSize, this._texW, this._texH);
    gl.uniform2f(u.uOrigin, cx * k, cy * k);
    gl.uniform1f(u.uFeather, f * k);
    gl.uniform1f(u.uWave, wave * k);
    gl.uniform1f(u.uForward, forward ? 1 : 0);
    gl.uniform1f(u.uLumLod, lumLod);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
};
export const lumaCircularWipe = {
  id: 'luma-circle',
  name: 'Luminance Circular',
  supportsOrigin: true,
  supportsFeather: true,
  supportsFinish: true, // honors options.endRadius (wipe stops early)
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 8v8m-4-4h8" stroke="currentColor" stroke-width="1.5"/></svg>`,

  imageObj: null,
  imageUrl: null,

  // Cached per (image, size)
  _canvas: null,
  _ctx: null,
  _imgData: null,
  _lum: null,      // Float32Array of luminance 0..1
  _arrival: null,  // Float32Array scratch buffer
  _cacheKey: '',
  _unusable: false, // true when this browser won't give us real pixel data

  // Firefox decodes CSS mask-image images lazily, at paint time. This wipe changes the mask
  // image every frame, and on some Firefox setups (notably high-DPI) the new image is swapped
  // out before it is ever drawn, so the mask never shows. In Firefox we therefore also hand
  // the app a ready-made canvas (the second image already multiplied by the mask), which has
  // no loading or decoding step. Apps that don't know about `canvasTwo` still get `maskTwo`.
  useCanvasInFirefox: true,
  // Gecko-only property (also true for Firefox forks such as Zen), with a user-agent backup
  _firefox: typeof window !== 'undefined' &&
    ('mozInnerScreenX' in window || /\bFirefox\//.test(navigator.userAgent)),
  _display: null,

  async init(imageTwoUrl) {
    if (this.imageUrl === imageTwoUrl && this.imageObj) return;
    this.imageUrl = imageTwoUrl;
    this._cacheKey = ''; // invalidate
    this._unusable = false;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageObj = img;
        if (!this._canReadPixels()) {
          this._unusable = true;
          console.warn('[luma-circle] This browser blocks canvas pixel reads (privacy protection?). Using the plain circular wipe instead.');
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imageTwoUrl;
    });
  },

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
      console.warn('[luma-circle] canvas read failed:', err);
      return false;
    }
  },

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

  // Second image, 'cover'-fitted and masked, drawn at the screen's real pixel density.
  _composite(width, height) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    const canvas = this._display || (this._display = document.createElement('canvas'));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    const natW = this.imageObj.naturalWidth || w;
    const natH = this.imageObj.naturalHeight || h;
    const scale = Math.max(w / natW, h / natH);
    const fw = natW * scale;
    const fh = natH * scale;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.imageObj, (w - fw) / 2, (h - fh) / 2, fw, fh);
    ctx.globalCompositeOperation = 'destination-in'; // keep the image only where the mask is opaque
    ctx.drawImage(this._canvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return canvas;
  },

  // Sample the image once per size (not once per frame).
  _prepare(width, height) {
    const key = `${this.imageUrl}|${width}x${height}`;
    if (this._cacheKey === key) return;

    const canvas = this._canvas || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);

    // 'cover' fit to match the app's background scaling
    const natW = this.imageObj.naturalWidth || width;
    const natH = this.imageObj.naturalHeight || height;
    const scale = Math.max(width / natW, height / natH);
    const fw = natW * scale;
    const fh = natH * scale;
    ctx.drawImage(this.imageObj, (width - fw) / 2, (height - fh) / 2, fw, fh);

    const imgData = ctx.getImageData(0, 0, width, height);
    const px = imgData.data;
    const n = width * height;
    const lum = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      lum[i] = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) / 255;
      px[p] = px[p + 1] = px[p + 2] = 0; // mask color is always black; only alpha varies
    }

    this._canvas = canvas;
    this._ctx = ctx;
    this._imgData = imgData;
    this._lum = lum;
    this._arrival = new Float32Array(n);
    this._cacheKey = key;
  },

  render(progress, { cx, cy, width, height, direction = 'forward', feather = 60, endRadius = null }) {
    width = Math.round(width);
    height = Math.round(height);
    const f = Math.max(1, feather);
    const p = Math.min(1, Math.max(0, progress));
    // endRadius (pixels) = where the soft edge stops. null/0 = wipe the whole image.
    const hasEnd = Number.isFinite(endRadius) && endRadius > 0;

    if (this._unusable || !this.imageObj || width <= 0 || height <= 0) {
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }

    try {
      this._paintMask(p, cx, cy, width, height, direction, f, endRadius, hasEnd);
      if (this._firefox && this.useCanvasInFirefox) {
        if (!this._loggedCanvas) {
          this._loggedCanvas = true;
          console.info('[luma-circle] Firefox detected: using canvas output');
        }
        const self = this;
        return {
          canvasTwo: this._composite(width, height),
          // Only built if the app ignores canvasTwo and asks for it
          get maskTwo() { return `url("${self._canvas.toDataURL()}")`; }
        };
      }
      return { maskTwo: `url("${this._canvas.toDataURL()}")` };
    } catch (err) {
      console.warn('[luma-circle] render failed, using plain circular wipe:', err);
      this._unusable = true;
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }
  },

  // Paints this frame's alpha mask into this._canvas
  _paintMask(p, cx, cy, width, height, direction, f, endRadius, hasEnd) {
    this._prepare(width, height);
    const lum = this._lum;
    const arrival = this._arrival;
    const imgData = this._imgData;
    const px = imgData.data;
    const forward = direction === 'forward';

    // Pass 1: when does the wave reach each pixel? Track the true min/max.
    let minA = Infinity;
    let maxA = -Infinity;
    let i = 0;
    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++, i++) {
        const d = Math.hypot(x - cx, dy);
        // Bright pixels get a head start (forward) / are covered earlier (backward)
        const a = forward ? Math.max(0, d - lum[i] * f) : d + lum[i] * f;
        arrival[i] = a;
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      }
    }

    // The wave travels exactly the range that is needed:
    //  - first pixel begins changing at progress 0+ (no dead time)
    //  - last pixel is fully opaque at progress 1 (no pop), unless a finish
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

    // Pass 2: alpha from distance past the wave front
    const n = width * height;
    for (let k = 0, q = 3; k < n; k++, q += 4) {
      const dist = forward ? wave - arrival[k] : arrival[k] - wave;
      const alpha = dist <= 0 ? 0 : dist >= f ? 1 : dist / f;
      px[q] = (alpha * 255 + 0.5) | 0;
    }

    this._ctx.putImageData(imgData, 0, 0);
  }
};
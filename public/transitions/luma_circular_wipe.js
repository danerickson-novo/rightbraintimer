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

  // Some browsers (Firefox with resistFingerprinting, LibreWolf, etc.) blank or randomize
  // canvas pixel reads. Detect that with a pixel of known colour.
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

    if (!this._dbgCalled) {
      this._dbgCalled = true;
      console.log('[luma-circle debug] render() is being called. imageObj loaded:', !!this.imageObj, 'unusable:', this._unusable);
    }

    if (this._unusable || !this.imageObj || width <= 0 || height <= 0) {
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }

    try {
      return this._renderLuma(p, cx, cy, width, height, direction, f, endRadius, hasEnd);
    } catch (err) {
      console.warn('[luma-circle] render failed, using plain circular wipe:', err);
      this._unusable = true;
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }
  },

  _renderLuma(p, cx, cy, width, height, direction, f, endRadius, hasEnd) {
    this._dbgStart = performance.now();
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
    const url = this._canvas.toDataURL();

    // TEMPORARY DEBUG: one line per second in the browser console
    const now = performance.now();
    if (!this._dbgT || now - this._dbgT > 1000) {
      this._dbgT = now;
      let aMin = 255, aMax = 0;
      for (let k = 3; k < px.length; k += 4 * 997) { // sparse sample is plenty
        if (px[k] < aMin) aMin = px[k];
        if (px[k] > aMax) aMax = px[k];
      }
      console.log(`[luma-circle debug] p=${p.toFixed(3)} size=${width}x${height} ` +
        `alpha(min..max)=${aMin}..${aMax} dir=${direction} feather=${f} endRadius=${endRadius} ` +
        `dataUrlKB=${(url.length / 1024) | 0} renderMs=${(now - this._dbgStart).toFixed(0)}`);
    }

    return { maskTwo: `url("${url}")` };
  }
};
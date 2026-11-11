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

  // Firefox loads CSS url() mask images asynchronously. A brand-new data URL every frame
  // is replaced before it ever finishes loading, so the mask never appears. In Firefox we
  // therefore only hand the browser a URL that has already loaded.
  _firefox: typeof document !== 'undefined' && 'MozAppearance' in document.documentElement.style,
  _ready: null,    // last data URL confirmed loaded
  _loading: false, // a mask image is currently loading
  _lastP: 0,

  async init(imageTwoUrl) {
    if (this.imageUrl === imageTwoUrl && this.imageObj) return;
    this.imageUrl = imageTwoUrl;
    this._cacheKey = ''; // invalidate
    this._ready = null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageObj = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imageTwoUrl;
    });
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

  _fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) {
    // Soft edge travels from fully hidden to fully covered
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

    if (!this.imageObj || width <= 0 || height <= 0) {
      return { maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }

    this._prepare(width, height);
    const lum = this._lum;
    const arrival = this._arrival;
    const imgData = this._imgData;
    const px = imgData.data;
    const forward = direction === 'forward';

    if (this._firefox) {
      // A new transition started: drop the previous transition's last mask
      if (p < this._lastP) this._ready = null;
      this._lastP = p;
      // Endpoints are exact and need no image
      if (p <= 0) return { maskTwo: 'linear-gradient(transparent, transparent)' };
      if (p >= 1 && !hasEnd) return { maskTwo: 'linear-gradient(#000, #000)' };
      // Still waiting on the previous mask to load: keep showing the last loaded one
      if (this._loading) {
        return { maskTwo: this._ready
          ? `url("${this._ready}")`
          : this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
      }
    }

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

    if (this._firefox) {
      // Load this frame's mask in the background; it is used from the next frame on
      this._loading = true;
      const img = new Image();
      img.onload = () => { this._ready = url; this._loading = false; };
      img.onerror = () => { this._loading = false; };
      img.src = url;
      return { maskTwo: this._ready
        ? `url("${this._ready}")`
        : this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) };
    }

    return { maskTwo: `url("${url}")` };
  }
};
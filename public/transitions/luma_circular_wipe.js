const DEFAULT_FPS_CONFIG = {
  minFps: 2,
  maxFps: 30,
  steps: 480,
};

/**
 * Calculates the lowest FPS that still feels smooth for a given duration (ms).
 * Clamps between minFps (for long timers) and maxFps (for short timers).
 */
export function getTargetFps(durationMs, {
  minFps = DEFAULT_FPS_CONFIG.minFps,
  maxFps = DEFAULT_FPS_CONFIG.maxFps,
  steps = DEFAULT_FPS_CONFIG.steps,
} = {}) {
  const safeMin = Math.max(0.25, Number(minFps) || DEFAULT_FPS_CONFIG.minFps);
  const safeMax = Math.max(safeMin, Number(maxFps) || DEFAULT_FPS_CONFIG.maxFps);
  const safeSteps = Math.max(10, Number(steps) || DEFAULT_FPS_CONFIG.steps);

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return safeMax;
  }

  const durationSec = durationMs / 1000;
  const requiredFps = safeSteps / durationSec;
  return Math.min(safeMax, Math.max(safeMin, requiredFps));
}

export const lumaCircularWipe = {
  id: 'luma-circle',
  name: 'Luminance Circular',
  supportsOrigin: true,
  supportsFeather: true,
  supportsFinish: true,
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
  _unusable: false,

  // Composited output canvas (reused across frames)
  _display: null,
  _displayCtx: null,

  // Deduplication state so unchanged states don't redraw
  _lastRenderSignature: '',
  _lastResult: null,

  getTargetFps(durationMs, fpsConfig) {
    return getTargetFps(durationMs, fpsConfig);
  },

  resetFrameCache() {
    this._lastRenderSignature = '';
    this._lastResult = null;
  },

  async init(imageTwoUrl) {
    if (this.imageUrl === imageTwoUrl && this.imageObj) return;
    this.imageUrl = imageTwoUrl;
    this._cacheKey = '';
    this._unusable = false;
    this.resetFrameCache();

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageObj = img;
        if (!this._canReadPixels()) {
          this._unusable = true;
          console.warn(
            '[luma-circle] Canvas pixel reads are unavailable; using plain circular wipe fallback.',
          );
        }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imageTwoUrl;
    });
  },

  _canReadPixels() {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const x = c.getContext('2d', { willReadFrequently: true });
      if (!x) return false;
      x.fillStyle = 'rgb(200, 100, 50)';
      x.fillRect(0, 0, 4, 4);
      const d = x.getImageData(0, 0, 1, 1).data;
      return (
        Math.abs(d[0] - 200) < 12 &&
        Math.abs(d[1] - 100) < 12 &&
        Math.abs(d[2] - 50) < 12 &&
        d[3] === 255
      );
    } catch (err) {
      console.warn('[luma-circle] canvas read check failed:', err);
      return false;
    }
  },

  _fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd) {
    const maxD = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy),
    );
    const r = p * (hasEnd ? endRadius : maxD + f);
    return `radial-gradient(circle at ${cx}px ${cy}px, #000 ${r - f}px, transparent ${r}px)`;
  },

  _composite(width, height) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));

    const canvas = this._display || (this._display = document.createElement('canvas'));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = this._displayCtx || (this._displayCtx = canvas.getContext('2d'));
    const natW = this.imageObj.naturalWidth || w;
    const natH = this.imageObj.naturalHeight || h;
    const scale = Math.max(w / natW, h / natH);
    const fw = natW * scale;
    const fh = natH * scale;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.imageObj, (w - fw) / 2, (h - fh) / 2, fw, fh);

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this._canvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
  },

  _prepare(width, height) {
    const key = `${this.imageUrl}|${width}x${height}`;
    if (this._cacheKey === key) return;

    const canvas = this._canvas || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);

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
      px[p] = 0;
      px[p + 1] = 0;
      px[p + 2] = 0;
    }

    this._canvas = canvas;
    this._ctx = ctx;
    this._imgData = imgData;
    this._lum = lum;
    this._arrival = new Float32Array(n);
    this._cacheKey = key;
  },

  _paintMask(p, cx, cy, width, height, direction, f, endRadius, hasEnd) {
    this._prepare(width, height);
    const lum = this._lum;
    const arrival = this._arrival;
    const imgData = this._imgData;
    const px = imgData.data;
    const forward = direction === 'forward';

    let minA = Infinity;
    let maxA = -Infinity;
    let i = 0;

    for (let y = 0; y < height; y++) {
      const dy = y - cy;
      for (let x = 0; x < width; x++, i++) {
        const d = Math.hypot(x - cx, dy);
        const a = forward ? Math.max(0, d - lum[i] * f) : d + lum[i] * f;
        arrival[i] = a;
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      }
    }

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
    const n = width * height;

    for (let k = 0, q = 3; k < n; k++, q += 4) {
      const dist = forward ? wave - arrival[k] : arrival[k] - wave;
      const alpha = dist <= 0 ? 0 : dist >= f ? 1 : dist / f;
      px[q] = (alpha * 255 + 0.5) | 0;
    }

    this._ctx.putImageData(imgData, 0, 0);
  },

  render(
    progress,
    {
      cx,
      cy,
      width,
      height,
      direction = 'forward',
      feather = 60,
      endRadius = null,
      stepCount = DEFAULT_FPS_CONFIG.steps,
    },
  ) {
    width = Math.round(width);
    height = Math.round(height);
    const f = Math.max(1, feather);
    const rawP = Math.min(1, Math.max(0, progress));
    const hasEnd = Number.isFinite(endRadius) && endRadius > 0;

    // Quantize progress to stepCount buckets so we never render a duplicate frame
    const safeSteps = Math.max(10, stepCount);
    const quantizedStep =
      rawP <= 0 ? 0 : rawP >= 1 ? safeSteps : Math.round(rawP * safeSteps);
    const p = quantizedStep / safeSteps;

    const signature = [
      this.imageUrl || '',
      this._unusable ? 'fallback' : 'canvas',
      quantizedStep,
      safeSteps,
      Math.round(cx),
      Math.round(cy),
      width,
      height,
      direction,
      Math.round(f),
      hasEnd ? Math.round(endRadius) : 'none',
    ].join('|');

    if (signature === this._lastRenderSignature && this._lastResult) {
      return this._lastResult;
    }

    let result;
    if (this._unusable || !this.imageObj || width <= 0 || height <= 0) {
      result = {
        maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd),
      };
    } else {
      try {
        this._paintMask(p, cx, cy, width, height, direction, f, endRadius, hasEnd);
        result = {
          canvasTwo: this._composite(width, height),
        };
      } catch (err) {
        console.warn('[luma-circle] render failed, using plain circular wipe fallback:', err);
        this._unusable = true;
        result = {
          maskTwo: this._fallbackMask(p, cx, cy, width, height, f, endRadius, hasEnd),
        };
      }
    }

    this._lastRenderSignature = signature;
    this._lastResult = result;
    return result;
  },
};
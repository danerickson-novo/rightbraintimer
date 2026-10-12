export const lumaCircularWipe = {
  id: 'luma-circle',
  name: 'Luminance Circular',
  supportsOrigin: true,
  supportsFeather: true,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 8v8m-4-4h8" stroke="currentColor" stroke-width="1.5"/></svg>`,
  
  lumaData: null,
  cachedWidth: 0,
  cachedHeight: 0,
  imageUrl: null,

  async init(imageTwoUrl, sampleWidth = 300, sampleHeight = 169) {
    if (this.imageUrl === imageTwoUrl && this.lumaData) return;
    this.imageUrl = imageTwoUrl;
    this.cachedWidth = sampleWidth;
    this.cachedHeight = sampleHeight;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
        const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
        const data = imgData.data;
        const luma = new Float32Array(sampleWidth * sampleHeight);

        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          // Standard Rec. 709 luminance
          luma[j] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
        this.lumaData = luma;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imageTwoUrl;
    });
  },

  render(progress, { cx, cy, width, height, direction = 'forward', feather = 60 }) {
    if (!this.lumaData || width <= 0 || height <= 0) {
      return { maskTwo: `radial-gradient(circle at ${cx}px ${cy}px, #000 ${progress * width}px, transparent ${progress * width + feather}px)` };
    }

    const sw = this.cachedWidth;
    const sh = this.cachedHeight;
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(sw, sh);
    const pixels = imgData.data;

    const scaleX = sw / width;
    const scaleY = sh / height;
    const sampleCx = cx * scaleX;
    const sampleCy = cy * scaleY;
    const sampleFeather = feather * ((scaleX + scaleY) / 2);

    const farthestCorner = Math.max(
      Math.hypot(sampleCx, sampleCy),
      Math.hypot(sw - sampleCx, sampleCy),
      Math.hypot(sampleCx, sh - sampleCy),
      Math.hypot(sw - sampleCx, sh - sampleCy)
    );
    const maxDist = farthestCorner + sampleFeather / 2 + 1;
    const maxRadiusBuffered = maxDist + sampleFeather / 2;
    const activeProgress = direction === 'forward' ? progress : 1 - progress;
    const waveRadius = maxRadiusBuffered * activeProgress;

    let lumaIndex = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const d = Math.hypot(x - sampleCx, y - sampleCy);
        const L = this.lumaData[lumaIndex++];

        // High luminance areas get a head start, changing fastest
        const effDist = d - (L * sampleFeather * 1.2);
        
        // Strictly contained within the feather band
        const distIntoWave = waveRadius - effDist;
        let alpha = 0;
        if (distIntoWave > 0) {
          alpha = Math.min(1, distIntoWave / sampleFeather);
        }

        const idx = (y * sw + x) * 4;
        const byteVal = Math.round(alpha * 255);
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = byteVal;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL();
    return { maskTwo: `url("${dataUrl}")` };
  }
};

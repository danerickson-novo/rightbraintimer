export const lumaCircularWipe = {
  id: 'luma-circle',
  name: 'Luminance Circular',
  supportsOrigin: true,
  supportsFeather: true,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 8v8m-4-4h8" stroke="currentColor" stroke-width="1.5"/></svg>`,
  
  imageObj: null,
  imageUrl: null,

  async init(imageTwoUrl) {
    if (this.imageUrl === imageTwoUrl && this.imageObj) return;
    this.imageUrl = imageTwoUrl;

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

  render(progress, { cx, cy, width, height, direction = 'forward', feather = 60 }) {
    if (!this.imageObj || width <= 0 || height <= 0) {
      const fallbackRadius = progress * Math.hypot(width, height);
      return { maskTwo: `radial-gradient(circle at ${cx}px ${cy}px, #000 ${fallbackRadius}px, transparent ${fallbackRadius + feather}px)` };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Calculate exact 'cover' bounding box to match app.js background scaling
    const natW = this.imageObj.naturalWidth || width;
    const natH = this.imageObj.naturalHeight || height;
    const scale = Math.max(width / natW, height / natH);
    const fittedWidth = natW * scale;
    const fittedHeight = natH * scale;
    const imgLeft = (width - fittedWidth) / 2;
    const imgTop = (height - fittedHeight) / 2;

    // 2. Draw image into its exact cover containment box for pixel sampling
    ctx.drawImage(this.imageObj, imgLeft, imgTop, fittedWidth, fittedHeight);
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    // 3. Calculate max distance from origin to the actual image cover corners
    const maxDistToImage = Math.max(
      Math.hypot(cx - imgLeft, cy - imgTop),
      Math.hypot(cx - (imgLeft + fittedWidth), cy - imgTop),
      Math.hypot(cx - imgLeft, cy - (imgTop + fittedHeight)),
      Math.hypot(cx - (imgLeft + fittedWidth), cy - (imgTop + fittedHeight))
    );

    // 4. Tightened wave range removing dead-time lag at start and end
    const minWaveRadius = -1 * feather;
    const maxWaveRadius = maxDistToImage + feather;

    let pixelIndex = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // If outside the canvas viewport, keep fully transparent
        if (x < 0 || x >= width || y < 0 || y >= height) {
          pixels[pixelIndex + 3] = 0;
          pixelIndex += 4;
          continue;
        }

        const r = pixels[pixelIndex] / 255;
        const g = pixels[pixelIndex + 1] / 255;
        const b = pixels[pixelIndex + 2] / 255;
        const L = 0.299 * r + 0.587 * g + 0.114 * b;

        const d = Math.hypot(x - cx, y - cy);
        
        let effDist;
        let alpha = 0;

        if (direction === 'forward') {
          // Expanding outward from center: bright points get head start (smaller effDist)
          effDist = d - (L * feather * 1.2);
          const waveRadius = minWaveRadius + (maxWaveRadius - minWaveRadius) * progress;
          const distIntoWave = waveRadius - effDist;
          if (distIntoWave > 0) {
            alpha = Math.max(0, Math.min(1, distIntoWave / feather));
          }
        } else {
          // Collapsing inward from outside edge: bright points get head start (larger effDist)
          effDist = d + (L * feather * 1.2);
          const waveRadius = maxWaveRadius - (maxWaveRadius - minWaveRadius) * progress;
          const distBehindWave = effDist - waveRadius;
          if (distBehindWave > 0) {
            alpha = Math.max(0, Math.min(1, distBehindWave / feather));
          }
        }

        const byteVal = Math.round(alpha * 255);
        pixels[pixelIndex] = 0;
        pixels[pixelIndex + 1] = 0;
        pixels[pixelIndex + 2] = 0;
        pixels[pixelIndex + 3] = byteVal;

        pixelIndex += 4;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL();
    return { maskTwo: `url("${dataUrl}")` };
  }
};

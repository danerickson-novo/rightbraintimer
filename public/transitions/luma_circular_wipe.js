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

    // 1. Calculate exact 'contain' bounding box of the image
    const natW = this.imageObj.naturalWidth || width;
    const natH = this.imageObj.naturalHeight || height;
    const scale = Math.min(width / natW, height / natH);
    const fittedWidth = natW * scale;
    const fittedHeight = natH * scale;
    const imgLeft = (width - fittedWidth) / 2;
    const imgTop = (height - fittedHeight) / 2;

    // 2. Draw image into its exact containment box for pixel sampling
    ctx.drawImage(this.imageObj, imgLeft, imgTop, fittedWidth, fittedHeight);
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;

    const farthestCorner = Math.max(
      Math.hypot(cx, imgTop),
      Math.hypot(width - cx, imgTop),
      Math.hypot(cx, height - imgTop),
      Math.hypot(width - cx, height - imgTop)
    );
    const maxDist = farthestCorner + feather / 2 + 1;
    const maxRadiusBuffered = maxDist + feather / 2;
    const activeProgress = direction === 'forward' ? progress : 1 - progress;
    const waveRadius = maxRadiusBuffered * activeProgress;

    let pixelIndex = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // If outside the actual contained image bounds, keep fully transparent
        if (x < imgLeft || x >= imgLeft + fittedWidth || y < imgTop || y >= imgTop + fittedHeight) {
          pixels[pixelIndex + 3] = 0;
          pixelIndex += 4;
          continue;
        }

        const r = pixels[pixelIndex] / 255;
        const g = pixels[pixelIndex + 1] / 255;
        const b = pixels[pixelIndex + 2] / 255;
        const L = 0.299 * r + 0.587 * g + 0.114 * b;

        const d = Math.hypot(x - cx, y - cy);

        // High luminance areas get a head start, changing fastest
        const effDist = d - (L * feather * 1.2);
        
        // Strictly contained within the feather band
        const distIntoWave = waveRadius - effDist;
        let alpha = 0;
        if (distIntoWave > 0) {
          alpha = Math.min(1, distIntoWave / feather);
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

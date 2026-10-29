export const circularWipe = {
  id: 'circle',
  name: 'Circular',
  supportsOrigin: true,
  supportsFeather: true,
  supportsFinish: true, // honors options.endRadius (wipe stops early)
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>`,
  render(progress, { cx, cy, width, height, direction = 'forward', feather = 60, endRadius = null }) {
    const farthestCorner = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy)
    );

    const maxDist = farthestCorner + feather / 2 + 1;
    const minRadius = -feather / 2;
    const maxRadiusBuffered = maxDist + feather / 2;

    // Radius (centre of the soft edge) at the start and end of the wipe. With a finish
    // radius (pixels) the soft edge ends at endRadius, so its centre is half a feather inside.
    const forward = direction === 'forward';
    const startRadius = forward ? minRadius : maxRadiusBuffered;
    let finalRadius = forward ? maxRadiusBuffered : minRadius;
    if (Number.isFinite(endRadius) && endRadius > 0) {
      finalRadius = Math.min(maxRadiusBuffered, Math.max(minRadius, endRadius - feather / 2));
    }

    const currentRadius = startRadius + (finalRadius - startRadius) * progress;

    const innerRadius = Math.max(0, currentRadius - feather / 2);
    const outerRadius = Math.max(0, currentRadius + feather / 2);

    const mask = direction === 'forward'
      ? `radial-gradient(circle at ${cx}px ${cy}px, #000 ${innerRadius}px, transparent ${outerRadius}px)`
      : `radial-gradient(circle at ${cx}px ${cy}px, transparent ${innerRadius}px, #000 ${outerRadius}px)`;

    return { maskTwo: mask };
  }
};
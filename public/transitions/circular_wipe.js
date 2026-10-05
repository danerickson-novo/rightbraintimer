/**
 * Circular Wipe Transition
 * @param {number} progress - The progress of the transition (0 to 1)
 * @param {Object} options - Configuration options
 * @param {number} options.cx - X coordinate of the origin
 * @param {number} options.cy - Y coordinate of the origin
 * @param {number} options.width - Canvas width
 * @param {number} options.height - Canvas height
 * @param {string} options.direction - 'forward' or 'inverse'
 * @param {number} options.feather - Feather amount in pixels
 * @returns {string} CSS radial-gradient string
 */
export function circularWipe(progress, { cx, cy, width, height, direction = 'forward', feather = 60 }) {
  const farthestCorner = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  );

  // Start -feather/2 so progress 0 is fully invisible.
  // End maxDist + feather/2 so progress 1 fully covers the canvas without popping.
  const maxDist = farthestCorner + feather / 2 + 1;
  const minRadius = -feather / 2;
  const maxRadiusBuffered = maxDist + feather / 2;

  const currentRadius = minRadius + (maxRadiusBuffered - minRadius) * (direction === 'forward' ? progress : 1 - progress);

  const innerRadius = Math.max(0, currentRadius - feather / 2);
  const outerRadius = Math.max(0, currentRadius + feather / 2);

  if (direction === 'forward') {
    return `radial-gradient(circle at ${cx}px ${cy}px, #000 ${innerRadius}px, transparent ${outerRadius}px)`;
  }

  return `radial-gradient(circle at ${cx}px ${cy}px, transparent ${innerRadius}px, #000 ${outerRadius}px)`;
}

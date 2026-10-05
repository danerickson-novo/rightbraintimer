/**
 * Linear Wipe Transition
 * @param {number} progress - The progress of the transition (0 to 1)
 * @param {Object} options - Configuration options
 * @param {number} options.width - Canvas width
 * @param {number} options.height - Canvas height
 * @param {string} options.axis - 'horizontal' or 'vertical'
 * @param {string} options.direction - 'forward' or 'inverse'
 * @param {number} options.feather - Feather amount in pixels
 * @returns {string} CSS linear-gradient string
 */
export function linearWipe(progress, { width, height, axis = 'horizontal', direction = 'forward', feather = 60 }) {
  const length = axis === 'horizontal' ? width : height;

  // Buffer both start (-feather/2) and end (length + feather/2)
  const startEdge = -feather / 2;
  const endEdge = length + feather / 2 + 1;
  const edge = startEdge + (endEdge - startEdge) * progress;

  const innerEdge = Math.max(0, edge - feather / 2);
  const outerEdge = Math.max(0, edge + feather / 2);

  const gradientDirection = axis === 'horizontal'
    ? direction === 'forward' ? 'to right' : 'to left'
    : direction === 'forward' ? 'to bottom' : 'to top';

  return `linear-gradient(${gradientDirection}, #000 ${innerEdge}px, transparent ${outerEdge}px)`;
}

/**
 * Center Wipe Transition
 * @param {number} progress - The progress of the transition (0 to 1)
 * @param {Object} options - Configuration options
 * @param {number} options.height - Canvas height
 * @param {string} options.direction - 'forward' or 'inverse'
 * @param {number} options.feather - Feather amount in pixels
 * @returns {string} CSS linear-gradient string
 */
export function centerWipe(progress, { height, direction = 'forward', feather = 60 }) {
  const center = height / 2;

  // Buffer max extent by full feather so the band completely clears top and bottom edges
  const maxExtent = center + feather + 1;
  const activeProgress = direction === 'forward' ? progress : 1 - progress;

  const extent = maxExtent * activeProgress;

  const topOuter = center - extent - feather / 2;
  const topInner = Math.min(center, center - extent + feather / 2);
  const bottomInner = Math.max(center, center + extent - feather / 2);
  const bottomOuter = center + extent + feather / 2;

  if (direction === 'forward') {
    return `linear-gradient(to bottom, transparent ${topOuter}px, #000 ${topInner}px, #000 ${bottomInner}px, transparent ${bottomOuter}px)`;
  }

  return `linear-gradient(to bottom, #000 ${topOuter}px, transparent ${topInner}px, transparent ${bottomInner}px, #000 ${bottomOuter}px)`;
}

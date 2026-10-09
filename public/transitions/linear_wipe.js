export const horizontalWipe = {
  id: 'horizontal',
  name: 'Left to right',
  supportsOrigin: false,
  supportsFeather: true,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5" /></svg>`,
  render(progress, { width, direction = 'forward', feather = 60 }) {
    const startEdge = -feather / 2;
    const endEdge = width + feather / 2 + 1;
    const edge = startEdge + (endEdge - startEdge) * progress;

    const innerEdge = Math.max(0, edge - feather / 2);
    const outerEdge = Math.max(0, edge + feather / 2);

    const gradientDirection = direction === 'forward' ? 'to right' : 'to left';
    const mask = `linear-gradient(${gradientDirection}, #000 ${innerEdge}px, transparent ${outerEdge}px)`;
    return { maskTwo: mask };
  }
};

export const verticalWipe = {
  id: 'vertical',
  name: 'Top to bottom',
  supportsOrigin: false,
  supportsFeather: true,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v15m-5-5 5 5 5-5" /></svg>`,
  render(progress, { height, direction = 'forward', feather = 60 }) {
    const startEdge = -feather / 2;
    const endEdge = height + feather / 2 + 1;
    const edge = startEdge + (endEdge - startEdge) * progress;

    const innerEdge = Math.max(0, edge - feather / 2);
    const outerEdge = Math.max(0, edge + feather / 2);

    const gradientDirection = direction === 'forward' ? 'to bottom' : 'to top';
    const mask = `linear-gradient(${gradientDirection}, #000 ${innerEdge}px, transparent ${outerEdge}px)`;
    return { maskTwo: mask };
  }
};

export const centerWipe = {
  id: 'center',
  name: 'Center to edges',
  supportsOrigin: false,
  supportsFeather: true,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h16M12 10V4m0 10v6m-3-13 3-3 3 3m-6 10 3 3 3-3" /></svg>`,
  render(progress, { height, direction = 'forward', feather = 60 }) {
    const center = height / 2;
    const maxExtent = center + feather + 1;
    const activeProgress = direction === 'forward' ? progress : 1 - progress;

    const extent = maxExtent * activeProgress;

    const topOuter = center - extent - feather / 2;
    const topInner = Math.min(center, center - extent + feather / 2);
    const bottomInner = Math.max(center, center + extent - feather / 2);
    const bottomOuter = center + extent + feather / 2;

    const mask = direction === 'forward'
      ? `linear-gradient(to bottom, transparent ${topOuter}px, #000 ${topInner}px, #000 ${bottomInner}px, transparent ${bottomOuter}px)`
      : `linear-gradient(to bottom, #000 ${topOuter}px, transparent ${topInner}px, transparent ${bottomInner}px, #000 ${bottomOuter}px)`;

    return { maskTwo: mask };
  }
};

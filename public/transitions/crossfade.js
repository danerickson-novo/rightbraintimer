export const crossfade = {
  id: 'crossfade',
  name: 'Crossfade',
  supportsOrigin: false,
  supportsFeather: false,
  iconSvg: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="12" r="6" stroke="currentColor" stroke-dasharray="2 2"/><circle cx="15" cy="12" r="6" stroke="currentColor"/></svg>`,
  render(progress, { direction = 'forward' }) {
    const activeProgress = direction === 'forward' ? progress : 1 - progress;
    return {
      opacityTwo: activeProgress
    };
  }
};

import { circularWipe } from './circular_wipe.js';
import { horizontalWipe, verticalWipe, centerWipe } from './linear_wipe.js';
import { crossfade } from './crossfade.js';
import { lumaCircularWipe } from './luma_circular_wipe.js'; // Added

export const transitionsRegistry = new Map();

export function registerTransition(transition) {
  transitionsRegistry.set(transition.id, transition);
}

registerTransition(circularWipe);
registerTransition(horizontalWipe);
registerTransition(verticalWipe);
registerTransition(centerWipe);
registerTransition(crossfade);
registerTransition(lumaCircularWipe); // Added

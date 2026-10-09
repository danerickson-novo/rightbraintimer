import { circularWipe } from './circular_wipe.js';
import { horizontalWipe, verticalWipe, centerWipe } from './linear_wipe.js';
import { crossfade } from './crossfade.js';

export const transitionsRegistry = new Map();

export function registerTransition(transition) {
  transitionsRegistry.set(transition.id, transition);
}

// Register default transition set
registerTransition(circularWipe);
registerTransition(horizontalWipe);
registerTransition(verticalWipe);
registerTransition(centerWipe);
registerTransition(crossfade);

// This service is used to broadcast status messages in real-time to the frontend like a (radio-tower)

import { EventEmitter } from 'events';
export const pipelineProgress = new EventEmitter();
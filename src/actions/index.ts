/**
 * Action exports
 */

// Session Management
export { healthcheckAction } from './healthcheck.js';
export { bootstrapAction } from './bootstrap.js';

// Stream Control
export { streamStartAction } from './streamStart.js';
export { streamStopAction } from './streamStop.js';
export { streamFallbackAction } from './streamFallback.js';
export { streamStatusAction } from './streamStatus.js';

// State Management
export { statePatchAction } from './statePatch.js';
export { layoutSetAction } from './layoutSet.js';
export { sceneSetActiveAction } from './sceneSetActive.js';

// Graphics
export { graphicsCreateAction } from './graphicsCreate.js';
export { graphicsUpdateAction } from './graphicsUpdate.js';
export { graphicsDeleteAction } from './graphicsDelete.js';
export { graphicsToggleAction } from './graphicsToggle.js';

// Sources
export { sourceCreateAction } from './sourceCreate.js';
export { sourceUpdateAction } from './sourceUpdate.js';
export { sourceDeleteAction } from './sourceDelete.js';

// Guests
export { guestInviteAction } from './guestInvite.js';
export { guestRemoveAction } from './guestRemove.js';

// Media
export { uploadImageAction } from './uploadImage.js';
export { uploadVideoAction } from './uploadVideo.js';
export { videoAddUrlAction } from './videoAddUrl.js';
export { videoDeleteAction } from './videoDelete.js';

// Platforms
export { platformConfigAction } from './platformConfig.js';
export { platformToggleAction } from './platformToggle.js';

// Radio
export { radioConfigAction } from './radioConfig.js';
export { radioControlAction } from './radioControl.js';

// All actions for plugin registration
import { healthcheckAction } from './healthcheck.js';
import { bootstrapAction } from './bootstrap.js';
import { streamStartAction } from './streamStart.js';
import { streamStopAction } from './streamStop.js';
import { streamFallbackAction } from './streamFallback.js';
import { streamStatusAction } from './streamStatus.js';
import { statePatchAction } from './statePatch.js';
import { layoutSetAction } from './layoutSet.js';
import { sceneSetActiveAction } from './sceneSetActive.js';
import { graphicsCreateAction } from './graphicsCreate.js';
import { graphicsUpdateAction } from './graphicsUpdate.js';
import { graphicsDeleteAction } from './graphicsDelete.js';
import { graphicsToggleAction } from './graphicsToggle.js';
import { sourceCreateAction } from './sourceCreate.js';
import { sourceUpdateAction } from './sourceUpdate.js';
import { sourceDeleteAction } from './sourceDelete.js';
import { guestInviteAction } from './guestInvite.js';
import { guestRemoveAction } from './guestRemove.js';
import { uploadImageAction } from './uploadImage.js';
import { uploadVideoAction } from './uploadVideo.js';
import { videoAddUrlAction } from './videoAddUrl.js';
import { videoDeleteAction } from './videoDelete.js';
import { platformConfigAction } from './platformConfig.js';
import { platformToggleAction } from './platformToggle.js';
import { radioConfigAction } from './radioConfig.js';
import { radioControlAction } from './radioControl.js';

export const allActions = [
  // Session Management
  healthcheckAction,
  bootstrapAction,
  // Stream Control
  streamStartAction,
  streamStopAction,
  streamFallbackAction,
  streamStatusAction,
  // State Management
  statePatchAction,
  layoutSetAction,
  sceneSetActiveAction,
  // Graphics
  graphicsCreateAction,
  graphicsUpdateAction,
  graphicsDeleteAction,
  graphicsToggleAction,
  // Sources
  sourceCreateAction,
  sourceUpdateAction,
  sourceDeleteAction,
  // Guests
  guestInviteAction,
  guestRemoveAction,
  // Media
  uploadImageAction,
  uploadVideoAction,
  videoAddUrlAction,
  videoDeleteAction,
  // Platforms
  platformConfigAction,
  platformToggleAction,
  // Radio
  radioConfigAction,
  radioControlAction,
];

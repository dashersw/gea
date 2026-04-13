/**
 * Mobile gesture setup — self-contained after the Phase 4 core cleanup.
 * No longer depends on `ComponentManager` (deleted from @geajs/core).
 */
import GestureHandler from './lib/gesture-handler'

export const gestureEvents = ['tap', 'longTap', 'swipeRight', 'swipeUp', 'swipeLeft', 'swipeDown']

let _gestureHandler: GestureHandler | null = null

/** Module-local accessor used by `lib/view-manager.ts`. */
export function _getGestureHandler(): GestureHandler {
  if (!_gestureHandler) _gestureHandler = new GestureHandler()
  return _gestureHandler
}

// Initialize on import so side-effects (document listeners inside GestureHandler)
// run when `@geajs/mobile` is loaded.
_getGestureHandler()

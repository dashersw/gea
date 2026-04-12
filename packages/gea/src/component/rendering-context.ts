/**
 * Global stack tracking the currently-rendering component.
 * Used by mount() to set GEA_PARENT_COMPONENT on child components.
 */
export const _renderingStack: any[] = [];

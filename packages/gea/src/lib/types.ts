export type DOMEvent<E extends Event = Event, T extends HTMLElement = HTMLElement> = E & { target: T }

/**
 * Props for the Teleport component
 */
export interface TeleportProps {
  /**
   * CSS selector for the target element where content should be teleported
   * @example "#modal-root"
   * @example ".sidebar-container"
   */
  'to-selector': string

  /**
   * When true, prevents teleporting and keeps content in original location
   * @default false
   */
  disabled?: boolean
}

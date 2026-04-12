export type DOMEvent<E extends Event = Event, T extends HTMLElement = HTMLElement> = E & { target: T }

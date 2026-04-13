export {}

declare global {
  interface Event {
    targetEl?: EventTarget | null
  }
}

export function pulseCssClass(element: HTMLElement, className: string): void {
  element.classList.remove(className)

  // Trigger reflow to ensure class removal takes effect.
  void element.offsetWidth

  element.classList.add(className)
}

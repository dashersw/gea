/**
 * Create a reusable HTML template that can be cloned for fast row creation.
 * Instead of N × createElement + setAttribute + appendChild,
 * clone a pre-built DOM tree and walk to the dynamic nodes.
 *
 * When `isSvg` is true the compiler has determined the root element is an
 * SVG child (circle, path, g, …) that needs the SVG namespace to parse correctly.
 */
export function template(html: string, isSvg?: boolean): () => HTMLElement {
  const tpl = document.createElement('template')

  if (isSvg) {
    tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`
    const svg = tpl.content.firstChild as SVGSVGElement
    const content = svg.firstChild as HTMLElement
    svg.removeChild(content)
    return () => content.cloneNode(true) as HTMLElement
  }

  tpl.innerHTML = html
  const content = tpl.content.firstChild as HTMLElement
  return () => content.cloneNode(true) as HTMLElement
}

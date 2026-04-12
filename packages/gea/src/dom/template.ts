// SVG child elements that need the SVG namespace to render correctly.
// When these appear as standalone templates (e.g. inside conditionals),
// they must be parsed within an <svg> context.
const SVG_CHILDREN = new Set([
  'circle', 'clipPath', 'defs', 'ellipse', 'feBlend', 'feColorMatrix',
  'feComponentTransfer', 'feComposite', 'feConvolveMatrix', 'feDiffuseLighting',
  'feDisplacementMap', 'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
  'feTile', 'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline',
  'radialGradient', 'rect', 'stop', 'symbol', 'text', 'textPath', 'tspan', 'use',
]);

/**
 * Create a reusable HTML template that can be cloned for fast row creation.
 * Instead of N × createElement + setAttribute + appendChild,
 * clone a pre-built DOM tree and walk to the dynamic nodes.
 */
export function template(html: string): () => HTMLElement {
  const trimmed = html.trim();

  // Detect SVG child elements that need the SVG namespace.
  // Extract the tag name from the opening tag.
  const tagMatch = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  const isSvgChild = tagMatch !== null && SVG_CHILDREN.has(tagMatch[1]);

  const tpl = document.createElement('template');

  if (isSvgChild) {
    // Wrap in <svg> so the HTML parser creates elements in the SVG namespace,
    // then extract the actual child.
    tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
    const svg = tpl.content.firstChild as SVGSVGElement;
    const content = svg.firstChild as HTMLElement;
    svg.removeChild(content);
    return () => content.cloneNode(true) as HTMLElement;
  }

  tpl.innerHTML = trimmed;
  const content = tpl.content.firstChild as HTMLElement;
  return () => content.cloneNode(true) as HTMLElement;
}

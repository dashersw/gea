// React's unitless style properties, kebab-cased. Vendor-prefixed variants
// (`-webkit-line-clamp`, `ms-flex`) are matched after stripping the prefix.
const UNITLESS = new Set(
  (
    'animation-iteration-count aspect-ratio border-image-outset border-image-slice border-image-width ' +
    'box-flex box-flex-group box-ordinal-group column-count columns flex flex-grow flex-positive ' +
    'flex-shrink flex-negative flex-order grid-area grid-row grid-row-end grid-row-span grid-row-start ' +
    'grid-column grid-column-end grid-column-span grid-column-start font-weight line-clamp line-height ' +
    'opacity order orphans scale tab-size widows z-index zoom fill-opacity flood-opacity stop-opacity ' +
    'stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity stroke-width'
  ).split(' '),
)

/** Serialize a style value for the kebab-case property `prop`: finite non-zero
 * numbers get `px` unless the property is unitless or a custom property. */
export function styleValue(prop: string, v: unknown): string {
  if (typeof v !== 'number' || v === 0 || !isFinite(v) || prop.startsWith('--')) return String(v)
  return UNITLESS.has(prop.replace(/^-?(webkit|moz|ms|o)-/, '')) ? String(v) : v + 'px'
}

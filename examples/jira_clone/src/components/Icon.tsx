export default function Icon({ type, size = 16, left = 0, top = 0 }) {
  const transform = left || top ? `translate(${left}px,${top}px)` : undefined
  return <i class={`icon icon-${type}`} style={{ fontSize: `${size}px`, transform }}></i>
}

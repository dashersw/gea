export default function Icon({ type, size = 16, left = 0, top = 0 }) {
  const transform = (left || top) ? `transform:translate(${left}px,${top}px)` : ''
  return (
    <i
      class={`icon icon-${type}`}
      style={`font-size:${size}px;${transform}`}
    ></i>
  )
}

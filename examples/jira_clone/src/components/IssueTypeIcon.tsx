const typeColors: Record<string, string> = {
  task: '#4FADE6',
  bug: '#E44D42',
  story: '#65BA43',
}

const typeIcons: Record<string, string> = {
  task: 'task',
  bug: 'bug',
  story: 'story',
}

export default function IssueTypeIcon({ type, size = 18, top = 0, left = 0 }) {
  const color = typeColors[type] || '#4FADE6'
  const transform = left || top ? `transform:translate(${left}px,${top}px)` : ''
  return (
    <i class={`icon icon-${typeIcons[type] || 'task'}`} style={`font-size:${size}px;color:${color};${transform}`}></i>
  )
}

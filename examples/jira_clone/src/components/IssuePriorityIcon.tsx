const priorityIcons: Record<string, { icon: string; color: string }> = {
  '5': { icon: 'arrow_up', color: '#CD1317' },
  '4': { icon: 'arrow_up', color: '#E9494A' },
  '3': { icon: 'arrow_up', color: '#E97F33' },
  '2': { icon: 'arrow_down', color: '#2D8738' },
  '1': { icon: 'arrow_down', color: '#57A55A' },
}

export default function IssuePriorityIcon({ priority, top = 0, left = 0 }) {
  const info = priorityIcons[priority] || priorityIcons['3']
  const transform = left || top ? `translate(${left}px,${top}px)` : undefined
  return (
    <span class="issue-priority-icon" style={{ color: info.color, transform }}>
      <i class={`icon icon-${info.icon}`}></i>
    </span>
  )
}

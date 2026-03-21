export const dragState = {
  issueId: '',
  cardHeight: 0,
}

export function clearDragState() {
  dragState.issueId = ''
  dragState.cardHeight = 0
  document.querySelectorAll('.dnd-placeholder').forEach((el) => el.remove())
}

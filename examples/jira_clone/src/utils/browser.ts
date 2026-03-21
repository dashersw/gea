export function getTextContentsFromHtmlString(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.textContent || ''
}

export function copyToClipboard(value: string): void {
  navigator.clipboard.writeText(value).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
}

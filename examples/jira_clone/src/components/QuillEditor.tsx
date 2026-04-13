import { Component, GEA_ON_PROP_CHANGE } from '@geajs/core'
import Quill from 'quill'

const TOOLBAR_OPTIONS = [
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link'],
  ['clean'],
]

export default class QuillEditor extends Component {
  quill: Quill | null = null
  _ignoreChange = false;

  [GEA_ON_PROP_CHANGE]() {
    // Quill manages its own DOM — never re-render.
  }

  onAfterRender() {
    const container = this.el?.querySelector('.ql-container-target')
    if (!container || this.quill) return

    this.quill = new Quill(container as HTMLElement, {
      theme: 'snow',
      modules: { toolbar: TOOLBAR_OPTIONS },
      placeholder: 'Add a description...',
    })

    if (this.props.value) {
      this._ignoreChange = true
      this.quill.clipboard.dangerouslyPasteHTML(this.props.value)
      this._ignoreChange = false
    }

    this.quill.on('text-change', () => {
      if (this._ignoreChange) return
      const html = this.quill!.root.innerHTML
      this.props.onChange?.(html)
    })

    this.quill.focus()
  }

  dispose() {
    this.quill = null
    super.dispose()
  }

  template() {
    return (
      <div class="quill-editor-wrapper">
        <div class="ql-container-target"></div>
      </div>
    )
  }
}

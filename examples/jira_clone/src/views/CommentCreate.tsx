import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import authStore from '../stores/auth-store'
import { Avatar, Button } from '@geajs/ui'
import Spinner from '../components/Spinner'

export default class CommentCreate extends Component {
  isFormOpen = false
  body = ''
  isCreating = false
  private _onKey: ((e: KeyboardEvent) => void) | null = null

  created() {
    this._onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        this.openForm()
      }
    }
    document.addEventListener('keydown', this._onKey)
  }

  dispose() {
    if (this._onKey) document.removeEventListener('keydown', this._onKey)
    super.dispose()
  }

  openForm() {
    if (this.isFormOpen) return
    this.isFormOpen = true
  }

  async handleSubmit() {
    if (!this.body.trim()) return
    this.isCreating = true
    try {
      await issueStore.createComment(this.props.issueId, this.body)
      this.body = ''
      this.isFormOpen = false
    } catch (e) {
      console.error(e)
    } finally {
      this.isCreating = false
    }
  }

  template({ issueId }: any) {
    const user = authStore.currentUser
    return (
      <div class="comment-create">
        {!this.isFormOpen && (
          <div class="comment-create-collapsed">
            <div class="comment-create-fake" click={() => this.openForm()}>
              <Avatar src={user?.avatarUrl} name={user?.name || ''} class="!h-8 !w-8" />
              <span class="comment-create-placeholder">Add a comment...</span>
            </div>
            <p class="comment-pro-tip">
              <strong>Pro tip:</strong> press <strong>M</strong> to comment
            </p>
          </div>
        )}
        {this.isFormOpen && (
          <div class="comment-create-form">
            <textarea
              class="textarea"
              placeholder="Add a comment..."
              autofocus
              value={this.body}
              input={(e: any) => {
                this.body = e.target.value
              }}
            ></textarea>
            <div class="comment-create-actions">
              <Button variant="default" disabled={this.isCreating} click={() => this.handleSubmit()}>
                {this.isCreating ? (
                  <span class="inline-flex items-center gap-2">
                    <Spinner size={16} />
                    Save
                  </span>
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                variant="ghost"
                click={() => {
                  this.isFormOpen = false
                  this.body = ''
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
}

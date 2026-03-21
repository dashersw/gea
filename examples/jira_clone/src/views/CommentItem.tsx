import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import projectStore from '../stores/project-store'
import { formatDateTimeConversational } from '../utils/dateTime'
import { Avatar, Button } from '@geajs/ui'

export default class CommentItem extends Component {
  isEditing = false
  editBody = ''

  get user() {
    const project = projectStore.project
    const users = project ? project.users : []
    return users.find((u: any) => u.id === this.props.userId)
  }

  get userName(): string {
    return this.user ? this.user.name : 'Unknown'
  }

  get userAvatar(): string {
    return this.user ? this.user.avatarUrl : ''
  }

  get dateText(): string {
    return formatDateTimeConversational(this.props.createdAt)
  }

  startEditing() {
    this.isEditing = true
    this.editBody = this.props.body || ''
  }

  async saveEdit() {
    if (!this.editBody.trim()) return
    await issueStore.updateComment(this.props.commentId, this.editBody, this.props.issueId)
    this.isEditing = false
  }

  async handleDelete() {
    await issueStore.deleteComment(this.props.commentId, this.props.issueId)
  }

  template({ commentId, body, userId, createdAt, issueId }: any) {
    return (
      <div class="comment">
        <Avatar src={this.userAvatar} name={this.userName} class="!h-8 !w-8" />
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-user-name">{this.userName}</span>
            <span class="comment-date">{this.dateText}</span>
          </div>
          {!this.isEditing && <div class="comment-body">{body}</div>}
          {this.isEditing && (
            <div class="comment-edit-form">
              <textarea
                class="textarea"
                value={this.editBody}
                input={(e: any) => {
                  this.editBody = e.target.value
                }}
              ></textarea>
              <div class="comment-edit-actions">
                <Button variant="default" click={() => this.saveEdit()}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  click={() => {
                    this.isEditing = false
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {!this.isEditing && (
            <div class="comment-actions">
              <span class="comment-action" click={() => this.startEditing()}>
                Edit
              </span>
              <span class="comment-action" click={() => this.handleDelete()}>
                Delete
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }
}

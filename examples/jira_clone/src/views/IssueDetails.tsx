import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import projectStore from '../stores/project-store'
import toastStore from '../stores/toast-store'
import {
  IssueType,
  IssueTypeCopy,
  IssueStatus,
  IssueStatusCopy,
  IssuePriority,
  IssuePriorityCopy,
} from '../constants/issues'
import { formatDateTimeConversational } from '../utils/dateTime'
import { Button, Dialog } from '@geajs/ui'
import Icon from '../components/Icon'
import IssueTypeIcon from '../components/IssueTypeIcon'
import IssuePriorityIcon from '../components/IssuePriorityIcon'
import Spinner from '../components/Spinner'
import CommentCreate from './CommentCreate'
import CommentItem from './CommentItem'
import QuillEditor from '../components/QuillEditor'

function getTrackingPercent(spent: number, remaining: number): number {
  const total = spent + remaining
  return total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
}

const typeOptions = Object.values(IssueType).map((t) => ({ value: t, label: IssueTypeCopy[t] }))
const statusOptions = Object.values(IssueStatus).map((s) => ({ value: s, label: IssueStatusCopy[s] }))
const priorityOptions = Object.values(IssuePriority).map((p) => ({ value: p, label: IssuePriorityCopy[p] }))

const statusColors: Record<string, { bg: string; color: string }> = {
  backlog: { bg: 'var(--color-bg-medium)', color: 'var(--color-text-darkest)' },
  selected: { bg: 'var(--color-bg-light-primary)', color: 'var(--color-primary)' },
  inprogress: { bg: 'var(--color-primary)', color: '#fff' },
  done: { bg: 'var(--color-success)', color: '#fff' },
}

export default class IssueDetails extends Component {
  isEditingTitle = false
  editTitle = ''
  isEditingDescription = false
  editDescription = ''
  confirmingDelete = false
  isLinkCopied = false
  isEditingTracking = false
  editTimeSpent = 0
  editTimeRemaining = 0
  openDropdown: string | null = null
  assigneeSearch = ''

  created(props: any) {
    if (props.issueId) {
      issueStore.fetchIssue(props.issueId)
    }
  }

  startEditTitle() {
    this.editTitle = issueStore.issue?.title || ''
    this.isEditingTitle = true
  }

  saveTitle() {
    this.isEditingTitle = false
    if (this.editTitle.trim() && this.editTitle !== issueStore.issue?.title) {
      issueStore.updateIssue({ title: this.editTitle.trim() })
    }
  }

  startEditDescription() {
    this.editDescription = issueStore.issue?.description || ''
    this.isEditingDescription = true
  }

  onDescriptionChange(html: string) {
    this.editDescription = html
  }

  saveDescription() {
    this.isEditingDescription = false
    const newDesc = this.editDescription
    if (newDesc !== (issueStore.issue?.description || '')) {
      issueStore.updateIssue({ description: newDesc })
    }
  }

  toggleDropdown(name: string) {
    this.openDropdown = this.openDropdown === name ? null : name
    this.assigneeSearch = ''
  }

  closeDropdown() {
    this.openDropdown = null
    this.assigneeSearch = ''
  }

  removeAssignee(userId: string) {
    const issue = issueStore.issue
    if (!issue) return
    const newIds = (issue.userIds || []).filter((id: string) => id !== userId)
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id: string) => ({ id })) })
  }

  addAssignee(userId: string) {
    const issue = issueStore.issue
    if (!issue) return
    const currentIds = issue.userIds || []
    if (currentIds.includes(userId)) return
    const newIds = [...currentIds, userId]
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id: string) => ({ id })) })
    this.closeDropdown()
  }

  startEditTracking() {
    const issue = issueStore.issue
    this.editTimeSpent = issue?.timeSpent || 0
    this.editTimeRemaining = issue?.timeRemaining || issue?.estimate || 0
    this.isEditingTracking = true
  }

  saveTracking() {
    this.isEditingTracking = false
    issueStore.updateIssue({
      timeSpent: this.editTimeSpent,
      timeRemaining: this.editTimeRemaining,
    })
  }

  handleGiveFeedback() {
    toastStore.success('This is a simplified Jira clone built with Gea — a reactive JavaScript UI framework.')
  }

  copyLink() {
    navigator.clipboard.writeText(window.location.href)
    this.isLinkCopied = true
    setTimeout(() => {
      this.isLinkCopied = false
    }, 2000)
  }

  handleDeleteIssue() {
    const issue = issueStore.issue
    if (!issue) return
    const issueId = issue.id
    this.confirmingDelete = false
    this.props.onClose?.()
    projectStore.deleteIssue(issueId)
    toastStore.success('Issue has been successfully deleted.')
  }

  template({ onClose }: any) {
    const { isLoading, issue } = issueStore
    const project = projectStore.project
    const users = project ? project.users : []

    if (isLoading || !issue) {
      return (
        <div class="issue-details-loader">
          <Spinner size={40} />
        </div>
      )
    }

    const issueTitle = issue.title || ''
    const issueDescription = issue.description || ''
    const issueType = issue.type || 'task'
    const issueStatus = issue.status || 'backlog'
    const issuePriority = issue.priority || '3'
    const issueEstimate = issue.estimate || 0
    const issueUserIds = issue.userIds || []
    const issueReporterId = issue.reporterId || ''
    const timeSpent = issue.timeSpent || 0
    const timeRemaining = issue.timeRemaining || issue.estimate || 0
    const trackPercent = getTrackingPercent(timeSpent, timeRemaining)
    const createdAgo = formatDateTimeConversational(issue.createdAt)
    const updatedAgo = formatDateTimeConversational(issue.updatedAt)
    const reporter = users.find((u: any) => u.id === issueReporterId)

    return (
      <div class="issue-details">
        <div class="issue-details-top-actions">
          <div class="issue-details-type issue-details-field--relative">
            <div class="issue-type-clickable" click={() => this.toggleDropdown('type')}>
              <IssueTypeIcon type={issueType} size={16} />
              <span class="issue-details-type-label">
                {(IssueTypeCopy[issueType] || 'Task').toUpperCase()}-{issue.id}
              </span>
            </div>
            {this.openDropdown === 'type' && (
              <div class="custom-dropdown">
                <div class="custom-dropdown-search">
                  <input
                    class="custom-dropdown-search-input"
                    type="text"
                    placeholder="Search"
                    value={this.assigneeSearch}
                    input={(e: any) => {
                      this.assigneeSearch = e.target.value
                    }}
                  />
                </div>
                {typeOptions
                  .filter((opt) => opt.label.toLowerCase().includes(this.assigneeSearch.toLowerCase()))
                  .map((opt) => (
                    <div
                      key={opt.value}
                      class={`custom-dropdown-item ${issueType === opt.value ? 'active' : ''}`}
                      click={() => {
                        issueStore.updateIssue({ type: opt.value })
                        this.closeDropdown()
                      }}
                    >
                      <IssueTypeIcon type={opt.value} size={16} />
                      <span>{opt.label}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div class="issue-details-top-right">
            <button class="issue-details-action-btn" click={() => this.handleGiveFeedback()}>
              <Icon type="feedback" size={14} />
              <span>Give feedback</span>
            </button>
            <button class="issue-details-action-btn" click={() => this.copyLink()}>
              <Icon type="link" size={14} />
              <span>{this.isLinkCopied ? 'Link Copied' : 'Copy link'}</span>
            </button>
            <button
              class="issue-details-action-btn"
              click={() => {
                this.confirmingDelete = true
              }}
            >
              <Icon type="trash" size={16} />
            </button>
            <button class="issue-details-action-btn" click={onClose}>
              <Icon type="close" size={20} />
            </button>
          </div>
        </div>

        {this.confirmingDelete && (
          <Dialog
            open={true}
            onOpenChange={(d: any) => {
              if (!d.open) this.confirmingDelete = false
            }}
          >
            <div class="confirm-dialog">
              <h3 class="confirm-dialog-title">Are you sure you want to delete this issue?</h3>
              <p class="confirm-dialog-message">Once you delete, it's gone for good.</p>
              <div class="confirm-dialog-actions">
                <Button variant="destructive" click={() => this.handleDeleteIssue()}>
                  Delete issue
                </Button>
                <Button
                  variant="ghost"
                  click={() => {
                    this.confirmingDelete = false
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Dialog>
        )}

        {this.openDropdown && <div class="dropdown-overlay" click={() => this.closeDropdown()}></div>}

        <div class="issue-details-body">
          <div class="issue-details-left">
            <div class="issue-details-title">
              {!this.isEditingTitle && (
                <h2 class="issue-title-text" click={() => this.startEditTitle()}>
                  {issueTitle}
                </h2>
              )}
              {this.isEditingTitle && (
                <textarea
                  class="issue-title-input"
                  value={this.editTitle}
                  input={(e: any) => {
                    this.editTitle = e.target.value
                  }}
                  blur={() => this.saveTitle()}
                  keydown={(e: any) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      this.saveTitle()
                    }
                  }}
                ></textarea>
              )}
            </div>

            <div class="issue-details-description">
              <h4 class="issue-details-section-title">Description</h4>
              {this.isEditingDescription && (
                <div class="description-editor">
                  <QuillEditor
                    value={this.editDescription}
                    onChange={(html: string) => this.onDescriptionChange(html)}
                  />
                  <div class="description-editor-actions">
                    <Button variant="default" click={() => this.saveDescription()}>
                      Save
                    </Button>
                    <Button variant="ghost" click={() => (this.isEditingDescription = false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!this.isEditingDescription && issueDescription && (
                <div class="text-edited-content description-clickable" click={() => this.startEditDescription()}>
                  {issueDescription}
                </div>
              )}
              {!this.isEditingDescription && !issueDescription && (
                <p class="issue-description-placeholder" click={() => this.startEditDescription()}>
                  Add a description...
                </p>
              )}
            </div>

            <div class="issue-details-comments">
              <h4 class="issue-details-section-title">Comments</h4>
              <CommentCreate issueId={issue.id} />
              {issue.comments &&
                issue.comments.map((comment: any) => (
                  <CommentItem
                    key={comment.id}
                    commentId={comment.id}
                    body={comment.body}
                    userId={comment.userId}
                    createdAt={comment.createdAt}
                    issueId={issue.id}
                  />
                ))}
            </div>
          </div>

          <div class="issue-details-right">
            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Status</label>
              <button
                class="status-badge"
                style={{ background: statusColors[issueStatus]?.bg, color: statusColors[issueStatus]?.color }}
                click={() => this.toggleDropdown('status')}
              >
                {(IssueStatusCopy[issueStatus] || 'Backlog').toUpperCase()}
                <span class="status-badge-arrow">&#x25BC;</span>
              </button>
              {this.openDropdown === 'status' && (
                <div class="custom-dropdown">
                  {statusOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={`custom-dropdown-item ${issueStatus === opt.value ? 'active' : ''}`}
                      click={() => {
                        issueStore.updateIssue({ status: opt.value })
                        this.closeDropdown()
                      }}
                    >
                      <span class="status-dot" style={{ background: statusColors[opt.value]?.bg }}></span>
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Assignees</label>
              <div class="assignee-chips">
                {issueUserIds.map((uid: string) => {
                  const u = users.find((usr: any) => usr.id === uid)
                  if (!u) return null
                  return (
                    <div class="assignee-chip" key={uid}>
                      <img class="assignee-chip-avatar" src={u.avatarUrl} alt={u.name} />
                      <span class="assignee-chip-name">{u.name}</span>
                      <span class="assignee-chip-remove" click={() => this.removeAssignee(uid)}>
                        &times;
                      </span>
                    </div>
                  )
                })}
                <span class="assignee-add-more" click={() => this.toggleDropdown('assignees')}>
                  + Add more
                </span>
              </div>
              {this.openDropdown === 'assignees' && (
                <div class="custom-dropdown">
                  <div class="custom-dropdown-search">
                    <input
                      class="custom-dropdown-search-input"
                      type="text"
                      placeholder="Search"
                      value={this.assigneeSearch}
                      input={(e: any) => {
                        this.assigneeSearch = e.target.value
                      }}
                    />
                    <span class="custom-dropdown-search-clear" click={() => this.closeDropdown()}>
                      &times;
                    </span>
                  </div>
                  {users
                    .filter(
                      (u: any) =>
                        !issueUserIds.includes(u.id) &&
                        u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()),
                    )
                    .map((u: any) => (
                      <div
                        key={u.id}
                        class="custom-dropdown-item"
                        click={() => {
                          this.addAssignee(u.id)
                        }}
                      >
                        <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                        <span>{u.name}</span>
                      </div>
                    ))}
                  {users.filter(
                    (u: any) =>
                      !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()),
                  ).length === 0 && <div class="custom-dropdown-empty">No users available</div>}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Reporter</label>
              <div class="reporter-display" click={() => this.toggleDropdown('reporter')}>
                {reporter && <img class="reporter-avatar" src={reporter.avatarUrl} alt={reporter.name} />}
                <span class="reporter-name">{reporter ? reporter.name : 'Unassigned'}</span>
              </div>
              {this.openDropdown === 'reporter' && (
                <div class="custom-dropdown">
                  {users.map((u: any) => (
                    <div
                      key={u.id}
                      class={`custom-dropdown-item ${issueReporterId === u.id ? 'active' : ''}`}
                      click={() => {
                        issueStore.updateIssue({ reporterId: u.id })
                        this.closeDropdown()
                      }}
                    >
                      <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                      <span>{u.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Priority</label>
              <div class="priority-display" click={() => this.toggleDropdown('priority')}>
                <IssuePriorityIcon priority={issuePriority} />
                <span class="priority-name">{IssuePriorityCopy[issuePriority] || 'Medium'}</span>
              </div>
              {this.openDropdown === 'priority' && (
                <div class="custom-dropdown">
                  {priorityOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={`custom-dropdown-item ${issuePriority === opt.value ? 'active' : ''}`}
                      click={() => {
                        issueStore.updateIssue({ priority: opt.value })
                        this.closeDropdown()
                      }}
                    >
                      <IssuePriorityIcon priority={opt.value} />
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Original Estimate (hours)</label>
              <input
                class="input"
                type="number"
                value={issueEstimate}
                change={(e: any) => issueStore.updateIssue({ estimate: Number(e.target.value) || null })}
              />
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Time Tracking</label>
              <div class="tracking-widget tracking-widget--clickable" click={() => this.startEditTracking()}>
                <div class="tracking-bar-container">
                  <Icon type="stopwatch" size={20} />
                  <div class="tracking-bar">
                    <div class="tracking-bar-fill" style={{ width: `${trackPercent}%` }}></div>
                  </div>
                </div>
                <div class="tracking-values">
                  <span>{timeSpent ? `${timeSpent}h logged` : 'No time logged'}</span>
                  <span>{timeRemaining}h remaining</span>
                </div>
              </div>
              {this.isEditingTracking && (
                <Dialog
                  open={true}
                  onOpenChange={(d: any) => {
                    if (!d.open) this.isEditingTracking = false
                  }}
                  class="dialog-tracking"
                >
                  <div class="tracking-dialog">
                    <div class="tracking-dialog-header">
                      <h3 class="tracking-dialog-title">Time tracking</h3>
                      <button
                        class="tracking-dialog-close"
                        click={() => {
                          this.isEditingTracking = false
                        }}
                      >
                        <Icon type="close" size={20} />
                      </button>
                    </div>
                    <div class="tracking-bar-container">
                      <Icon type="stopwatch" size={22} />
                      <div class="tracking-bar">
                        <div
                          class="tracking-bar-fill"
                          style={{ width: `${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%` }}
                        ></div>
                      </div>
                    </div>
                    <div class="tracking-values">
                      <span>{this.editTimeSpent ? `${this.editTimeSpent}h logged` : 'No time logged'}</span>
                      <span>{this.editTimeRemaining}h remaining</span>
                    </div>
                    <div class="tracking-edit-fields">
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time spent (hours)</label>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          value={this.editTimeSpent}
                          input={(e: any) => {
                            this.editTimeSpent = Number(e.target.value) || 0
                          }}
                        />
                      </div>
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time remaining (hours)</label>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          value={this.editTimeRemaining}
                          input={(e: any) => {
                            this.editTimeRemaining = Number(e.target.value) || 0
                          }}
                        />
                      </div>
                    </div>
                    <div class="tracking-edit-actions">
                      <Button variant="default" click={() => this.saveTracking()}>
                        Done
                      </Button>
                    </div>
                  </div>
                </Dialog>
              )}
            </div>

            <div class="issue-details-dates">
              <div class="issue-details-date">Created at {createdAgo}</div>
              <div class="issue-details-date">Updated at {updatedAgo}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

import { Component } from '@geajs/core'
import projectStore from '../stores/project-store'
import authStore from '../stores/auth-store'
import toastStore from '../stores/toast-store'
import { IssueType, IssueTypeCopy, IssueStatus, IssuePriority, IssuePriorityCopy } from '../constants/issues'
import { is, generateErrors } from '../utils/validation'
import { Button, Select } from '@geajs/ui'
import Spinner from '../components/Spinner'

export default class IssueCreate extends Component {
  type = IssueType.TASK
  title = ''
  description = ''
  reporterId = ''
  userIds: string[] = []
  priority = IssuePriority.MEDIUM
  isCreating = false
  errors: Record<string, string> = {}

  created() {
    if (authStore.currentUser) {
      this.reporterId = authStore.currentUser.id
    }
  }

  async handleSubmit() {
    this.errors = generateErrors(
      { type: this.type, title: this.title, reporterId: this.reporterId, priority: this.priority },
      {
        type: is.required(),
        title: [is.required(), is.maxLength(200)],
        reporterId: is.required(),
        priority: is.required(),
      },
    )
    if (Object.keys(this.errors).length > 0) return

    this.isCreating = true
    try {
      await projectStore.createIssue({
        type: this.type,
        title: this.title,
        description: this.description,
        reporterId: this.reporterId,
        userIds: this.userIds,
        priority: this.priority,
        status: IssueStatus.BACKLOG,
        projectId: projectStore.project.id,
        users: this.userIds.map((id: string) => ({ id })),
      })
      toastStore.success('Issue has been successfully created.')
      this.props.onClose?.()
    } catch (e: any) {
      toastStore.error(e)
    } finally {
      this.isCreating = false
    }
  }

  template({ onClose }: any) {
    const project = projectStore.project
    if (!project) return <div></div>

    const typeOptions = Object.values(IssueType).map((t) => ({ value: t, label: IssueTypeCopy[t] }))
    const priorityOptions = Object.values(IssuePriority).map((p) => ({ value: p, label: IssuePriorityCopy[p] }))
    const userOptions = project.users.map((u: any) => ({ value: u.id, label: u.name }))

    return (
      <div class="issue-create">
        <h2 class="issue-create-heading">Create issue</h2>

        <div class="form-field">
          <label class="form-label">Issue Type</label>
          <Select
            class="w-full"
            items={typeOptions}
            value={[this.type]}
            onValueChange={(d: { value: string[] }) => {
              const v = d.value[0]
              if (v !== undefined) this.type = v
            }}
            placeholder="Type"
          />
          {this.errors.type && <div class="form-error">{this.errors.type}</div>}
        </div>

        <div class="issue-create-divider"></div>

        <div class="form-field">
          <label class="form-label">Short Summary</label>
          <input
            class={`input ${this.errors.title ? 'input-error' : ''}`}
            type="text"
            value={this.title}
            input={(e: any) => {
              this.title = e.target.value
            }}
          />
          {this.errors.title && <div class="form-error">{this.errors.title}</div>}
        </div>

        <div class="form-field">
          <label class="form-label">Description</label>
          <textarea
            class="textarea"
            value={this.description}
            input={(e: any) => {
              this.description = e.target.value
            }}
          ></textarea>
        </div>

        <div class="form-field">
          <label class="form-label">Reporter</label>
          <Select
            class="w-full"
            items={userOptions}
            value={this.reporterId ? [this.reporterId] : []}
            onValueChange={(d: { value: string[] }) => {
              const v = d.value[0]
              if (v !== undefined) this.reporterId = v
            }}
            placeholder="Reporter"
          />
          {this.errors.reporterId && <div class="form-error">{this.errors.reporterId}</div>}
        </div>

        <div class="form-field">
          <label class="form-label">Assignees</label>
          <Select
            class="w-full"
            multiple={true}
            items={userOptions}
            value={this.userIds}
            onValueChange={(d: { value: string[] }) => {
              this.userIds = d.value
            }}
            placeholder="Assignees"
          />
        </div>

        <div class="form-field">
          <label class="form-label">Priority</label>
          <Select
            class="w-full"
            items={priorityOptions}
            value={[this.priority]}
            onValueChange={(d: { value: string[] }) => {
              const v = d.value[0]
              if (v !== undefined) this.priority = v
            }}
            placeholder="Priority"
          />
          {this.errors.priority && <div class="form-error">{this.errors.priority}</div>}
        </div>

        <div class="issue-create-actions">
          <Button variant="default" disabled={this.isCreating} click={() => this.handleSubmit()}>
            {this.isCreating ? (
              <span class="inline-flex items-center gap-2">
                <Spinner size={16} />
                Create Issue
              </span>
            ) : (
              'Create Issue'
            )}
          </Button>
          <Button variant="ghost" click={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }
}

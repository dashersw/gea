import { Component } from '@geajs/core'
import projectStore from '../stores/project-store'
import toastStore from '../stores/toast-store'
import { ProjectCategory, ProjectCategoryCopy } from '../constants/projects'
import { is, generateErrors } from '../utils/validation'
import Breadcrumbs from '../components/Breadcrumbs'
import { Button, Select } from '@geajs/ui'
import Spinner from '../components/Spinner'

export default class ProjectSettings extends Component {
  name = ''
  url = ''
  category = ''
  description = ''
  isUpdating = false
  errors: Record<string, string> = {}

  created() {
    this.loadFromProject()
  }

  loadFromProject() {
    const p = projectStore.project
    if (!p) return
    this.name = p.name || ''
    this.url = p.url || ''
    this.category = p.category || ''
    this.description = p.description || ''
  }

  async handleSubmit() {
    this.errors = generateErrors(
      { name: this.name, url: this.url, category: this.category },
      {
        name: [is.required(), is.maxLength(100)],
        url: is.url(),
        category: is.required(),
      },
    )
    if (Object.keys(this.errors).length > 0) return

    this.isUpdating = true
    try {
      await projectStore.updateProject({
        name: this.name,
        url: this.url,
        category: this.category,
        description: this.description,
      })
      toastStore.success('Changes have been saved successfully.')
    } catch (e) {
      toastStore.error(e)
    } finally {
      this.isUpdating = false
    }
  }

  template() {
    const project = projectStore.project
    if (!project) return <div></div>

    const categoryOptions = Object.values(ProjectCategory).map((c) => ({
      value: c,
      label: ProjectCategoryCopy[c],
    }))

    return (
      <div class="project-settings">
        <div class="project-settings-form">
          <Breadcrumbs items={['Projects', project.name, 'Project Details']} />
          <h1 class="project-settings-heading">Project Details</h1>

          <div class="form-field">
            <label class="form-label">Name</label>
            <input
              class={`input ${this.errors.name ? 'input-error' : ''}`}
              type="text"
              value={this.name}
              input={(e: any) => {
                this.name = e.target.value
              }}
            />
            {this.errors.name && <div class="form-error">{this.errors.name}</div>}
          </div>

          <div class="form-field">
            <label class="form-label">URL</label>
            <input
              class={`input ${this.errors.url ? 'input-error' : ''}`}
              type="text"
              value={this.url}
              input={(e: any) => {
                this.url = e.target.value
              }}
            />
            {this.errors.url && <div class="form-error">{this.errors.url}</div>}
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
            <label class="form-label">Project Category</label>
            <Select
              class="w-full"
              items={categoryOptions}
              value={this.category ? [this.category] : []}
              onValueChange={(d: { value: string[] }) => {
                const v = d.value[0]
                if (v !== undefined) this.category = v
              }}
              placeholder="Category"
            />
            {this.errors.category && <div class="form-error">{this.errors.category}</div>}
          </div>

          <Button variant="default" disabled={this.isUpdating} click={() => this.handleSubmit()}>
            {this.isUpdating ? (
              <span class="inline-flex items-center gap-2">
                <Spinner size={16} />
                Save changes
              </span>
            ) : (
              'Save changes'
            )}
          </Button>
        </div>
      </div>
    )
  }
}

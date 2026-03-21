import { Component } from '@geajs/core'
import { router } from '../router'
import projectStore from '../stores/project-store'
import Icon from '../components/Icon'

export default class Sidebar extends Component {
  template() {
    const project = projectStore.project
    if (!project) return <div class="sidebar"></div>

    return (
      <div class="sidebar">
        <div class="sidebar-project-info">
          <div class="sidebar-project-avatar">{project.name?.charAt(0) || 'P'}</div>
          <div class="sidebar-project-texts">
            <div class="sidebar-project-name">{project.name}</div>
            <div class="sidebar-project-category">{project.category} project</div>
          </div>
        </div>

        <div
          class={`sidebar-link ${router.isActive('/project/board') ? 'active' : ''}`}
          click={() => router.push('/project/board')}
        >
          <Icon type="board" size={20} />
          <span class="sidebar-link-text">Kanban Board</span>
        </div>
        <div
          class={`sidebar-link ${router.isActive('/project/settings') ? 'active' : ''}`}
          click={() => router.push('/project/settings')}
        >
          <Icon type="settings" size={20} />
          <span class="sidebar-link-text">Project Settings</span>
        </div>

        <div class="sidebar-divider"></div>

        <div class="sidebar-link sidebar-link-not-implemented">
          <Icon type="shipping" size={20} />
          <span class="sidebar-link-text">Releases</span>
          <span class="sidebar-not-implemented">Not implemented</span>
        </div>
        <div class="sidebar-link sidebar-link-not-implemented">
          <Icon type="issues" size={20} />
          <span class="sidebar-link-text">Issues and filters</span>
          <span class="sidebar-not-implemented">Not implemented</span>
        </div>
        <div class="sidebar-link sidebar-link-not-implemented">
          <Icon type="page" size={20} />
          <span class="sidebar-link-text">Pages</span>
          <span class="sidebar-not-implemented">Not implemented</span>
        </div>
        <div class="sidebar-link sidebar-link-not-implemented">
          <Icon type="reports" size={20} />
          <span class="sidebar-link-text">Reports</span>
          <span class="sidebar-not-implemented">Not implemented</span>
        </div>
        <div class="sidebar-link sidebar-link-not-implemented">
          <Icon type="component" size={20} />
          <span class="sidebar-link-text">Components</span>
          <span class="sidebar-not-implemented">Not implemented</span>
        </div>
      </div>
    )
  }
}

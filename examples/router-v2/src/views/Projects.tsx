import { Component } from '@geajs/core'
import { Link } from '@geajs/core/router'

const projects = [
  { id: '1', name: 'Website Redesign', status: 'In Progress' },
  { id: '2', name: 'Mobile App', status: 'Planning' },
  { id: '3', name: 'API Integration', status: 'Done' },
]

export default class Projects extends Component {
  template() {
    return (
      <div class="view projects">
        <h1>Projects</h1>
        <div class="project-list">
          {projects.map((p) => (
            <div key={p.id} class="project-card">
              <div class="project-info">
                <h3>{p.name}</h3>
                <span class="project-status">{p.status}</span>
              </div>
              <Link to={`/dashboard/projects/${p.id}`} label="View" class="btn-link" />
            </div>
          ))}
        </div>
      </div>
    )
  }
}

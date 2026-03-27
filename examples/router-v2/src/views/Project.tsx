import { Component } from '@geajs/core'
import { Link } from '@geajs/core/router'

const projectData: Record<string, { name: string; description: string }> = {
  '1': { name: 'Website Redesign', description: 'Redesigning the company website with a modern look and feel.' },
  '2': { name: 'Mobile App', description: 'Building a cross-platform mobile application.' },
  '3': { name: 'API Integration', description: 'Integrating third-party APIs into the platform.' },
}

export default class Project extends Component {
  template({ id }) {
    const project = projectData[id]

    if (!project) {
      return (
        <div class="view">
          <h1>Project not found</h1>
          <p>No project with ID "{id}" exists.</p>
          <Link to="/dashboard/projects" label="Back to Projects" class="btn-link" />
        </div>
      )
    }

    return (
      <div class="view project-detail">
        <h1>{project.name}</h1>
        <p>{project.description}</p>
        <div class="project-actions">
          <Link to={`/dashboard/projects/${id}/edit`} label="Edit Project" class="btn-primary" />
          <Link to="/dashboard/projects" label="Back to Projects" class="btn-link" />
        </div>
      </div>
    )
  }
}

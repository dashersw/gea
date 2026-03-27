import { Component } from '@geajs/core'
import { Link } from '@geajs/core/router'

export default class ProjectEdit extends Component {
  template({ id }) {
    return (
      <div class="view project-edit">
        <h1>Edit Project #{id}</h1>
        <p>This view was lazy-loaded.</p>
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" placeholder="Project name" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea placeholder="Project description"></textarea>
        </div>
        <div class="project-actions">
          <button class="btn-primary">Save</button>
          <Link to={`/dashboard/projects/${id}`} label="Cancel" class="btn-link" />
        </div>
      </div>
    )
  }
}

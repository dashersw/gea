import { router } from '@geajs/core'
import Project from '../../../../examples/jira_clone/src/views/Project'
import issueStore from '../../../../examples/jira_clone/src/stores/issue-store'
import projectStore from '../../../../examples/jira_clone/src/stores/project-store'
import authStore from '../../../../examples/jira_clone/src/stores/auth-store'

export { Project, issueStore, projectStore, authStore, router }

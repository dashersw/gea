import { router } from '../../../../examples/jira_clone/src/router'
import Project from '../../../../examples/jira_clone/src/views/Project'
import Board from '../../../../examples/jira_clone/src/views/Board'
import issueStore from '../../../../examples/jira_clone/src/stores/issue-store'
import projectStore from '../../../../examples/jira_clone/src/stores/project-store'
import authStore from '../../../../examples/jira_clone/src/stores/auth-store'

router.setRoutes({
  '/project/board': Board,
  '/project/board/issues/:issueId': Board,
})

export { Project, issueStore, projectStore, authStore, router }

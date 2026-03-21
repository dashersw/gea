export const IssueType = {
  TASK: 'task',
  BUG: 'bug',
  STORY: 'story',
} as const

export const IssueStatus = {
  BACKLOG: 'backlog',
  SELECTED: 'selected',
  INPROGRESS: 'inprogress',
  DONE: 'done',
} as const

export const IssuePriority = {
  HIGHEST: '5',
  HIGH: '4',
  MEDIUM: '3',
  LOW: '2',
  LOWEST: '1',
} as const

export const IssueTypeCopy: Record<string, string> = {
  [IssueType.TASK]: 'Task',
  [IssueType.BUG]: 'Bug',
  [IssueType.STORY]: 'Story',
}

export const IssueStatusCopy: Record<string, string> = {
  [IssueStatus.BACKLOG]: 'Backlog',
  [IssueStatus.SELECTED]: 'Selected for development',
  [IssueStatus.INPROGRESS]: 'In progress',
  [IssueStatus.DONE]: 'Done',
}

export const IssuePriorityCopy: Record<string, string> = {
  [IssuePriority.HIGHEST]: 'Highest',
  [IssuePriority.HIGH]: 'High',
  [IssuePriority.MEDIUM]: 'Medium',
  [IssuePriority.LOW]: 'Low',
  [IssuePriority.LOWEST]: 'Lowest',
}

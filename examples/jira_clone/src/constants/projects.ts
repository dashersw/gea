export const ProjectCategory = {
  SOFTWARE: 'software',
  MARKETING: 'marketing',
  BUSINESS: 'business',
} as const

export const ProjectCategoryCopy: Record<string, string> = {
  [ProjectCategory.SOFTWARE]: 'Software',
  [ProjectCategory.MARKETING]: 'Marketing',
  [ProjectCategory.BUSINESS]: 'Business',
}

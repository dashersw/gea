import '@geajs/core/jsx-runtime'

declare module '@geajs/core/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      view: any
      'nav-bar': any
      'back-button': any
      'menu-button': any
      'sidebar-item': any
      'sidebar-label': any
      'tab-view': any
      views: any
      'tab-bar': any
      'tab-items': any
      'tab-item': any
      sidebar: any
      'sidebar-items': any
      'pull-to-refresh': any
      'pull-to-refresh-arrow': any
      'inf-scroll': any
    }
  }
}

export {}

import { Component } from '@geajs/core'

export default class NavbarLeft extends Component {
  template({ onSearchClick, onCreateClick }: any) {
    return (
      <div class="navbar-left">
        <div class="navbar-left-logo">
          <svg viewBox="0 0 28 28" width="28" height="28" style={{ fill: '#fff' }}>
            <path d="M26.5 14c0 6.904-5.596 12.5-12.5 12.5S1.5 20.904 1.5 14 7.096 1.5 14 1.5 26.5 7.096 26.5 14z" />
            <path d="M14 7l7 7-7 7-7-7 7-7z" style={{ fill: '#0052cc' }} />
          </svg>
        </div>
        <div class="navbar-left-item" click={onSearchClick}>
          <i class="icon icon-search"></i>
          <span class="navbar-left-item-text">Search issues</span>
        </div>
        <div class="navbar-left-item" click={onCreateClick}>
          <i class="icon icon-plus"></i>
          <span class="navbar-left-item-text">Create Issue</span>
        </div>
        <div class="navbar-left-bottom">
          <div class="navbar-left-item">
            <i class="icon icon-help"></i>
            <span class="navbar-left-item-text">About</span>
          </div>
        </div>
      </div>
    )
  }
}

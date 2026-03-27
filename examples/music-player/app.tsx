import { Component } from '@geajs/core'
import { router } from '@geajs/core/router'
import Badge from '@geajs/ui/badge'
import Separator from '@geajs/ui/separator'
import store from './store'
import TrackRow from './track-row'
import NowPlayingBar from './now-playing-bar'

export default class App extends Component {
  created() {
    router.setRoutes({
      '/': App,
      '/playlist/:id': App,
    })

    router.observe('path', () => {
      const id = router.params.id
      if (id && id !== store.activePlaylistId) {
        store.selectPlaylist(id)
      }
    })

    const id = router.params.id
    if (id) store.selectPlaylist(id)
  }

  template() {
    return (
      <div class="player-layout">
        {/* Sidebar */}
        <aside class="player-sidebar">
          <div class="sidebar-header">
            <h1 class="player-brand">♪ GeaMusic</h1>
          </div>
          <Separator />
          <nav class="playlist-nav">
            <p class="nav-section-label">Playlists</p>
            {store.playlists.map((pl) => (
              <button
                key={pl.id}
                class={`playlist-btn ${store.activePlaylistId === pl.id ? 'active' : ''}`}
                click={() => {
                  store.selectPlaylist(pl.id)
                  router.push(`/playlist/${pl.id}`)
                }}
                data-playlist-id={pl.id}
              >
                <span class="playlist-icon">♫</span>
                <span class="playlist-name">{pl.name}</span>
                <Badge variant="outline" class="playlist-count">
                  {pl.trackIds.length}
                </Badge>
              </button>
            ))}
          </nav>
          <Separator />
          <div class="sidebar-currently-playing">
            <p class="nav-section-label">Now Playing</p>
            {store.currentTrack ? (
              <div class="sidebar-now-playing">
                <div class="sidebar-art">{store.currentTrack.title[0]}</div>
                <div class="sidebar-track-meta">
                  <p class="sidebar-track-title">{store.currentTrack.title}</p>
                  <p class="sidebar-track-artist">{store.currentTrack.artist}</p>
                  {store.isPlaying && (
                    <Badge variant="secondary" class="playing-badge">
                      Playing
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <p class="nothing-playing">Nothing playing</p>
            )}
          </div>
        </aside>

        {/* Main */}
        <main class="player-main">
          <div class="tracklist-header">
            <div>
              <h2 class="tracklist-title">{store.activePlaylist?.name}</h2>
              <p class="tracklist-desc">{store.activeTracks.length} tracks</p>
            </div>
            <input
              class="track-search"
              placeholder="Search tracks…"
              value={store.searchQuery}
              input={store.setSearch}
              aria-label="Search tracks"
            />
          </div>

          <div class="tracklist-wrap">
            <table class="tracklist">
              <thead>
                <tr>
                  <th class="th-num">#</th>
                  <th>Title</th>
                  <th class="th-album">Album</th>
                  <th class="th-dur">Time</th>
                </tr>
              </thead>
              <tbody>
                {store.filteredTracks.map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i} />
                ))}
              </tbody>
            </table>
            {store.filteredTracks.length === 0 && <p class="no-tracks">No tracks match your search.</p>}
          </div>
        </main>

        <NowPlayingBar />
      </div>
    )
  }
}

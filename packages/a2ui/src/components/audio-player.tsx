import { Component } from '@geajs/core'

interface AudioPlayerProps {
  url?: string
}

export default class AudioPlayer extends Component<AudioPlayerProps> {
  template(props: AudioPlayerProps) {
    return <audio class="a2ui-audio" src={props.url} controls></audio>
  }
}

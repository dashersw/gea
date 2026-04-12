// CodeMirror bundle entry point for the browser playground
export { EditorState } from '@codemirror/state'
export { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view'
export { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
export { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
export { javascript } from '@codemirror/lang-javascript'
export { tags } from '@lezer/highlight'

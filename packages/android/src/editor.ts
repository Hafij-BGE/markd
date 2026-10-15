import {
  CodeBlockLanguageSelector,
  EmojiSelector,
  en,
  FootnoteTool,
  ImageEditTool,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableChessboard,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu,
  type IIndexCursor,
  type IMuyaOptions
} from '@muyajs/core'
import { callNative, isNative } from './native'
import { settings } from './settings'
import { isDarkTheme, onThemeChange } from './theme'

// Relative image paths are resolved by muya against `window.DIRNAME` into
// `file:///__markd_doc/...`. A WebView page cannot load file:// URLs, so the
// image `src` setters are wrapped to send those requests to the app's /doc/
// route instead, which MainActivity serves from the document's folder. The
// per-document token keeps the HTTP cache from mixing up two documents that
// both have e.g. `assets/image.png`.
const DOC_DIR = '/__markd_doc'
const DOC_FILE_PREFIX = `file://${DOC_DIR}/`
let docToken = 'none'

export const docAssetUrl = (relative: string): string =>
  `${location.origin}/doc/${docToken}/${relative.replace(/^\.\//, '')}`

const rewriteSrc = (value: string): string =>
  value.startsWith(DOC_FILE_PREFIX) ? docAssetUrl(value.slice(DOC_FILE_PREFIX.length)) : value

const installImageShim = (): void => {
  window.DIRNAME = DOC_DIR
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor,
    set(this: HTMLImageElement, value: string) {
      descriptor.set!.call(this, rewriteSrc(String(value)))
    }
  })
  const setAttribute = Element.prototype.setAttribute
  Element.prototype.setAttribute = function(this: Element, name: string, value: string) {
    if (this instanceof HTMLImageElement && name.toLowerCase() === 'src') value = rewriteSrc(String(value))
    return setAttribute.call(this, name, value)
  }
}

declare global {
  interface Window {
    DIRNAME?: string
  }
}

export interface EditorHooks {
  /** Pick an image from the device and return the src to write into the document. */
  pickImage: () => Promise<string>
  /** Persist a pasted / dropped image and return the src to write. */
  storeImage: (src: string) => Promise<string>
  onChange: () => void
  onSelectionChange: () => void
}

let muya: Muya | null = null
let hooks: EditorHooks | null = null
let savedCursor: IIndexCursor | null = null

export const getMuya = (): Muya => {
  if (!muya) throw new Error('Editor is not ready')
  return muya
}

/** Markdown including edits still queued in muya's JSON state. */
export const currentMarkdown = (): string => {
  const editor = getMuya()
  editor.flush()
  return editor.getMarkdown()
}

const muyaOptions = (): Partial<IMuyaOptions> => ({
  fontSize: settings.fontSize,
  lineHeight: 1.6,
  focusMode: settings.focusMode,
  spellcheckEnabled: settings.spellcheck,
  frontMatter: true,
  footnote: true,
  superSubScript: true,
  texMathDollars: true,
  texMathGfm: true,
  autoPairBracket: true,
  autoPairMarkdownSyntax: true,
  autoPairQuote: true,
  preferLooseListItem: true,
  hideQuickInsertHint: false,
  codeBlockLineNumbers: false,
  mermaidTheme: isDarkTheme() ? 'dark' : 'default',
  vegaTheme: isDarkTheme() ? 'dark' : 'latimes',
  imageAction: async(state) => (hooks ? hooks.storeImage(state.src) : state.src)
})

const registerPlugins = (): void => {
  Muya.use(EmojiSelector)
  Muya.use(FootnoteTool)
  Muya.use(InlineFormatToolbar)
  Muya.use(ImageEditTool, {
    imagePathPicker: () => hooks?.pickImage() ?? Promise.resolve(''),
    imageAction: (state: { src: string }) => hooks?.storeImage(state.src) ?? Promise.resolve(state.src)
  })
  Muya.use(ImageToolBar)
  Muya.use(ImageResizeBar)
  Muya.use(CodeBlockLanguageSelector)
  Muya.use(LinkTools, {
    jumpClick: (linkInfo: { href?: string } | null) => {
      const href = linkInfo?.href
      if (!href || !/^(https?:|mailto:)/i.test(href)) return
      if (isNative()) callNative('openExternal', { url: href }).catch(() => {})
      else window.open(href, '_blank', 'noopener,noreferrer')
    }
  })
  Muya.use(ParagraphFrontButton)
  Muya.use(ParagraphFrontMenu)
  Muya.use(TableChessboard)
  Muya.use(TableColumnToolbar)
  Muya.use(ParagraphQuickInsertMenu)
  Muya.use(TableDragBar)
  Muya.use(TableRowColumMenu)
  Muya.use(PreviewToolBar)
}

const create = (markdown: string): Muya => {
  const host = document.getElementById('editor-host')!
  host.replaceChildren()
  const mount = document.createElement('div')
  host.append(mount)
  const instance = new Muya(mount, { ...muyaOptions(), markdown })
  instance.locale(en)
  instance.init()
  instance.on('json-change', () => hooks?.onChange())
  instance.on('selection-change', () => {
    rememberCursor()
    hooks?.onSelectionChange()
  })
  return instance
}

export const initEditor = (markdown: string, editorHooks: EditorHooks): Muya => {
  hooks = editorHooks
  installImageShim()
  registerPlugins()
  muya = create(markdown)
  onThemeChange(() => {
    muya?.setOptions({ mermaidTheme: isDarkTheme() ? 'dark' : 'default', vegaTheme: isDarkTheme() ? 'dark' : 'latimes' }, true)
  })
  return muya
}

/** Load a different document: fresh history and a fresh image cache scope. */
export const loadDocument = (markdown: string): void => {
  docToken = Math.random().toString(36).slice(2, 10)
  const editor = getMuya()
  editor.invalidateImageCache()
  editor.setContent(markdown)
  editor.clearHistory()
  savedCursor = null
}

export const rememberCursor = (): void => {
  try {
    savedCursor = muya?.getCursorOffset() ?? savedCursor
  } catch {
    // Muya throws while the selection sits in a float tool; keep the last one.
  }
}

/** Insert an image at the last known caret, or append it when there is none. */
export const insertImageAtCursor = (src: string, alt: string): void => {
  const editor = getMuya()
  if (savedCursor) {
    try {
      editor.setCursorByOffset(savedCursor)
    } catch {
      savedCursor = null
    }
  }
  const before = currentMarkdown()
  if (savedCursor) {
    editor.insertImage({ src, alt })
    // The edit reaches the state through a pending JSON op.
    editor.flush()
  }
  if (editor.getMarkdown() === before) {
    const md = before.replace(/\s*$/, '')
    editor.setContent(`${md}${md ? '\n\n' : ''}![${alt}](${src})\n`)
    notifyChange()
  }
}

/** `setContent` does not emit json-change; callers that replace text use this. */
export const notifyChange = (): void => {
  hooks?.onChange()
}

export const setEditorOptions = (options: Partial<IMuyaOptions>): void => {
  getMuya().setOptions(options, true)
}

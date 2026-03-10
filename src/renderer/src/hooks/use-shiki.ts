import { useEffect, useState } from 'react'
import { createHighlighter, createJavaScriptRegexEngine, type Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null
let highlighterInstance: Highlighter | null = null

const PRELOADED_LANGS = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'json',
  'html',
  'css',
  'python',
  'bash',
  'shell',
  'markdown',
  'yaml',
  'toml',
  'sql',
  'rust',
  'go',
  'c',
  'cpp',
  'java',
  'ruby',
  'swift',
  'kotlin',
  'diff',
]

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['vitesse-dark'],
      langs: PRELOADED_LANGS,
      engine: createJavaScriptRegexEngine(),
    })
    highlighterPromise.then((h) => {
      highlighterInstance = h
    })
  }
  return highlighterPromise
}

// Eagerly start loading
getHighlighter()

export function useShiki(code: string, language: string): string | null {
  const [html, setHtml] = useState<string | null>(() => {
    if (highlighterInstance) {
      return highlight(highlighterInstance, code, language)
    }
    return null
  })

  useEffect(() => {
    let cancelled = false

    if (highlighterInstance) {
      setHtml(highlight(highlighterInstance, code, language))
      return
    }

    getHighlighter().then((h) => {
      if (!cancelled) {
        setHtml(highlight(h, code, language))
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, language])

  return html
}

function highlight(h: Highlighter, code: string, language: string): string {
  const lang = h.getLoadedLanguages().includes(language) ? language : 'text'
  return h.codeToHtml(code, {
    lang,
    theme: 'vitesse-dark',
  })
}

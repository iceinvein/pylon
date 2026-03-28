import type { AstNode } from '../../shared/types'

export type ParsedFile = {
  declarations: AstNode[]
  imports: Array<{ moduleSpecifier: string; specifiers: string[] }>
}

export type LanguageParser = {
  parseFile(filePath: string, content: string): ParsedFile
}

export type ImportResolver = {
  resolve(specifier: string, fromFile: string, allFiles: Set<string>): string | null
}

export interface SqlContext {
  id: string
  question: string
  sql: string
  explanation: string
  source: string
  createdAt: string
}

export interface SqlSource {
  table: string
  title: string
  fields: string[]
}

export interface SqlWorkspace {
  examples: string[]
  sources: SqlSource[]
  rowLimit: number
  history: SqlContext[]
  favorites: SqlContext[]
}

export interface SqlValidation {
  valid: boolean
  message: string
}

export interface SqlResult {
  columns: string[]
  rows: (string | number | null)[][]
  truncated: boolean
  elapsedMs: number
}

export interface GenerateSqlInput {
  question: string
  // A backend may use this turn to resolve a follow-up question.
  previous: Pick<SqlContext, 'question' | 'sql'> | null
}

export interface ExecuteSqlInput {
  query: SqlContext
  confirmed: boolean
}

export interface FavoriteSqlInput {
  query: SqlContext
  saved: boolean
}

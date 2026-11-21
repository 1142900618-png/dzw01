import { request } from '@/api/client'
import type {
  ExecuteSqlInput,
  FavoriteSqlInput,
  GenerateSqlInput,
  SqlContext,
  SqlResult,
  SqlValidation,
  SqlWorkspace,
} from '@/domain/textsql'

export const textSqlApi = {
  workspace: (signal?: AbortSignal) => request<SqlWorkspace>('/textsql/workspace', {}, signal),
  generate: (input: GenerateSqlInput, signal?: AbortSignal) =>
    request<SqlContext>('/textsql/generate', input, signal),
  validate: (sql: string, signal?: AbortSignal) =>
    request<SqlValidation>('/textsql/validate', { sql }, signal),
  execute: (input: ExecuteSqlInput, signal?: AbortSignal) =>
    request<SqlResult>('/textsql/execute', input, signal),
  favorite: (input: FavoriteSqlInput, signal?: AbortSignal) =>
    request<SqlContext[]>('/textsql/favorite', input, signal),
}

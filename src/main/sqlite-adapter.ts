import type { DatabaseSyncOptions } from 'node:sqlite'

export type SqliteRow = Record<string, unknown>

export type SqliteRunResult = {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export type SqliteStatement = {
  all<T extends SqliteRow = SqliteRow>(...params: unknown[]): T[]
  get<T extends SqliteRow = SqliteRow>(...params: unknown[]): T | undefined
  run(...params: unknown[]): SqliteRunResult
}

type NativeStatement = {
  all(...params: unknown[]): SqliteRow[]
  get(...params: unknown[]): SqliteRow | undefined
  run(...params: unknown[]): SqliteRunResult
}

type NativeDatabase = {
  readonly isTransaction?: boolean
  close(): void
  exec(sql: string): void
  prepare(sql: string): NativeStatement
}

type NativeDatabaseConstructor = new (path: string, options?: DatabaseSyncOptions) => NativeDatabase

export type SqliteDatabase = {
  close(): void
  exec(sql: string): void
  pragma<T extends SqliteRow = SqliteRow>(sql: string): T[]
  prepare(sql: string): SqliteStatement
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
}

export function createSqliteDatabase(
  path: string,
  options?: DatabaseSyncOptions,
): SqliteDatabase {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  return createSqliteDatabaseWithNative(DatabaseSync, path, options)
}

export function createSqliteDatabaseWithNative(
  DatabaseSync: NativeDatabaseConstructor,
  path: string,
  options?: DatabaseSyncOptions,
): SqliteDatabase {
  return createSqliteDatabaseFromNative(
    options === undefined ? new DatabaseSync(path) : new DatabaseSync(path, options),
  )
}

export function createSqliteDatabaseFromNative(nativeDb: NativeDatabase): SqliteDatabase {
  let transactionDepth = 0
  let savepointId = 0

  const database: SqliteDatabase = {
    close() {
      nativeDb.close()
    },

    exec(sql: string) {
      nativeDb.exec(sql)
    },

    pragma<T extends SqliteRow = SqliteRow>(sql: string): T[] {
      return database.prepare(`PRAGMA ${sql}`).all<T>()
    },

    prepare(sql: string): SqliteStatement {
      const statement = nativeDb.prepare(sql)
      return {
        all<T extends SqliteRow = SqliteRow>(...params: unknown[]): T[] {
          return statement.all(...params) as T[]
        },

        get<T extends SqliteRow = SqliteRow>(...params: unknown[]): T | undefined {
          return statement.get(...params) as T | undefined
        },

        run(...params: unknown[]): SqliteRunResult {
          return statement.run(...params)
        },
      }
    },

    transaction<T extends (...args: never[]) => unknown>(fn: T): T {
      return ((...args: Parameters<T>): ReturnType<T> => {
        const useSavepoint = transactionDepth > 0 || nativeDb.isTransaction === true
        const savepoint = `pylon_tx_${++savepointId}`
        nativeDb.exec(useSavepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN')
        transactionDepth += 1

        try {
          const result = fn(...args) as ReturnType<T>
          nativeDb.exec(useSavepoint ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT')
          return result
        } catch (err) {
          if (useSavepoint) {
            nativeDb.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
            nativeDb.exec(`RELEASE SAVEPOINT ${savepoint}`)
          } else {
            nativeDb.exec('ROLLBACK')
          }
          throw err
        } finally {
          transactionDepth -= 1
        }
      }) as T
    },
  }

  return database
}

declare module "better-sqlite3" {
  interface Database {
    prepare<P, R>(sql: string): Statement<P, R>;
    exec(sql: string): this;
    pragma(sql: string): any;
    close(): void;
  }

  interface Statement<P, R> {
    run(...params: any[]): RunResult;
    get(...params: any[]): R | undefined;
    all(...params: any[]): R[];
    bind(...params: any[]): this;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  class Database {
    constructor(filename: string, options?: any);
    prepare<P, R>(sql: string): Statement<P, R>;
    exec(sql: string): this;
    pragma(sql: string): any;
    close(): void;
  }

  export default Database;
}

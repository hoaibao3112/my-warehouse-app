declare module 'pg' {
	export class Pool {
		constructor(opts?: any)
		connect(): Promise<any>
		query(sql: string, params?: any[]): Promise<{ rows: any[] }>
	}

	export type PoolClient = any
}

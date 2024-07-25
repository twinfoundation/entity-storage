// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import { GeneralError, Guards, Is, StringHelper } from "@gtsc/core";
import {
	type IEntitySchemaProperty,
	type IEntitySchema,
	EntitySchemaFactory,
	EntitySchemaHelper,
    type EntityCondition,
    type SortDirection,
		IComparator,
		ComparisonOperator
} from "@gtsc/entity";
import { type ILoggingConnector, LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import { Client, types as CassandraTypes } from "cassandra-driver";
import type { IScyllaDBConfig } from "./models/IScyllaDBConfig";
import type { IScyllaDBTableConfig } from "./models/IScyllaDBTableConfig";

/**
 * Store entities using ScyllaDB.
 */
export abstract class AbstractScyllaDBEntity<T> {
	/**
	 * Limit the number of entities when finding.
	 * @internal
	 */
	protected static readonly PAGE_SIZE: number = 40;

	/**
	 * Class name.
	 */
	protected CLASS_NAME: string = "";

	/**
	 * The name of the database table.
	 * @internal
	 */
	protected fullTableName: string;

	/**
	 * Configuration to connection to ScyllaDB.
	 * @internal
	 */
	protected readonly _config: IScyllaDBTableConfig;

	/**
	 * The logging connector.
	 * @internal
	 */
	protected readonly _logging: ILoggingConnector;

	/**
	 * The schema for the entity.
	 * @internal
	 */
	private readonly _entitySchema: IEntitySchema<T>;

	/**
	 * The partition key.
	 * @internal
	 */
	private readonly _primaryKey: IEntitySchemaProperty<T>;

	/**
	 * Create a new instance of FileEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to "logging".
	 * @param options.entitySchema The name of the entity schema.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		loggingConnectorType?: string;
		entitySchema: string;
		config: IScyllaDBTableConfig;
	}) {
		Guards.object<IScyllaDBTableConfig>(this.CLASS_NAME, nameof(options.config), options.config);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.tableName), options.config.tableName);

		this._logging = LoggingConnectorFactory.get(options.loggingConnectorType ?? "logging");
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);

		this._config = options.config;
		this.fullTableName = StringHelper.camelCase(`${options.config.tableName}`);
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param requestContext The context for the request.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(
		id: string,
		secondaryIndex?: keyof T,
		requestContext?: IServiceRequestContext
	): Promise<T | undefined> {
		Guards.stringValue("ScyllaDBEntity", nameof(id), id);

		let connection;
		try {
			const indexField = secondaryIndex ?? this._primaryKey?.property;

			const sql = `SELECT * FROM "${this.fullTableName}" WHERE "${String(indexField)}"= ?`;

			await this._logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "entityStorage.sqlGet",
				data: sql
			});

			connection = await this.openConnection(this._config);

			const result = await this.queryDB(connection, sql, [id]);

			if (result.rows.length === 1) {
				return this.convertRowToObject(result.rows[0]) as T;
			}
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"entityStorage.getFailed",
				{
					id
				},
				error
			);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @param requestContext The context for the request.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		conditions?: EntityCondition<T>,
		sortProperties?: {
			property: keyof T;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof T)[],
		cursor?: string,
		pageSize?: number,
		requestContext?: IServiceRequestContext
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 * If non partitioned request then partitionId is included in items.
		 */
		entities: Partial<T & { partitionId?: string }>[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
		/**
		 * Number of entities to return.
		 */
		pageSize?: number;
		/**
		 * Total entities length.
		 */
		totalEntities: number;
	}> {
		let connection;
		try {
			const returnSize = pageSize ?? AbstractScyllaDBEntity.PAGE_SIZE;
			let sql = `SELECT * FROM "${this.fullTableName}"`;

			const conds: string[] = [];
			let conditionQuery = "";
			// The params to be used to execute the query
			const params: unknown[] = [];

			if (Is.arrayValue(conditions)) {
				for (const cond of conditions) {
					const condition = cond as IComparator;
					const descriptor = this._entitySchema.properties?.find(
						p => p.property === condition.property
					);
					if (
						condition.operator === ComparisonOperator.Includes ||
						condition.operator === ComparisonOperator.NotIncludes
					) {
						const propValue = `'%${condition.value}%'`;
						if (condition.operator === ComparisonOperator.Includes) {
							conds.push(`"${condition.property}" LIKE ${propValue}`);
						} else if (condition.operator === ComparisonOperator.NotIncludes) {
							conds.push(`"${condition.property}" NOT LIKE ${propValue}`);
						}
					} else if (condition.operator === ComparisonOperator.In) {
						let value: unknown[] = [];
						if (!Is.arrayValue(condition.value)) {
							value.push(this.propertyToDbValue(condition.value, descriptor));
						} else {
							value = condition.value.map(v => this.propertyToDbValue(v, descriptor));
						}
						params.push(value);
						conds.push(`"${condition.property}" IN ?`);
					} else {
						const propValue = condition.value;
						params.push(propValue);
						if (condition.operator === ComparisonOperator.Equals) {
							conds.push(`"${condition.property}" = ?`);
						} else if (condition.operator === ComparisonOperator.NotEquals) {
							conds.push(`"${condition.property}" <> ?`);
						} else if (condition.operator === ComparisonOperator.GreaterThan) {
							conds.push(`"${condition.property}" > ?`);
						} else if (condition.operator === ComparisonOperator.LessThan) {
							conds.push(`"${condition.property}" < ?`);
						} else if (condition.operator === ComparisonOperator.GreaterThanOrEqual) {
							conds.push(`"${condition.property}" >= ?`);
						} else if (condition.operator === ComparisonOperator.LessThanOrEqual) {
							conds.push(`"${condition.property}" <= ?`);
						}
					}

					const operator = condition.logicalOperator ?? logicalOperator.AND;
					conditionQuery = `${conds.join(` ${operator} `)}`;
				}
			}

			if (conds.length > 0) {
				sql += ` WHERE ${conditionQuery}`;
			}

			connection = await this.openConnection(this._config);

			const countQuery = sql.replace("SELECT *", "SELECT COUNT(*) AS totalEntities");
			const countResults = await this.queryDB(connection, countQuery, params, undefined, returnSize);

			if (sort) {
				const sortKey = sort?.key ?? this._primaryKey.name;
				const sortDir =
					sort?.direction ??
					this._entityDescriptor.properties.find(e => e.name === sortKey)?.sortDirection ??
					"asc";

				sql += ` ORDER BY "${String(sortKey)}" ${sortDir.toUpperCase()}`;
			}

			await this._logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "entityStorage.sqlFind",
				data: sql
			});

			// We just use the cursor
			const result = await this.queryDB(connection, sql, params, cursor, returnSize);

			const entities: T[] = [];

			for (const row of result.rows) {
				entities.push(this.convertRowToObject(row) as T);
			}

			return {
				entities,
				cursor: result.pageState ?? undefined,
				pageSize: returnSize,
				totalEntities: Number(countResults.rows[0].totalEntities)
			};
		} catch (error) {
			throw new GeneralError(this.CLASS_NAME, "entityStorage.findFailed", undefined, error);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Open a new database connection.
	 * @param config The config for the connection.
	 * @returns The new connection.
	 * @internal
	 */
	protected async openConnection(config: IScyllaDBConfig): Promise<Client> {
		const client = new Client({
			contactPoints: config.hosts,
			localDataCenter: config.localDataCenter,
			keyspace: config.keyspace
		});

		await client.connect();

		return client;
	}

	/**
	 * Close database connection.
	 * @param connection The connection to close.
	 * @internal
	 */
	protected async closeConnection(connection?: Client): Promise<void> {
		if (!connection) {
			return;
		}
		return connection.shutdown();
	}

	/**
	 * Query the database.
	 * @param connection The connection to query.
	 * @param sql The sql statement to execute.
	 * @param params The params to use when executing the query.
	 * @param state The state to use when it comes to pagination.
	 * @returns The rows.
	 * @internal
	 */
	protected async queryDB(
		connection: Client,
		sql: string,
		params: unknown[],
		pageState?: string,
		pageSize?: number
	): Promise<CassandraTypes.ResultSet> {
		return new Promise<CassandraTypes.ResultSet>((resolve, reject) => {
			const rows: CassandraTypes.Row[] = [];

			connection.eachRow(
				sql,
				params,
				{
					prepare: true,
					autoPage: false,
					fetchSize: pageSize ?? this._PAGE_SIZE,
					pageState
				},
				(n: number, row: CassandraTypes.Row) => {
					rows.push(row);
				},
				(err: Error, res: CassandraTypes.ResultSet) => {
					if (err) {
						reject(err);
						return;
					}
					res.rows = rows;
					resolve(res);
				}
			);
		});
	}

	/**
	 * Execute on the database.
	 * @param connection The connection to execute.
	 * @param sql The sql statement to execute.
	 * @internal
	 */
	protected async execute(
		connection: Client,
		sql: string,
		params?: unknown[]
	): Promise<CassandraTypes.ResultSet> {
		return connection.execute(sql, params, { prepare: true });
	}

	/**
	 * Create keyspace if it doesnt exist.
	 * @param connection The connection to perform the query with.
	 * @param keyspaceName The name of the keyspace to create.
	 * @internal
	 */
	protected async createKeyspace(
		connection: Client,
		keyspaceName: string
	): Promise<CassandraTypes.ResultSet> {
		return this.execute(
			connection,
			`CREATE KEYSPACE IF NOT EXISTS "${keyspaceName}"
            WITH REPLICATION = { 'class' : 'SimpleStrategy', 'replication_factor' : 1}`
		);
	}

	/**
	 * Format a field from the DB.
	 * @param value The value to convert to original form.
	 * @param fieldDescriptor The descriptor for the field.
	 * @returns The value as a property for the object.
	 * @internal
	 */
	protected dbValueToProperty(
		value: unknown,
		fieldDescriptor: IEntitySchemaProperty<T>
	): unknown {
		if (fieldDescriptor.type === "object") {
			if (
				value === "null" ||
				value === "undefined" ||
				value === "" ||
				value === null ||
				value === undefined ||
				!Is.string(value)
			) {
				return;
			}
			try {
				return JSON.parse(value);
			} catch {
				throw new GeneralError(this.CLASS_NAME, "parseJSONFailed", {
					name: fieldDescriptor.name,
					value
				});
			}
		} else if (fieldDescriptor.type === "UUID") {
			return (value as CassandraTypes.Uuid).toString();
		}

		return value;
	}

	/**
	 * Format a value for the DB. As the driver takes care of conversion from Javascript
	 * @param value The value to format.
	 * @param fieldDescriptor The descriptor for the field
	 * @returns The value after conversion.
	 * @internal
	 */
	protected propertyToDbValue(
		value: unknown,
		fieldDescriptor?: IEntitySchemaProperty<T>
	): unknown {
		if (fieldDescriptor) {
			if (fieldDescriptor.type === "object") {
				return Is.empty(value) ? "null" : this.jsonWrap(value);
			} else if (fieldDescriptor.type === "UUID") {
				if (!Is.string(value)) {
					return;
				}
				return CassandraTypes.Uuid.fromString(value);
			}
			return value;
		}
	}

	/**
	 * Convert a row back to an object.
	 * @param row The row to convert.
	 * @returns The row as an object.
	 * @internal
	 */
	protected convertRowToObject(row: { [id: string]: unknown }): unknown {
		const obj: { [id: string]: unknown } = {};

		for (const field of this._entitySchema.properties ?? []) {
			const value = row[field.property as string];
			if (value) {
				obj[field.property as string] = this.dbValueToProperty(value, field);
			}
		}

		return obj;
	}

	/**
	 * Wrap a string for DB format.
	 * @param value The value to wrap.
	 * @returns The wrapped string.
	 * @internal
	 */
	protected stringWrap(value: string): string {
		if (value === undefined || value === null) {
			return "''";
		}

		return `'${value.replace(/'/g, "''")}'`;
	}

	/**
	 * Wrap an object for json in DB format.
	 * @param value The value to wrap.
	 * @returns The wrapped string.
	 * @internal
	 */
	protected jsonWrap(value: unknown): string {
		let json = JSON.stringify(value);

		// eslint-disable-next-line no-control-regex
		json = json.replace(/[\b\0\t\n\r\u001A\\]/g, s => {
			switch (s) {
				case "\0":
					return String.raw`\0`;
				case "\n":
					return String.raw`\n`;
				case "\r":
					return String.raw`\r`;
				case "\b":
					return String.raw`\b`;
				case "\t":
					return String.raw`\t`;
				case "\u001A":
					return String.raw`\Z`;
				default:
					return `\\${s}`;
			}
		});
		return json;
	}
}

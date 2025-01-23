// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, GeneralError, Guards } from "@twin.org/core";
import {
	type EntityCondition,
	EntitySchemaFactory,
	type IEntitySchema,
	type SortDirection
} from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import mysql from "mysql2/promise";
import type { IMySqlEntityStorageConnectorConfig } from "./models/IMySqlEntityStorageConnectorConfig";
import type { IMySqlEntityStorageConnectorConstructorOptions } from "./models/IMySqlEntityStorageConnectorConstructorOptions";

/**
 * Class for performing entity storage operations using MySql.
 */
export class MySqlEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Limit the number of entities when finding.
	 * @internal
	 */
	private static readonly _PAGE_SIZE: number = 40;

	/**
	 * Partition id field name.
	 * @internal
	 */
	private static readonly _PARTITION_ID_NAME: string = "partitionId";

	/**
	 * Partition id field path.
	 * @internal
	 */
	private static readonly _PARTITION_ID_PATH: string = "/partitionId";

	/**
	 * Partition id field value.
	 * @internal
	 */
	private static readonly _PARTITION_ID_VALUE: string = "1";

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<MySqlEntityStorageConnector>();

	/**
	 * The schema for the entity.
	 * @internal
	 */
	private readonly _entitySchema: IEntitySchema<T>;

	/**
	 * The configuration for the connector.
	 * @internal
	 */
	private readonly _config: IMySqlEntityStorageConnectorConfig;

	/**
	 * The MySql client.
	 * @internal
	 */
	private _client: mysql.Connection | undefined;

	/**
	 * Create a new instance of MySqlEntityStorageConnector.
	 * @param options The options for the connector.
	 */
	constructor(options: IMySqlEntityStorageConnectorConstructorOptions) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object<IMySqlEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.host), options.config.host);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.user), options.config.user);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.password), options.config.password);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.database), options.config.database);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.table), options.config.table);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);

		this._config = options.config;
	}

	/**
	 * Initialize the MySql environment.
	 * @param nodeLoggingConnectorType Optional type of the logging connector.
	 * @returns A promise that resolves to a boolean indicating success.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		this._client = await mysql.createConnection({
			host: this._config.host,
			port: Number.parseInt(this._config.port ?? "3306", 10),
			user: this._config.user,
			password: this._config.password
		});

		// Create the database if it does not exist
		try {
			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "databaseCreating",
				data: {
					database: this._config.database
				}
			});

			if (!this._client) {
				throw new GeneralError(this.CLASS_NAME, "clientNotInitialized");
			}
			await this._client.query(`CREATE DATABASE IF NOT EXISTS \`${this._config.database}\``);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "databaseExists",
				data: {
					database: this._config.database
				}
			});

			await this._client.query(`CREATE TABLE IF NOT EXISTS \`${this._config.database}\`.\`${this._config.table}\` (${this.mapSqlProperties(this._entitySchema)})`);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableExists",
				data: {
					table: this._config.table
				}
			});
		} catch (error) {
			const errors = error instanceof AggregateError ? error.errors : [error];
			for (const err of errors) {
				await nodeLogging?.log({
					level: "error",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "databaseCreateFailed",
					error: BaseError.fromError(err),
					data: {
						database: this._config.database
					}
				});
			}
			return false;
		}

		return true;
	}

	/**
	 * Get the schema for the entities.
	 * @returns The schema for the entities.
	 */
	public getSchema(): IEntitySchema {
		return this._entitySchema as IEntitySchema;
	}

	/**
	 * Get an entity from MySql.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param conditions The optional conditions to match for the entities.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(
		id: string,
		secondaryIndex?: keyof T,
		conditions?: { property: keyof T; value: unknown }[]
	): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);
		return undefined;
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param conditions The optional conditions to match for the entities.
	 * @returns The id of the entity.
	 */
	public async set(entity: T, conditions?: { property: keyof T; value: unknown }[]): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		const id = entity["id" as keyof T] as unknown as string;

		try {
			const columns = Object.keys(entity as object).map(key => `\`${key}\``).join(", ");
			const values = Object.values(entity as object);
			const placeholders = values.map(() => "?").join(", ");

			if (!this._client) {
				throw new GeneralError(this.CLASS_NAME, "clientNotInitialized");
			}
			const queryResponse = await this._client.query(
				`INSERT INTO \`${this._config.database}\`.\`${this._config.table}\` (${columns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${columns
					.split(", ")
					.map(col => `${col} = VALUES(${col})`)
					.join(", ")};`,
				values
			);
			// eslint-disable-next-line no-console
			console.log(queryResponse);
		} catch (err) {
			// eslint-disable-next-line no-console
			console.log(err);
			throw new GeneralError(
				this.CLASS_NAME,
				"setFailed",
				{
					id
				},
				err
			);
		}
	}

	/**
	 * Remove the entity.
	 * @param id The id of the entity to remove.
	 * @param conditions The optional conditions to match for the entities.
	 * @returns Nothing.
	 */
	public async remove(
		id: string,
		conditions?: { property: keyof T; value: unknown }[]
	): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		return undefined;
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The suggested number of entities to return in each chunk, in some scenarios can return a different amount.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		conditions?: EntityCondition<T>,
		sortProperties?: { property: keyof T; sortDirection: SortDirection }[],
		properties?: (keyof T)[],
		cursor?: string,
		pageSize?: number
	): Promise<{ entities: Partial<T>[]; cursor?: string }> {
		return { entities: [] };
	}

	// eslint-disable-next-line jsdoc/require-throws
	/**
	 * Map entity schema properties to SQL properties.
	 * @param entitySchema The schema of the entity.
	 * @returns The SQL properties as a string.
	 */
	private mapSqlProperties(entitySchema: IEntitySchema<T>): string {
		const sqlTypeMap: { [key: string]: string } = {
			string: "VARCHAR(255)",
			number: "INT",
			object: "JSON",
			array: "JSON"
		};

		if (!entitySchema.properties) {
			throw new GeneralError(this.CLASS_NAME, "entitySchemaPropertiesUndefined");
		}
		return entitySchema.properties
			.map(prop => {
				const sqlType = sqlTypeMap[prop.type] || "TEXT";
				const primaryKey = prop.isPrimary ? " PRIMARY KEY" : "";
				const nullable = prop.optional ? " NULL" : " NOT NULL";
				return `${String(prop.property)} ${sqlType}${primaryKey}${nullable}`;
			})
			.join(", ");
	}
}

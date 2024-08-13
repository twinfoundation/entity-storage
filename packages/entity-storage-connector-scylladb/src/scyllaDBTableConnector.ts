// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import { BaseError, GeneralError, Guards, type IError, Is } from "@gtsc/core";
import {
	EntitySchemaFactory,
	EntitySchemaPropertyType,
	type IEntitySchemaProperty
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import { AbstractScyllaDBConnector } from "./abstractScyllaDBConnector";
import type { IScyllaDBTableConfig } from "./models/IScyllaDBTableConfig";

/**
 * Store entities using ScyllaDB.
 */
export class ScyllaDBTableConnector<T = unknown>
	extends AbstractScyllaDBConnector<T>
	implements IEntityStorageConnector<T>
{
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<ScyllaDBTableConnector>();

	/**
	 * Create a new instance of ScyllaDBTableConnector.
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
		super(options, nameof(ScyllaDBTableConnector));
	}

	/**
	 * Bootstrap the connector by creating and initializing any resources it needs.
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<void> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);
		nodeLogging?.log({
			level: "info",
			source: this.CLASS_NAME,
			ts: Date.now(),
			message: "tableCreating",
			data: { table: this._fullTableName }
		});

		try {
			let dbConnection = await this.openConnection(true);

			await this.createKeyspace(dbConnection, this._config.keyspace);

			// Connection has to be closed and now open a new one with our keyspace
			await this.closeConnection(dbConnection);
			dbConnection = await this.openConnection();

			// Need to find structured properties (declared as type: object)
			const structuredProperties = this._entitySchema.properties?.filter(
				property =>
					property.type === EntitySchemaPropertyType.Object ||
					(property.type === EntitySchemaPropertyType.Array && property.itemTypeRef)
			);

			// Needs to support objects that may have itemRef other objects (to be done)
			if (Is.array(structuredProperties)) {
				for (const strProperty of structuredProperties) {
					const subTypeSchemaRef = strProperty.itemTypeRef;
					if (!Is.undefined(subTypeSchemaRef)) {
						const objSchema = EntitySchemaFactory.get(subTypeSchemaRef);
						const typeFields: string[] = [];
						for (const field of objSchema.properties ?? []) {
							typeFields.push(`"${String(field.property)}" ${this.toDbField(field)}`);
						}
						const sql = `CREATE TYPE IF NOT EXISTS
																		"${subTypeSchemaRef}" (${typeFields.join(",")})`;

						await nodeLogging?.log({
							level: "info",
							source: this.CLASS_NAME,
							ts: Date.now(),
							message: "sql",
							data: { sql }
						});

						await this.execute(dbConnection, sql);

						await nodeLogging?.log({
							level: "info",
							source: this.CLASS_NAME,
							ts: Date.now(),
							message: "typeCreated",
							data: { typeName: subTypeSchemaRef }
						});
					}
				}
			}

			const fields: string[] = [];
			const primaryKeys: string[] = [];
			const secondaryKeys: string[] = [];

			for (const field of this._entitySchema.properties ?? []) {
				fields.push(`"${String(field.property)}" ${this.toDbField(field)}`);
				if (field.isPrimary) {
					primaryKeys.push(`"${field.property as string}"`);
				}
				if (field.isSecondary) {
					secondaryKeys.push(`"${field.property as string}"`);
				}
			}
			fields.push(`PRIMARY KEY ((${primaryKeys.join(",")})`);
			if (secondaryKeys.length > 0) {
				fields.push(`${secondaryKeys.join(",")})`);
			} else {
				fields[fields.length - 1] += ")";
			}

			const sql = `CREATE TABLE IF NOT EXISTS "${this._fullTableName}" (${fields.join(", ")})`;

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "sql",
				data: { sql }
			});

			await this.execute(dbConnection, sql);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableCreated",
				data: { table: this._fullTableName }
			});
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceInUseException")) {
				await nodeLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "tableExists",
					data: { table: this._fullTableName }
				});
			} else {
				await nodeLogging?.log({
					level: "error",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "tableCreateFailed",
					error: err as IError,
					data: { table: this._fullTableName }
				});
			}
		}
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 */
	public async set(entity: T): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		let connection;
		const id = entity[this._primaryKey?.property];
		try {
			const propNames = this._entitySchema.properties?.map(f => `"${String(f.property)}"`) ?? [];
			const propValues: unknown[] = [];
			const preparedValues: string[] = [];

			const entityAsKeyValues = entity as unknown as { [key: string]: unknown };

			for (const propDesc of this._entitySchema.properties ?? []) {
				const value = entityAsKeyValues[propDesc.property as string];
				propValues.push(this.propertyToDbValue(value, propDesc));
				preparedValues.push("?");
			}

			const sql = `INSERT INTO "${this._fullTableName}" (${propNames.join(",")}) VALUES (${preparedValues.join(
				","
			)})`;

			await this._logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "sql",
				data: { sql }
			});

			connection = await this.openConnection();

			await this.execute(connection, sql, propValues);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"entityStorage.setFailed",
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
	 * Delete the entity.
	 * @param id The id of the entity to remove.
	 */
	public async remove(id: string): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		let connection;
		const primaryFieldValue = this.propertyToDbValue(id, this._primaryKey);

		try {
			const sql = `DELETE FROM "${this._fullTableName}" WHERE "${String(this._primaryKey?.property)}"=?`;

			await this._logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "entityStorage.sqlRemove",
				data: { sql }
			});

			connection = await this.openConnection();

			await this.execute(connection, sql, [primaryFieldValue]);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"removeFailed",
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
	 * Drops table.
	 */
	public async dropTable(): Promise<void> {
		let connection;

		try {
			connection = await this.openConnection();

			await connection.execute(`DROP TABLE IF EXISTS "${this._fullTableName}"`);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"dropTableFailed",
				{ table: this._fullTableName },
				error
			);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Truncates (clear) table.
	 */
	public async truncateTable(): Promise<void> {
		let connection;

		try {
			connection = await this.openConnection();

			await connection.execute(`TRUNCATE TABLE "${this._fullTableName}"`);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"truncateTableFailed",
				{ table: this._fullTableName },
				error
			);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Transform a logical description of a field into a DB field.
	 * @param logicalField The logical field description.
	 * @returns The DB type.
	 * @throws GeneralException if no mapping found.
	 */
	private toDbField(logicalField: IEntitySchemaProperty<T>): string {
		let dbType: string;

		switch (logicalField.type) {
			case "string":
				dbType = "TEXT";
				switch (logicalField.format) {
					case "uuid":
						dbType = "UUID";
						break;
					case "date":
					case "date-time":
						dbType = "TIMESTAMP";
						break;
				}
				break;
			case "number":
				dbType = "DOUBLE";
				switch (logicalField.format) {
					case "float":
						dbType = "FLOAT";
						break;
					case "double":
						dbType = "DOUBLE";
						break;
				}
				break;
			case "integer":
				dbType = "INT";
				switch (logicalField.format) {
					case "int8":
					case "uint8":
						dbType = "TINYINT";
						break;
					case "int16":
					case "uint16":
						dbType = "SMALLINT";
						break;
					case "int32":
					case "uint32":
						dbType = "INT";
						break;
					case "int64":
					case "uint64":
						dbType = "BIGINT";
						break;
				}
				break;
			case "boolean":
				dbType = "BOOLEAN";
				break;
			case "object":
				if (!logicalField.itemTypeRef) {
					throw new GeneralError(this.CLASS_NAME, "itemTypeNotDefined", {
						type: logicalField.type,
						table: this._fullTableName
					});
				}
				dbType = `frozen<"${logicalField.itemTypeRef}">`;
				break;
			case "array":
				if (!logicalField.itemType && !logicalField.itemTypeRef) {
					throw new GeneralError(this.CLASS_NAME, "itemTypeNotDefined", {
						type: logicalField.type,
						table: this._fullTableName
					});
				}
				if (logicalField.itemType) {
					dbType = `SET<${this.toDbField({
						property: logicalField.property,
						type: logicalField.itemType as EntitySchemaPropertyType
					})}>`;
				} else {
					dbType = `SET<frozen<"${logicalField.itemTypeRef}">>`;
				}
				break;
		}

		return dbType;
	}
}

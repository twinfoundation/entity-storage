// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import { BaseError, GeneralError, Guards, type IError, Is, StringHelper } from "@gtsc/core";
import {
	EntitySchemaFactory,
	EntitySchemaPropertyType,
	type IEntitySchemaProperty
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import { AbstractScyllaDBConnector } from "./abstractScyllaDBConnector";

/**
 * Store entities using ScyllaDB.
 */
export class ScyllaDBTableConnector<T = unknown>
	extends AbstractScyllaDBConnector<T>
	implements IEntityStorageConnector<T>
{
	/**
	 * Limit the number of entities when finding.
	 * @internal
	 */
	private static readonly _PAGE_SIZE: number = 40;

	/**
	 * Runtime name for the class.
	 * @internal
	 */
	public override readonly CLASS_NAME: string = nameof<ScyllaDBTableConnector>();

	/**
	 * Bootstrap the service by creating and initializing any resources it needs.
	 * @param systemPartitionId The System Partition ID.
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(systemPartitionId: string): Promise<void> {
		this._logging.log(
			{
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableCreating",
				data: { table: this.fullTableName }
			},
			{ partitionId: systemPartitionId }
		);

		try {
			let dbConnection = await this.openConnection(this._config);

			await this.createKeyspace(dbConnection, StringHelper.camelCase(systemPartitionId));

			// Connection has to be closed and now open a new one with our keyspace
			await this.closeConnection(dbConnection);
			dbConnection = await this.openConnection(
				this._config,
				StringHelper.camelCase(systemPartitionId)
			);

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

						await this._logging.log(
							{
								level: "info",
								source: this.CLASS_NAME,
								ts: Date.now(),
								message: "sql",
								data: sql
							},
							{ partitionId: systemPartitionId }
						);

						await this.execute(dbConnection, sql);

						await this._logging.log(
							{
								level: "info",
								source: this.CLASS_NAME,
								ts: Date.now(),
								message: "typeCreated",
								data: { typeName: subTypeSchemaRef }
							},
							{ partitionId: systemPartitionId }
						);
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
			fields.push(`PRIMARY KEY ( (${primaryKeys.join(",")})`);
			if (secondaryKeys.length > 0) {
				fields.push(`${secondaryKeys.join(",")})`);
			} else {
				fields[fields.length - 1] += ")";
			}

			const sql = `CREATE TABLE IF NOT EXISTS "${this.fullTableName}" (${fields.join(",")})`;

			await this._logging.log(
				{
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "sql",
					data: sql
				},
				{ partitionId: systemPartitionId }
			);

			await this.execute(dbConnection, sql);

			await this._logging.log(
				{
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "tableCreated",
					data: { table: this.fullTableName }
				},
				{ partitionId: systemPartitionId }
			);
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceInUseException")) {
				await this._logging.log(
					{
						level: "info",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "tableExists",
						data: { table: this.fullTableName }
					},
					{ partitionId: systemPartitionId }
				);
			} else {
				await this._logging.log(
					{
						level: "error",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "tableCreateFailed",
						error: err as IError,
						data: { table: this.fullTableName }
					},
					{ partitionId: systemPartitionId }
				);
			}
		}
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param requestContext The context for the request.
	 */
	public async set(entity: T, requestContext?: IServiceRequestContext): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

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

			if (propNames.length === 0) {
				await this._logging.log(
					{
						level: "warn",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "noProperties"
					},
					requestContext
				);
				return;
			}

			const sql = `INSERT INTO "${this.fullTableName}" (${propNames.join(",")}) VALUES (${preparedValues.join(
				","
			)})`;

			await this._logging.log(
				{
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "sql",
					data: sql
				},
				requestContext
			);

			connection = await this.openConnection(
				this._config,
				StringHelper.camelCase(requestContext?.partitionId)
			);

			await this.execute(connection, sql, propValues);
		} catch (error) {
			await this._logging.log(
				{
					level: "error",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "setFailed",
					error: error as IError
				},
				requestContext
			);

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
	 * @param requestContext The context for the request.
	 */
	public async remove(id: string, requestContext?: IServiceRequestContext): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

		let connection;
		const primaryFieldValue = this.propertyToDbValue(id, this._primaryKey);

		try {
			const sql = `DELETE FROM "${this.fullTableName}" WHERE "${String(this._primaryKey?.property)}"=?`;

			await this._logging.log(
				{
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "entityStorage.sqlRemove",
					data: sql
				},
				requestContext
			);

			connection = await this.openConnection(
				this._config,
				StringHelper.camelCase(requestContext?.partitionId)
			);

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
	 * Get the default page size of the entity storage.
	 * @returns The entitty storage page size.
	 */
	public pageSize(): number {
		return ScyllaDBTableConnector._PAGE_SIZE;
	}

	/**
	 * Drops table.
	 * @param requestContext Context Request.
	 */
	public async dropTable(requestContext: IServiceRequestContext): Promise<void> {
		let connection;

		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

		try {
			connection = await this.openConnection(
				this._config,
				StringHelper.camelCase(requestContext.partitionId)
			);

			await connection.execute(`DROP TABLE IF EXISTS "${this.fullTableName}"`);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"dropTableFailed",
				{ table: this.fullTableName },
				error
			);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Truncates (clear) table.
	 * @param requestContext Context Request.
	 */
	public async truncateTable(requestContext: IServiceRequestContext): Promise<void> {
		let connection;

		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

		try {
			connection = await this.openConnection(
				this._config,
				StringHelper.camelCase(requestContext.partitionId)
			);

			await connection.execute(`TRUNCATE TABLE "${this.fullTableName}"`);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"truncateTableFailed",
				{ table: this.fullTableName },
				error
			);
		} finally {
			await this.closeConnection(connection);
		}
	}

	/**
	 * Transform a logically descripted field into a DB field.
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
						table: this.fullTableName
					});
				}
				dbType = `frozen<"${logicalField.itemTypeRef}">`;
				break;
			case "array":
				if (!logicalField.itemType && !logicalField.itemTypeRef) {
					throw new GeneralError(this.CLASS_NAME, "itemTypeNotDefined", {
						type: logicalField.type,
						table: this.fullTableName
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

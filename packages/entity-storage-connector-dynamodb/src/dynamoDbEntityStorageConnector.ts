// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	ConditionalOperator,
	type CreateTableCommandInput,
	DynamoDB,
	type GlobalSecondaryIndex,
	QueryCommand,
	waitUntilTableExists
} from "@aws-sdk/client-dynamodb";
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand
} from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { BaseError, Converter, GeneralError, Guards, Is } from "@gtsc/core";
import {
	ComparisonOperator,
	type EntityCondition,
	EntitySchemaFactory,
	EntitySchemaHelper,
	type EntitySchemaPropertyType,
	type IComparator,
	type IEntitySchema,
	type IEntitySchemaProperty,
	type IEntitySort,
	LogicalOperator,
	type SortDirection
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import type { IDynamoDbEntityStorageConnectorConfig } from "./models/IDynamoDbEntityStorageConnectorConfig";

/**
 * Class for performing entity storage operations using Dynamo DB.
 */
export class DynamoDbEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
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
	 * Partition id field value.
	 * @internal
	 */
	private static readonly _PARTITION_ID_VALUE: string = "1";

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<DynamoDbEntityStorageConnector>();

	/**
	 * The schema for the entity.
	 * @internal
	 */
	private readonly _entitySchema: IEntitySchema<T>;

	/**
	 * The primary key.
	 * @internal
	 */
	private readonly _primaryKey: IEntitySchemaProperty<T>;

	/**
	 * Properties that can be used for sorting.
	 * @internal
	 */
	private readonly _sortProperties: IEntitySort<T>[];

	/**
	 * The configuration for the connector.
	 * @internal
	 */
	private readonly _config: IDynamoDbEntityStorageConnectorConfig;

	/**
	 * Create a new instance of DynamoDbEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.entitySchema The schema for the entity.
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to no logging.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		entitySchema: string;
		loggingConnectorType?: string;
		config: IDynamoDbEntityStorageConnectorConfig;
	}) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object<IDynamoDbEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.accessKeyId),
			options.config.accessKeyId
		);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.secretAccessKey),
			options.config.secretAccessKey
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.region), options.config.region);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.tableName), options.config.tableName);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);

		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);
		this._sortProperties = EntitySchemaHelper.getSortProperties(this._entitySchema) ?? [];

		this._config = options.config;
	}

	/**
	 * Bootstrap the service by creating and initializing any resources it needs.
	 * @param systemLoggingConnectorType The system logging connector type, defaults to "system-logging".
	 * @returns Nothing.
	 */
	public async bootstrap(systemLoggingConnectorType?: string): Promise<void> {
		const systemLogging = LoggingConnectorFactory.getIfExists(
			systemLoggingConnectorType ?? "system-logging"
		);

		if (!(await this.tableExists(this._config.tableName))) {
			await systemLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableCreating",
				data: {
					tableName: this._config.tableName
				}
			});

			try {
				const dbConnection = this.createConnection();

				const tableParams: CreateTableCommandInput = {
					AttributeDefinitions: [],
					KeySchema: [],
					ProvisionedThroughput: {
						ReadCapacityUnits: 1,
						WriteCapacityUnits: 1
					},
					TableName: this._config.tableName
				};

				// We always add a partition key to the table as a non optional hash key
				// is always required when querying using sort parameters
				tableParams.AttributeDefinitions?.push({
					AttributeName: DynamoDbEntityStorageConnector._PARTITION_ID_NAME,
					AttributeType: "S"
				});
				tableParams.KeySchema?.push({
					AttributeName: DynamoDbEntityStorageConnector._PARTITION_ID_NAME,
					KeyType: "HASH"
				});

				const gsi: GlobalSecondaryIndex[] = [];

				if (Is.arrayValue(this._entitySchema.properties)) {
					for (const prop of this._entitySchema.properties) {
						if (prop.isPrimary) {
							tableParams.AttributeDefinitions?.push({
								AttributeName: prop.property as string,
								AttributeType: prop.type === "integer" || prop.type === "number" ? "N" : "S"
							});
							tableParams.KeySchema?.push({
								AttributeName: prop.property as string,
								KeyType: "RANGE"
							});
						} else if (Is.stringValue(prop.sortDirection) || prop.isSecondary) {
							tableParams.AttributeDefinitions?.push({
								AttributeName: prop.property as string,
								AttributeType: prop.type === "integer" || prop.type === "number" ? "N" : "S"
							});

							gsi.push({
								IndexName: `${prop.property as string}-index`,
								KeySchema: [
									{
										AttributeName: DynamoDbEntityStorageConnector._PARTITION_ID_NAME,
										KeyType: "HASH"
									},
									{
										AttributeName: prop.property as string,
										KeyType: "RANGE"
									}
								],
								Projection: {
									ProjectionType: "ALL"
								},
								ProvisionedThroughput: {
									ReadCapacityUnits: 1,
									WriteCapacityUnits: 1
								}
							});
						}
					}
				}

				if (gsi.length > 0) {
					tableParams.GlobalSecondaryIndexes = gsi;
				}

				await dbConnection.createTable(tableParams);

				// Wait for table to exist
				await waitUntilTableExists(
					{
						client: dbConnection,
						maxWaitTime: 60000
					},
					{
						TableName: this._config.tableName
					}
				);

				await systemLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "tableCreated",
					data: {
						tableName: this._config.tableName
					}
				});
			} catch (err) {
				if (BaseError.isErrorCode(err, "ResourceInUseException")) {
					await systemLogging?.log({
						level: "info",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "tableExists",
						data: {
							tableName: this._config.tableName
						}
					});
				} else {
					await systemLogging?.log({
						level: "error",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "tableCreateFailed",
						error: BaseError.fromError(err),
						data: {
							tableName: this._config.tableName
						}
					});
				}
			}
		} else {
			await systemLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableExists",
				data: {
					tableName: this._config.tableName
				}
			});
		}
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(id: string, secondaryIndex?: keyof T): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		try {
			const docClient = this.createDocClient();

			if (Is.undefined(secondaryIndex)) {
				const getCommand = new GetCommand({
					TableName: this._config.tableName,
					Key: {
						[DynamoDbEntityStorageConnector._PARTITION_ID_NAME]:
							DynamoDbEntityStorageConnector._PARTITION_ID_VALUE,
						[this._primaryKey.property]: id
					}
				});

				const response = await docClient.send(getCommand);

				delete response.Item?.[DynamoDbEntityStorageConnector._PARTITION_ID_NAME];
				return response.Item as T;
			}

			const secIndex = secondaryIndex.toString();
			const globalSecondaryIndex = `${secIndex}-index`;

			const queryCommand = new QueryCommand({
				TableName: this._config.tableName,
				IndexName: globalSecondaryIndex,
				KeyConditionExpression: `#${secIndex} = :id AND #${DynamoDbEntityStorageConnector._PARTITION_ID_NAME} = :${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`,
				ExpressionAttributeNames: {
					[`#${secIndex}`]: secIndex,
					[`#${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`]:
						DynamoDbEntityStorageConnector._PARTITION_ID_NAME
				},
				ExpressionAttributeValues: {
					[`:${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`]: {
						S: DynamoDbEntityStorageConnector._PARTITION_ID_VALUE
					},
					":id": { S: id }
				}
			});

			const response = await docClient.send(queryCommand);

			if (response.Items?.length === 1) {
				return unmarshall(response.Items[0]) as T;
			}
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceNotFoundException")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"tableDoesNotExist",
					{
						table: this._config.tableName
					},
					err
				);
			}
			throw new GeneralError(
				this.CLASS_NAME,
				"getFailed",
				{
					id
				},
				err
			);
		}
		return undefined;
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @returns The id of the entity.
	 */
	public async set(entity: T): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		const id = entity[this._primaryKey.property];

		try {
			const docClient = this.createDocClient();

			const putCommand = new PutCommand({
				TableName: this._config.tableName,
				Item: {
					[DynamoDbEntityStorageConnector._PARTITION_ID_NAME]:
						DynamoDbEntityStorageConnector._PARTITION_ID_VALUE,
					...entity
				} as { [id: string]: unknown }
			});

			await docClient.send(putCommand);
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceNotFoundException")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"tableDoesNotExist",
					{
						tableName: this._config.tableName
					},
					err
				);
			}
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
	 * @returns Nothing.
	 */
	public async remove(id: string): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		try {
			const docClient = this.createDocClient();

			const deleteCommand = new DeleteCommand({
				TableName: this._config.tableName,
				Key: {
					[DynamoDbEntityStorageConnector._PARTITION_ID_NAME]:
						DynamoDbEntityStorageConnector._PARTITION_ID_VALUE,
					[this._primaryKey.property as string]: id
				}
			});

			await docClient.send(deleteCommand);
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceNotFoundException")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"tableDoesNotExist",
					{
						table: this._config.tableName
					},
					err
				);
			}

			throw new GeneralError(
				this.CLASS_NAME,
				"removeFailed",
				{
					id
				},
				err
			);
		}
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
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
		pageSize?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<T>[];
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
		const sql = "";

		try {
			const returnSize = pageSize ?? DynamoDbEntityStorageConnector._PAGE_SIZE;

			// const sortSql: string[] = [];
			// const indexName = "";

			// // If we have a sortable property defined in the descriptor then we must use
			// // its secondary index to lookup the value using PartiQL
			// if (Is.arrayValue(sortProperties)) {
			// 	for (const sortProperty of sortProperties) {
			// 		const propertySchema = this._entitySchema.properties?.find(
			// 			e => e.property === sortProperty.property
			// 		);
			// 		if (
			// 			Is.undefined(propertySchema) ||
			// 			(!propertySchema.isPrimary && !propertySchema.isSecondary)
			// 		) {
			// 			throw new GeneralError(this.CLASS_NAME, "sortNotIndexed", {
			// 				property: sortProperty.property
			// 			});
			// 		}

			// 		if (propertySchema.isSecondary) {
			// 			indexName = `."${sortProperty.property as string}-index"`;
			// 		}

			// 		const sortDir =
			// 			sortProperty.sortDirection ?? propertySchema?.sortDirection ?? SortDirection.Ascending;

			// 		sortSql.push(
			// 			`"${sortProperty.property as string}" ${sortDir === SortDirection.Ascending ? "ASC" : "DESC"}`
			// 		);
			// 	}
			// }

			// let fields = "*";

			// if (Is.arrayValue(properties)) {
			// 	fields = properties.map(p => `"${p as string}"`).join(",");
			// }

			// sql = `SELECT ${fields} FROM "${this._config.tableName}"${indexName}`;

			// const conditionSql = this.createSQLCondition("", conditions);
			// if (conditionSql.length > 0) {
			// 	sql += ` WHERE "${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}" = '${DynamoDbEntityStorageConnector._PARTITION_ID_VALUE}' AND ${conditionSql.trim()}`;
			// }

			// if (sortSql.length > 0) {
			// 	sql += ` ORDER BY ${sortSql.join(",")}`;
			// }

			// const query = new QueryCommand({
			// 	TableName: this._config.tableName,
			// 	KeyConditionExpression: "#partitionId = :partitionId",
			// 	FilterExpression: "#valueObject.#name.#value = :valueObjectNameValue",
			// 	ExpressionAttributeNames: {
			// 		"#partitionId": "partitionId",
			// 		"#valueObject": "valueObject",
			// 		"#name": "name",
			// 		"#value": "value"
			// 	},
			// 	ExpressionAttributeValues: {
			// 		[`:${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`]: {
			// 			S: DynamoDbEntityStorageConnector._PARTITION_ID_VALUE
			// 		},
			// 		":valueObjectNameValue": {
			// 			S: "fred"
			// 		}
			// 	}
			// });

			const query = new QueryCommand({
				TableName: this._config.tableName,
				KeyConditionExpression: "#partitionId = :partitionId",
				FilterExpression: "contains(#valueArray, :valueArrayProp)",
				ExpressionAttributeNames: {
					"#partitionId": "partitionId",
					"#valueArray": "valueArray"
				},
				ExpressionAttributeValues: {
					[`:${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`]: {
						S: DynamoDbEntityStorageConnector._PARTITION_ID_VALUE
					},
					":valueArrayProp": {
						M: {
							field: { S: "name" }
						}
					}
				}
			});

			// console.log(sql);

			const connection = this.createDocClient();
			console.log(JSON.stringify(query, undefined, 2));

			const results = await connection.send(query);
			console.log(JSON.stringify(results.Items, undefined, 2));

			// // Always get page size + 1 and discard the final entry if it is over page size
			// // this allows us to calculate if we should return a cursor to the next chunk
			// const results = await connection.executeStatement({
			// 	Statement: sql
			// });

			const entities: T[] = [];

			let startIndex = 0;
			const nextCursorId = Is.stringValue(cursor) ? Converter.hexToUtf8(cursor) : undefined;
			if (Is.stringValue(nextCursorId) && Is.arrayValue(results.Items)) {
				startIndex = results.Items.findIndex(it => it.id.S === nextCursorId);
			}

			let nextItem;
			if (Is.arrayValue(results.Items)) {
				for (let i = startIndex < 0 ? 0 : startIndex; i < results.Items.length; i++) {
					const entity = unmarshall(results.Items[i]) as T;

					entities.push(entity);
					if (entities.length === returnSize) {
						if (i < results.Items.length - 1) {
							nextItem = results.Items[i + 1];
						}
						break;
					}
				}
			}

			return {
				entities,
				cursor: Is.stringValue(nextItem?.id?.S)
					? Converter.utf8ToHex(nextItem?.id?.S as string)
					: undefined,
				pageSize: returnSize,
				totalEntities: results.Items?.length ?? 0
			};
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceNotFoundException")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"tableDoesNotExist",
					{
						table: this._config.tableName
					},
					err
				);
			}
			throw new GeneralError(
				this.CLASS_NAME,
				"queryFailed",
				{
					sql
				},
				err
			);
		}
	}

	/**
	 * Delete the table.
	 * @returns Nothing.
	 */
	public async tableDelete(): Promise<void> {
		try {
			const dbConnection = this.createConnection();

			await dbConnection.deleteTable({ TableName: this._config.tableName });
		} catch {}
	}

	/**
	 * Create an SQL condition clause.
	 * @param prefix The prefix to use for the condition.
	 * @param condition The conditions to create the query from.
	 * @returns The condition clause.
	 */
	private createSQLCondition(prefix: string, condition?: EntityCondition<T>): string {
		// If no conditions are defined then return empty string
		if (Is.undefined(condition)) {
			return "";
		}

		if ("conditions" in condition) {
			// It's a group of comparisons, so check the individual items and combine with the logical operator
			const joinConditions: string[] = condition.conditions.map(c =>
				this.createSQLCondition(prefix, c)
			);

			const joined = joinConditions.join(
				` ${this.mapConditionalOperator(condition.logicalOperator)} `
			);
			return ` (${joined}) `;
		}

		const schemaProp = this._entitySchema.properties?.find(p => p.property === condition.property);
		if ("condition" in condition) {
			return this.createSQLCondition(`${condition.property as string}`, condition.condition);
		}

		// It's a single value so just create the property comparison for the condition
		return this.mapComparisonOperator(prefix, condition, schemaProp?.type);
	}

	/**
	 * Map the framework comparison operators to those in DynamoDB.
	 * @param prefix The prefix to use for the condition.
	 * @param comparator The operator to map.
	 * @param type The type of the property.
	 * @returns The comparison operator.
	 * @throws GeneralError if the comparison operator is not supported.
	 */
	private mapComparisonOperator(
		prefix: string,
		comparator: IComparator<T>,
		type?: EntitySchemaPropertyType
	): string {
		const dbValue = this.propertyToDbValue(comparator.value, type);

		let prop = `${comparator.property as string}`;
		if (prefix.length > 0) {
			prop = `${prefix}.${prop}`;
		}

		if (comparator.operator === ComparisonOperator.Equals) {
			return `"${prop}" = ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.NotEquals) {
			return `"${prop}" <> ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.GreaterThan) {
			return `"${prop}" > ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.LessThan) {
			return `"${prop}" < ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.GreaterThanOrEqual) {
			return `"${prop}" >= ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.LessThanOrEqual) {
			return `"${prop}" <= ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.Includes) {
			return `"${prop}" CONTAINS ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.NotIncludes) {
			return `"${prop}" NOT_CONTAINS ${dbValue}`;
		} else if (comparator.operator === ComparisonOperator.In) {
			return `"${prop}" IN ${dbValue}`;
		}

		throw new GeneralError(this.CLASS_NAME, "comparisonNotSupported", { operator: comparator });
	}

	/**
	 * Map the framework conditional operators to those in DynamoDB.
	 * @param operator The operator to map.
	 * @returns The conditional operator.
	 * @throws GeneralError if the conditional operator is not supported.
	 */
	private mapConditionalOperator(operator?: LogicalOperator): string {
		if ((operator ?? LogicalOperator.And) === LogicalOperator.And) {
			return ConditionalOperator.AND;
		} else if (operator === LogicalOperator.Or) {
			return ConditionalOperator.OR;
		}

		throw new GeneralError(this.CLASS_NAME, "conditionalNotSupported", { operator });
	}

	/**
	 * Format a value to insert into DB.
	 * @param value The value to format.
	 * @param type The type for the property.
	 * @returns The value after conversion.
	 * @internal
	 */
	private propertyToDbValue(value: unknown, type?: EntitySchemaPropertyType): string {
		if (Is.array(value)) {
			return `[${value.map(v => this.propertyToDbValue(v, type)).join(",")}]`;
		}

		if (type === "integer" || type === "number") {
			return value === undefined ? "null" : `${value}`;
		} else if (type === "boolean") {
			return value ? "true" : "false";
		}

		return `'${value}'`;
	}

	/**
	 * Create a doc client connection.
	 * @returns The dynamo db document client.
	 * @internal
	 */
	private createDocClient(): DynamoDBDocumentClient {
		return DynamoDBDocumentClient.from(
			new DynamoDB({
				apiVersion: "2012-10-08",
				...this.createConnectionConfig()
			}),
			{
				marshallOptions: {
					removeUndefinedValues: true
				}
			}
		);
	}

	/**
	 * Create a new DB connection.
	 * @returns The dynamo db connection.
	 * @internal
	 */
	private createConnection(): DynamoDB {
		return new DynamoDB(this.createConnectionConfig());
	}

	/**
	 * Create a new DB connection configuration.
	 * @returns The dynamo db connection configuration.
	 * @internal
	 */
	private createConnectionConfig(): {
		credentials: {
			accessKeyId: string;
			secretAccessKey: string;
		};
		endpoint?: string;
		region: string;
	} {
		return {
			credentials: {
				accessKeyId: this._config.accessKeyId,
				secretAccessKey: this._config.secretAccessKey
			},
			endpoint: this._config.endpoint,
			region: this._config.region
		};
	}

	/**
	 * Check if the table exists.
	 * @param tableName The table to check.
	 * @returns True if the table exists.
	 * @internal
	 */
	private async tableExists(tableName: string): Promise<boolean> {
		try {
			const dbConnection = this.createConnection();

			await dbConnection.describeTable({ TableName: tableName });

			return true;
		} catch {
			return false;
		}
	}
}

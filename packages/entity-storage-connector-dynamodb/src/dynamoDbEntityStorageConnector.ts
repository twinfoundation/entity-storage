// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	type AttributeValue,
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
import { BaseError, Coerce, Converter, GeneralError, Guards, Is } from "@gtsc/core";
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
							// You can only query and sort items if you have a secondary index
							// defined for the property
							tableParams.AttributeDefinitions?.push({
								AttributeName: prop.property as string,
								AttributeType: prop.type === "integer" || prop.type === "number" ? "N" : "S"
							});

							gsi.push({
								IndexName: `${prop.property as string}Index`,
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
			const globalSecondaryIndex = `${secIndex}Index`;

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

			let indexName: string | undefined;

			// If we have a sortable property defined in the descriptor then we must use
			// the secondary index for the query
			if (Is.arrayValue(sortProperties)) {
				if (sortProperties.length > 1) {
					throw new GeneralError(this.CLASS_NAME, "sortSingle");
				}

				for (const sortProperty of sortProperties) {
					const propertySchema = this._entitySchema.properties?.find(
						e => e.property === sortProperty.property
					);
					if (
						Is.undefined(propertySchema) ||
						(!propertySchema.isPrimary &&
							!propertySchema.isSecondary &&
							Is.empty(propertySchema.sortDirection))
					) {
						throw new GeneralError(this.CLASS_NAME, "sortNotIndexed", {
							property: sortProperty.property
						});
					}

					indexName = propertySchema.isPrimary
						? undefined
						: `${sortProperty.property as string}Index`;
				}
			}

			const attributeNames: { [id: string]: string } = { "#partitionId": "partitionId" };
			const attributeValues: { [id: string]: AttributeValue } = {
				[`:${DynamoDbEntityStorageConnector._PARTITION_ID_NAME}`]: {
					S: DynamoDbEntityStorageConnector._PARTITION_ID_VALUE
				}
			};

			const expressions = this.buildQueryParameters(
				"",
				conditions,
				attributeNames,
				attributeValues
			);

			let keyExpression = "#partitionId = :partitionId";
			if (expressions.keyCondition.length > 0) {
				keyExpression += ` AND ${expressions.keyCondition}`;
			}

			const query = new QueryCommand({
				TableName: this._config.tableName,
				IndexName: indexName,
				KeyConditionExpression: keyExpression,
				FilterExpression: Is.stringValue(expressions.filterCondition)
					? expressions.filterCondition
					: undefined,
				ExpressionAttributeNames: attributeNames,
				ExpressionAttributeValues: attributeValues,
				ProjectionExpression: properties?.map(p => p as string).join(", ")
			});

			const connection = this.createDocClient();

			const results = await connection.send(query);

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
	 * @param objectPath The path for the nested object.
	 * @param condition The conditions to create the query from.
	 * @param attributeNames The attribute names to use in the query.
	 * @param attributeValues The attribute values to use in the query.
	 * @returns The condition clause.
	 */
	private buildQueryParameters(
		objectPath: string,
		condition: EntityCondition<T> | undefined,
		attributeNames: { [id: string]: string },
		attributeValues: { [id: string]: AttributeValue }
	): {
		keyCondition: string;
		filterCondition: string;
	} {
		// If no conditions are defined then return empty string
		if (Is.undefined(condition)) {
			return {
				keyCondition: "",
				filterCondition: ""
			};
		}

		if ("conditions" in condition) {
			// It's a group of comparisons, so check the individual items and combine with the logical operator
			const joinConditions: {
				keyCondition: string;
				filterCondition: string;
			}[] = condition.conditions.map(c =>
				this.buildQueryParameters(objectPath, c, attributeNames, attributeValues)
			);

			const logicalOperator = this.mapConditionalOperator(condition.logicalOperator);
			const keyCondition = joinConditions.map(j => j.keyCondition).join(` ${logicalOperator} `);
			const filterCondition = joinConditions
				.map(j => j.filterCondition)
				.join(` ${logicalOperator} `);

			return {
				keyCondition: Is.stringValue(keyCondition) ? ` (${keyCondition}) ` : "",
				filterCondition: Is.stringValue(filterCondition) ? ` (${filterCondition}) ` : ""
			};
		}

		const schemaProp = this._entitySchema.properties?.find(p => p.property === condition.property);

		// It's a single value so just create the property comparison for the condition
		const comparison = this.mapComparisonOperator(
			objectPath,
			condition,
			schemaProp?.type,
			attributeNames,
			attributeValues
		);

		return {
			keyCondition: schemaProp?.isPrimary ? comparison : "",
			filterCondition: schemaProp?.isPrimary ? "" : comparison
		};
	}

	/**
	 * Map the framework comparison operators to those in DynamoDB.
	 * @param objectPath The prefix to use for the condition.
	 * @param comparator The operator to map.
	 * @param type The type of the property.
	 * @param attributeNames The attribute names to use in the query.
	 * @param attributeValues The attribute values to use in the query.
	 * @returns The comparison expression.
	 * @throws GeneralError if the comparison operator is not supported.
	 */
	private mapComparisonOperator(
		objectPath: string,
		comparator: IComparator,
		type: EntitySchemaPropertyType | undefined,
		attributeNames: { [id: string]: string },
		attributeValues: { [id: string]: AttributeValue }
	): string {
		let prop = objectPath;
		if (prop.length > 0) {
			prop += ".";
		}
		prop += comparator.property as string;

		let attributeName = this.populateAttributeNames(prop, attributeNames);
		let propName = `:${attributeName.replace(/\./g, "").replace(/#/g, "")}`;

		if (Is.array(comparator.value)) {
			const dbValues = comparator.value.map(v => this.propertyToDbValue(v, type));
			const arrAttributeNames = [];
			for (let i = 0; i < dbValues.length; i++) {
				const arrAttributeName = `${propName}${i}`;
				attributeValues[arrAttributeName] = dbValues[i];
				arrAttributeNames.push(arrAttributeName);
			}
			propName = attributeName;
			attributeName = `(${arrAttributeNames.join(", ")})`;
		} else {
			attributeValues[propName] = this.propertyToDbValue(comparator.value, type);
		}

		if (comparator.operator === ComparisonOperator.Equals) {
			return `${attributeName} = ${propName}`;
		} else if (comparator.operator === ComparisonOperator.NotEquals) {
			return `${attributeName} <> ${propName}`;
		} else if (comparator.operator === ComparisonOperator.GreaterThan) {
			return `${attributeName} > ${propName}`;
		} else if (comparator.operator === ComparisonOperator.LessThan) {
			return `${attributeName} < ${propName}`;
		} else if (comparator.operator === ComparisonOperator.GreaterThanOrEqual) {
			return `${attributeName} >= ${propName}`;
		} else if (comparator.operator === ComparisonOperator.LessThanOrEqual) {
			return `${attributeName} <= ${propName}`;
		} else if (comparator.operator === ComparisonOperator.Includes) {
			return `contains(${attributeName}, ${propName})`;
		} else if (comparator.operator === ComparisonOperator.NotIncludes) {
			return `notContains(${attributeName}, ${propName})`;
		} else if (comparator.operator === ComparisonOperator.In) {
			return `${propName} IN ${attributeName}`;
		}

		throw new GeneralError(this.CLASS_NAME, "comparisonNotSupported", { operator: comparator });
	}

	/**
	 * Create a unique name for the attribute.
	 * @param name The name to create a unique name for.
	 * @param attributeNames The attribute names to use in the query.
	 * @returns The unique name.
	 */
	private populateAttributeNames(name: string, attributeNames: { [id: string]: string }): string {
		const parts = name.split(".");
		const attributeNameParts: string[] = [];

		for (const part of parts) {
			const hashPart = `#${part}`;
			if (Is.empty(attributeNames[hashPart])) {
				attributeNames[hashPart] = part;
			}
			attributeNameParts.push(hashPart);
		}

		return attributeNameParts.join(".");
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
	private propertyToDbValue(value: unknown, type?: EntitySchemaPropertyType): AttributeValue {
		if (Is.object(value)) {
			const map: { [id: string]: AttributeValue } = {};
			for (const key in value) {
				map[key] = this.propertyToDbValue(value[key]);
			}
			return {
				M: map
			};
		}

		if (type === "integer" || type === "number") {
			return { N: Coerce.string(value) ?? "" };
		} else if (type === "boolean") {
			return { BOOL: Coerce.boolean(value) ?? false };
		}

		return { S: Coerce.string(value) ?? "" };
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

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	type AttributeValue,
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
import { type NativeAttributeValue, unmarshall } from "@aws-sdk/util-dynamodb";
import {
	BaseError,
	Coerce,
	Converter,
	GeneralError,
	Guards,
	Is,
	ObjectHelper
} from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	EntitySchemaFactory,
	EntitySchemaHelper,
	type EntitySchemaPropertyType,
	type IComparator,
	type IEntitySchema,
	type IEntitySchemaProperty,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
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

		this._config = options.config;
		this._config.endpoint = Is.stringValue(this._config.endpoint)
			? this._config.endpoint
			: undefined;
	}

	/**
	 * Bootstrap the component by creating and initializing any resources it needs.
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @returns True if the bootstrapping process was successful.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		if (!(await this.tableExists(this._config.tableName))) {
			await nodeLogging?.log({
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

				await nodeLogging?.log({
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
					await nodeLogging?.log({
						level: "info",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "tableExists",
						data: {
							tableName: this._config.tableName
						}
					});
				} else {
					const errors = err instanceof AggregateError ? err.errors : [err];
					for (const error of errors) {
						await nodeLogging?.log({
							level: "error",
							source: this.CLASS_NAME,
							ts: Date.now(),
							message: "tableCreateFailed",
							error: BaseError.fromError(error),
							data: {
								tableName: this._config.tableName
							}
						});
					}
				}
				return false;
			}
		} else {
			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "tableExists",
				data: {
					tableName: this._config.tableName
				}
			});
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
	 * Get an entity.
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

		try {
			const docClient = this.createDocClient();

			if (Is.empty(secondaryIndex) && Is.empty(conditions)) {
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

			const finalConditions: EntityCondition<T> = {
				conditions: []
			};

			if (Is.stringValue(secondaryIndex)) {
				finalConditions.conditions.push({
					property: secondaryIndex,
					comparison: ComparisonOperator.Equals,
					value: id
				});
			}
			if (Is.arrayValue(conditions)) {
				for (const c of conditions) {
					finalConditions.conditions.push({
						property: c.property as string,
						comparison: ComparisonOperator.Equals,
						value: c.value
					});
				}
			}

			const queryResult = await this.internalQuery(
				finalConditions,
				undefined,
				undefined,
				undefined,
				1,
				secondaryIndex as string
			);

			return queryResult.entities[0] as T;
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
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param conditions The optional conditions to match for the entities.
	 * @returns The id of the entity.
	 */
	public async set(entity: T, conditions?: { property: keyof T; value: unknown }[]): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		const id = entity[this._primaryKey.property];

		try {
			const docClient = this.createDocClient();

			const { conditionExpression, attributeNames, attributeValues } =
				this.buildConditionExpression(conditions);

			const putCommand = new PutCommand({
				TableName: this._config.tableName,
				Item: {
					[DynamoDbEntityStorageConnector._PARTITION_ID_NAME]:
						DynamoDbEntityStorageConnector._PARTITION_ID_VALUE,
					...entity
				} as { [id: string]: unknown },
				// Only set the condition expression if we have conditions to match
				// and the primary key exists, otherwise we are creating a new object
				ConditionExpression: Is.stringValue(conditionExpression)
					? `(attribute_exists(${this._primaryKey.property as string}) AND ${conditionExpression}) OR attribute_not_exists(${this._primaryKey.property as string})`
					: undefined,
				ExpressionAttributeNames: attributeNames,
				ExpressionAttributeValues: attributeValues
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
	 * @param conditions The optional conditions to match for the entities.
	 * @returns Nothing.
	 */
	public async remove(
		id: string,
		conditions?: { property: keyof T; value: unknown }[]
	): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		try {
			const docClient = this.createDocClient();

			const { conditionExpression, attributeNames, attributeValues } =
				this.buildConditionExpression(conditions);

			const deleteCommand = new DeleteCommand({
				TableName: this._config.tableName,
				Key: {
					[DynamoDbEntityStorageConnector._PARTITION_ID_NAME]:
						DynamoDbEntityStorageConnector._PARTITION_ID_VALUE,
					[this._primaryKey.property as string]: id
				},
				ConditionExpression: conditionExpression,
				ExpressionAttributeNames: attributeNames,
				ExpressionAttributeValues: attributeValues
			});

			await docClient.send(deleteCommand);
		} catch (err) {
			if (BaseError.isErrorName(err, "ConditionalCheckFailedException")) {
				return;
			}
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
	 * @param pageSize The suggested number of entities to return in each chunk, in some scenarios can return a different amount.
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
	}> {
		return this.internalQuery(conditions, sortProperties, properties, cursor, pageSize);
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
	 * Create the parameters for a query.
	 * @param objectPath The path for the nested object.
	 * @param condition The conditions to create the query from.
	 * @param attributeNames The attribute names to use in the query.
	 * @param attributeValues The attribute values to use in the query.
	 * @returns The condition clause.
	 * @internal
	 */
	private buildQueryParameters(
		objectPath: string,
		condition: EntityCondition<T> | undefined,
		attributeNames: { [id: string]: string },
		attributeValues: { [id: string]: AttributeValue },
		secondaryIndex?: string
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
			if (condition.conditions.length === 0) {
				return {
					keyCondition: "",
					filterCondition: ""
				};
			}
			// It's a group of comparisons, so check the individual items and combine with the logical operator
			const joinConditions: {
				keyCondition: string;
				filterCondition: string;
			}[] = condition.conditions.map(c =>
				this.buildQueryParameters(objectPath, c, attributeNames, attributeValues, secondaryIndex)
			);

			const logicalOperator = this.mapConditionalOperator(condition.logicalOperator);
			const keyCondition = joinConditions
				.filter(j => j.keyCondition.length > 0)
				.map(j => j.keyCondition)
				.join(` ${logicalOperator} `);
			const filterCondition = joinConditions
				.filter(j => j.filterCondition.length > 0)
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

		const isKey =
			schemaProp?.isPrimary || (schemaProp?.isSecondary && schemaProp?.property === secondaryIndex);
		return {
			keyCondition: isKey ? comparison : "",
			filterCondition: !isKey ? comparison : ""
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
	 * @internal
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

		if (comparator.comparison === ComparisonOperator.Equals) {
			return `${attributeName} = ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.NotEquals) {
			return `${attributeName} <> ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.GreaterThan) {
			return `${attributeName} > ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.LessThan) {
			return `${attributeName} < ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.GreaterThanOrEqual) {
			return `${attributeName} >= ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.LessThanOrEqual) {
			return `${attributeName} <= ${propName}`;
		} else if (comparator.comparison === ComparisonOperator.Includes) {
			return `contains(${attributeName}, ${propName})`;
		} else if (comparator.comparison === ComparisonOperator.NotIncludes) {
			return `notContains(${attributeName}, ${propName})`;
		} else if (comparator.comparison === ComparisonOperator.In) {
			return `${propName} IN ${attributeName}`;
		}

		throw new GeneralError(this.CLASS_NAME, "comparisonNotSupported", {
			comparison: comparator.comparison
		});
	}

	/**
	 * Create a unique name for the attribute.
	 * @param name The name to create a unique name for.
	 * @param attributeNames The attribute names to use in the query.
	 * @returns The unique name.
	 * @internal
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
	 * @internal
	 */
	private mapConditionalOperator(operator?: LogicalOperator): string {
		if ((operator ?? LogicalOperator.And) === LogicalOperator.And) {
			return "AND";
		} else if (operator === LogicalOperator.Or) {
			return "OR";
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

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The suggested number of entities to return in each chunk, in some scenarios can return a different amount.
	 * @param secondaryIndex The secondary index to use for the query.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @internal
	 */
	private async internalQuery(
		conditions?: EntityCondition<T>,
		sortProperties?: {
			property: keyof T;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof T)[],
		cursor?: string,
		pageSize?: number,
		secondaryIndex?: string
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<T>[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}> {
		try {
			const returnSize = pageSize ?? DynamoDbEntityStorageConnector._PAGE_SIZE;

			let indexName: string | undefined = Is.stringValue(secondaryIndex)
				? `${secondaryIndex}Index`
				: undefined;

			// If we have a sortable property defined in the descriptor then we must use
			// the secondary index for the query
			let scanAscending = true;
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
					scanAscending = sortProperty.sortDirection === SortDirection.Ascending;
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
				attributeValues,
				secondaryIndex
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
				ProjectionExpression: properties?.map(p => p as string).join(", "),
				Limit: returnSize,
				ScanIndexForward: scanAscending,
				ExclusiveStartKey: Is.empty(cursor)
					? undefined
					: ObjectHelper.fromBytes(Converter.base64ToBytes(cursor))
			});

			const connection = this.createDocClient();

			const results = await connection.send(query);

			let entities: T[] = [];

			if (Is.arrayValue(results.Items)) {
				entities = results.Items.map(item => unmarshall(item) as T);
			}

			return {
				entities,
				cursor: Is.empty(results.LastEvaluatedKey)
					? undefined
					: Converter.bytesToBase64(ObjectHelper.toBytes(results.LastEvaluatedKey))
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
			throw new GeneralError(this.CLASS_NAME, "queryFailed", undefined, err);
		}
	}

	/**
	 * Build the condition expression for the query.
	 * @param conditions The conditions to build the expression from.
	 * @returns The condition expression.
	 * @throws GeneralError if the property is not found in the schema.
	 * @internal
	 */
	private buildConditionExpression(conditions?: { property: keyof T; value: unknown }[]): {
		conditionExpression: string | undefined;
		attributeNames: { [id: string]: string } | undefined;
		attributeValues: { [key: string]: NativeAttributeValue } | undefined;
	} {
		let conditionExpression: string | undefined;
		let attributeNames: { [id: string]: string } | undefined;
		let attributeValues: { [key: string]: NativeAttributeValue } | undefined;

		if (Is.arrayValue(conditions)) {
			const expressions: string[] = [];

			for (const c of conditions) {
				const schemaProp = this._entitySchema.properties?.find(p => p.property === c.property);

				if (Is.undefined(schemaProp)) {
					throw new GeneralError(this.CLASS_NAME, "propertyNotFound", {
						property: c.property
					});
				}

				const attributeName = `#${c.property as string}`;
				const attributeValueName = `:${c.property as string}`;
				attributeNames ??= {};
				attributeValues ??= {};
				attributeNames[attributeName] = c.property as string;
				attributeValues[attributeValueName] = c.value;
				expressions.push(`${attributeName} = ${attributeValueName}`);
			}

			conditionExpression = expressions.join(" AND ");
		}
		return { conditionExpression, attributeNames, attributeValues };
	}
}

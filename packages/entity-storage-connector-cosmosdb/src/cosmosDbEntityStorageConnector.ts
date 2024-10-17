// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	CosmosClient,
	type ItemDefinition,
	PartitionKeyKind,
	type Container,
	type SqlQuerySpec,
	type FeedOptions,
	type SqlParameter
} from "@azure/cosmos";

import { BaseError, Coerce, GeneralError, Guards, Is } from "@twin.org/core";
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
import type { ICosmosDbEntityStorageConnectorConfig } from "./models/ICosmosDbEntityStorageConnectorConfig";

/**
 * Class for performing entity storage operations using Cosmos DB.
 */
export class CosmosDbEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
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
	public readonly CLASS_NAME: string = nameof<CosmosDbEntityStorageConnector>();

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
	private readonly _config: ICosmosDbEntityStorageConnectorConfig;

	/**
	 * Container user for the data storage
	 */
	private _container?: Container;

	/**
	 * Create a new instance of CosmosDbEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.entitySchema The schema for the entity.
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to no logging.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		entitySchema: string;
		loggingConnectorType?: string;
		config: ICosmosDbEntityStorageConnectorConfig;
	}) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object<ICosmosDbEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.endpoint), options.config.endpoint);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.key), options.config.key);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.databaseId),
			options.config.databaseId
		);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.containerId),
			options.config.containerId
		);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);

		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);

		this._config = options.config;
	}

	/**
	 * Initialize the Cosmos DB environment.
	 * @param nodeLoggingConnectorType Optional type of the logging connector.
	 * @returns A promise that resolves to a boolean indicating success.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		// Create the Cosmos DB client
		const client = new CosmosClient({
			endpoint: this._config.endpoint,
			key: this._config.key
		});

		// Create the database if it does not exist
		try {
			const { resource: databaseDefinition } = await client.databases.createIfNotExists({
				id: this._config.databaseId
			});
			Guards.stringValue(this.CLASS_NAME, nameof(databaseDefinition?.id), databaseDefinition?.id);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "databaseExists",
				data: {
					databaseId: databaseDefinition.id
				}
			});
		} catch (error) {
			if (BaseError.isErrorCode(error, "Conflict")) {
				await nodeLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "databaseAlreadyExists",
					data: {
						databaseId: this._config.databaseId
					}
				});
			} else {
				const errors = error instanceof AggregateError ? error.errors : [error];
				for (const err of errors) {
					await nodeLogging?.log({
						level: "error",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "databaseCreateFailed",
						error: BaseError.fromError(err),
						data: {
							databaseId: this._config.databaseId
						}
					});
				}
				return false;
			}
		}

		// Create the container if it does not exist
		try {
			const { resource: containerDefinition } = await client
				.database(this._config.databaseId)
				.containers.createIfNotExists(
					{
						id: this._config.containerId,
						partitionKey: {
							kind: PartitionKeyKind.Hash,
							paths: [CosmosDbEntityStorageConnector._PARTITION_ID_PATH]
						}
					},
					{ offerThroughput: 400 }
				);

			if (!containerDefinition) {
				throw new GeneralError(this.CLASS_NAME, "containerNotExisting");
			}
			this._container = client.database(this._config.databaseId).container(containerDefinition.id);
			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "containerExists",
				data: {
					containerId: this._config.containerId
				}
			});
		} catch (error) {
			if (GeneralError.isErrorCode(error, "containerNotExisting")) {
				try {
					await this.createContainer();
					await nodeLogging?.log({
						level: "info",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "containerExists",
						data: {
							containerId: this._config.containerId
						}
					});
				} catch (err) {
					await nodeLogging?.log({
						level: "error",
						source: this.CLASS_NAME,
						ts: Date.now(),
						message: "containerCreateFailed",
						error: BaseError.fromError(err),
						data: {
							containerId: this._config.containerId
						}
					});
					return false;
				}
			} else {
				throw new GeneralError(this.CLASS_NAME, "containerNotCreated", undefined, error);
			}
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
	 * Get an entity from Cosmos DB.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(id: string, secondaryIndex?: keyof T): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		try {
			// No second index
			const container = await this.createContainer();
			if (Is.undefined(secondaryIndex)) {
				const { resource: item } = await container
					.item(id, CosmosDbEntityStorageConnector._PARTITION_ID_VALUE)
					.read<ItemDefinition>();
				return item as T | undefined;
			}

			// With a second index
			const secIndex = secondaryIndex.toString();
			const query: SqlQuerySpec = {
				query: `SELECT * FROM c WHERE c.${secIndex} = @id AND c.${CosmosDbEntityStorageConnector._PARTITION_ID_NAME} = @partitionKey`,
				parameters: [
					{ name: "@id", value: id },
					{ name: "@partitionKey", value: CosmosDbEntityStorageConnector._PARTITION_ID_VALUE }
				]
			};

			const { resources: items } = await container.items.query(query).fetchAll();

			if (items.length === 1) {
				return items[0] as T;
			}
		} catch (err) {
			if (BaseError.isErrorCode(err, "NotFound")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"containerDoesNotExist",
					{
						container: this._config.containerId
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
			const container = await this.createContainer();

			await container.items.upsert({
				id,
				[CosmosDbEntityStorageConnector._PARTITION_ID_NAME]:
					CosmosDbEntityStorageConnector._PARTITION_ID_VALUE,
				...entity
			});
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceNotFoundException")) {
				throw new GeneralError(
					this.CLASS_NAME,
					"containerDoesNotExist",
					{
						containerId: this._config.containerId
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
			const container = await this.createContainer();

			await container.item(id, CosmosDbEntityStorageConnector._PARTITION_ID_VALUE).delete();
		} catch (err) {
			if (typeof err === "object" && err !== null && "body" in err) {
				const body = (err as { body?: unknown }).body;
				if (typeof body === "object" && body !== null && "code" in body) {
					if (body.code === "NotFound") {
						body.code = "NotFoundException";
						if (BaseError.isErrorCode(body, "NotFoundException")) {
							return;
						}
					}
				} else {
				}
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
		sortProperties?: { property: keyof T; sortDirection: SortDirection }[],
		properties?: (keyof T)[],
		cursor?: string,
		pageSize?: number
	): Promise<{ entities: Partial<T>[]; cursor?: string }> {
		const sql = "";
		try {
			const returnSize = pageSize ?? CosmosDbEntityStorageConnector._PAGE_SIZE;

			let orderByClause: string = "";
			if (Array.isArray(sortProperties)) {
				if (sortProperties.length > 1) {
					throw new GeneralError(this.CLASS_NAME, "sortSingle");
				}
				for (const sortProperty of sortProperties) {
					const propertySchema = this._entitySchema.properties?.find(
						e => e.property === sortProperty.property
					);
					if (
						!propertySchema ||
						(!propertySchema.isPrimary &&
							!propertySchema.isSecondary &&
							!propertySchema.sortDirection)
					) {
						throw new GeneralError(this.CLASS_NAME, "sortNotIndexed", {
							property: sortProperty.property
						});
					}
					const direction =
						sortProperty.sortDirection === SortDirection.Ascending
							? SortDirection.Ascending
							: SortDirection.Descending;
					orderByClause = `ORDER BY c.${String(sortProperty.property)} ${direction}`;
				}
			}

			const attributeNames: { [id: string]: string } = {};
			const attributeValues: { [id: string]: unknown } = {};
			let queryClause = this.buildQueryParameters("", conditions, attributeNames, attributeValues);

			if (queryClause.length > 1) {
				queryClause = ` AND ${queryClause}`;
			}

			const querySpecs: SqlQuerySpec = {
				query: `SELECT ${properties ? properties.map(p => `c.${p as string}`).join(", ") : "*"} FROM c WHERE c.partitionId = @partitionId ${queryClause} ${orderByClause}`,
				parameters: [
					{ name: "@partitionId", value: CosmosDbEntityStorageConnector._PARTITION_ID_VALUE },
					...Object.keys(attributeValues).map(
						key => ({ name: `@${key}`, value: attributeValues[key] }) as SqlParameter
					)
				]
			};

			const feedOptions: FeedOptions = {
				maxItemCount: returnSize,
				continuationToken: cursor
			};

			const container = await this.createContainer();
			const feedResponse = await container.items.query(querySpecs, feedOptions).fetchNext();
			const entities: Partial<T>[] = feedResponse.resources.map(item => ({ ...item }));

			return { entities, cursor: feedResponse.continuationToken };
		} catch (err) {
			throw new GeneralError(this.CLASS_NAME, "queryFailed", { sql }, err);
		}
	}

	/**
	 * Delete the container.
	 * @returns Nothing.
	 */
	public async containerDelete(): Promise<void> {
		try {
			// Create the Cosmos DB client
			const client = new CosmosClient({
				endpoint: this._config.endpoint,
				key: this._config.key
			});

			const { resource: containerDefinition } = await client
				.database(this._config.databaseId)
				.containers.createIfNotExists(
					{
						id: this._config.containerId,
						partitionKey: {
							kind: PartitionKeyKind.Hash,
							paths: [CosmosDbEntityStorageConnector._PARTITION_ID_PATH]
						}
					},
					{
						offerThroughput: 400
					}
				);

			const db = client.database(this._config.databaseId);
			if (containerDefinition) {
				await db.container(containerDefinition.id).delete();
			}
		} catch {}
	}

	/**
	 * Create an SQL condition clause.
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
		attributeValues: { [id: string]: unknown }
	): string {
		// If no conditions are defined then return empty string
		if (Is.undefined(condition)) {
			return "";
		}

		if ("conditions" in condition) {
			if (condition.conditions.length === 0) {
				return "";
			}
			// It's a group of comparisons, so check the individual items and combine with the logical operator
			const joinConditions: string[] = condition.conditions.map(c =>
				this.buildQueryParameters(objectPath, c, attributeNames, attributeValues)
			);

			const logicalOperator = this.mapConditionalOperator(condition.logicalOperator);
			const queryClause = joinConditions
				.filter(j => j.length > 0)
				.map(j => j)
				.join(` ${logicalOperator} `);

			return Is.stringValue(queryClause) ? ` (${queryClause}) ` : "";
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

		return comparison;
	}

	/**
	 * Map the framework comparison operators to those in CosmosDB.
	 * @param objectPath The prefix to use for the condition.
	 * @param comparator The operator to map.
	 * @param type The type of the property.
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
		attributeValues: { [id: string]: unknown }
	): string {
		let prop = objectPath;
		if (prop.length > 0) {
			prop += ".";
		}
		prop += comparator.property as string;

		let attributeName = this.populateAttributeNames(prop, attributeNames);
		let propName = `${attributeName.replace(/\./g, "").replace(/@/g, "")}`;

		if (Is.array(comparator.value)) {
			const dbValues = comparator.value.map(v => this.propertyToDbValue(v, type));
			const arrAttributeNames = [];
			for (let i = 0; i < dbValues.length; i++) {
				const arrAttributeName = `${propName}${i}`;
				attributeValues[arrAttributeName] = dbValues[i];
				arrAttributeNames.push(arrAttributeName);
			}
			propName = attributeName;
			attributeName = `(${arrAttributeNames.map(name => `@${name}`).join(", ")})`;
		} else {
			attributeValues[propName] = comparator.value;
		}

		const matches = attributeName.split(".").length;
		if (matches && comparator.comparison === ComparisonOperator.Equals) {
			attributeName = attributeName
				.split(".")
				.map(part => `["${part}"]`)
				.join("");
			return `c${attributeName} = @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.Equals) {
			return `c.${attributeName} = @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.NotEquals) {
			return `c.${attributeName} <> @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.GreaterThan) {
			return `c.${attributeName} > @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.LessThan) {
			return `c.${attributeName} < @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.GreaterThanOrEqual) {
			return `c.${attributeName} >= @${propName}`;
		} else if (comparator.comparison === ComparisonOperator.LessThanOrEqual) {
			return `c.${attributeName} <= @${propName}`;
		} else if (
			typeof attributeValues[propName] === "object" &&
			comparator.comparison === ComparisonOperator.Includes
		) {
			return `array_contains(c.${attributeName}, @${propName})`;
		} else if (comparator.comparison === ComparisonOperator.Includes) {
			return `contains(c.${attributeName}, @${propName})`;
		} else if (comparator.comparison === ComparisonOperator.NotIncludes) {
			return `notContains(c.${attributeName}, @${propName})`;
		} else if (comparator.comparison === ComparisonOperator.In) {
			return `c.${propName} IN ${attributeName}`;
		}

		throw new GeneralError(this.CLASS_NAME, "comparisonNotSupported", {
			comparison: comparator.comparison
		});
	}

	/**
	 * Format a value to insert into DB.
	 * @param value The value to format.
	 * @param type The type for the property.
	 * @returns The value after conversion.
	 * @internal
	 */
	private propertyToDbValue(value: unknown, type?: EntitySchemaPropertyType): unknown {
		if (Is.object(value)) {
			const map: { [id: string]: unknown } = {};
			for (const key in value) {
				map[key] = this.propertyToDbValue(value[key]);
			}
			return map;
		}

		if (type === "integer" || type === "number") {
			return Coerce.string(value) ?? "";
		} else if (type === "boolean") {
			return Coerce.boolean(value) ?? false;
		}

		return Coerce.string(value) ?? "";
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
			const hashPart = `${part}`;
			if (Is.empty(attributeNames[hashPart])) {
				attributeNames[hashPart] = part;
			}
			attributeNameParts.push(hashPart);
		}

		return attributeNameParts.join(".");
	}

	/**
	 * Map the framework conditional operators to those in CosmosDB.
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
	 * Creates the CosmosDB container to be used if it doesn't exists in the context yet.
	 * @returns The existing container.
	 * @throws GeneralError if the container was not created.
	 * @internal
	 */
	private createContainer(): Container {
		if (this._container) {
			return this._container;
		}
		const client = new CosmosClient({
			endpoint: this._config.endpoint,
			key: this._config.key
		});

		this._container = client.database(this._config.databaseId).container(this._config.containerId);
		return this._container;
	}
}

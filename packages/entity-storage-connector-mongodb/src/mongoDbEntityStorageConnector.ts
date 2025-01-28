// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, GeneralError, Guards, Is, ObjectHelper } from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	EntitySchemaFactory,
	type IEntitySchema,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	MongoClient,
	type Db,
	type Collection,
	type WithId,
	type Sort,
	type Filter,
	type Document
} from "mongodb";
import type { IMongoDbEntityStorageConnectorConfig } from "./models/IMongoDbEntityStorageConnectorConfig";
import type { IMongoDbEntityStorageConnectorConstructorOptions } from "./models/IMongoDbEntityStorageConnectorConstructorOptions";

/**
 * Class for performing entity storage operations using MongoDb.
 */
export class MongoDbEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Limit the number of entities when finding.
	 * @internal
	 */
	private static readonly _PAGE_SIZE: number = 40;

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<MongoDbEntityStorageConnector>();

	/**
	 * The schema for the entity.
	 * @internal
	 */
	private readonly _entitySchema: IEntitySchema<T>;

	/**
	 * The configuration for the connector.
	 * @internal
	 */
	private readonly _config: IMongoDbEntityStorageConnectorConfig;

	/**
	 * The MongoDb client.
	 * @internal
	 */
	private readonly _client: MongoClient;

	/**
	 * The MongoDb database.
	 * @internal
	 */
	private _database: Db | undefined;

	/**
	 * The MongoDb collection.
	 * @internal
	 */
	private _collection: Collection | undefined;

	/**
	 * Create a new instance of MongoDbEntityStorageConnector.
	 * @param options The options for the connector.
	 */
	constructor(options: IMongoDbEntityStorageConnectorConstructorOptions) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object<IMongoDbEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.host), options.config.host);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.database), options.config.database);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.collection),
			options.config.collection
		);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);

		this._config = options.config;

		this._client = new MongoClient(this.createConnectionConfig());
	}

	/**
	 * Initialize the MongoDb environment.
	 * @param nodeLoggingConnectorType Optional type of the logging connector.
	 * @returns A promise that resolves to a boolean indicating success.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		try {
			await this._client.connect();

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "databaseCreating",
				data: {
					database: this._config.database
				}
			});

			// Create the database if it does not exist
			this._database = this._client.db(this._config.database);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "databaseExists",
				data: {
					database: this._config.database
				}
			});

			this._collection = await this._database.collection(this._config.collection);

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "collectionExists",
				data: {
					collection: this._config.collection
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
	 * Get an entity from MongoDb.
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
			const query: { [key: string]: unknown } = secondaryIndex ? { [secondaryIndex]: id } : { id };

			if (conditions) {
				for (const condition of conditions) {
					query[condition.property as string] = condition.value;
				}
			}

			const result = await this._collection?.findOne(query);
			return result as T | undefined;
		} catch (err) {
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
		const id = entity["id" as keyof T] as unknown as string;

		try {
			const filter: { [key: string]: unknown } = { id };

			if (Is.arrayValue(conditions)) {
				for (const condition of conditions) {
					filter[condition.property as string] = condition.value;
				}
			}

			await this._collection?.findOneAndUpdate(
				filter,
				{ $set: entity as Partial<Document> },
				{ upsert: true, returnDocument: "after" }
			);
		} catch (err) {
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
			const query: { [key: string]: unknown } = { id };

			if (conditions) {
				for (const condition of conditions) {
					query[condition.property as string] = condition.value;
				}
			}

			await this._collection?.deleteOne(query);
		} catch (err) {
			throw new GeneralError(this.CLASS_NAME, "removeFailed", { id }, err);
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
		const returnSize = pageSize ?? MongoDbEntityStorageConnector._PAGE_SIZE;

		const filter: Filter<T> = {};
		if (conditions) {
			this.buildQueryParameters("", conditions, filter);
		}

		const sort: Sort = {};
		if (Array.isArray(sortProperties)) {
			for (const sortProperty of sortProperties) {
				const direction = sortProperty.sortDirection === SortDirection.Ascending ? 1 : -1;
				sort[sortProperty.property as string] = direction;
			}
		}

		const projection: { [key: string]: number } = {};
		if (properties) {
			for (const property of properties) {
				projection[property as string] = 1;
			}
		}

		const cursorValue = cursor ? Number(cursor) : 0;
		const entities = await this._collection
			?.find(filter as Filter<Document>, { projection })
			.sort(sort)
			.skip(cursorValue)
			.limit(returnSize)
			.toArray();

		return {
			entities: (entities as unknown as Partial<T>[]) ?? [],
			cursor: entities?.length === returnSize ? String(cursorValue + returnSize) : undefined
		};
	}

	/**
	 * Drop the collection.
	 * @returns Nothing.
	 */
	public async collectionDrop(): Promise<void> {
		try {
			if (this._collection) {
				await this._collection.drop();
			}
		} catch {
			// Ignore errors
		}
	}

	/**
	 * Create a new DB connection configuration.
	 * @returns The dynamo db connection configuration.
	 * @internal
	 */
	private createConnectionConfig(): string {
		const { host, user, password, database } = this._config;
		if (user && password) {
			return `mongodb://${user}:${password}@${host}/${database}`;
		}
		return `mongodb://${host}/${database}`;
	}

	/**
	 * Create an MongoDB filter query.
	 * @param objectPath The path for the nested object.
	 * @param condition The conditions to create the query from.
	 * @param filter The filter query to use.
	 * @internal
	 */
	private buildQueryParameters(
		objectPath: string,
		condition: EntityCondition<T>,
		filter: Filter<T>
	): void {
		if (!condition) {
			return;
		}

		if ("conditions" in condition) {
			const subConditions: Filter<T>[] = condition.conditions.map(c => {
				const subFilter: Filter<T> = {};
				this.buildQueryParameters(objectPath, c, subFilter);
				return subFilter;
			});

			if (condition.logicalOperator === LogicalOperator.And) {
				filter.$and = subConditions as Filter<WithId<T>>[];
			} else if (condition.logicalOperator === LogicalOperator.Or) {
				filter.$or = subConditions as Filter<WithId<T>>[];
			} else {
				Object.assign(filter, subConditions[0]);
			}
		} else {
			const prop = objectPath ? `${objectPath}.${condition.property}` : String(condition.property);
			const comparison = this.mapComparisonOperator(condition.comparison, condition.value);

			(filter as { [key: string]: unknown })[prop] = comparison;
		}
	}

	/**
	 * Map the framework comparison operators to those in MongoDB.
	 * @param comparison The comparison operator.
	 * @param value The value to compare.
	 * @returns The MongoDB comparison expression.
	 * @internal
	 */
	private mapComparisonOperator(comparison: ComparisonOperator, value: unknown): unknown {
		switch (comparison) {
			case ComparisonOperator.Equals:
				return value;
			case ComparisonOperator.NotEquals:
				return { $ne: value };
			case ComparisonOperator.GreaterThan:
				return { $gt: value };
			case ComparisonOperator.LessThan:
				return { $lt: value };
			case ComparisonOperator.GreaterThanOrEqual:
				return { $gte: value };
			case ComparisonOperator.LessThanOrEqual:
				return { $lte: value };
			case ComparisonOperator.In:
				return { $in: Array.isArray(value) ? value : [value] };
			case ComparisonOperator.Includes:
				return { $elemMatch: { $eq: value } };
			default:
				throw new GeneralError(this.CLASS_NAME, "unsupportedComparisonOperator", { comparison });
		}
	}

	/**
	 * Verify the conditions for the entity.
	 * @param conditions The conditions to verify.
	 * @internal
	 */
	private verifyConditions(
		conditions: { property: keyof T; value: unknown }[],
		obj: { [key in keyof T]: unknown }
	): boolean {
		return conditions.every(
			condition => ObjectHelper.propertyGet(obj, condition.property as string) === condition.value
		);
	}
}

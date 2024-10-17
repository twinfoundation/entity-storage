// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	Firestore,
	type Settings,
	type CollectionReference,
	type Query,
	type DocumentSnapshot,
	type DocumentData
} from "@google-cloud/firestore";
import { BaseError, Converter, GeneralError, Guards, Is, ObjectHelper } from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	EntitySchemaFactory,
	EntitySchemaHelper,
	type IEntitySchema,
	type IEntitySchemaProperty,
	SortDirection
} from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { JWTInput } from "google-auth-library";
import type { IEntityWithIndexing } from "./models/IEntityWithIndexing";
import type { IFirestoreEntityStorageConnectorConfig } from "./models/IFirestoreEntityStorageConnectorConfig";
import type { IValueType } from "./models/IValueType";

/**
 * Class for performing entity storage operations using Firestore.
 */
export class FirestoreEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Limit the number of entities when finding.
	 * @internal
	 */
	private static readonly _PAGE_SIZE: number = 40;

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<FirestoreEntityStorageConnector>();

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
	private readonly _config: IFirestoreEntityStorageConnectorConfig;

	/**
	 * The Firestore client.
	 * @internal
	 */
	private readonly _firestoreClient: Firestore;

	/**
	 * Create a new instance of FirestoreEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.entitySchema The schema for the entity.
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to no logging.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		entitySchema: string;
		loggingConnectorType?: string;
		config: IFirestoreEntityStorageConnectorConfig;
	}) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object<IFirestoreEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.projectId), options.config.projectId);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.collectionName),
			options.config.collectionName
		);

		let credentials: JWTInput | undefined;
		if (!Is.empty(options.config.credentials)) {
			Guards.stringBase64(
				this.CLASS_NAME,
				nameof(options.config.credentials),
				options.config.credentials
			);
			credentials = ObjectHelper.fromBytes<JWTInput>(
				Converter.base64ToBytes(options.config.credentials)
			);
		}

		this._config = options.config;
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);

		const firestoreOptions: Settings = {
			projectId: this._config.projectId,
			...this._config.settings
		};

		if (this._config.endpoint) {
			firestoreOptions.host = this._config.endpoint;
			firestoreOptions.ssl = false;
		}

		if (this._config.keyFilename) {
			firestoreOptions.keyFilename = this._config.keyFilename;
		} else if (credentials) {
			firestoreOptions.credentials = credentials;
		}

		this._firestoreClient = new Firestore(firestoreOptions);
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

		try {
			// Firestore doesn't require explicit collection creation
			// Perform a small write operation to ensure connectivity
			const testDoc = this._firestoreClient.collection(this._config.collectionName).doc("test");
			await testDoc.set({ test: true });
			await testDoc.delete();

			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "firestoreConnected",
				data: {
					projectId: this._config.projectId,
					collectionName: this._config.collectionName
				}
			});

			return true;
		} catch (err) {
			await nodeLogging?.log({
				level: "error",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "firestoreConnectionFailed",
				error: BaseError.fromError(err),
				data: {
					projectId: this._config.projectId,
					collectionName: this._config.collectionName
				}
			});
			return false;
		}
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
	 * @param id The id of the entity to get.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(id: string): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		try {
			const docRef = this.getCollection().doc(id);
			const doc = await docRef.get();

			if (doc.exists) {
				return doc.data() as T;
			}
		} catch (err) {
			throw new GeneralError(this.CLASS_NAME, "getEntityFailed", { id }, err);
		}
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @returns Nothing.
	 */
	public async set(entity: T): Promise<void> {
		Guards.object(this.CLASS_NAME, nameof(entity), entity);

		try {
			const id = entity[this._primaryKey.property as keyof T] as string;

			const entityWithPossibleIndexing = entity as T & Partial<IEntityWithIndexing>;

			// Handle indexing field BEFORE cleaning undefined values
			if (
				entityWithPossibleIndexing.valueArray &&
				Is.array(entityWithPossibleIndexing.valueArray)
			) {
				const valueArrayFields = entityWithPossibleIndexing.valueArray
					.filter((item): item is IValueType => Is.notEmpty(item))
					.map(item => `${item.field}:${item.value}`);
				entityWithPossibleIndexing.valueArrayFields = valueArrayFields;
			}

			await this.getCollection()
				.doc(id)
				.set(entity as DocumentData);
		} catch (err) {
			throw new GeneralError(this.CLASS_NAME, "setEntityFailed", { entity }, err);
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
			await this.getCollection().doc(id).delete();
		} catch (err) {
			throw new GeneralError(this.CLASS_NAME, "removeEntityFailed", { id }, err);
		}
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The suggested number of entities to return in each chunk.
	 * @returns The matching entities and a cursor for the next page.
	 */
	public async query(
		conditions?: EntityCondition<T>,
		sortProperties?: { property: keyof T; sortDirection: SortDirection }[],
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
		const queryDescription: string[] = [];

		try {
			let query = this.getCollection() as Query;

			if (conditions) {
				query = this.applyConditions(query, conditions);
				queryDescription.push(`Conditions: ${JSON.stringify(conditions)}`);
			}

			if (sortProperties) {
				for (const { property, sortDirection } of sortProperties) {
					query = query.orderBy(
						property as string,
						sortDirection === SortDirection.Ascending ? "asc" : "desc"
					);
				}
				queryDescription.push(`Sort: ${JSON.stringify(sortProperties)}`);
			}

			if (cursor) {
				const cursorDoc = await this._firestoreClient?.doc(cursor).get();
				if (cursorDoc?.exists) {
					query = query.startAfter(cursorDoc);
				}
				queryDescription.push(`Cursor: ${cursor}`);
			}

			const limit = pageSize ?? FirestoreEntityStorageConnector._PAGE_SIZE;
			query = query.limit(limit);
			queryDescription.push(`Limit: ${limit}`);

			if (properties) {
				query = query.select(...(properties as string[]));
				queryDescription.push(`Properties: ${properties.join(", ")}`);
			}

			const querySnapshot = await query.get();
			const entities = querySnapshot.docs.map((doc: DocumentSnapshot) => doc.data() as T);

			let nextCursor: string | undefined;
			if (entities.length === limit) {
				nextCursor = querySnapshot.docs[querySnapshot.docs.length - 1].ref.path;
			}

			return {
				entities,
				cursor: nextCursor
			};
		} catch (err) {
			throw new GeneralError(
				this.CLASS_NAME,
				"queryFailed",
				{ queryDescription: queryDescription.join("; ") },
				err
			);
		}
	}

	/**
	 * Delete all entities in the collection.
	 * @returns Nothing.
	 * @internal
	 */
	public async collectionDelete(): Promise<void> {
		const collection = this.getCollection();
		const batchSize = 500;
		const query = collection.limit(batchSize);

		try {
			await this.deleteQueryBatch(query, batchSize);
		} catch (error) {
			throw new GeneralError(
				this.CLASS_NAME,
				"collectionDeleteFailed",
				{ collectionName: this._config.collectionName },
				error
			);
		}
	}

	/**
	 * Apply conditions to a Firestore query.
	 * @param query The initial query.
	 * @param condition The condition to apply.
	 * @returns The updated query.
	 * @internal
	 */
	private applyConditions(query: Query, condition: EntityCondition<T>): Query {
		if ("conditions" in condition) {
			// It's a group of conditions
			for (const c of condition.conditions) {
				query = this.applyConditions(query, c);
			}
			return query;
		}
		// It's a single condition
		const { property, value, comparison } = condition;
		switch (comparison) {
			case ComparisonOperator.Equals:
				return query.where(property as string, "==", value);
			case ComparisonOperator.NotEquals:
				return query.where(property as string, "!=", value);
			case ComparisonOperator.GreaterThan:
				return query.where(property as string, ">", value);
			case ComparisonOperator.LessThan:
				return query.where(property as string, "<", value);
			case ComparisonOperator.GreaterThanOrEqual:
				return query.where(property as string, ">=", value);
			case ComparisonOperator.LessThanOrEqual:
				return query.where(property as string, "<=", value);
			case ComparisonOperator.In:
				return query.where(property as string, "in", value as unknown[]);
			case ComparisonOperator.Includes:
				return query.where(property as string, "array-contains", value);
			default:
				throw new GeneralError(this.CLASS_NAME, "unsupportedComparisonOperator", { comparison });
		}
	}

	/**
	 * Get the Firestore collection for this entity.
	 * @returns The Firestore collection.
	 * @internal
	 */
	private getCollection(): CollectionReference {
		if (!this._firestoreClient) {
			throw new GeneralError(this.CLASS_NAME, "firestoreClientNotInitialized");
		}
		return this._firestoreClient.collection(this._config.collectionName);
	}

	/**
	 * Delete all entities in the collection.
	 * @returns Nothing.
	 * @internal
	 */
	private async deleteQueryBatch(query: Query, batchSize: number): Promise<void> {
		const snapshot = await query.get();

		if (snapshot.size === 0) {
			return;
		}

		const batch = this._firestoreClient?.batch();
		for (const doc of snapshot.docs) {
			batch?.delete(doc.ref);
		}

		await batch?.commit();

		if (snapshot.size === batchSize) {
			await this.deleteQueryBatch(query, batchSize);
		}
	}
}

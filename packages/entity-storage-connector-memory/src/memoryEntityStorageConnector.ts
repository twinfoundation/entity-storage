// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Coerce, Guards, Is, ObjectHelper } from "@gtsc/core";
import {
	EntityConditions,
	EntitySchemaFactory,
	EntitySchemaHelper,
	EntitySorter,
	type EntityCondition,
	type IEntitySchema,
	type IEntitySchemaProperty,
	type SortDirection
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";

/**
 * Class for performing entity storage operations in-memory.
 */
export class MemoryEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Default Page Size for cursor.
	 * @internal
	 */
	private static readonly _DEFAULT_PAGE_SIZE: number = 20;

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<MemoryEntityStorageConnector>();

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
	 * The storage for the in-memory items.
	 * @internal
	 */
	private readonly _store: { [partitionId: string]: T[] };

	/**
	 * Create a new instance of MemoryEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.entitySchema The schema for the entity.
	 */
	constructor(options: { entitySchema: string }) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);
		this._store = {};
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param requestContext The context for the request.
	 * @returns The object if it can be found or undefined, if non partitioned request then partitionId is included in items.
	 */
	public async get(
		id: string,
		secondaryIndex?: keyof T,
		requestContext?: IServiceRequestContext
	): Promise<(T & { partitionId?: string }) | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		const partitionId = requestContext?.partitionId;
		const isPartitioned = Is.stringValue(partitionId);

		const partitionsToSearch: string[] = isPartitioned ? [partitionId] : Object.keys(this._store);

		for (const partition of partitionsToSearch) {
			const store = this._store[partition];
			const found = store?.find(entity => entity[lookupKey] === id);

			if (found) {
				const result: T & { partitionId?: string } = {
					...found
				};
				if (!isPartitioned) {
					result.partitionId = partition;
				}
				return result;
			}
		}

		return undefined;
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param requestContext The context for the request.
	 * @returns The id of the entity.
	 */
	public async set(entity: T, requestContext?: IServiceRequestContext): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

		this._store[requestContext.partitionId] ??= [];

		const existingIndex = this._store[requestContext.partitionId].findIndex(
			e => e[this._primaryKey.property] === entity[this._primaryKey.property]
		);
		if (existingIndex >= 0) {
			this._store[requestContext.partitionId][existingIndex] = entity;
		} else {
			this._store[requestContext.partitionId].push(entity);
		}
	}

	/**
	 * Remove the entity.
	 * @param id The id of the entity to remove.
	 * @param requestContext The context for the request.
	 * @returns Nothing.
	 */
	public async remove(id: string, requestContext?: IServiceRequestContext): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(requestContext?.partitionId),
			requestContext?.partitionId
		);

		const index =
			this._store[requestContext.partitionId]?.findIndex(
				e => e[this._primaryKey.property] === id
			) ?? -1;
		if (index >= 0) {
			this._store[requestContext.partitionId].splice(index, 1);
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
		const partitionId = requestContext?.partitionId;
		const isPartitioned = Is.stringValue(partitionId);

		let allEntities: (T & { partitionId?: string })[] = [];
		if (isPartitioned) {
			allEntities = (this._store[partitionId] as (T & { partitionId?: string })[]) ?? [];
		} else {
			for (const partition of Object.keys(this._store)) {
				allEntities = allEntities.concat(
					this._store[partition].map(e => ({ ...e, partitionId: partition }))
				);
			}
		}

		const entities = [];
		const finalPageSize = pageSize ?? MemoryEntityStorageConnector._DEFAULT_PAGE_SIZE;
		let nextCursor: string | undefined;
		let totalEntities = 0;
		if (allEntities.length > 0) {
			const finalSortKeys = EntitySchemaHelper.buildSortProperties<T>(
				this._entitySchema,
				sortProperties
			);
			allEntities = EntitySorter.sort(allEntities, finalSortKeys);

			const startIndex = Coerce.number(cursor) ?? 0;

			totalEntities = startIndex;

			for (let i = startIndex; i < allEntities.length; i++) {
				if (EntityConditions.check(allEntities[i], conditions)) {
					totalEntities++;
					if (entities.length < finalPageSize) {
						entities.push(ObjectHelper.pick(allEntities[i], properties));
						if (entities.length >= finalPageSize) {
							nextCursor = (i + 1).toString();
						}
					}
				}
			}
		}

		return {
			entities,
			cursor: nextCursor,
			pageSize: finalPageSize,
			totalEntities
		};
	}

	/**
	 * Get the memory store for the specified partition.
	 * @param partitionId The partition id.
	 * @returns The store.
	 */
	public getStore(partitionId: string): T[] | undefined {
		return this._store[partitionId];
	}
}

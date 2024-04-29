// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Coerce, Guards, ObjectHelper } from "@gtsc/core";
import {
	EntityConditions,
	EntityPropertyDescriptor,
	EntitySorter,
	type EntityCondition,
	type IEntityDescriptor,
	type IEntityPropertyDescriptor,
	type SortDirection
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { nameof } from "@gtsc/nameof";
import type { IRequestContext } from "@gtsc/services";
import type { IMemoryEntityStorageConnectorConfig } from "./models/IMemoryEntityStorageConnectorConfig";

/**
 * Class for performing entity storage operations in-memory.
 */
export class MemoryEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Runtime name for the class.
	 * @internal
	 */
	private static readonly _CLASS_NAME: string = nameof<MemoryEntityStorageConnector>();

	/**
	 * Default Page Size for cursor.
	 * @internal
	 */
	private static readonly _DEFAULT_PAGE_SIZE: number = 20;

	/**
	 * The descriptor for the entity.
	 * @internal
	 */
	private readonly _entityDescriptor: IEntityDescriptor<T>;

	/**
	 * The primary key.
	 * @internal
	 */
	private readonly _primaryKey: IEntityPropertyDescriptor<T>;

	/**
	 * The storage for the in-memory items.
	 * @internal
	 */
	private readonly _store: { [tenantId: string]: T[] };

	/**
	 * Create a new instance of MemoryEntityStorageConnector.
	 * @param entityDescriptor The descriptor for the entity.
	 * @param config The configuration for the entity storage connector.
	 */
	constructor(
		entityDescriptor: IEntityDescriptor<T>,
		config?: IMemoryEntityStorageConnectorConfig<T>
	) {
		Guards.object<IEntityDescriptor<T>>(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(entityDescriptor),
			entityDescriptor
		);
		Guards.array(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(entityDescriptor.properties),
			entityDescriptor.properties
		);
		this._entityDescriptor = entityDescriptor;
		this._primaryKey = EntityPropertyDescriptor.getPrimaryKey<T>(entityDescriptor);
		this._store = config?.initialValues ?? {};
	}

	/**
	 * Get an entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(
		requestContext: IRequestContext,
		id: string,
		secondaryIndex?: keyof T
	): Promise<T | undefined> {
		Guards.string(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);

		Guards.stringValue(MemoryEntityStorageConnector._CLASS_NAME, nameof(id), id);

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		const found = this._store[requestContext.tenantId]?.find(entity => entity[lookupKey] === id);
		if (found) {
			return found;
		}

		return undefined;
	}

	/**
	 * Set an entity.
	 * @param requestContext The context for the request.
	 * @param entity The entity to set.
	 * @returns The id of the entity.
	 */
	public async set(requestContext: IRequestContext, entity: T): Promise<void> {
		Guards.string(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		Guards.object<T>(MemoryEntityStorageConnector._CLASS_NAME, nameof(entity), entity);

		this._store[requestContext.tenantId] ??= [];

		const existingIndex = this._store[requestContext.tenantId].findIndex(
			e => e[this._primaryKey.property] === entity[this._primaryKey.property]
		);
		if (existingIndex >= 0) {
			this._store[requestContext.tenantId][existingIndex] = entity;
		} else {
			this._store[requestContext.tenantId].push(entity);
		}
	}

	/**
	 * Remove the entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to remove.
	 * @returns Nothing.
	 */
	public async remove(requestContext: IRequestContext, id: string): Promise<void> {
		Guards.string(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		Guards.stringValue(MemoryEntityStorageConnector._CLASS_NAME, nameof(id), id);

		const index =
			this._store[requestContext.tenantId]?.findIndex(e => e[this._primaryKey.property] === id) ??
			-1;
		if (index >= 0) {
			this._store[requestContext.tenantId].splice(index, 1);
		}
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param requestContext The context for the request.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		requestContext: IRequestContext,
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
		Guards.object(MemoryEntityStorageConnector._CLASS_NAME, nameof(requestContext), requestContext);
		Guards.string(
			MemoryEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);

		let allEntities = this._store[requestContext.tenantId] ?? [];
		const entities = [];
		const finalPageSize = pageSize ?? MemoryEntityStorageConnector._DEFAULT_PAGE_SIZE;
		let nextCursor: string | undefined;
		if (allEntities.length > 0) {
			const finalSortKeys = EntityPropertyDescriptor.buildSortProperties<T>(
				this._entityDescriptor,
				sortProperties
			);
			allEntities = EntitySorter.sort(allEntities, finalSortKeys);

			const startIndex = Coerce.number(cursor) ?? 0;

			for (let i = startIndex; i < allEntities.length; i++) {
				if (EntityConditions.check(allEntities[i], conditions)) {
					entities.push(ObjectHelper.pick(allEntities[i], properties));
					if (entities.length >= finalPageSize) {
						nextCursor = (i + 1).toString();
						break;
					}
				}
			}
		}

		return {
			entities,
			cursor: nextCursor,
			pageSize: finalPageSize,
			totalEntities: allEntities.length
		};
	}

	/**
	 * Get the memory store for the specified tenant.
	 * @param tenantId The tenant id.
	 * @returns The store.
	 */
	public getStore(tenantId: string): T[] | undefined {
		return this._store[tenantId];
	}
}

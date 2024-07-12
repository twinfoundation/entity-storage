// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { EntityCondition, SortDirection } from "@gtsc/entity";
import type { IService, IServiceRequestContext } from "@gtsc/services";

/**
 * Interface describing an entity storage connector.
 */
export interface IEntityStorageConnector<T = unknown> extends IService {
	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param requestContext The context for the request.
	 * @returns The object if it can be found or undefined, if non partitioned request then partitionId is included in items.
	 */
	get(
		id: string,
		secondaryIndex?: keyof T,
		requestContext?: IServiceRequestContext
	): Promise<(T & { partitionId?: string }) | undefined>;

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param requestContext The context for the request.
	 * @returns The id of the entity.
	 */
	set(entity: T, requestContext?: IServiceRequestContext): Promise<void>;

	/**
	 * Remove the entity.
	 * @param id The id of the entity to remove.
	 * @param requestContext The context for the request.
	 * @returns Nothing.
	 */
	remove(id: string, requestContext?: IServiceRequestContext): Promise<void>;

	/**
	 * Query all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @param requestContext The context for the request.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	query(
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
	}>;
}

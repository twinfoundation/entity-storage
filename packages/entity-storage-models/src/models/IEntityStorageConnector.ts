// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { SortDirection, Condition } from "@gtsc/entity";
import type { IRequestContext, IService } from "@gtsc/services";

/**
 * Interface describing an entity storage connector.
 */
export interface IEntityStorageConnector<T = unknown> extends IService {
	/**
	 * Get an entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @returns The object if it can be found or undefined.
	 */
	get(
		requestContext: IRequestContext,
		id: string,
		secondaryIndex?: keyof T
	): Promise<T | undefined>;

	/**
	 * Set an entity.
	 * @param requestContext The context for the request.
	 * @param entity The entity to set.
	 * @returns The id of the entity.
	 */
	set(requestContext: IRequestContext, entity: T): Promise<void>;

	/**
	 * Remove the entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to remove.
	 * @returns Nothing.
	 */
	remove(requestContext: IRequestContext, id: string): Promise<void>;

	/**
	 * Query all the entities which match the conditions.
	 * @param requestContext The context for the request.
	 * @param conditions The conditions to match for the entities.
	 * @param sortKeys The optional sort order.
	 * @param keys The optional keys to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	query(
		requestContext: IRequestContext,
		conditions?: Condition<T>,
		sortKeys?: {
			name: keyof T;
			sortDirection: SortDirection;
		}[],
		keys?: (keyof T)[],
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
	}>;
}

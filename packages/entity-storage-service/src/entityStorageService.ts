// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, Is, NotFoundError, ObjectHelper } from "@twin.org/core";
import {
	ComparisonOperator,
	type EntityCondition,
	EntitySchemaHelper,
	LogicalOperator,
	SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageComponent,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import type { IEntityStorageServiceConstructorOptions } from "./models/IEntityStorageServiceConstructorOptions";

/**
 * Class for performing entity service operations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EntityStorageService<T = any> implements IEntityStorageComponent<T> {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<EntityStorageService>();

	/**
	 * The entity storage for items.
	 * @internal
	 */
	private readonly _entityStorage: IEntityStorageConnector<T>;

	/**
	 * Include the node identity when performing storage operations, defaults to true.
	 * @internal
	 */
	private readonly _includeNodeIdentity: boolean;

	/**
	 * Include the user identity when performing storage operations, defaults to true.
	 * @internal
	 */
	private readonly _includeUserIdentity: boolean;

	/**
	 * Create a new instance of EntityStorageService.
	 * @param options The dependencies for the entity storage service.
	 */
	constructor(options: IEntityStorageServiceConstructorOptions) {
		Guards.string(this.CLASS_NAME, nameof(options.entityStorageType), options.entityStorageType);
		this._entityStorage = EntityStorageConnectorFactory.get<IEntityStorageConnector<T>>(
			options.entityStorageType
		);
		this._includeNodeIdentity = options.config?.includeNodeIdentity ?? true;
		this._includeUserIdentity = options.config?.includeUserIdentity ?? true;
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param userIdentity The user identity to use with storage operations.
	 * @param nodeIdentity The node identity to use with storage operations.
	 * @returns The id of the entity.
	 */
	public async set(entity: T, userIdentity?: string, nodeIdentity?: string): Promise<void> {
		Guards.object(this.CLASS_NAME, nameof(entity), entity);

		const conditions: {
			property: keyof T;
			value: unknown;
		}[] = [];
		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			conditions.push({
				property: "userIdentity" as keyof T,
				value: userIdentity
			});
			ObjectHelper.propertySet(entity, "userIdentity", userIdentity);
		}
		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			conditions.push({
				property: "nodeIdentity" as keyof T,
				value: nodeIdentity
			});
			ObjectHelper.propertySet(entity, "nodeIdentity", nodeIdentity);
		}

		return this._entityStorage.set(entity, conditions);
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param userIdentity The user identity to use with storage operations.
	 * @param nodeIdentity The node identity to use with storage operations.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(
		id: string,
		secondaryIndex?: keyof T,
		userIdentity?: string,
		nodeIdentity?: string
	): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		return this.internalGet(id, secondaryIndex, userIdentity, nodeIdentity);
	}

	/**
	 * Remove the entity.
	 * @param id The id of the entity to remove.
	 * @param userIdentity The user identity to use with storage operations.
	 * @param nodeIdentity The node identity to use with storage operations.
	 * @returns Nothing.
	 */
	public async remove(id: string, userIdentity?: string, nodeIdentity?: string): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		const conditions: {
			property: keyof T;
			value: unknown;
		}[] = [];
		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			conditions.push({
				property: "userIdentity" as keyof T,
				value: userIdentity
			});
		}
		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			conditions.push({
				property: "nodeIdentity" as keyof T,
				value: nodeIdentity
			});
		}

		await this._entityStorage.remove(id, conditions);
	}

	/**
	 * Query all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param orderBy The order for the results.
	 * @param orderByDirection The direction for the order, defaults to ascending.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The suggested number of entities to return in each chunk, in some scenarios can return a different amount.
	 * @param userIdentity The user identity to use with storage operations.
	 * @param nodeIdentity The node identity to use with storage operations.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 */
	public async query(
		conditions?: EntityCondition<T>,
		orderBy?: keyof T,
		orderByDirection?: SortDirection,
		properties?: (keyof T)[],
		cursor?: string,
		pageSize?: number,
		userIdentity?: string,
		nodeIdentity?: string
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
		const finalConditions: EntityCondition<T> = {
			conditions: [],
			logicalOperator: LogicalOperator.And
		};

		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			finalConditions.conditions.push({
				property: "nodeIdentity",
				comparison: ComparisonOperator.Equals,
				value: nodeIdentity
			});
		}
		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			finalConditions.conditions.push({
				property: "userIdentity",
				comparison: ComparisonOperator.Equals,
				value: userIdentity
			});
		}

		if (!Is.empty(conditions)) {
			finalConditions.conditions.push(conditions);
		}

		const result = await this._entityStorage.query(
			finalConditions.conditions.length > 0 ? finalConditions : undefined,
			Is.stringValue(orderBy)
				? [{ property: orderBy, sortDirection: orderByDirection ?? SortDirection.Ascending }]
				: undefined,
			properties,
			cursor,
			pageSize
		);

		for (const entity of result.entities) {
			ObjectHelper.propertyDelete(entity, "nodeIdentity");
			ObjectHelper.propertyDelete(entity, "userIdentity");
		}

		return result;
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @param userIdentity The user identity to use with storage operations.
	 * @param nodeIdentity The node identity to use with storage operations.
	 * @returns The object if it can be found or throws.
	 * @internal
	 */
	private async internalGet(
		id: string,
		secondaryIndex?: keyof T,
		userIdentity?: string,
		nodeIdentity?: string
	): Promise<T> {
		const conditions: EntityCondition<T>[] = [];

		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			conditions.push({
				property: "userIdentity",
				comparison: ComparisonOperator.Equals,
				value: userIdentity
			});
		}
		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			conditions.push({
				property: "nodeIdentity",
				comparison: ComparisonOperator.Equals,
				value: nodeIdentity
			});
		}
		if (Is.stringValue(secondaryIndex)) {
			conditions.push({
				property: secondaryIndex,
				comparison: ComparisonOperator.Equals,
				value: id
			});
		}

		let entity: T | undefined;
		if (conditions.length === 0) {
			entity = await this._entityStorage.get(id, secondaryIndex);
		} else {
			if (!Is.stringValue(secondaryIndex)) {
				const schema = this._entityStorage.getSchema();
				const primaryKey = EntitySchemaHelper.getPrimaryKey(schema);

				conditions.unshift({
					property: primaryKey.property,
					comparison: ComparisonOperator.Equals,
					value: id
				});
			}

			const results = await this._entityStorage.query(
				{
					conditions,
					logicalOperator: LogicalOperator.And
				},
				undefined,
				undefined,
				undefined,
				1
			);

			entity = results.entities[0] as T;
		}

		if (Is.empty(entity)) {
			throw new NotFoundError(this.CLASS_NAME, "entityNotFound", id);
		}

		ObjectHelper.propertyDelete(entity, "nodeIdentity");
		ObjectHelper.propertyDelete(entity, "userIdentity");

		return entity;
	}
}

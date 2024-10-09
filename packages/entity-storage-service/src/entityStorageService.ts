// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Guards, Is, NotFoundError, ObjectHelper } from "@twin.org/core";
import {
	ComparisonOperator,
	LogicalOperator,
	type SortDirection,
	type EntityCondition,
	EntitySchemaHelper
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageComponent,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import type { IEntityStorageConfig } from "./models/IEntityStorageConfig";

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
	 * @param options.config The configuration for the service.
	 * @param options.entityStorageType The entity storage type.
	 */
	constructor(options: { entityStorageType: string; config?: IEntityStorageConfig }) {
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

		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			ObjectHelper.propertySet(entity, "userIdentity", userIdentity);
		}

		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			ObjectHelper.propertySet(entity, "nodeIdentity", nodeIdentity);
		}

		return this._entityStorage.set(entity);
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

		if (conditions.length === 0) {
			const entity = await this._entityStorage.get(id, secondaryIndex);
			if (Is.empty(entity)) {
				throw new NotFoundError(this.CLASS_NAME, "entityNotFound", id);
			}

			ObjectHelper.propertyDelete(entity, "nodeIdentity");
			ObjectHelper.propertyDelete(entity, "userIdentity");

			return entity;
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

		const entity = results.entities[0];

		if (Is.empty(entity)) {
			throw new NotFoundError(this.CLASS_NAME, "entityNotFound", id);
		}

		ObjectHelper.propertyDelete(entity, "nodeIdentity");
		ObjectHelper.propertyDelete(entity, "userIdentity");

		return entity as T;
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

		if (conditions.length === 0) {
			const entity = await this._entityStorage.get(id);
			if (Is.empty(entity)) {
				throw new NotFoundError(this.CLASS_NAME, "entityNotFound", id);
			}

			await this._entityStorage.remove(id);
		} else {
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

			if (results.entities.length > 0) {
				const firstEntity = results.entities[0] as T;
				const schema = this._entityStorage.getSchema();
				const primaryKey = EntitySchemaHelper.getPrimaryKey(schema);
				await this._entityStorage.remove(firstEntity[primaryKey.property] as string);
			} else {
				throw new NotFoundError(this.CLASS_NAME, "entityNotFound", id);
			}
		}
	}

	/**
	 * Query all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
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
		sortProperties?: {
			property: keyof T;
			sortDirection: SortDirection;
		}[],
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
		const conditionsList: EntityCondition<T>[] = [];

		if (this._includeUserIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(userIdentity), userIdentity);
			conditionsList.push({
				property: "userIdentity",
				comparison: ComparisonOperator.Equals,
				value: userIdentity
			});
		}
		if (this._includeNodeIdentity) {
			Guards.stringValue(this.CLASS_NAME, nameof(nodeIdentity), nodeIdentity);
			conditionsList.push({
				property: "nodeIdentity",
				comparison: ComparisonOperator.Equals,
				value: nodeIdentity
			});
		}

		const finalConditions: EntityCondition<T> = {
			conditions: conditionsList,
			logicalOperator: LogicalOperator.And
		};
		if (!Is.empty(conditions)) {
			finalConditions.conditions.push(conditions);
		}

		const result = await this._entityStorage.query(
			finalConditions,
			sortProperties,
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
}

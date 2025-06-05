// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComponentFactory, Guards } from "@twin.org/core";
import {
	type EntityCondition,
	EntitySchemaFactory,
	EntitySchemaHelper,
	type IEntitySchema,
	type SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import type { IDecentralisedEntityStorageConnectorConstructorOptions } from "./models/IDecentralisedEntityStorageConnectorConstructorOptions";
import type { ISynchronisedEntity } from "./models/ISynchronisedEntity";
import type { SynchronisedStorageService } from "./synchronisedStorageService";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class DecentralisedEntityStorageConnector<
	T extends ISynchronisedEntity = ISynchronisedEntity
> implements IEntityStorageConnector<T>
{
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<DecentralisedEntityStorageConnector>();

	/**
	 * The schema for the entity.
	 * @internal
	 */
	private readonly _entitySchema: IEntitySchema<T>;

	/**
	 * The entity storage connector to use for actual data.
	 * @internal
	 */
	private readonly _entityStorageConnector: IEntityStorageConnector<T>;

	/**
	 * The synchronised storage service to use for synchronised storage operations.
	 * @internal
	 */
	private readonly _synchronisedStorageService: SynchronisedStorageService<T>;

	/**
	 * Create a new instance of DecentralisedEntityStorageConnector.
	 * @param options The options for the connector.
	 */
	constructor(options: IDecentralisedEntityStorageConnectorConstructorOptions) {
		Guards.object<IDecentralisedEntityStorageConnectorConstructorOptions>(
			this.CLASS_NAME,
			nameof(options),
			options
		);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.entityStorageConnectorType),
			options.entityStorageConnectorType
		);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.synchronisedStorageConnectorType),
			options.synchronisedStorageConnectorType
		);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);

		this._entityStorageConnector = EntityStorageConnectorFactory.get(
			options.entityStorageConnectorType
		);

		this._synchronisedStorageService = ComponentFactory.get(
			options.synchronisedStorageConnectorType
		);
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

		return this._entityStorageConnector.get(id, secondaryIndex, conditions);
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param conditions The optional conditions to match for the entities.
	 * @returns The id of the entity.
	 */
	public async set(entity: T, conditions?: { property: keyof T; value: unknown }[]): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		await this._synchronisedStorageService.prepareEntityForSync(entity);

		EntitySchemaHelper.validateEntity(entity, this.getSchema());

		await this._entityStorageConnector.set(entity, conditions);

		await this._synchronisedStorageService.syncEntitySet(entity);
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

		await this._entityStorageConnector.remove(id, conditions);

		await this._synchronisedStorageService.syncEntityRemove(id);
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
		return this._entityStorageConnector.query(
			conditions,
			sortProperties,
			properties,
			cursor,
			pageSize
		);
	}
}

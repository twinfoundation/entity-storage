// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseError, Coerce, Guards, Is, ObjectHelper } from "@gtsc/core";
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
import { LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import type { IFileEntityStorageConnectorConfig } from "./models/IFileEntityStorageConnectorConfig";

/**
 * Class for performing entity storage operations in file.
 */
export class FileEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Default Page Size for cursor.
	 * @internal
	 */
	private static readonly _DEFAULT_PAGE_SIZE: number = 20;

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<FileEntityStorageConnector>();

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
	 * The directory to use for storage.
	 * @internal
	 */
	private readonly _directory: string;

	/**
	 * Create a new instance of FileEntityStorageConnector.
	 * @param options The options for the connector.
	 * @param options.entitySchema The name of the entity schema.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: { entitySchema: string; config: IFileEntityStorageConnectorConfig }) {
		Guards.object(this.CLASS_NAME, nameof(options), options);
		Guards.stringValue(this.CLASS_NAME, nameof(options.entitySchema), options.entitySchema);
		Guards.object(this.CLASS_NAME, nameof(options.config), options.config);
		Guards.stringValue(this.CLASS_NAME, nameof(options.config.directory), options.config.directory);
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);
		this._directory = path.resolve(options.config.directory);
	}

	/**
	 * Bootstrap the connector by creating and initializing any resources it needs.
	 * @param systemLoggingConnectorType The system logging connector type, defaults to "system-logging".
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(systemLoggingConnectorType?: string): Promise<void> {
		const systemLogging = LoggingConnectorFactory.getIfExists(
			systemLoggingConnectorType ?? "system-logging"
		);

		if (!(await this.dirExists(this._directory))) {
			await systemLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "directoryCreating",
				data: {
					directory: this._directory
				}
			});

			try {
				await mkdir(this._directory, { recursive: true });

				await systemLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "directoryCreated",
					data: {
						directory: this._directory
					}
				});
			} catch (err) {
				await systemLogging?.log({
					level: "error",
					source: this.CLASS_NAME,
					message: "directoryCreateFailed",
					data: {
						directory: this._directory
					},
					error: BaseError.fromError(err)
				});
			}
		} else {
			await systemLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "directoryExists",
				data: {
					directory: this._directory
				}
			});
		}
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

		const partitionsToSearch: string[] = [];

		const partitionId = requestContext?.partitionId;
		const isPartitioned = Is.stringValue(partitionId);
		if (isPartitioned) {
			partitionsToSearch.push(partitionId);
		} else {
			partitionsToSearch.push(...(await this.readPartitionIndex()));
		}

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		for (const partition of partitionsToSearch) {
			const store = await this.readPartitionStore(partition);

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

		const store = await this.readPartitionStore(requestContext.partitionId);

		const existingIndex = store.findIndex(
			e => e[this._primaryKey.property] === entity[this._primaryKey.property]
		);
		if (existingIndex >= 0) {
			store[existingIndex] = entity;
		} else {
			store.push(entity);
		}

		await this.writePartitionStore(requestContext.partitionId, store);

		const partitionIndex = await this.readPartitionIndex();
		if (!partitionIndex.includes(requestContext.partitionId)) {
			partitionIndex.push(requestContext.partitionId);
			await this.writePartitionIndex(partitionIndex);
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

		const store = await this.readPartitionStore(requestContext.partitionId);

		const index = store.findIndex(e => e[this._primaryKey.property] === id);
		if (index >= 0) {
			store.splice(index, 1);
		}

		await this.writePartitionStore(requestContext.partitionId, store);

		const partitionIndex = await this.readPartitionIndex();
		const partitionIdx = partitionIndex.indexOf(requestContext.partitionId);
		if (partitionIdx >= 0 && store.length === 0) {
			partitionIndex.splice(partitionIdx, 1);
			await this.writePartitionIndex(partitionIndex);
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
			allEntities = (await this.readPartitionStore(partitionId)) as (T & {
				partitionId?: string;
			})[];
		} else {
			const partitionIndex = await this.readPartitionIndex();
			for (const partition of partitionIndex) {
				const store = await this.readPartitionStore(partition);
				allEntities = allEntities.concat(store.map(e => ({ ...e, partitionId: partition })));
			}
		}

		const entities = [];
		const finalPageSize = pageSize ?? FileEntityStorageConnector._DEFAULT_PAGE_SIZE;
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
	 * Read the partition index from file.
	 * @returns The partition index.
	 */
	private async readPartitionIndex(): Promise<string[]> {
		try {
			const filename = path.join(this._directory, "partition-index.json");
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as string[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the partition index to the file.
	 * @param partitionIds The partition ids to write in the index.
	 * @returns Nothing.
	 */
	private async writePartitionIndex(partitionIds: string[]): Promise<void> {
		try {
			const filename = path.join(this._directory, "partition-index.json");
			await writeFile(filename, JSON.stringify(partitionIds, undefined, "\t"), "utf8");
		} catch {}
	}

	/**
	 * Read the store from file.
	 * @param partitionId The partition id to read the store for.
	 * @returns The store for the partition.
	 */
	private async readPartitionStore(partitionId: string): Promise<T[]> {
		try {
			const filename = path.join(this._directory, `${partitionId}.json`);
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as T[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the store to the file.
	 * @param partitionId The partition id to write the store for.
	 * @param store The store to write.
	 * @returns Nothing.
	 */
	private async writePartitionStore(partitionId: string, store: T[]): Promise<void> {
		try {
			const filename = path.join(this._directory, `${partitionId}.json`);
			await writeFile(filename, JSON.stringify(store, undefined, "\t"), "utf8");
		} catch {}
	}

	/**
	 * Check if the dir exists.
	 * @param dir The directory to check.
	 * @returns True if the dir exists.
	 * @internal
	 */
	private async dirExists(dir: string): Promise<boolean> {
		try {
			await access(dir);
			return true;
		} catch {
			return false;
		}
	}
}

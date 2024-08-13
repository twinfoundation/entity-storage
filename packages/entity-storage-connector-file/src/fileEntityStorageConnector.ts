// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseError, Coerce, Guards, ObjectHelper } from "@gtsc/core";
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
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @returns True if the bootstrapping process was successful.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		if (!(await this.dirExists(this._directory))) {
			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "directoryCreating",
				data: {
					directory: this._directory
				}
			});

			try {
				await mkdir(this._directory, { recursive: true });

				await nodeLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "directoryCreated",
					data: {
						directory: this._directory
					}
				});
			} catch (err) {
				await nodeLogging?.log({
					level: "error",
					source: this.CLASS_NAME,
					message: "directoryCreateFailed",
					data: {
						directory: this._directory
					},
					error: BaseError.fromError(err)
				});
				return false;
			}
		} else {
			await nodeLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "directoryExists",
				data: {
					directory: this._directory
				}
			});
		}
		return true;
	}

	/**
	 * Get an entity.
	 * @param id The id of the entity to get, or the index value if secondaryIndex is set.
	 * @param secondaryIndex Get the item using a secondary index.
	 * @returns The object if it can be found or undefined.
	 */
	public async get(id: string, secondaryIndex?: keyof T): Promise<T | undefined> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		const store = await this.readStore();

		const found = store?.find(entity => entity[lookupKey] === id);

		if (found) {
			return found;
		}

		return undefined;
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @returns The id of the entity.
	 */
	public async set(entity: T): Promise<void> {
		Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

		const store = await this.readStore();

		const existingIndex = store.findIndex(
			e => e[this._primaryKey.property] === entity[this._primaryKey.property]
		);
		if (existingIndex >= 0) {
			store[existingIndex] = entity;
		} else {
			store.push(entity);
		}

		await this.writeStore(store);
	}

	/**
	 * Remove the entity.
	 * @param id The id of the entity to remove.
	 * @returns Nothing.
	 */
	public async remove(id: string): Promise<void> {
		Guards.stringValue(this.CLASS_NAME, nameof(id), id);

		const store = await this.readStore();

		const index = store.findIndex(e => e[this._primaryKey.property] === id);
		if (index >= 0) {
			store.splice(index, 1);
		}

		await this.writeStore(store);
	}

	/**
	 * Find all the entities which match the conditions.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional properties to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
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
		/**
		 * Number of entities to return.
		 */
		pageSize?: number;
		/**
		 * Total entities length.
		 */
		totalEntities: number;
	}> {
		let allEntities = await this.readStore();

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
	 * Read the store from file.
	 * @returns The store.
	 */
	private async readStore(): Promise<T[]> {
		try {
			const filename = path.join(this._directory, "store.json");
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as T[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the store to the file.
	 * @param store The store to write.
	 * @returns Nothing.
	 */
	private async writeStore(store: T[]): Promise<void> {
		try {
			const filename = path.join(this._directory, "store.json");
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

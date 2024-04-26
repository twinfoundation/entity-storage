// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BaseError, Coerce, Guards, ObjectHelper } from "@gtsc/core";
import {
	type EntityCondition,
	EntityConditions,
	EntityPropertyDescriptor,
	EntitySorter,
	type IEntityDescriptor,
	type IEntityPropertyDescriptor,
	type SortDirection
} from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import type { ILoggingProvider } from "@gtsc/logging-provider-models";
import { nameof } from "@gtsc/nameof";
import type { IRequestContext } from "@gtsc/services";
import type { IFileEntityStorageConnectorConfig } from "./models/IFileEntityStorageConnectorConfig";

/**
 * Class for performing entity storage operations in file.
 */
export class FileEntityStorageConnector<T = unknown> implements IEntityStorageConnector<T> {
	/**
	 * Runtime name for the class.
	 * @internal
	 */
	private static readonly _CLASS_NAME: string = nameof<FileEntityStorageConnector>();

	/**
	 * Default Page Size for cursor.
	 * @internal
	 */
	private static readonly _DEFAULT_PAGE_SIZE: number = 20;

	/**
	 * The logging service.
	 * @internal
	 */
	private readonly _loggingService: ILoggingProvider;

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
	 * The directory to use for storage.
	 * @internal
	 */
	private readonly _directory: string;

	/**
	 * The base filename to use for storage.
	 * @internal
	 */
	private readonly _baseFilename: string;

	/**
	 * Create a new instance of FileEntityStorageConnector.
	 * @param dependencies The dependencies for the service.
	 * @param dependencies.loggingService The logging service.
	 * @param entityDescriptor The descriptor for the entity.
	 * @param config The configuration for the entity storage connector.
	 */
	constructor(
		dependencies: {
			loggingService: ILoggingProvider;
		},
		entityDescriptor: IEntityDescriptor<T>,
		config: IFileEntityStorageConnectorConfig
	) {
		Guards.object<IEntityDescriptor<T>>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(dependencies),
			dependencies
		);
		Guards.object<IEntityDescriptor<T>>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(dependencies.loggingService),
			dependencies.loggingService
		);
		Guards.object<IEntityDescriptor<T>>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(entityDescriptor),
			entityDescriptor
		);
		Guards.array(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(entityDescriptor.properties),
			entityDescriptor.properties
		);
		Guards.object<IEntityDescriptor<T>>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(config),
			config
		);
		Guards.string(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(config.directory),
			config.directory
		);
		Guards.string(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(config.baseFilename),
			config.baseFilename
		);
		this._loggingService = dependencies.loggingService;
		this._entityDescriptor = entityDescriptor;
		this._primaryKey = EntityPropertyDescriptor.getPrimaryKey<T>(entityDescriptor);
		this._directory = path.resolve(config.directory);
		this._baseFilename = config.baseFilename;
	}

	/**
	 * Bootstrap the service by creating and initializing any resources it needs.
	 * @param requestContext The request context for bootstrapping.
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(requestContext: IRequestContext): Promise<void> {
		if (!(await this.dirExists(this._directory))) {
			this._loggingService.log(requestContext, {
				level: "info",
				source: FileEntityStorageConnector._CLASS_NAME,
				message: "directoryCreating",
				data: {
					directory: this._directory
				}
			});

			try {
				await mkdir(this._directory, { recursive: true });

				this._loggingService.log(requestContext, {
					level: "info",
					source: FileEntityStorageConnector._CLASS_NAME,
					message: "directoryCreated",
					data: {
						directory: this._directory
					}
				});
			} catch (err) {
				this._loggingService.log(requestContext, {
					level: "error",
					source: FileEntityStorageConnector._CLASS_NAME,
					message: "directoryCreateFailed",
					data: {
						directory: this._directory
					},
					error: BaseError.fromError(err)
				});
			}
		} else {
			this._loggingService.log(requestContext, {
				level: "info",
				source: FileEntityStorageConnector._CLASS_NAME,
				message: "directoryExists",
				data: {
					directory: this._directory
				}
			});
		}
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
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);

		Guards.stringValue(FileEntityStorageConnector._CLASS_NAME, nameof(id), id);

		const store = await this.readTenantStore(requestContext.tenantId);

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		const found = store.find(entity => entity[lookupKey] === id);
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
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		Guards.object<T>(FileEntityStorageConnector._CLASS_NAME, nameof(entity), entity);

		const store = await this.readTenantStore(requestContext.tenantId);

		const existingIndex = store.findIndex(
			e => e[this._primaryKey.property] === entity[this._primaryKey.property]
		);
		if (existingIndex >= 0) {
			store[existingIndex] = entity;
		} else {
			store.push(entity);
		}

		await this.writeTenantStore(requestContext.tenantId, store);
	}

	/**
	 * Remove the entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to remove.
	 * @returns Nothing.
	 */
	public async remove(requestContext: IRequestContext, id: string): Promise<void> {
		Guards.string(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		Guards.stringValue(FileEntityStorageConnector._CLASS_NAME, nameof(id), id);

		const store = await this.readTenantStore(requestContext.tenantId);

		const index = store.findIndex(e => e[this._primaryKey.property] === id);
		if (index >= 0) {
			store.splice(index, 1);
		}

		await this.writeTenantStore(requestContext.tenantId, store);
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
		Guards.object(FileEntityStorageConnector._CLASS_NAME, nameof(requestContext), requestContext);
		Guards.string(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		let allEntities = await this.readTenantStore(requestContext.tenantId);
		const entities = [];
		const finalPageSize = pageSize ?? FileEntityStorageConnector._DEFAULT_PAGE_SIZE;
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
	 * Read the store from file.
	 * @param tenantId The tenant id to read the store for.
	 * @returns The store for the tenant.
	 */
	private async readTenantStore(tenantId: string): Promise<T[]> {
		try {
			const filename = path.join(this._directory, `${tenantId}_${this._baseFilename}.json`);
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as T[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the store to the file.
	 * @param tenantId The tenant id to read the store for.
	 * @param store The store to write.
	 * @returns Nothing.
	 */
	private async writeTenantStore(tenantId: string, store: T[]): Promise<void> {
		try {
			const filename = path.join(this._directory, `${tenantId}_${this._baseFilename}.json`);
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

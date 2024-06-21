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
import { LoggingConnectorFactory, type ILoggingConnector } from "@gtsc/logging-models";
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
	 * The logging connector.
	 * @internal
	 */
	private readonly _logging: ILoggingConnector;

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
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to "logging".
	 * @param options.entitySchema The name of the entity schema.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		loggingConnectorType?: string;
		entitySchema: string;
		config: IFileEntityStorageConnectorConfig;
	}) {
		Guards.object(FileEntityStorageConnector._CLASS_NAME, nameof(options), options);
		Guards.stringValue(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(options.entitySchema),
			options.entitySchema
		);
		Guards.object(FileEntityStorageConnector._CLASS_NAME, nameof(options.config), options.config);
		Guards.stringValue(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(options.config.directory),
			options.config.directory
		);
		this._logging = LoggingConnectorFactory.get(options.loggingConnectorType ?? "logging");
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);
		this._directory = path.resolve(options.config.directory);
	}

	/**
	 * Bootstrap the connector by creating and initializing any resources it needs.
	 * @param requestContext The request context for bootstrapping.
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(requestContext: IRequestContext): Promise<void> {
		if (!(await this.dirExists(this._directory))) {
			this._logging.log(requestContext, {
				level: "info",
				source: FileEntityStorageConnector._CLASS_NAME,
				message: "directoryCreating",
				data: {
					directory: this._directory
				}
			});

			try {
				await mkdir(this._directory, { recursive: true });

				this._logging.log(requestContext, {
					level: "info",
					source: FileEntityStorageConnector._CLASS_NAME,
					message: "directoryCreated",
					data: {
						directory: this._directory
					}
				});
			} catch (err) {
				this._logging.log(requestContext, {
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
			this._logging.log(requestContext, {
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
	 * @returns The object if it can be found or undefined, if request context was wildcard then tenantId is also included.
	 */
	public async get(
		requestContext: IRequestContext,
		id: string,
		secondaryIndex?: keyof T
	): Promise<(T & { tenantId?: string }) | undefined> {
		Guards.object<IRequestContext>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext),
			requestContext
		);
		Guards.stringValue(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);

		Guards.stringValue(FileEntityStorageConnector._CLASS_NAME, nameof(id), id);

		const tenantsToSearch = [];

		if (requestContext.tenantId === "*") {
			tenantsToSearch.push(...(await this.readTenantIndex()));
		} else {
			tenantsToSearch.push(requestContext.tenantId);
		}

		const lookupKey = secondaryIndex ?? this._primaryKey.property;

		for (const tenantId of tenantsToSearch) {
			const store = await this.readTenantStore(tenantId);

			const found = store?.find(entity => entity[lookupKey] === id);

			if (found) {
				const result: T & { tenantId?: string } = {
					...found
				};
				if (requestContext.tenantId === "*") {
					result.tenantId = tenantId;
				}
				return result;
			}
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
		Guards.object<IRequestContext>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext),
			requestContext
		);
		Guards.stringValue(
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

		const tenantIndex = await this.readTenantIndex();
		if (!tenantIndex.includes(requestContext.tenantId)) {
			tenantIndex.push(requestContext.tenantId);
			await this.writeTenantIndex(tenantIndex);
		}
	}

	/**
	 * Remove the entity.
	 * @param requestContext The context for the request.
	 * @param id The id of the entity to remove.
	 * @returns Nothing.
	 */
	public async remove(requestContext: IRequestContext, id: string): Promise<void> {
		Guards.object<IRequestContext>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext),
			requestContext
		);
		Guards.stringValue(
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

		const tenantIndex = await this.readTenantIndex();
		const tenantIdx = tenantIndex.indexOf(requestContext.tenantId);
		if (tenantIdx >= 0 && store.length === 0) {
			tenantIndex.splice(tenantIdx, 1);
			await this.writeTenantIndex(tenantIndex);
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
		 * If the request context was wildcard then tenantId is also included.
		 */
		entities: Partial<T & { tenantId?: string }>[];
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
		Guards.object<IRequestContext>(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext),
			requestContext
		);
		Guards.stringValue(
			FileEntityStorageConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);

		let allEntities: (T & { tenantId?: string })[] = [];
		if (requestContext.tenantId === "*") {
			const tenantIndex = await this.readTenantIndex();
			for (const tenantId of tenantIndex) {
				const store = await this.readTenantStore(tenantId);
				allEntities = allEntities.concat(store.map(e => ({ ...e, tenantId })));
			}
		} else {
			allEntities = (await this.readTenantStore(requestContext.tenantId)) as (T & {
				tenantId?: string;
			})[];
		}

		const entities = [];
		const finalPageSize = pageSize ?? FileEntityStorageConnector._DEFAULT_PAGE_SIZE;
		let nextCursor: string | undefined;
		if (allEntities.length > 0) {
			const finalSortKeys = EntitySchemaHelper.buildSortProperties<T>(
				this._entitySchema,
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
	 * Read the tenant index from file.
	 * @returns The tenant index.
	 */
	private async readTenantIndex(): Promise<string[]> {
		try {
			const filename = path.join(this._directory, "tenant-index.json");
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as string[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the tenant index to the file.
	 * @param tenantIds The tenant ids to write in the index.
	 * @returns Nothing.
	 */
	private async writeTenantIndex(tenantIds: string[]): Promise<void> {
		try {
			const filename = path.join(this._directory, "tenant-index.json");
			await writeFile(filename, JSON.stringify(tenantIds, undefined, "\t"), "utf8");
		} catch {}
	}

	/**
	 * Read the store from file.
	 * @param tenantId The tenant id to read the store for.
	 * @returns The store for the tenant.
	 */
	private async readTenantStore(tenantId: string): Promise<T[]> {
		try {
			const filename = path.join(this._directory, `${tenantId}.json`);
			const store = await readFile(filename, "utf8");
			return JSON.parse(store) as T[];
		} catch {
			return [];
		}
	}

	/**
	 * Write the store to the file.
	 * @param tenantId The tenant id to write the store for.
	 * @param store The store to write.
	 * @returns Nothing.
	 */
	private async writeTenantStore(tenantId: string, store: T[]): Promise<void> {
		try {
			const filename = path.join(this._directory, `${tenantId}.json`);
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

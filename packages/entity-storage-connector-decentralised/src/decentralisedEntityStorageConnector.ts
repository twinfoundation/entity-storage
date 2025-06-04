// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	BlobStorageConnectorFactory,
	type IBlobStorageConnector
} from "@twin.org/blob-storage-models";
import { BaseError, GeneralError, Guards, Is } from "@twin.org/core";
import {
	type EntityCondition,
	EntitySchemaFactory,
	EntitySchemaHelper,
	type IEntitySchema,
	type IEntitySchemaProperty,
	type SortDirection
} from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { IdentityConnectorFactory, type IIdentityConnector } from "@twin.org/identity-models";
import { type ILoggingConnector, LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import {
	type IVerifiableStorageConnector,
	VerifiableStorageConnectorFactory
} from "@twin.org/verifiable-storage-models";
import type { SyncSnapshotEntry } from "./entities/syncSnapshotEntry";
import { ChangeSetHelper } from "./helpers/changeSetHelper";
import { LocalSyncStateHelper } from "./helpers/localSyncStateHelper";
import { RemoteSyncStateHelper } from "./helpers/remoteSyncStateHelper";
import type { IDecentralisedEntity } from "./models/IDecentralisedEntity";
import type { IDecentralisedEntityStorageConnectorConfig } from "./models/IDecentralisedEntityStorageConnectorConfig";
import type { IDecentralisedEntityStorageConnectorConstructorOptions } from "./models/IDecentralisedEntityStorageConnectorConstructorOptions";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class DecentralisedEntityStorageConnector<
	T extends IDecentralisedEntity = IDecentralisedEntity
> implements IEntityStorageConnector<T>
{
	/**
	 * The default interval to check for entity updates, defaults to 5 mins.
	 * @internal
	 */
	private static readonly _DEFAULT_ENTITY_UPDATE_INTERVAL_MS: number = 300000;

	/**
	 * The default interval to perform consolidation, defaults to 60 mins.
	 * @internal
	 */
	private static readonly _DEFAULT_CONSOLIDATION_INTERVAL_MS: number = 3600000;

	/**
	 * The default size of a consolidation batch.
	 * @internal
	 */
	private static readonly _DEFAULT_CONSOLIDATION_BATCH_SIZE: number = 1000;

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
	 * The primary key.
	 * @internal
	 */
	private readonly _primaryKey: IEntitySchemaProperty<T>;

	/**
	 * The entity storage connector to use for actual data.
	 * @internal
	 */
	private readonly _entityStorageConnector: IEntityStorageConnector<T>;

	/**
	 * The storage connector for the sync snapshot entries.
	 * @internal
	 */
	private readonly _localSyncSnapshotEntryEntityStorage: IEntityStorageConnector<
		SyncSnapshotEntry<T>
	>;

	/**
	 * The blob storage connector to use for remote sync states.
	 * @internal
	 */
	private readonly _blobStorageConnector: IBlobStorageConnector;

	/**
	 * The verifiable storage connector to use for storing sync pointers.
	 * @internal
	 */
	private readonly _verifiableSyncPointerStorageConnector: IVerifiableStorageConnector;

	/**
	 * The identity connector to use for signing/verifying changesets.
	 * @internal
	 */
	private readonly _identityConnector: IIdentityConnector;

	/**
	 * The local sync state helper to use for applying changesets.
	 * @internal
	 */
	private readonly _localSyncStateHelper: LocalSyncStateHelper<T>;

	/**
	 * The remote sync state helper to use for applying changesets.
	 * @internal
	 */
	private readonly _remoteSyncStateHelper: RemoteSyncStateHelper<T>;

	/**
	 * The change set helper to use for applying changesets.
	 * @internal
	 */
	private readonly _changeSetHelper: ChangeSetHelper<T>;

	/**
	 * The options for the connector.
	 * @internal
	 */
	private readonly _config: Required<IDecentralisedEntityStorageConnectorConfig>;

	/**
	 * The timer id for checking for entity updates.
	 * @internal
	 */
	private _entityUpdateTimer: NodeJS.Timeout | undefined;

	/**
	 * The timer id for consolidation.
	 * @internal
	 */
	private _consolidationTimer: NodeJS.Timeout | undefined;

	/**
	 * The identity of the node this connector is running on.
	 * @internal
	 */
	private _nodeIdentity?: string;

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
		Guards.object<IDecentralisedEntityStorageConnectorConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);
		Guards.stringValue(
			this.CLASS_NAME,
			nameof(options.config.verifiableStorageKey),
			options.config.verifiableStorageKey
		);
		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);

		const requiredProperties: (keyof IDecentralisedEntity)[] = ["nodeIdentity", "dateCreated"];

		for (const requiredProperty of requiredProperties) {
			const foundProperty = this._entitySchema.properties?.find(
				prop => prop.property === requiredProperty
			);
			if (Is.empty(foundProperty)) {
				throw new GeneralError(this.CLASS_NAME, "missingRequiredProperty", { requiredProperty });
			} else if (Is.empty(foundProperty.isSecondary) && Is.empty(foundProperty.sortDirection)) {
				throw new GeneralError(this.CLASS_NAME, "missingRequiredPropertySort", {
					requiredProperty
				});
			}
		}

		this._entityStorageConnector = EntityStorageConnectorFactory.get(
			options.entityStorageConnectorType
		);

		this._localSyncSnapshotEntryEntityStorage = EntityStorageConnectorFactory.get(
			options.syncSnapshotStorageConnectorType ?? "sync-snapshot-entry"
		);

		this._verifiableSyncPointerStorageConnector = VerifiableStorageConnectorFactory.get(
			options.verifiableStorageConnectorType ?? "verifiable-storage"
		);

		this._blobStorageConnector = BlobStorageConnectorFactory.get(
			options.blobStorageConnectorType ?? "blob-storage"
		);

		this._identityConnector = IdentityConnectorFactory.get(
			options.identityConnectorType ?? "identity"
		);

		this._config = {
			entityUpdateIntervalMs:
				options.config.entityUpdateIntervalMs ??
				DecentralisedEntityStorageConnector._DEFAULT_ENTITY_UPDATE_INTERVAL_MS,
			verifiableStorageKey: options.config.verifiableStorageKey ?? "verifiable-storage",
			decentralisedStorageMethodId:
				options.config.decentralisedStorageMethodId ?? "decentralised-storage-assertion",
			isAuthoritativeNode: options.config.isAuthoritativeNode ?? false,
			consolidationIntervalMs:
				options.config.consolidationIntervalMs ??
				DecentralisedEntityStorageConnector._DEFAULT_CONSOLIDATION_INTERVAL_MS,
			consolidationBatchSize:
				options.config.consolidationBatchSize ??
				DecentralisedEntityStorageConnector._DEFAULT_CONSOLIDATION_BATCH_SIZE,
			remoteSyncEndpoint: options.config.remoteSyncEndpoint ?? ""
		};

		if (!this._config.isAuthoritativeNode) {
			Guards.stringValue(
				this.CLASS_NAME,
				nameof(this._config.remoteSyncEndpoint),
				this._config.remoteSyncEndpoint
			);
		}

		this._changeSetHelper = new ChangeSetHelper<T>(
			this._entityStorageConnector,
			this._blobStorageConnector,
			this._identityConnector,
			this._config.decentralisedStorageMethodId,
			this._primaryKey
		);

		this._localSyncStateHelper = new LocalSyncStateHelper<T>(
			this._localSyncSnapshotEntryEntityStorage,
			this._changeSetHelper
		);
		this._remoteSyncStateHelper = new RemoteSyncStateHelper<T>(
			this._entityStorageConnector,
			this._blobStorageConnector,
			this._verifiableSyncPointerStorageConnector,
			this._changeSetHelper,
			this._config.verifiableStorageKey
		);
	}

	/**
	 * Bootstrap the connector by creating and initializing any resources it needs.
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @returns True if the bootstrapping process was successful.
	 */
	public async bootstrap(nodeLoggingConnectorType?: string): Promise<boolean> {
		return true;
	}

	/**
	 * The component needs to be started when the node is initialized.
	 * @param nodeIdentity The identity of the node starting the component.
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @param componentState A persistent state which can be modified by the method.
	 * @returns Nothing.
	 */
	public async start(
		nodeIdentity: string,
		nodeLoggingConnectorType: string | undefined,
		componentState?: {
			[id: string]: unknown;
		}
	): Promise<void> {
		const nodeLogging = LoggingConnectorFactory.getIfExists(
			nodeLoggingConnectorType ?? "node-logging"
		);

		this._nodeIdentity = nodeIdentity;

		await this.startEntitySync(nodeLogging);

		if (this._config.isAuthoritativeNode) {
			await this.startConsolidationSync(nodeLogging);
		}
	}

	/**
	 * The component needs to be stopped when the node is closed.
	 * @param nodeIdentity The identity of the node stopping the component.
	 * @param nodeLoggingConnectorType The node logging connector type, defaults to "node-logging".
	 * @param componentState A persistent state which can be modified by the method.
	 * @returns Nothing.
	 */
	public async stop(
		nodeIdentity: string,
		nodeLoggingConnectorType: string | undefined,
		componentState?: { [id: string]: unknown }
	): Promise<void> {
		if (Is.notEmpty(this._entityUpdateTimer)) {
			clearTimeout(this._entityUpdateTimer);
			this._entityUpdateTimer = undefined;
		}
		if (Is.notEmpty(this._consolidationTimer)) {
			clearTimeout(this._consolidationTimer);
			this._consolidationTimer = undefined;
		}
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

		// Make sure the entity has the node identity set
		// as we only create sync snapshots for entities created by this node
		// it is the responsibility of other nodes to sync their entities
		entity.nodeIdentity = this._nodeIdentity ?? "";
		entity.dateCreated = new Date(Date.now()).toISOString();

		EntitySchemaHelper.validateEntity(entity, this.getSchema());

		await this._entityStorageConnector.set(entity, conditions);

		// Add the local change to the sync snapshot, we only store id for the change
		// as the entity is already stored in the entity storage and we will retrieve it
		// when we need to create the changeset
		const primaryKey = entity[this._primaryKey.property] as string;
		await this._localSyncStateHelper.addLocalChange("set", primaryKey);
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

		await this._localSyncStateHelper.addLocalChange("delete", id);
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

	/**
	 * Start the sync with further updates after an interval.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async startEntitySync(logging: ILoggingConnector | undefined): Promise<void> {
		// If the update interval is set to 0, we don't perform any updates
		if (this._config.entityUpdateIntervalMs > 0) {
			try {
				// First we check for remote changes
				await this.updateFromRemoteSyncState(logging);

				// Now send any updates we have to the remote storage
				await this.updateFromLocalSyncState(logging);
			} catch (error) {
				console.error(error);
				await logging?.log({
					level: "error",
					source: this.CLASS_NAME,
					message: "entitySyncFailed",
					error: BaseError.fromError(error)
				});
			} finally {
				// Set a timer to check for updates again
				this._entityUpdateTimer = setTimeout(
					async () => this.startEntitySync(logging),
					this._config.entityUpdateIntervalMs
				);
			}
		}
	}

	/**
	 * Check for updates in the remote decentralised storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async updateFromRemoteSyncState(logging: ILoggingConnector | undefined): Promise<void> {
		// Get the verifiable sync pointer from the verifiable storage
		const verifiableSyncPointer =
			await this._remoteSyncStateHelper.getVerifiableSyncPointer(logging);

		if (!Is.empty(verifiableSyncPointer)) {
			// Load the sync state from the remote blob storage using the sync pointer
			// to load the sync state
			const remoteSyncState = await this._remoteSyncStateHelper.getRemoteSyncState(
				logging,
				verifiableSyncPointer.syncPointerId
			);

			// If we got the sync state we can try and sync from it
			if (!Is.undefined(remoteSyncState)) {
				await this._localSyncStateHelper.syncFromRemote(logging, remoteSyncState);
			}
		}
	}

	/**
	 * Find any local updates and send them to the remote storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async updateFromLocalSyncState(logging: ILoggingConnector | undefined): Promise<void> {
		if (Is.stringValue(this._nodeIdentity)) {
			// Ge the current local change snapshot
			const localChangeSnapshot = await this._localSyncStateHelper.getLocalChangeSnapshot();

			if (!Is.empty(localChangeSnapshot)) {
				// Send the local changes to the remote storage
				const complete = await this._remoteSyncStateHelper.updateFromLocalSyncState(
					logging,
					localChangeSnapshot,
					this._nodeIdentity
				);

				// If the local change snapshot was successfully sent to the remote storage
				// we can remove it from the local storage, otherwise we keep it
				// so we can try to send it again next time
				if (complete) {
					await this._localSyncStateHelper.removeLocalChangeSnapshot(logging, localChangeSnapshot);
				}
			}
		}
	}

	/**
	 * Start the consolidation sync.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async startConsolidationSync(logging: ILoggingConnector | undefined): Promise<void> {
		// If the consolidation interval is set to 0, we don't perform any consolidation
		if (this._config.consolidationIntervalMs > 0) {
			let localChangeSnapshot: SyncSnapshotEntry<T> | undefined;
			try {
				// If we are performing a consolidation, we can remove the local changes
				await this._localSyncStateHelper.getLocalChangeSnapshot();
				if (!Is.empty(localChangeSnapshot)) {
					await this._localSyncStateHelper.removeLocalChangeSnapshot(logging, localChangeSnapshot);
				}

				if (Is.stringValue(this._nodeIdentity)) {
					await this._remoteSyncStateHelper.consolidateFromLocal(
						logging,
						this._nodeIdentity,
						this._config.consolidationBatchSize ??
							DecentralisedEntityStorageConnector._DEFAULT_CONSOLIDATION_BATCH_SIZE
					);

					// The consolidation was successful, so we can remove the local change snapshot permanently
					localChangeSnapshot = undefined;
				}
			} catch (error) {
				if (localChangeSnapshot) {
					// If the consolidation failed, we can keep the local change snapshot
					await this._localSyncStateHelper.setLocalChangeSnapshot(localChangeSnapshot);
				}
				await logging?.log({
					level: "error",
					source: this.CLASS_NAME,
					message: "consolidationSyncFailed",
					error: BaseError.fromError(error)
				});
			} finally {
				// Set a timer to perform the consolidation again
				this._consolidationTimer = setTimeout(
					async () => this.startConsolidationSync(logging),
					this._config.consolidationIntervalMs
				);
			}
		}
	}
}

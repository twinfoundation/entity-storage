// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	BlobStorageConnectorFactory,
	type IBlobStorageConnector
} from "@twin.org/blob-storage-models";
import { BaseError, ComponentFactory, GeneralError, Guards, Is } from "@twin.org/core";
import {
	EntitySchemaFactory,
	EntitySchemaHelper,
	type IEntitySchema,
	type IEntitySchemaProperty
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
import type { ISynchronisedEntity } from "./models/ISynchronisedEntity";
import type { ISynchronisedStorageComponent } from "./models/ISynchronisedStorageComponent";
import type { ISynchronisedStorageServiceConfig } from "./models/ISynchronisedStorageServiceConfig";
import type { ISynchronisedStorageServiceConstructorOptions } from "./models/ISynchronisedStorageServiceConstructorOptions";
import type { ITrustedSynchronisedStorageComponent } from "./models/ITrustedSynchronisedStorageComponent";

/**
 * Class for performing synchronised storage operations.
 */
export class SynchronisedStorageService<T extends ISynchronisedEntity = ISynchronisedEntity>
	implements ISynchronisedStorageComponent<T>
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
	public readonly CLASS_NAME: string = nameof<SynchronisedStorageService>();

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
	 * The synchronised storage service to use when this is not a trusted node.
	 * @internal
	 */
	private readonly _trustedSynchronisedStorageComponent?: ITrustedSynchronisedStorageComponent;

	/**
	 * The change set helper.
	 * @internal
	 */
	private readonly _changeSetHelper: ChangeSetHelper<T>;

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
	 * The options for the connector.
	 * @internal
	 */
	private readonly _config: Required<ISynchronisedStorageServiceConfig>;

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
	 * Create a new instance of SynchronisedStorageService.
	 * @param options The options for the service.
	 */
	constructor(options: ISynchronisedStorageServiceConstructorOptions) {
		Guards.object<ISynchronisedStorageServiceConstructorOptions>(
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
		Guards.object<ISynchronisedStorageServiceConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);

		this._entitySchema = EntitySchemaFactory.get(options.entitySchema);
		this._primaryKey = EntitySchemaHelper.getPrimaryKey<T>(this._entitySchema);

		const requiredProperties: (keyof ISynchronisedEntity)[] = ["nodeIdentity", "dateCreated"];

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

		this._entityStorageConnector = EntityStorageConnectorFactory.get<IEntityStorageConnector<T>>(
			options.entityStorageConnectorType
		);

		this._localSyncSnapshotEntryEntityStorage = EntityStorageConnectorFactory.get<
			IEntityStorageConnector<SyncSnapshotEntry<T>>
		>(options.syncSnapshotStorageConnectorType ?? "sync-snapshot-entry");

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
			synchronisedStorageKey: options.config.synchronisedStorageKey,
			synchronisedStorageMethodId:
				options.config.synchronisedStorageMethodId ?? "synchronised-storage-assertion",
			entityUpdateIntervalMs:
				options.config.entityUpdateIntervalMs ??
				SynchronisedStorageService._DEFAULT_ENTITY_UPDATE_INTERVAL_MS,
			isTrustedNode: options.config.isTrustedNode ?? false,
			consolidationIntervalMs:
				options.config.consolidationIntervalMs ??
				SynchronisedStorageService._DEFAULT_CONSOLIDATION_INTERVAL_MS,
			consolidationBatchSize:
				options.config.consolidationBatchSize ??
				SynchronisedStorageService._DEFAULT_CONSOLIDATION_BATCH_SIZE
		};

		// If this is not a trusted node, we need to use a synchronised storage service
		// to synchronise with a trusted node.
		if (!this._config.isTrustedNode) {
			Guards.stringValue(
				this.CLASS_NAME,
				nameof(options.trustedSynchronisedStorageComponentType),
				options.trustedSynchronisedStorageComponentType
			);
			this._trustedSynchronisedStorageComponent =
				ComponentFactory.get<ITrustedSynchronisedStorageComponent>(
					options.trustedSynchronisedStorageComponentType
				);
		}

		this._changeSetHelper = new ChangeSetHelper<T>(
			this._entityStorageConnector,
			this._blobStorageConnector,
			this._identityConnector,
			this._config.synchronisedStorageMethodId,
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
			this._changeSetHelper
		);
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

		if (this._config.entityUpdateIntervalMs > 0) {
			await this.startEntitySync(nodeLogging);
		}

		if (this._config.isTrustedNode && this._config.consolidationIntervalMs > 0) {
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
	 * Prepares an entry for synchronisation.
	 * @param entity The entity to prepare for synchronisation.
	 */
	public async prepareEntityForSync(entity: T): Promise<void> {
		// Make sure the entity has the node identity set
		// as we only create sync snapshots for entities created by this node
		// it is the responsibility of other nodes to sync their entities
		entity.nodeIdentity = this._nodeIdentity ?? "";
		entity.dateCreated = new Date(Date.now()).toISOString();
	}

	/**
	 * Synchronise an entity storage operation.
	 * @param entity The entity to synchronise.
	 * @returns Nothing.
	 */
	public async syncEntitySet(entity: T): Promise<void> {
		// Add the local change to the sync snapshot, we only store id for the change
		// as the entity is already stored in the entity storage and we will retrieve it
		// when we need to create the changeset
		const primaryKey = entity[this._primaryKey.property] as string;
		await this._localSyncStateHelper.addLocalChange("set", primaryKey);
	}

	/**
	 * Synchronise an entity removal operation.
	 * @param id The id of the entity to synchronise.
	 * @returns Nothing.
	 */
	public async syncEntityRemove(id: string): Promise<void> {
		await this._localSyncStateHelper.addLocalChange("delete", id);
	}

	/**
	 * Start the sync with further updates after an interval.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async startEntitySync(logging: ILoggingConnector | undefined): Promise<void> {
		try {
			// First we check for remote changes
			await this.updateFromRemoteSyncState(logging);

			// Now send any updates we have to the remote storage
			await this.updateFromLocalSyncState(logging);
		} catch (error) {
			// console.log(error);
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

	/**
	 * Check for updates in the remote storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async updateFromRemoteSyncState(logging: ILoggingConnector | undefined): Promise<void> {
		// Get the verifiable sync pointer from the verifiable storage
		const verifiableSyncPointer = await this._remoteSyncStateHelper.getVerifiableSyncPointer(
			logging,
			this._config.synchronisedStorageKey
		);

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
				const changeSetStorageId = await this._remoteSyncStateHelper.createAndStoreChangeSet(
					logging,
					localChangeSnapshot.changes,
					this._nodeIdentity
				);

				if (Is.stringValue(changeSetStorageId)) {
					// Send the local changes to the remote storage if we are a trusted node
					if (this._config.isTrustedNode) {
						await this._remoteSyncStateHelper.addChangeSetToSyncState(
							logging,
							this._config.synchronisedStorageKey,
							changeSetStorageId
						);
					} else if (!Is.empty(this._trustedSynchronisedStorageComponent)) {
						// If we are not a trusted node, we need to send the changes to the trusted node
						await this._trustedSynchronisedStorageComponent.syncChangeSet(changeSetStorageId);
					}

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
					this._config.synchronisedStorageKey,
					this._config.consolidationBatchSize ??
						SynchronisedStorageService._DEFAULT_CONSOLIDATION_BATCH_SIZE
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

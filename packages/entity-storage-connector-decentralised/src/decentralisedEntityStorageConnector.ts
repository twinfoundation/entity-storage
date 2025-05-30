// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	BlobStorageConnectorFactory,
	type IBlobStorageConnector
} from "@twin.org/blob-storage-models";
import {
	BaseError,
	Compression,
	CompressionType,
	Converter,
	GeneralError,
	Guards,
	Is,
	NotFoundError,
	ObjectHelper,
	RandomHelper
} from "@twin.org/core";
import type { IJsonLdNodeObject } from "@twin.org/data-json-ld";
import {
	ComparisonOperator,
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
import {
	DocumentHelper,
	IdentityConnectorFactory,
	IdentityResolverConnectorFactory,
	type IIdentityConnector,
	type IIdentityResolverConnector
} from "@twin.org/identity-models";
import { type ILoggingConnector, LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { type IProof, ProofTypes } from "@twin.org/standards-w3c-did";
import {
	type IVerifiableStorageConnector,
	VerifiableStorageConnectorFactory
} from "@twin.org/verifiable-storage-models";
import type { SyncSnapshotEntry } from "./entities/syncSnapshotEntry";
import type { IDecentralisedEntity } from "./models/IDecentralisedEntity";
import type { IDecentralisedEntityStorageConnectorConfig } from "./models/IDecentralisedEntityStorageConnectorConfig";
import type { IDecentralisedEntityStorageConnectorConstructorOptions } from "./models/IDecentralisedEntityStorageConnectorConstructorOptions";
import type { ISyncChangeSet } from "./models/ISyncChangeSet";
import type { ISyncSnapshot } from "./models/ISyncSnapshot";
import type { ISyncState } from "./models/ISyncState";
import type { IVerifiableSyncPointer } from "./models/IVerifiableSyncPointer";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class DecentralisedEntityStorageConnector<
	T extends IDecentralisedEntity = IDecentralisedEntity
> implements IEntityStorageConnector<T>
{
	/**
	 * The default interval to check for updates.
	 * @internal
	 */
	private static readonly _DEFAULT_UPDATE_CHECK_INTERVAL_MS: number = 300000;

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
	 * The logging connector to use for logging.
	 * @internal
	 */
	private readonly _loggingConnector?: ILoggingConnector;

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
	 * The identity resolver connector to use for verifying changesets.
	 * @internal
	 */
	private readonly _identityResolverConnector: IIdentityResolverConnector;

	/**
	 * The key to use for the verifiable storage.
	 * @internal
	 */
	private readonly _verifiableStorageKey: string;

	/**
	 * How often to check for updates in milliseconds..
	 * @internal
	 */
	private readonly _updateCheckIntervalMs: number;

	/**
	 * The id of the identity method to use when signing/verifying changesets.
	 * @internal
	 */
	private readonly _decentralisedStorageMethodId: string;

	/**
	 * The timer id for checking for updates.
	 * @internal
	 */
	private _updateCheckTimer: NodeJS.Timeout | undefined;

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

		const requiredProperties: (keyof IDecentralisedEntity)[] = ["nodeIdentity"];

		for (const requiredProperty of requiredProperties) {
			const foundProperty = this._entitySchema.properties?.find(
				prop => prop.property === requiredProperty
			);
			if (Is.empty(foundProperty)) {
				throw new GeneralError(this.CLASS_NAME, "missingRequiredProperty", { requiredProperty });
			}
		}

		if (Is.stringValue(options.loggingConnectorType)) {
			this._loggingConnector = LoggingConnectorFactory.get(options.loggingConnectorType);
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

		this._identityResolverConnector = IdentityResolverConnectorFactory.get(
			options.identityResolverConnectorType ?? "identity-resolver"
		);

		this._verifiableStorageKey = options.config.verifiableStorageKey;
		this._decentralisedStorageMethodId =
			options.config.decentralisedStorageMethodId ?? "decentralised-storage-assertion";
		this._updateCheckIntervalMs =
			options.config.updateCheckIntervalMs ??
			DecentralisedEntityStorageConnector._DEFAULT_UPDATE_CHECK_INTERVAL_MS;
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

		await this.startSync(nodeLogging);
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
		if (Is.notEmpty(this._updateCheckTimer)) {
			clearInterval(this._updateCheckTimer);
			this._updateCheckTimer = undefined;
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
		entity.nodeIdentity = this._nodeIdentity ?? entity.nodeIdentity;

		EntitySchemaHelper.validateEntity(entity, this.getSchema());

		await this._entityStorageConnector.set(entity, conditions);

		// Add the local change to the sync snapshot, we only store id for the change
		// as the entity is already stored in the entity storage and we will retrieve it
		// when we need to create the changeset
		const primaryKey = entity[this._primaryKey.property] as string;
		await this.addLocalChange("set", primaryKey);
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

		await this.addLocalChange("delete", id);
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
	 * Check for updates in the decentralised storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async updateFromRemoteSyncState(logging: ILoggingConnector | undefined): Promise<void> {
		// Get the verifiable sync pointer from the verifiable storage
		const verifiableSyncPointer = await this.getVerifiableSyncPointer(logging);

		if (!Is.empty(verifiableSyncPointer)) {
			// Load the sync state from the remote blob storage using the sync pointer
			// to load the sync state
			const remoteSyncState = await this.getRemoteSyncState(
				logging,
				verifiableSyncPointer.syncPointerId
			);

			// If we got the sync state we can try and sync from it
			if (!Is.undefined(remoteSyncState)) {
				await this.syncFromRemote(logging, remoteSyncState);
			}
		}
	}

	/**
	 * Check for updates not yet stored in decentralised storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async updateFromLocalSyncState(logging: ILoggingConnector | undefined): Promise<void> {
		const localChangeSnapshot = await this.getLocalChangeSnapshot();

		if (Is.arrayValue(localChangeSnapshot.changes)) {
			// First load the current sync state if there is one
			const syncStatePointer = await this.getVerifiableSyncPointer(logging);
			let syncState: ISyncState | undefined;
			if (!Is.empty(syncStatePointer?.syncPointerId)) {
				syncState = await this.getRemoteSyncState(logging, syncStatePointer.syncPointerId);
			}
			// No current sync state, sowe create a new one
			if (Is.empty(syncState)) {
				syncState = { snapshots: [] };
			}

			// Sort the snapshots so the newest snapshot is last in the array
			const sortedSnapshots = syncState.snapshots.sort((a, b) =>
				a.dateCreated.localeCompare(b.dateCreated)
			);

			// Get the current snapshot, if it does not exist we create a new one
			let currentSnapshot: ISyncSnapshot | undefined = sortedSnapshots[sortedSnapshots.length - 1];
			if (Is.empty(currentSnapshot)) {
				currentSnapshot = {
					id: Converter.bytesToHex(RandomHelper.generate(32)),
					dateCreated: new Date(Date.now()).toISOString(),
					changeSetStorageIds: []
				};
				syncState.snapshots.push(currentSnapshot);
			} else {
				// Snapshot exists, we update the dateModified
				currentSnapshot.dateModified = new Date(Date.now()).toISOString();
			}

			// Populate the full details for the sync change set
			for (const change of localChangeSnapshot.changes) {
				if (change.operation === "set" && Is.stringValue(change.id)) {
					// If the change is a set operation, we need to swap out the id for the entity
					change.entity = await this._entityStorageConnector.get(change.id);
					delete change.id;
				}
			}

			// Add the changeset to the current snapshot
			const syncChangeSet: ISyncChangeSet<T> = {
				id: Converter.bytesToHex(RandomHelper.generate(32)),
				dateCreated: new Date(Date.now()).toISOString(),
				changes: localChangeSnapshot.changes,
				nodeIdentity: this._nodeIdentity ?? ""
			};

			// And sign it with the node identity
			syncChangeSet.proof = await this.createChangeSetProof(logging, syncChangeSet);

			// Store the changeset in the blob storage
			const changeSetStorageId = await this.storeChangeSet(logging, syncChangeSet);

			// Add the changeset storage id to the current snapshot
			currentSnapshot.changeSetStorageIds.push(changeSetStorageId);

			// Store the sync state in the blob storage
			const syncStateId = await this.storeRemoteSyncState(logging, syncState);

			// Store the verifiable sync pointer in the verifiable storage
			await this.storeVerifiableSyncPointer(logging, syncStateId);

			// Remove the local changeset
			await this._localSyncSnapshotEntryEntityStorage.remove(localChangeSnapshot.id);
		}
	}

	/**
	 * Add a new change to the local snapshot.
	 * @param operation The operation to perform, either "set" or "delete".
	 * @param id The id of the entity to add the change for.
	 * @returns Nothing.
	 * @internal
	 */
	private async addLocalChange(operation: "set" | "delete", id: string): Promise<void> {
		const localChangeSnapshot = await this.getLocalChangeSnapshot();

		localChangeSnapshot.changes ??= [];

		// If we already have a change for this id we are
		// about to supersede it, we remove the previous change
		// to avoid having multiple changes for the same id
		const previousChangeIndex = localChangeSnapshot.changes.findIndex(change => change.id === id);
		if (previousChangeIndex !== -1) {
			localChangeSnapshot.changes.splice(previousChangeIndex, 1);
		}

		localChangeSnapshot.changes.push({ operation, id });

		await this._localSyncSnapshotEntryEntityStorage.set(localChangeSnapshot);
	}

	/**
	 * Get the current local snapshot.
	 * @returns The local snapshot entry.
	 * @internal
	 */
	private async getLocalChangeSnapshot(): Promise<SyncSnapshotEntry<T>> {
		const queryResult = await this._localSyncSnapshotEntryEntityStorage.query({
			property: "isLocalSnapshot",
			value: true,
			comparison: ComparisonOperator.Equals
		});

		if (queryResult.entities.length > 0) {
			return queryResult.entities[0] as SyncSnapshotEntry<T>;
		}

		return {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			changeSetStorageIds: [],
			isLocalSnapshot: true
		};
	}

	/**
	 * Get the sync pointer.
	 * @param logging The logging connector to use for logging.
	 * @returns The sync pointer.
	 * @internal
	 */
	private async getVerifiableSyncPointer(
		logging: ILoggingConnector | undefined
	): Promise<IVerifiableSyncPointer | undefined> {
		try {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "verifiableSyncPointerRetrieving",
				data: {
					key: this._verifiableStorageKey
				}
			});
			const syncPointerStore = await this._verifiableSyncPointerStorageConnector.get(
				this._verifiableStorageKey,
				{ includeData: true }
			);
			if (Is.uint8Array(syncPointerStore.data)) {
				const syncPointer = ObjectHelper.fromBytes<IVerifiableSyncPointer>(syncPointerStore.data);
				await logging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "verifiableSyncPointerRetrieved",
					data: {
						key: this._verifiableStorageKey,
						syncPointerId: syncPointer.syncPointerId
					}
				});
				return syncPointer;
			}
		} catch (err) {
			if (!BaseError.someErrorName(err, nameof(NotFoundError))) {
				throw err;
			}
		}

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "verifiableSyncPointerNotFound",
			data: {
				key: this._verifiableStorageKey
			}
		});
	}

	/**
	 * Store the verifiable sync pointer in the verifiable storage.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async storeVerifiableSyncPointer(
		logging: ILoggingConnector | undefined,
		syncStateId: string
	): Promise<IVerifiableSyncPointer> {
		// Create a new verifiable sync pointer object pointing to the sync state
		const verifiableSyncPointer: IVerifiableSyncPointer = {
			syncPointerId: syncStateId
		};

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "verifiableSyncPointerStoring",
			data: {
				key: this._verifiableStorageKey,
				syncPointerId: verifiableSyncPointer.syncPointerId
			}
		});

		// Store the verifiable sync pointer in the verifiable storage
		await this._verifiableSyncPointerStorageConnector.create(
			this._verifiableStorageKey,
			ObjectHelper.toBytes<IVerifiableSyncPointer>(verifiableSyncPointer)
		);

		return verifiableSyncPointer;
	}

	/**
	 * Store the remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param syncState The sync state to store.
	 * @returns The id of the sync state.
	 * @internal
	 */
	private async storeRemoteSyncState(
		logging: ILoggingConnector | undefined,
		syncState: ISyncState
	): Promise<string> {
		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "remoteSyncStateStoring",
			data: {
				snapshotCount: syncState.snapshots.length
			}
		});

		const compressed = await Compression.compress(
			ObjectHelper.toBytes<ISyncState>(syncState),
			CompressionType.Gzip
		);

		return this._blobStorageConnector.set(compressed);
	}

	/**
	 * Get the remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param syncPointerId The id of the sync pointer to retrieve the state for.
	 * @returns The remote sync state.
	 * @internal
	 */
	private async getRemoteSyncState(
		logging: ILoggingConnector | undefined,
		syncPointerId: string
	): Promise<ISyncState | undefined> {
		try {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "remoteSyncStateRetrieving",
				data: {
					syncPointerId
				}
			});
			const blobData = await this._blobStorageConnector.get(syncPointerId);

			if (Is.uint8Array(blobData)) {
				const decompressed = await Compression.decompress(blobData, CompressionType.Gzip);

				const syncState = ObjectHelper.fromBytes<ISyncState>(decompressed);
				await logging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "remoteSyncStateRetrieved",
					data: {
						syncPointerId,
						snapshotCount: syncState.snapshots.length
					}
				});
				return syncState;
			}
		} catch (err) {
			if (!BaseError.someErrorName(err, nameof(NotFoundError))) {
				throw err;
			}
		}

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "remoteSyncStateNotFound",
			data: {
				syncPointerId
			}
		});
	}

	/**
	 * Sync local data using a remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param remoteSyncState The sync state to sync with.
	 * @returns Nothing.
	 * @internal
	 */
	private async syncFromRemote(
		logging: ILoggingConnector | undefined,
		remoteSyncState: ISyncState
	): Promise<void> {
		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "remoteSyncSynchronisation",
			data: {
				snapshotCount: remoteSyncState.snapshots.length
			}
		});

		// Sort from newest to oldest
		const sortedRemoteSnapshots = remoteSyncState.snapshots.sort(
			(a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
		);

		const newSnapshots: SyncSnapshotEntry<T>[] = [];
		const modifiedSnapshots: {
			localSnapshot: SyncSnapshotEntry<T>;
			remoteSnapshot: SyncSnapshotEntry<T>;
		}[] = [];

		for (const remoteSnapshot of sortedRemoteSnapshots) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "remoteSyncSnapshotProcessing",
				data: {
					snapshotId: remoteSnapshot.id,
					dateCreated: new Date(remoteSnapshot.dateCreated).toISOString()
				}
			});

			const localSnapshot = await this._localSyncSnapshotEntryEntityStorage.get(remoteSnapshot.id);

			if (Is.empty(localSnapshot)) {
				// We don't have the snapshot locally, so we need to process it
				newSnapshots.push(remoteSnapshot);
			} else if (localSnapshot.dateModified !== remoteSnapshot.dateModified) {
				// If the local snapshot has a different dateModified, we need to update it
				modifiedSnapshots.push({
					localSnapshot,
					remoteSnapshot
				});
			} else {
				// we sorted the snapshots from newest to oldest, so if we found a local snapshot
				// with the same dateModified as the remote snapshot, we can stop processing further
				break;
			}
		}

		// We reverse the order of the snapshots to process them from oldest to newest
		// because we want to apply the changes in the order they were created
		await this.processModifiedSnapshots(logging, modifiedSnapshots.reverse());
		await this.processNewSnapshots(logging, newSnapshots.reverse());
	}

	/**
	 * Process the modified snapshots and store them in the local storage.
	 * @param logging The logging connector to use for logging.
	 * @param modifiedSnapshots The modified snapshots to process.
	 * @returns Nothing.
	 * @internal
	 */
	private async processModifiedSnapshots(
		logging: ILoggingConnector | undefined,
		modifiedSnapshots: {
			localSnapshot: SyncSnapshotEntry<T>;
			remoteSnapshot: SyncSnapshotEntry<T>;
		}[]
	): Promise<void> {
		for (const modifiedSnapshot of modifiedSnapshots) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "remoteSyncSnapshotModified",
				data: {
					snapshotId: modifiedSnapshot.remoteSnapshot.id,
					localModified: new Date(
						modifiedSnapshot.localSnapshot.dateModified ??
							modifiedSnapshot.localSnapshot.dateCreated
					).toISOString(),
					remoteModified: new Date(
						modifiedSnapshot.remoteSnapshot.dateModified ??
							modifiedSnapshot.remoteSnapshot.dateCreated
					).toISOString()
				}
			});

			for (const storageId of modifiedSnapshot.remoteSnapshot.changeSetStorageIds) {
				// Check if the local snapshot does not have the storageId
				if (!modifiedSnapshot.localSnapshot.changeSetStorageIds.includes(storageId)) {
					await this.getAndApplyChangeset(logging, storageId);
				}
			}

			await this._localSyncSnapshotEntryEntityStorage.set(modifiedSnapshot.remoteSnapshot);
		}
	}

	/**
	 * Process the new snapshots and store them in the local storage.
	 * @param logging The logging connector to use for logging.
	 * @param newSnapshots The new snapshots to process.
	 * @returns Nothing.
	 * @internal
	 */
	private async processNewSnapshots(
		logging: ILoggingConnector | undefined,
		newSnapshots: SyncSnapshotEntry<T>[]
	): Promise<void> {
		for (const newSnapshot of newSnapshots) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "remoteSyncSnapshotNew",
				data: {
					snapshotId: newSnapshot.id,
					localModified: new Date(newSnapshot.dateCreated).toISOString()
				}
			});

			for (const storageId of newSnapshot.changeSetStorageIds) {
				await this.getAndApplyChangeset(logging, storageId);
			}

			await this._localSyncSnapshotEntryEntityStorage.set(newSnapshot);
		}
	}

	/**
	 * Apply a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param changeSetStorageId The id of the sync changeset to apply.
	 * @returns Nothing.
	 * @internal
	 */
	private async getAndApplyChangeset(
		logging: ILoggingConnector | undefined,
		changeSetStorageId: string
	): Promise<void> {
		const blobData = await this._blobStorageConnector.get(changeSetStorageId);
		if (Is.uint8Array(blobData)) {
			const decompressed = await Compression.decompress(blobData, CompressionType.Gzip);

			const syncChangeset = ObjectHelper.fromBytes<ISyncChangeSet<T>>(decompressed);

			if (await this.verifyChangesetProof(logging, syncChangeset)) {
				await this.applyChangeset(logging, syncChangeset);
			}
		}
	}

	/**
	 * Apply a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeset The sync changeset to apply.
	 * @returns Nothing.
	 * @internal
	 */
	private async applyChangeset(
		logging: ILoggingConnector | undefined,
		syncChangeset: ISyncChangeSet<T>
	): Promise<void> {
		for (const change of syncChangeset.changes) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "remoteSyncChangeApplying",
				data: {
					operation: change.operation,
					id: change.id
				}
			});

			switch (change.operation) {
				case "set":
					if (!Is.empty(change.entity)) {
						await this._entityStorageConnector.set(change.entity);
					}
					break;
				case "delete":
					if (!Is.empty(change.id)) {
						await this._entityStorageConnector.remove(change.id);
					}
					break;
			}
		}
	}

	/**
	 * Store the changeset.
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeSet The sync change set to store.
	 * @returns The id of the change set.
	 * @internal
	 */
	private async storeChangeSet(
		logging: ILoggingConnector | undefined,
		syncChangeSet: ISyncChangeSet
	): Promise<string> {
		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "remoteSyncChangeSetStoring",
			data: {
				id: syncChangeSet.id
			}
		});

		const compressed = await Compression.compress(
			ObjectHelper.toBytes<ISyncChangeSet>(syncChangeSet),
			CompressionType.Gzip
		);

		return this._blobStorageConnector.set(compressed);
	}

	/**
	 * Verify the proof of a sync changeset.
	 * @param syncChangeset The sync changeset to verify.
	 * @returns True if the proof is valid, false otherwise.
	 * @internal
	 */
	private async verifyChangesetProof(
		logging: ILoggingConnector | undefined,
		syncChangeset: ISyncChangeSet
	): Promise<boolean> {
		if (Is.empty(syncChangeset.proof)) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "verifyChangeSetProofMissing",
				data: {
					snapshotId: syncChangeset.id
				}
			});
			return false;
		}
		const changeSetWithoutProof = ObjectHelper.clone(syncChangeset);
		delete changeSetWithoutProof.proof;

		const isValid = await this._identityConnector.verifyProof(
			changeSetWithoutProof as unknown as IJsonLdNodeObject,
			syncChangeset.proof
		);

		if (!isValid) {
			await logging?.log({
				level: "error",
				source: this.CLASS_NAME,
				message: "verifyChangeSetProofInvalid",
				data: {
					id: syncChangeset.id
				}
			});
		} else {
			await logging?.log({
				level: "error",
				source: this.CLASS_NAME,
				message: "verifyChangeSetProofValid",
				data: {
					id: syncChangeset.id
				}
			});
		}

		return isValid;
	}

	/**
	 * Create the proof of a sync change set.
	 * @param syncChangeset The sync changeset to create the proof for.
	 * @returns The proof.
	 * @internal
	 */
	private async createChangeSetProof(
		logging: ILoggingConnector | undefined,
		syncChangeset: ISyncChangeSet
	): Promise<IProof> {
		const changeSetWithoutProof = ObjectHelper.clone(syncChangeset);
		delete changeSetWithoutProof.proof;

		const proof = await this._identityConnector.createProof(
			syncChangeset.nodeIdentity,
			DocumentHelper.joinId(syncChangeset.nodeIdentity, this._decentralisedStorageMethodId),
			ProofTypes.DataIntegrityProof,
			changeSetWithoutProof as unknown as IJsonLdNodeObject
		);

		await logging?.log({
			level: "error",
			source: this.CLASS_NAME,
			message: "createdChangeSetProof",
			data: {
				id: syncChangeset.id,
				...proof
			}
		});

		return proof;
	}

	/**
	 * Start the sync with further updates after an interval.
	 * @param logging The logging connector to use for logging.
	 * @returns Nothing.
	 * @internal
	 */
	private async startSync(logging: ILoggingConnector | undefined): Promise<void> {
		try {
			// First we check for remote changes
			await this.updateFromRemoteSyncState(logging);

			// Now send any updates we have to the remote storage
			await this.updateFromLocalSyncState(logging);
		} catch (error) {
			await logging?.log({
				level: "error",
				source: this.CLASS_NAME,
				message: "syncFailed",
				error: BaseError.fromError(error)
			});
		} finally {
			// Set a timer to check for updates again
			this._updateCheckTimer = setTimeout(
				async () => this.startSync(logging),
				this._updateCheckIntervalMs
			);
		}
	}
}

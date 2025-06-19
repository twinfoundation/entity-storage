// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	BlobStorageCompressionType,
	type IBlobStorageComponent
} from "@twin.org/blob-storage-models";
import {
	BaseError,
	Converter,
	Is,
	NotFoundError,
	ObjectHelper,
	RandomHelper
} from "@twin.org/core";
import { SortDirection } from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import type { ILoggingConnector } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { IVerifiableStorageConnector } from "@twin.org/verifiable-storage-models";
import type { ChangeSetHelper } from "./changeSetHelper";
import type { ISyncChange } from "../models/ISyncChange";
import type { ISyncChangeSet } from "../models/ISyncChangeSet";
import type { ISynchronisedEntity } from "../models/ISynchronisedEntity";
import type { ISyncPointer } from "../models/ISyncPointer";
import type { ISyncSnapshot } from "../models/ISyncSnapshot";
import type { ISyncState } from "../models/ISyncState";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class RemoteSyncStateHelper<T extends ISynchronisedEntity = ISynchronisedEntity> {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<RemoteSyncStateHelper>();

	/**
	 * The entity storage connector to use for actual data.
	 */
	private readonly _entityStorageConnector: IEntityStorageConnector<T>;

	/**
	 * The blob storage component to use for remote sync states.
	 */
	private readonly _blobStorageComponent: IBlobStorageComponent;

	/**
	 * The verifiable storage connector to use for storing sync pointers.
	 */
	private readonly _verifiableSyncPointerStorageConnector: IVerifiableStorageConnector;

	/**
	 * The change set helper to use for applying changesets.
	 */
	private readonly _changeSetHelper: ChangeSetHelper<T>;

	/**
	 * Create a new instance of DecentralisedEntityStorageConnector.
	 * @param entityStorageConnector The entity storage connector to use for actual data.
	 * @param blobStorageComponent The blob storage component to use for remote sync states.
	 * @param verifiableSyncPointerStorageConnector The verifiable storage connector to use for storing sync pointers.
	 * @param changeSetHelper The change set helper to use for managing changesets.
	 */
	constructor(
		entityStorageConnector: IEntityStorageConnector<T>,
		blobStorageComponent: IBlobStorageComponent,
		verifiableSyncPointerStorageConnector: IVerifiableStorageConnector,
		changeSetHelper: ChangeSetHelper<T>
	) {
		this._entityStorageConnector = entityStorageConnector;
		this._blobStorageComponent = blobStorageComponent;
		this._verifiableSyncPointerStorageConnector = verifiableSyncPointerStorageConnector;
		this._changeSetHelper = changeSetHelper;
	}

	/**
	 * Create and store a change set.
	 * @param logging The logging connector to use for logging.
	 * @param changes The changes to apply.
	 * @param nodeIdentity The identity of the node that is performing the update.
	 * @returns The storage id of the change set if created.
	 */
	public async createAndStoreChangeSet(
		logging: ILoggingConnector | undefined,
		changes: ISyncChange<T>[] | undefined,
		nodeIdentity: string
	): Promise<string | undefined> {
		if (Is.arrayValue(changes)) {
			// Populate the full details for the sync change set
			for (const change of changes) {
				if (change.operation === "set" && Is.stringValue(change.id)) {
					// If the change is a set operation, we need to swap out the id for the entity
					change.entity = await this._entityStorageConnector.get(change.id);
					delete change.id;
					// Remove the node identity as the changeset has this stored at the top level
					// and we do not want to store it in the change itself
					ObjectHelper.propertyDelete(change.entity, "nodeIdentity");
				}
			}

			// Add the changeset to the current snapshot
			const syncChangeSet: ISyncChangeSet<T> = {
				id: Converter.bytesToHex(RandomHelper.generate(32)),
				dateCreated: new Date(Date.now()).toISOString(),
				changes,
				nodeIdentity
			};

			// And sign it with the node identity
			syncChangeSet.proof = await this._changeSetHelper.createChangeSetProof(
				logging,
				syncChangeSet
			);

			// Store the changeset in the blob storage
			return this._changeSetHelper.storeChangeSet(logging, syncChangeSet);
		}
	}

	/**
	 * Add a new changeset into the sync state.
	 * @param logging The logging connector to use for logging.
	 * @param synchronisedStorageKey The key to use for the synchronised storage.
	 * @param changeSetStorageId The id of the change set to add the the current state
	 * @returns Nothing.
	 */
	public async addChangeSetToSyncState(
		logging: ILoggingConnector | undefined,
		synchronisedStorageKey: string,
		changeSetStorageId: string
	): Promise<void> {
		// First load the current sync state if there is one
		const syncStatePointer = await this.getVerifiableSyncPointer(logging, synchronisedStorageKey);
		let syncState: ISyncState | undefined;
		if (!Is.empty(syncStatePointer?.syncPointerId)) {
			syncState = await this.getRemoteSyncState(logging, syncStatePointer.syncPointerId);
		}
		// No current sync state, so we create a new one
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

		// Add the changeset storage id to the current snapshot
		currentSnapshot.changeSetStorageIds.push(changeSetStorageId);

		// Store the sync state in the blob storage
		const syncStateId = await this.storeRemoteSyncState(logging, syncState);

		// Store the verifiable sync pointer in the verifiable storage
		await this.storeVerifiableSyncPointer(logging, synchronisedStorageKey, syncStateId);
	}

	/**
	 * Create a consolidated snapshot for the entire storage.
	 * @param logging The logging connector to use for logging.
	 * @param nodeIdentity The identity of the node that is performing the update.
	 * @param synchronisedStorageKey The key to use for the synchronised storage.
	 * @param consolidationBatchSize The batch size to use for consolidation.
	 * @returns Nothing.
	 */
	public async consolidateFromLocal(
		logging: ILoggingConnector | undefined,
		nodeIdentity: string,
		synchronisedStorageKey: string,
		consolidationBatchSize: number
	): Promise<void> {
		let cursor: string | undefined;
		const changeSetStorageIds: string[] = [];

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "consolidationStarting"
		});

		do {
			const result = await this._entityStorageConnector.query(
				undefined,
				[{ property: "dateCreated", sortDirection: SortDirection.Ascending }],
				undefined,
				cursor,
				consolidationBatchSize
			);

			// Create a new snapshot entry for the current batch
			const syncChangeSet: ISyncChangeSet<T> = {
				id: Converter.bytesToHex(RandomHelper.generate(32)),
				dateCreated: new Date(Date.now()).toISOString(),
				entities: result.entities as T[],
				nodeIdentity
			};

			// And sign it with the node identity
			syncChangeSet.proof = await this._changeSetHelper.createChangeSetProof(
				logging,
				syncChangeSet
			);

			// Store the changeset in the blob storage
			const changeSetStorageId = await this._changeSetHelper.storeChangeSet(logging, syncChangeSet);

			// Add the changeset storage id to the snapshot ids
			changeSetStorageIds.push(changeSetStorageId);

			cursor = result.cursor;
		} while (Is.stringValue(cursor));

		const syncState: ISyncState = { snapshots: [] };

		const batchSnapshot: ISyncSnapshot = {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			changeSetStorageIds
		};
		syncState.snapshots.push(batchSnapshot);

		// Store the sync state in the blob storage
		const syncStateId = await this.storeRemoteSyncState(logging, syncState);

		// Store the verifiable sync pointer in the verifiable storage
		await this.storeVerifiableSyncPointer(logging, synchronisedStorageKey, syncStateId);

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "consolidationCompleted"
		});
	}

	/**
	 * Get the sync pointer.
	 * @param logging The logging connector to use for logging.
	 * @param synchronisedStorageKey The key to use for the synchronised storage.
	 * @returns The sync pointer.
	 */
	public async getVerifiableSyncPointer(
		logging: ILoggingConnector | undefined,
		synchronisedStorageKey: string
	): Promise<ISyncPointer | undefined> {
		try {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "verifiableSyncPointerRetrieving",
				data: {
					key: synchronisedStorageKey
				}
			});
			const syncPointerStore = await this._verifiableSyncPointerStorageConnector.get(
				synchronisedStorageKey,
				{ includeData: true }
			);
			if (Is.uint8Array(syncPointerStore.data)) {
				const syncPointer = ObjectHelper.fromBytes<ISyncPointer>(syncPointerStore.data);
				await logging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "verifiableSyncPointerRetrieved",
					data: {
						key: synchronisedStorageKey,
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
				key: synchronisedStorageKey
			}
		});
	}

	/**
	 * Store the verifiable sync pointer in the verifiable storage.
	 * @param logging The logging connector to use for logging.
	 * @param synchronisedStorageKey The key to use for the synchronised storage.
	 * @param syncStateId The id of the sync state to store.
	 * @returns Nothing.
	 */
	public async storeVerifiableSyncPointer(
		logging: ILoggingConnector | undefined,
		synchronisedStorageKey: string,
		syncStateId: string
	): Promise<ISyncPointer> {
		// Create a new verifiable sync pointer object pointing to the sync state
		const verifiableSyncPointer: ISyncPointer = {
			syncPointerId: syncStateId
		};

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "verifiableSyncPointerStoring",
			data: {
				key: synchronisedStorageKey,
				syncPointerId: verifiableSyncPointer.syncPointerId
			}
		});

		// Store the verifiable sync pointer in the verifiable storage
		await this._verifiableSyncPointerStorageConnector.create(
			synchronisedStorageKey,
			ObjectHelper.toBytes<ISyncPointer>(verifiableSyncPointer)
		);

		return verifiableSyncPointer;
	}

	/**
	 * Store the remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param syncState The sync state to store.
	 * @returns The id of the sync state.
	 */
	public async storeRemoteSyncState(
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

		// We don't want to encrypt the sync state as no other nodes would be able to read it
		// the blob storage also needs to be publicly accessible so that other nodes can retrieve it
		return this._blobStorageComponent.create(
			Converter.bytesToBase64(ObjectHelper.toBytes<ISyncState>(syncState)),
			undefined,
			undefined,
			undefined,
			{ disableEncryption: true, compress: BlobStorageCompressionType.Gzip }
		);
	}

	/**
	 * Get the remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param syncPointerId The id of the sync pointer to retrieve the state for.
	 * @returns The remote sync state.
	 */
	public async getRemoteSyncState(
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
			const blobEntry = await this._blobStorageComponent.get(syncPointerId, {
				includeContent: true
			});

			if (Is.stringBase64(blobEntry.blob)) {
				const syncState = ObjectHelper.fromBytes<ISyncState>(
					Converter.base64ToBytes(blobEntry.blob)
				);
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
}

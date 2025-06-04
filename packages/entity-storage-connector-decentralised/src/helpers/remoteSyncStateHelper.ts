// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IBlobStorageConnector } from "@twin.org/blob-storage-models";
import {
	BaseError,
	Compression,
	CompressionType,
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
import type { SyncSnapshotEntry } from "../entities/syncSnapshotEntry";
import type { IDecentralisedEntity } from "../models/IDecentralisedEntity";
import type { ISyncChangeSet } from "../models/ISyncChangeSet";
import type { ISyncSnapshot } from "../models/ISyncSnapshot";
import type { ISyncState } from "../models/ISyncState";
import type { IVerifiableSyncPointer } from "../models/IVerifiableSyncPointer";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class RemoteSyncStateHelper<T extends IDecentralisedEntity = IDecentralisedEntity> {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<RemoteSyncStateHelper>();

	/**
	 * The entity storage connector to use for actual data.
	 * @internal
	 */
	private readonly _entityStorageConnector: IEntityStorageConnector<T>;

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
	 * The change set helper to use for applying changesets.
	 * @internal
	 */
	private readonly _changeSetHelper: ChangeSetHelper<T>;

	/**
	 * The key to use for the verifiable storage.
	 * @internal
	 */
	private readonly _verifiableStorageKey: string;

	/**
	 * Create a new instance of DecentralisedEntityStorageConnector.
	 * @param entityStorageConnector The entity storage connector to use for actual data.
	 * @param blobStorageConnector The blob storage connector to use for remote sync states.
	 * @param verifiableSyncPointerStorageConnector The verifiable storage connector to use for storing sync pointers.
	 * @param changeSetHelper The change set helper to use for managing changesets.
	 * @param verifiableStorageKey The key to use for the verifiable storage.
	 */
	constructor(
		entityStorageConnector: IEntityStorageConnector<T>,
		blobStorageConnector: IBlobStorageConnector,
		verifiableSyncPointerStorageConnector: IVerifiableStorageConnector,
		changeSetHelper: ChangeSetHelper<T>,
		verifiableStorageKey: string
	) {
		this._entityStorageConnector = entityStorageConnector;
		this._blobStorageConnector = blobStorageConnector;
		this._verifiableSyncPointerStorageConnector = verifiableSyncPointerStorageConnector;
		this._changeSetHelper = changeSetHelper;
		this._verifiableStorageKey = verifiableStorageKey;
	}

	/**
	 * Check for updates not yet stored in decentralised storage.
	 * @param logging The logging connector to use for logging.
	 * @param localChangeSnapshot The local change snapshot to use for updates.
	 * @param nodeIdentity The identity of the node that is performing the update.
	 * @returns True if the local sync state was used.
	 * @internal
	 */
	public async updateFromLocalSyncState(
		logging: ILoggingConnector | undefined,
		localChangeSnapshot: SyncSnapshotEntry<T>,
		nodeIdentity: string
	): Promise<boolean> {
		if (Is.arrayValue(localChangeSnapshot.changes)) {
			// First load the current sync state if there is one
			const syncStatePointer = await this.getVerifiableSyncPointer(logging);
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

			// Populate the full details for the sync change set
			for (const change of localChangeSnapshot.changes) {
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
				changes: localChangeSnapshot.changes,
				nodeIdentity
			};

			// And sign it with the node identity
			syncChangeSet.proof = await this._changeSetHelper.createChangeSetProof(
				logging,
				syncChangeSet
			);

			// Store the changeset in the blob storage
			const changeSetStorageId = await this._changeSetHelper.storeChangeSet(logging, syncChangeSet);

			// Add the changeset storage id to the current snapshot
			currentSnapshot.changeSetStorageIds.push(changeSetStorageId);

			// Store the sync state in the blob storage
			const syncStateId = await this.storeRemoteSyncState(logging, syncState);

			// Store the verifiable sync pointer in the verifiable storage
			await this.storeVerifiableSyncPointer(logging, syncStateId);

			// Remove the local changeset
			return true;
		}

		return false;
	}

	/**
	 * Create a consolidated snapshot for the entire storage.
	 * @param logging The logging connector to use for logging.
	 * @param nodeIdentity The identity of the node that is performing the update.
	 * @returns Nothing.
	 * @internal
	 */
	public async consolidateFromLocal(
		logging: ILoggingConnector | undefined,
		nodeIdentity: string,
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
		await this.storeVerifiableSyncPointer(logging, syncStateId);

		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "consolidationCompleted"
		});
	}

	/**
	 * Get the sync pointer.
	 * @param logging The logging connector to use for logging.
	 * @returns The sync pointer.
	 * @internal
	 */
	public async getVerifiableSyncPointer(
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
	public async storeVerifiableSyncPointer(
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
}

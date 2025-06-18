// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Converter, Is, RandomHelper } from "@twin.org/core";
import { ComparisonOperator } from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import type { ILoggingConnector } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import type { ChangeSetHelper } from "./changeSetHelper";
import type { SyncSnapshotEntry } from "../entities/syncSnapshotEntry";
import type { ISynchronisedEntity } from "../models/ISynchronisedEntity";
import type { ISyncState } from "../models/ISyncState";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class LocalSyncStateHelper<T extends ISynchronisedEntity = ISynchronisedEntity> {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<LocalSyncStateHelper>();

	/**
	 * The storage connector for the sync snapshot entries.
	 * @internal
	 */
	private readonly _localSyncSnapshotEntryEntityStorage: IEntityStorageConnector<
		SyncSnapshotEntry<T>
	>;

	/**
	 * The change set helper to use for applying changesets.
	 * @internal
	 */
	private readonly _changeSetHelper: ChangeSetHelper<T>;

	/**
	 * The context for the entity being synchronised.
	 * @internal
	 */
	private readonly _entityContext: string;

	/**
	 * Create a new instance of LocalSyncStateHelper.
	 * @param localSyncSnapshotEntryEntityStorage The storage connector for the local sync snapshot entries.
	 * @param changeSetHelper The change set helper to use for applying changesets.
	 * @param entityContext The context for the entity being synchronised.
	 */
	constructor(
		localSyncSnapshotEntryEntityStorage: IEntityStorageConnector<SyncSnapshotEntry<T>>,
		changeSetHelper: ChangeSetHelper<T>,
		entityContext: string
	) {
		this._localSyncSnapshotEntryEntityStorage = localSyncSnapshotEntryEntityStorage;
		this._changeSetHelper = changeSetHelper;
		this._entityContext = entityContext;
	}

	/**
	 * Add a new change to the local snapshot.
	 * @param operation The operation to perform, either "set" or "delete".
	 * @param id The id of the entity to add the change for.
	 * @returns Nothing.
	 */
	public async addLocalChange(operation: "set" | "delete", id: string): Promise<void> {
		const localChangeSnapshot = await this.getLocalChangeSnapshot();

		localChangeSnapshot.changes ??= [];

		// If we already have a change for this id we are
		// about to supersede it, we remove the previous change
		// to avoid having multiple changes for the same id
		const previousChangeIndex = localChangeSnapshot.changes.findIndex(change => change.id === id);
		if (previousChangeIndex !== -1) {
			localChangeSnapshot.changes.splice(previousChangeIndex, 1);
		}

		if (localChangeSnapshot.changes.length > 0) {
			localChangeSnapshot.dateModified = new Date(Date.now()).toISOString();
		}

		localChangeSnapshot.changes.push({ operation, id });

		await this.setLocalChangeSnapshot(localChangeSnapshot);
	}

	/**
	 * Get the current local snapshot.
	 * @returns The local snapshot entry.
	 */
	public async getLocalChangeSnapshot(): Promise<SyncSnapshotEntry<T>> {
		const queryResult = await this._localSyncSnapshotEntryEntityStorage.query({
			conditions: [
				{
					property: "isLocalSnapshot",
					value: true,
					comparison: ComparisonOperator.Equals
				},
				{
					property: "context",
					value: this._entityContext,
					comparison: ComparisonOperator.Equals
				}
			]
		});

		if (queryResult.entities.length > 0) {
			return queryResult.entities[0] as SyncSnapshotEntry<T>;
		}

		return {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			context: this._entityContext,
			dateCreated: new Date(Date.now()).toISOString(),
			changeSetStorageIds: [],
			isLocalSnapshot: true
		};
	}

	/**
	 * Set the current local snapshot.
	 * @param localChangeSnapshot The local change snapshot to set.
	 * @returns Nothing.
	 */
	public async setLocalChangeSnapshot(localChangeSnapshot: SyncSnapshotEntry<T>): Promise<void> {
		await this._localSyncSnapshotEntryEntityStorage.set(localChangeSnapshot);
	}

	/**
	 * Get the current local snapshot.
	 * @param logging The logging connector to use for logging.
	 * @param localChangeSnapshot The local change snapshot to remove.
	 * @returns Nothing.
	 */
	public async removeLocalChangeSnapshot(
		logging: ILoggingConnector | undefined,
		localChangeSnapshot: SyncSnapshotEntry<T>
	): Promise<void> {
		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "removeLocalChangeSnapshot",
			data: {
				snapshotId: localChangeSnapshot.id
			}
		});
		await this._localSyncSnapshotEntryEntityStorage.remove(localChangeSnapshot.id);
	}

	/**
	 * Sync local data using a remote sync state.
	 * @param logging The logging connector to use for logging.
	 * @param remoteSyncState The sync state to sync with.
	 * @returns Nothing.
	 */
	public async syncFromRemote(
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
			const remoteSnapshotWithContext: SyncSnapshotEntry<T> = {
				...remoteSnapshot,
				context: this._entityContext
			};

			if (Is.empty(localSnapshot)) {
				// We don't have the snapshot locally, so we need to process it
				newSnapshots.push(remoteSnapshotWithContext);
			} else if (localSnapshot.dateModified !== remoteSnapshot.dateModified) {
				// If the local snapshot has a different dateModified, we need to update it
				modifiedSnapshots.push({
					localSnapshot,
					remoteSnapshot: remoteSnapshotWithContext
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
	 */
	public async processModifiedSnapshots(
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
					await this._changeSetHelper.getAndApplyChangeset(logging, storageId);
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
				await this._changeSetHelper.getAndApplyChangeset(logging, storageId);
			}

			await this._localSyncSnapshotEntryEntityStorage.set(newSnapshot);
		}
	}
}

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

		this._verifiableStorageKey = options.config.verifiableStorageKey;
		this._decentralisedStorageMethodId =
			options.config.decentralisedStorageMethodId ?? "decentralised-storage-assertion";
		this._updateCheckIntervalMs =
			options.config.updateCheckIntervalMs ??
			DecentralisedEntityStorageConnector._DEFAULT_UPDATE_CHECK_INTERVAL_MS;

		this._changeSetHelper = new ChangeSetHelper<T>(
			this._entityStorageConnector,
			this._blobStorageConnector,
			this._identityConnector,
			this._decentralisedStorageMethodId
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
			this._verifiableStorageKey
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
}

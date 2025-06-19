// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
	BlobStorageConnectorFactory,
	type IBlobStorageComponent
} from "@twin.org/blob-storage-models";
import { ComponentFactory, Guards, Is } from "@twin.org/core";
import { EntitySchemaFactory, EntitySchemaHelper } from "@twin.org/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import { IdentityConnectorFactory } from "@twin.org/identity-models";
import { nameof } from "@twin.org/nameof";
import { VerifiableStorageConnectorFactory } from "@twin.org/verifiable-storage-models";
import { ChangeSetHelper } from "./helpers/changeSetHelper";
import { RemoteSyncStateHelper } from "./helpers/remoteSyncStateHelper";
import type { ISynchronisedEntity } from "./models/ISynchronisedEntity";
import type { ITrustedSynchronisedStorageComponent } from "./models/ITrustedSynchronisedStorageComponent";
import type { ITrustedSynchronisedStorageServiceConfig } from "./models/ITrustedSynchronisedStorageServiceConfig";
import type { ITrustedSynchronisedStorageServiceConstructorOptions } from "./models/ITrustedSynchronisedStorageServiceConstructorOptions";

/**
 * Class for performing synchronised storage operations.
 */
export class TrustedSynchronisedStorageService implements ITrustedSynchronisedStorageComponent {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<TrustedSynchronisedStorageService>();

	/**
	 * The change set helper.
	 * @internal
	 */
	private readonly _changeSetHelper: ChangeSetHelper;

	/**
	 * The remote sync state helper to use for applying changesets.
	 * @internal
	 */
	private readonly _remoteSyncStateHelper: RemoteSyncStateHelper;

	/**
	 * The options for the connector.
	 * @internal
	 */
	private readonly _config: Required<ITrustedSynchronisedStorageServiceConfig>;

	/**
	 * Create a new instance of SynchronisedTrustedStorageService.
	 * @param options The options for the service.
	 */
	constructor(options: ITrustedSynchronisedStorageServiceConstructorOptions) {
		Guards.object<ITrustedSynchronisedStorageServiceConstructorOptions>(
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
		Guards.object<ITrustedSynchronisedStorageServiceConfig>(
			this.CLASS_NAME,
			nameof(options.config),
			options.config
		);

		const entitySchema = EntitySchemaFactory.get(options.entitySchema);
		const primaryKey = EntitySchemaHelper.getPrimaryKey(entitySchema);

		const entityStorageConnector = EntityStorageConnectorFactory.get<
			IEntityStorageConnector<ISynchronisedEntity>
		>(options.entityStorageConnectorType);

		const verifiableSyncPointerStorageConnector = VerifiableStorageConnectorFactory.get(
			options.verifiableStorageConnectorType ?? "verifiable-storage"
		);

		const blobStorageComponent = ComponentFactory.get<IBlobStorageComponent>(
			options.blobStorageComponentType ?? "blob-storage"
		);

		const identityConnector = IdentityConnectorFactory.get(
			options.identityConnectorType ?? "identity"
		);

		this._config = {
			synchronisedStorageKey: options.config.synchronisedStorageKey,
			synchronisedStorageMethodId:
				options.config.synchronisedStorageMethodId ?? "synchronised-storage-assertion"
		};

		this._changeSetHelper = new ChangeSetHelper(
			entityStorageConnector,
			blobStorageComponent,
			identityConnector,
			this._config.synchronisedStorageMethodId,
			primaryKey
		);

		this._remoteSyncStateHelper = new RemoteSyncStateHelper(
			entityStorageConnector,
			blobStorageComponent,
			verifiableSyncPointerStorageConnector,
			this._changeSetHelper
		);
	}

	/**
	 * Synchronise a complete set of changes, assumes this is a trusted node.
	 * @param changeSetStorageId The id of the change set to synchronise in blob storage.
	 * @returns Nothing.
	 */
	public async syncChangeSet(changeSetStorageId: string): Promise<void> {
		// This method is called by non trusted nodes to synchronise changes
		Guards.stringValue(this.CLASS_NAME, nameof(changeSetStorageId), changeSetStorageId);

		// TODO: The change set has a proof signed by the originating node identity
		// The proof is verified that the change set is valid and has not been tampered with.
		// but we also need to check that the originating node has permissions
		// to store the change set in the synchronised storage.
		// This will be performed using rights-management

		const changeSet = await this._changeSetHelper.getAndApplyChangeset(
			undefined,
			changeSetStorageId
		);

		if (!Is.empty(changeSet)) {
			await this._remoteSyncStateHelper.addChangeSetToSyncState(
				undefined,
				this._config.synchronisedStorageKey,
				changeSetStorageId
			);
		}
	}
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type {
	IBlobStorageConnector
} from "@twin.org/blob-storage-models";
import {
	Compression,
	CompressionType,
	Is,
	ObjectHelper
} from "@twin.org/core";
import type { IJsonLdNodeObject } from "@twin.org/data-json-ld";
import type {
	IEntityStorageConnector
} from "@twin.org/entity-storage-models";
import {
	DocumentHelper,
	type IIdentityConnector
} from "@twin.org/identity-models";
import type { ILoggingConnector } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { type IProof, ProofTypes } from "@twin.org/standards-w3c-did";
import type { IDecentralisedEntity } from "../models/IDecentralisedEntity";
import type { ISyncChangeSet } from "../models/ISyncChangeSet";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class ChangeSetHelper<
	T extends IDecentralisedEntity = IDecentralisedEntity
>
{
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<ChangeSetHelper>();

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
	 * The identity connector to use for signing/verifying changesets.
	 * @internal
	 */
	private readonly _identityConnector: IIdentityConnector;

	/**
	 * The id of the identity method to use when signing/verifying changesets.
	 * @internal
	 */
	private readonly _decentralisedStorageMethodId: string;

	/**
	 * Create a new instance of ChangeSetHelper.
	 * @param entityStorageConnector The entity storage connector to use for actual data.
	 * @param blobStorageConnector The blob storage connector to use for remote sync states.
	 * @param identityConnector The identity connector to use for signing/verifying changesets.
	 * @param decentralisedStorageMethodId The id of the identity method to use when signing/verifying changesets.
	 */
	constructor(
		entityStorageConnector: IEntityStorageConnector<T>,
		blobStorageConnector: IBlobStorageConnector,
		identityConnector: IIdentityConnector,
		decentralisedStorageMethodId: string
	) {
		this._entityStorageConnector = entityStorageConnector;
		this._decentralisedStorageMethodId = decentralisedStorageMethodId;
		this._blobStorageConnector = blobStorageConnector;
		this._identityConnector = identityConnector;
	}

	/**
	 * Apply a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param changeSetStorageId The id of the sync changeset to apply.
	 * @returns Nothing.
	 * @internal
	 */
	public async getAndApplyChangeset(
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
	public async applyChangeset(
		logging: ILoggingConnector | undefined,
		syncChangeset: ISyncChangeSet<T>
	): Promise<void> {
		for (const change of syncChangeset.changes) {
			await logging?.log({
				level: "info",
				source: this.CLASS_NAME,
				message: "changeSetApplying",
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
	public async storeChangeSet(
		logging: ILoggingConnector | undefined,
		syncChangeSet: ISyncChangeSet
	): Promise<string> {
		await logging?.log({
			level: "info",
			source: this.CLASS_NAME,
			message: "changeSetStoring",
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
	public async verifyChangesetProof(
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
	public async createChangeSetProof(
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
}

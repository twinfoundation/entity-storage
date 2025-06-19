// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BlobStorageCompressionType, type IBlobStorageComponent } from "@twin.org/blob-storage-models";
import { Converter, Is, ObjectHelper } from "@twin.org/core";
import type { IJsonLdNodeObject } from "@twin.org/data-json-ld";
import type { IEntitySchemaProperty } from "@twin.org/entity";
import type { IEntityStorageConnector } from "@twin.org/entity-storage-models";
import { DocumentHelper, type IIdentityConnector } from "@twin.org/identity-models";
import type { ILoggingConnector } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { type IProof, ProofTypes } from "@twin.org/standards-w3c-did";
import type { ISyncChangeSet } from "../models/ISyncChangeSet";
import type { ISynchronisedEntity } from "../models/ISynchronisedEntity";

/**
 * Class for performing entity storage operations in decentralised storage.
 */
export class ChangeSetHelper<T extends ISynchronisedEntity = ISynchronisedEntity> {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<ChangeSetHelper>();

	/**
	 * The entity storage connector to use for actual data.
	 */
	private readonly _entityStorageConnector: IEntityStorageConnector<T>;

	/**
	 * The blob storage component to use for remote sync states.
	 */
	private readonly _blobStorageComponent: IBlobStorageComponent;

	/**
	 * The identity connector to use for signing/verifying changesets.
	 */
	private readonly _identityConnector: IIdentityConnector;

	/**
	 * The id of the identity method to use when signing/verifying changesets.
	 */
	private readonly _decentralisedStorageMethodId: string;

	/**
	 * The primary key.
	 */
	private readonly _primaryKey: IEntitySchemaProperty<T>;

	/**
	 * Create a new instance of ChangeSetHelper.
	 * @param entityStorageConnector The entity storage connector to use for actual data.
	 * @param blobStorageComponent The blob storage component to use for remote sync states.
	 * @param identityConnector The identity connector to use for signing/verifying changesets.
	 * @param decentralisedStorageMethodId The id of the identity method to use when signing/verifying changesets.
	 * @param primaryKey The primary key of the entity schema to use for the changeset.
	 */
	constructor(
		entityStorageConnector: IEntityStorageConnector<T>,
		blobStorageComponent: IBlobStorageComponent,
		identityConnector: IIdentityConnector,
		decentralisedStorageMethodId: string,
		primaryKey: IEntitySchemaProperty<T>
	) {
		this._entityStorageConnector = entityStorageConnector;
		this._decentralisedStorageMethodId = decentralisedStorageMethodId;
		this._blobStorageComponent = blobStorageComponent;
		this._identityConnector = identityConnector;
		this._primaryKey = primaryKey;
	}

	/**
	 * Get and verify a changeset.
	 * @param logging The logging connector to use for logging.
	 * @param changeSetStorageId The id of the sync changeset to apply.
	 * @returns The changeset if it was verified.
	 */
	public async getAndVerifyChangeset(
		logging: ILoggingConnector | undefined,
		changeSetStorageId: string
	): Promise<ISyncChangeSet<T> | undefined> {
		// Changesets are not encrypted as they are signed with the node identity
		// and they are publicly accessible so that other nodes can retrieve them.
		const blobEntry = await this._blobStorageComponent.get(changeSetStorageId, {
			includeContent: true
		});
		if (Is.stringBase64(blobEntry.blob)) {
			const syncChangeset = ObjectHelper.fromBytes<ISyncChangeSet<T>>(
				Converter.base64ToBytes(blobEntry.blob)
			);

			const verified = await this.verifyChangesetProof(logging, syncChangeset);
			return verified ? syncChangeset : undefined;
		}
	}

	/**
	 * Apply a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param changeSetStorageId The id of the sync changeset to apply.
	 * @returns True if the change was applied.
	 */
	public async getAndApplyChangeset(
		logging: ILoggingConnector | undefined,
		changeSetStorageId: string
	): Promise<boolean> {
		const syncChangeset = await this.getAndVerifyChangeset(logging, changeSetStorageId);

		if (!Is.empty(syncChangeset)) {
			await this.applyChangeset(logging, syncChangeset);
			return true;
		}

		return false;
	}

	/**
	 * Apply a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeset The sync changeset to apply.
	 * @returns Nothing.
	 */
	public async applyChangeset(
		logging: ILoggingConnector | undefined,
		syncChangeset: ISyncChangeSet<T>
	): Promise<void> {
		if (Is.arrayValue(syncChangeset.entities)) {
			for (const entity of syncChangeset.entities) {
				const entityId = entity[this._primaryKey.property] as string;
				await logging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "changeSetEntity",
					data: {
						id: entityId
					}
				});

				await this._entityStorageConnector.set(entity);
			}
		}

		if (Is.arrayValue(syncChangeset.changes)) {
			for (const change of syncChangeset.changes) {
				await logging?.log({
					level: "info",
					source: this.CLASS_NAME,
					message: "changeSetApplyingChange",
					data: {
						operation: change.operation,
						id: change.id
					}
				});

				switch (change.operation) {
					case "set":
						if (!Is.empty(change.entity)) {
							// The node identity was stripped when stored in the changeset
							// as the changeset is signed with the node identity.
							// so we need to restore it here.
							change.entity.nodeIdentity = syncChangeset.nodeIdentity;
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
	}

	/**
	 * Store the changeset.
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeSet The sync change set to store.
	 * @returns The id of the change set.
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

		// We don't want to encrypt the sync state as no other nodes would be able to read it
		// the blob storage also needs to be publicly accessible so that other nodes can retrieve it
		return this._blobStorageComponent.create(
			Converter.bytesToBase64(ObjectHelper.toBytes<ISyncChangeSet>(syncChangeSet)),
			undefined,
			undefined,
			undefined,
			{
				disableEncryption: true,
				compress: BlobStorageCompressionType.Gzip
			}
		);
	}

	/**
	 * Verify the proof of a sync changeset.
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeset The sync changeset to verify.
	 * @returns True if the proof is valid, false otherwise.
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
	 * @param logging The logging connector to use for logging.
	 * @param syncChangeset The sync changeset to create the proof for.
	 * @returns The proof.
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

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IDecentralisedEntityStorageConnectorConfig } from "./IDecentralisedEntityStorageConnectorConfig";

/**
 * Options for the Decentralised Entity Storage Connector constructor.
 */
export interface IDecentralisedEntityStorageConnectorConstructorOptions {
	/**
	 * The name of the entity schema.
	 */
	entitySchema: string;

	/**
	 * The logging connector.
	 */
	loggingConnectorType?: string;

	/**
	 * The entity storage connector type to use for actual data.
	 */
	entityStorageConnectorType: string;

	/**
	 * The entity storage connector type to use for sync snapshots.
	 * @default sync-snapshot-entry
	 */
	syncSnapshotStorageConnectorType?: string;

	/**
	 * The blob storage component used for remote sync state.
	 * @default blob-storage
	 */
	blobStorageConnectorType?: string;

	/**
	 * The verifiable storage connector type to use for decentralised state.
	 * @default verifiable-storage
	 */
	verifiableStorageConnectorType?: string;

	/**
	 * The identity connector.
	 * @default identity
	 */
	identityConnectorType?: string;

	/**
	 * The identity resolver connector.
	 * @default identity-resolver
	 */
	identityResolverConnectorType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: IDecentralisedEntityStorageConnectorConfig;
}

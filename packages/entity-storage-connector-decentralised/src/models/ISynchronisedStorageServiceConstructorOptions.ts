// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ISynchronisedStorageServiceConfig } from "./ISynchronisedStorageServiceConfig";

/**
 * Options for the Synchronised Storage Service constructor.
 */
export interface ISynchronisedStorageServiceConstructorOptions {
	/**
	 * The name of the entity schema.
	 */
	entitySchema: string;

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
	 * The synchronised entity storage connector type to use if this node is not trusted.
	 */
	trustedSynchronisedStorageConnectorType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: ISynchronisedStorageServiceConfig;
}

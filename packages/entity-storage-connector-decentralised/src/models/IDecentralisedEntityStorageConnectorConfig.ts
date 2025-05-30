// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the Decentralised Entity Storage Connector.
 */
export interface IDecentralisedEntityStorageConnectorConfig {
	/**
	 * The key to use for the remote verifiable storage.
	 */
	verifiableStorageKey: string;

	/**
	 * The id of the identity method to use when signing/verifying changesets.
	 * @default decentralised-storage-assertion
	 */
	decentralisedStorageMethodId?: string;

	/**
	 * How often to check for updates in milliseconds.
	 * @default 300000 (5 minutes)
	 */
	updateCheckIntervalMs?: number;

	/**
	 * Interval to perform consolidation of changesets, only available if you have write access to the verifiable storage.
	 */
	consolidationIntervalMs?: number;

	/**
	 * When the node has no permissions to write to the verifiable storage, this is the endpoint to use for remote sync.
	 */
	remoteSyncEndpoint?: string;
}

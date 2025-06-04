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
	 * How often to check for entity updates in milliseconds.
	 * @default 300000 (5 minutes)
	 */
	entityUpdateIntervalMs?: number;

	/**
	 * Is this a node that has permission to write to the verifiable storage?
	 * @default false
	 */
	isAuthoritativeNode?: boolean;

	/**
	 * Interval to perform consolidation of changesets, only used if isAuthoritativeNode is set.
	 * @default 300000 (5 minutes)
	 */
	consolidationIntervalMs?: number;

	/**
	 * The number of entities to process in a single consolidation batch.
	 * @default 1000
	 */
	consolidationBatchSize?: number;

	/**
	 * This is the endpoint to use for remote sync when isAuthoritativeNode is not set.
	 */
	remoteSyncEndpoint?: string;
}

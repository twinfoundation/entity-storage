// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ITrustedSynchronisedStorageServiceConfig } from "./ITrustedSynchronisedStorageServiceConfig";

/**
 * Configuration for the Synchronised Storage Service.
 */
export interface ISynchronisedStorageServiceConfig
	extends ITrustedSynchronisedStorageServiceConfig {
	/**
	 * How often to check for entity updates in milliseconds.
	 * @default 300000 (5 minutes)
	 */
	entityUpdateIntervalMs?: number;

	/**
	 * Is this a node that has permission to write to the verifiable storage?
	 * @default false
	 */
	isTrustedNode?: boolean;

	/**
	 * Interval to perform consolidation of changesets, only used if isTrustedNode is set.
	 * @default 300000 (5 minutes)
	 */
	consolidationIntervalMs?: number;

	/**
	 * The number of entities to process in a single consolidation batch.
	 * @default 1000
	 */
	consolidationBatchSize?: number;
}

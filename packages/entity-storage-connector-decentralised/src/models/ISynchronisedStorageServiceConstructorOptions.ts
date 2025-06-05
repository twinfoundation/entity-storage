// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ISynchronisedStorageServiceConfig } from "./ISynchronisedStorageServiceConfig";
import type { ITrustedSynchronisedStorageServiceConstructorOptions } from "./ITrustedSynchronisedStorageServiceConstructorOptions";

/**
 * Options for the Synchronised Storage Service constructor.
 */
export interface ISynchronisedStorageServiceConstructorOptions
	extends ITrustedSynchronisedStorageServiceConstructorOptions {
	/**
	 * The synchronised entity storage component type to use if this node is not trusted.
	 */
	trustedSynchronisedStorageComponentType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: ISynchronisedStorageServiceConfig;
}

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
	 * The entity storage connector type to use for actual data.
	 */
	entityStorageConnectorType: string;

	/**
	 * The synchronised entity storage connector type to use.
	 */
	synchronisedStorageConnectorType: string;

	/**
	 * The configuration for the connector.
	 */
	config?: IDecentralisedEntityStorageConnectorConfig;
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IFirestoreEntityStorageConnectorConfig } from "./IFirestoreEntityStorageConnectorConfig";

/**
 * Options for the Firestore Entity Storage Connector constructor.
 */
export interface IFirestoreEntityStorageConnectorConstructorOptions {
	/**
	 * The schema for the entity.
	 */
	entitySchema: string;

	/**
	 * The type of logging connector to use, defaults to no logging.
	 */
	loggingConnectorType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: IFirestoreEntityStorageConnectorConfig;
}

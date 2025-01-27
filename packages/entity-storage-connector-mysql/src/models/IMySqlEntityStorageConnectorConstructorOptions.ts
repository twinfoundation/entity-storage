// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IMySqlEntityStorageConnectorConfig } from "./IMySqlEntityStorageConnectorConfig";

/**
 * The options for the MySql entity storage connector constructor.
 */
export interface IMySqlEntityStorageConnectorConstructorOptions {
	/**
	 * The schema for the entity.
	 */
	entitySchema: string;

	/**
	 * The type of logging connector to use.
	 * @default logging
	 */
	loggingConnectorType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: IMySqlEntityStorageConnectorConfig;
}

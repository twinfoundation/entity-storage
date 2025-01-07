// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IDynamoDbEntityStorageConnectorConfig } from "./IDynamoDbEntityStorageConnectorConfig";

/**
 * Options for the Dynamo DB Entity Storage Connector constructor.
 */
export interface IDynamoDbEntityStorageConnectorConstructorOptions {
	/**
	 * The schema for the entity
	 */
	entitySchema: string;

	/**
	 * The type of logging connector to use, defaults to no logging.
	 */
	loggingConnectorType?: string;

	/**
	 * The configuration for the connector.
	 */
	config: IDynamoDbEntityStorageConnectorConfig;
}

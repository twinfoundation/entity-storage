// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IPostgresSqlEntityStorageConnectorConfig } from "./IPostgresSqlEntityStorageConnectorConfig";

/**
 * The options for the PostgresSql entity storage connector constructor.
 */
export interface IPostgresSqlEntityStorageConnectorConstructorOptions {
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
	config: IPostgresSqlEntityStorageConnectorConfig;
}

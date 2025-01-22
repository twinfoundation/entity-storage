// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the MySql Entity Storage Connector.
 */
export interface IMySqlEntityStorageConnectorConfig {
	/**
	 * The host for the MySql instance.
	 */
	host: string;

	/**
	 * The port for the MySql instance.
	 */
	port?: string;

	/**
	 * The user for the MySql instance.
	 */
	user: string;

	/**
	 * The password for the MySql instance.
	 */
	password: string;

	/**
	 * The name of the database to be used.
	 */
	database?: string;
}

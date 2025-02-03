// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the PostgresSql Entity Storage Connector.
 */
export interface IPostgresSqlEntityStorageConnectorConfig {
	/**
	 * The host for the PostgresSql instance.
	 */
	host: string;

	/**
	 * The port for the PostgresSql instance.
	 */
	port?: number;

	/**
	 * The user for the PostgresSql instance.
	 */
	user: string;

	/**
	 * The password for the PostgresSql instance.
	 */
	password: string;

	/**
	 * The name of the database to be used.
	 */
	database: string;

	/**
	 * The name of the table to be used.
	 */
	tableName: string;
}

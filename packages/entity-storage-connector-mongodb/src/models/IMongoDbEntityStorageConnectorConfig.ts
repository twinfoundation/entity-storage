// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the MongoDb Entity Storage Connector.
 */
export interface IMongoDbEntityStorageConnectorConfig {
	/**
	 * The host for the MongoDb instance.
	 */
	host: string;

	/**
	 * The port for the MongoDb instance.
	 */
	port?: string;

	/**
	 * The user for the MongoDb instance.
	 */
	user?: string;

	/**
	 * The password for the MongoDb instance.
	 */
	password?: string;

	/**
	 * The name of the database to be used.
	 */
	database: string;

	/**
	 * The name of the collection to be used.
	 */
	collection: string;
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * ScyllaDB Configuration.
 */
export interface IScyllaDBConfig {
	/**
	 * The host to contact to.
	 */
	hosts: string[];

	/**
	 * The local data center.
	 */
	localDataCenter: string;

	/**
	 * The keyspace to use.
	 */
	keyspace: string;
}

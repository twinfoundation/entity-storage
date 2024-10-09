// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the entity storage service.
 */
export interface IEntityStorageConfig {
	/**
	 * Include the node identity when performing storage operations, defaults to true.
	 */
	includeNodeIdentity?: boolean;

	/**
	 * Include the user identity when performing storage operations, defaults to true.
	 */
	includeUserIdentity?: boolean;
}

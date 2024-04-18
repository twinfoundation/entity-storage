// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the Memory Entity Storage Provider.
 */
export interface IMemoryEntityStorageProviderConfig<T = unknown> {
	/**
	 * Initial values to populate the entity storage with.
	 */
	initialValues?: { [tenantId: string]: T[] };
}

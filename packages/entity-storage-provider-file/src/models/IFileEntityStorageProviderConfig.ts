// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the File Entity Storage Provider.
 */
export interface IFileEntityStorageProviderConfig {
	/**
	 * The directory to use for storage.
	 */
	directory: string;

	/**
	 * The base filename to use for stored items.
	 */
	baseFilename: string;
}

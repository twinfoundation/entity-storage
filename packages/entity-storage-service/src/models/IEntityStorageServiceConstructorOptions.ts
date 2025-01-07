// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IEntityStorageConfig } from "./IEntityStorageConfig";

/**
 * Options for the Entity Storage Service constructor.
 */
export interface IEntityStorageServiceConstructorOptions {
	/**
	 * The type of the entity storage.
	 */
	entityStorageType: string;

	/**
	 * The configuration for the service.
	 */
	config?: IEntityStorageConfig;
}

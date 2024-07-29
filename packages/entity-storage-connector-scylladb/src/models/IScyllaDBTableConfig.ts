// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IScyllaDBConfig } from "./IScyllaDBConfig";

/**
 * Definition of MySQL DB configuration.
 */
export interface IScyllaDBTableConfig extends IScyllaDBConfig {
	/**
	 * The name of the table for the storage.
	 */
	tableName: string;
}

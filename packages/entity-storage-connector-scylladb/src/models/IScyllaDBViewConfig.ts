// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IScyllaDBTableConfig } from "./IScyllaDBTableConfig";

/**
 * Definition of MySQL DB configuration.
 */
export interface IScyllaDBViewConfig extends IScyllaDBTableConfig {
	/**
	 * The name of view.
	 */
	viewName: string;
}

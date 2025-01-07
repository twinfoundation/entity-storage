// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IScyllaDBViewConfig } from "./IScyllaDBViewConfig";

/**
 * Options for the ScyllaDB View Connector constructor.
 */
export interface IScyllaDBViewConnectorConstructorOptions {
	/**
	 * The type of logging connector to use, defaults to no logging.
	 */
	loggingConnectorType?: string;

	/**
	 * The name of the entity schema.
	 */
	entitySchema: string;

	/**
	 * The name of the view schema.
	 */
	viewSchema: string;

	/**
	 * The configuration for the connector.
	 */
	config: IScyllaDBViewConfig;
}

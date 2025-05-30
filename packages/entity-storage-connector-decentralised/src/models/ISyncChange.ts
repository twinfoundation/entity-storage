// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The object definition for a sync change.
 */
export interface ISyncChange<T = unknown> {
	/**
	 * Operation.
	 */
	operation: "set" | "delete";

	/**
	 * The item id if the operation is a delete.
	 */
	id?: string;

	/**
	 * The entity to set.
	 */
	entity?: T;
}

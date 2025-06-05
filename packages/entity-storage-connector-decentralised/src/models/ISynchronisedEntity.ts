// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The base definition for synchronised entries.
 */
export interface ISynchronisedEntity {
	/**
	 * The date the entry was created
	 */
	dateCreated: string;

	/**
	 * The identity of the node that owns the entry.
	 */
	nodeIdentity: string;
}

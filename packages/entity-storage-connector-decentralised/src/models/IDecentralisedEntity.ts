// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * The base definition for decentralised entries.
 */
export interface IDecentralisedEntity {
	/**
	 * The date the entry was created
	 */
	dateCreated: string;

	/**
	 * The identity of the node that owns the entry.
	 */
	nodeIdentity: string;
}

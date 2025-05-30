// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IProof } from "@twin.org/standards-w3c-did";
import type { ISyncChange } from "./ISyncChange";

/**
 * The object definition for a sync change set.
 */
export interface ISyncChangeSet<T = unknown> {
	/**
	 * The id of the snapshot.
	 */
	id: string;

	/**
	 * The date the change set was created.
	 */
	dateCreated: string;

	/**
	 * The date the change set was last modified.
	 */
	dateModified?: string;

	/**
	 * The changes to perform.
	 */
	changes: ISyncChange<T>[];

	/**
	 * The identity of the node that created the change set.
	 */
	nodeIdentity: string;

	/**
	 * The proof for the change set.
	 */
	proof?: IProof;
}

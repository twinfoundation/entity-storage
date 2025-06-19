// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { entity, property } from "@twin.org/entity";
import type { ISyncChange } from "../models/ISyncChange";

/**
 * Class representing an entry for the sync snapshot.
 */
@entity()
export class SyncSnapshotEntry<T = unknown> {
	/**
	 * The id for the snapshot.
	 */
	@property({ type: "string", isPrimary: true })
	public id!: string;

	/**
	 * The context for the snapshot i.e. which entity is being synchronized.
	 */
	@property({ type: "string", isSecondary: true })
	public context!: string;

	/**
	 * The date the snapshot was created.
	 */
	@property({ type: "string" })
	public dateCreated!: string;

	/**
	 * The date the snapshot was last modified.
	 */
	@property({ type: "string", optional: true })
	public dateModified?: string;

	/**
	 * The flag to determine if this is the current local snapshot containing changes for this node.
	 */
	@property({ type: "boolean", optional: true })
	public isLocalSnapshot?: boolean;

	/**
	 * The ids of the storage for the change sets in the snapshot, if this is not a local snapshot.
	 */
	@property({ type: "array", itemType: "string", optional: true })
	public changeSetStorageIds?: string[];

	/**
	 * The changes that were made in this snapshot, if this is a local snapshot.
	 */
	@property({ type: "array", itemType: "object", optional: true })
	public localChanges?: ISyncChange<T>[];
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";

/**
 * Class for performing synchronised storage operations.
 */
export interface ITrustedSynchronisedStorageComponent extends IComponent {
	/**
	 * Synchronise a complete set of changes, assumes this is a trusted node.
	 * @param changeSetStorageId The id of the change set to synchronise in blob storage.
	 * @returns Nothing.
	 */
	syncChangeSet(changeSetStorageId: string): Promise<void>;
}

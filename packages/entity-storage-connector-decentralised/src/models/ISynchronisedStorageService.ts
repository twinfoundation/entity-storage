// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";
import type { ISynchronisedEntity } from "./ISynchronisedEntity";

/**
 * Class for performing synchronised storage operations.
 */
export interface ISynchronisedStorageService<T extends ISynchronisedEntity = ISynchronisedEntity>
	extends IComponent {
	/**
	 * Prepares an entry for synchronisation.
	 * @param entity The entity to prepare for synchronisation.
	 * @returns Nothing.
	 */
	prepareEntityForSync(entity: T): Promise<void>;

	/**
	 * Synchronise an entity storage operation.
	 * @param entity The entity to synchronise.
	 * @returns Nothing.
	 */
	syncEntitySet(entity: T): Promise<void>;

	/**
	 * Synchronise an entity removal operation.
	 * @param id The id of the entity to synchronise.
	 * @returns Nothing.
	 */
	syncEntityRemove(id: string): Promise<void>;

	/**
	 * Synchronise a complete set of changes, assumes this is a trusted node.
	 * @param changeSetStorageId The id of the change set to synchronise in blob storage.
	 * @returns Nothing.
	 */
	syncChangeSet(changeSetStorageId: string): Promise<void>;
}

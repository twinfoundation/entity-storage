// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IComponent } from "@twin.org/core";
import type { ISynchronisedEntity } from "./ISynchronisedEntity";

/**
 * Class for performing synchronised storage operations.
 */
export interface ISynchronisedStorageComponent<T extends ISynchronisedEntity = ISynchronisedEntity>
	extends IComponent {
	/**
	 * Prepares an entry for synchronisation.
	 * @param entity The entity to prepare for synchronisation.
	 * @returns Nothing.
	 */
	prepare(entity: T): Promise<void>;

	/**
	 * Synchronise an entity storage operation.
	 * @param entity The entity to synchronise.
	 * @returns Nothing.
	 */
	set(entity: T): Promise<void>;

	/**
	 * Synchronise an entity removal operation.
	 * @param id The id of the entity to synchronise.
	 * @returns Nothing.
	 */
	remove(id: string): Promise<void>;
}

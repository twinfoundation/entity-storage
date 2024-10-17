// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import type { IValueType } from "./IValueType";

/**
 * Interface representing an entity with indexing fields.
 */
export interface IEntityWithIndexing {
	/**
	 * The value array.
	 */
	valueArray?: IValueType[];

	/**
	 * The value array fields.
	 */
	valueArrayFields?: string[];
}

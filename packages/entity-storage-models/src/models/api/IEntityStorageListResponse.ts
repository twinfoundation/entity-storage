// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Response to getting the list of entries from a query.
 */
export interface IEntityStorageListResponse {
	/**
	 * The list of entries from the query.
	 */
	body: {
		/**
		 * The entities from the query.
		 */
		entities: unknown[];

		/**
		 * The cursor for the next page.
		 */
		cursor?: string;
	};
}

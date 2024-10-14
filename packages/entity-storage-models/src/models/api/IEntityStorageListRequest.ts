// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Query the entries from entity storage.
 */
export interface IEntityStorageListRequest {
	/**
	 * The parameters from the query.
	 */
	query?: {
		/**
		 * The condition for the query as JSON version of EntityCondition type.
		 */
		conditions?: string;

		/**
		 * The sort property array as JSON serialization of property,direction.
		 */
		sortProperties?: string;

		/**
		 * The properties to return in the response as a comma separated list, by default returns all properties.
		 */
		properties?: string;

		/**
		 * The number of entries to return per page.
		 */
		pageSize?: number;

		/**
		 * The cursor to get next chunk of data, returned in previous response.
		 */
		cursor?: string;
	};
}

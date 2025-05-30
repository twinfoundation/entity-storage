// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { ISyncSnapshot } from "./ISyncSnapshot";

/**
 * The object definition for a sync state.
 */
export interface ISyncState {
	/**
	 * The snapshots.
	 */
	snapshots: ISyncSnapshot[];
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { EntitySchemaFactory, EntitySchemaHelper } from "@twin.org/entity";
import { nameof } from "@twin.org/nameof";
import { SyncSnapshotEntry } from "./entities/syncSnapshotEntry";

/**
 * Initialize the schema for the decentralised service.
 */
export function initSchema(): void {
	EntitySchemaFactory.register(nameof<SyncSnapshotEntry>(), () =>
		EntitySchemaHelper.getSchema(SyncSnapshotEntry)
	);
}

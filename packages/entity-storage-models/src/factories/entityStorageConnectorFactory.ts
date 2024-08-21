// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Factory } from "@gtsc/core";
import type { IEntityStorageConnector } from "../models/IEntityStorageConnector";

/**
 * Factory for creating entity storage connectors.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EntityStorageConnectorFactory =
	Factory.createFactory<IEntityStorageConnector>("entity-storage");

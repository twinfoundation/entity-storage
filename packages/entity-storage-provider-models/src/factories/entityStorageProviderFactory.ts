// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { Factory } from "@gtsc/core";
import type { IEntityStorageProvider } from "../models/IEntityStorageProvider";

/**
 * Factory for creating entity storage providers.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EntityStorageProviderFactory = new Factory<IEntityStorageProvider>("entity-storage");

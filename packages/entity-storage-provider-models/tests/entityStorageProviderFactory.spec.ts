// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { EntityStorageProviderFactory } from "../src/factories/entityStorageProviderFactory";
import type { IEntityStorageProvider } from "../src/models/IEntityStorageProvider";

describe("EntityStorageProviderFactory", () => {
	test("can add an item to the factory", async () => {
		EntityStorageProviderFactory.register(
			"my-entity-storage",
			() => ({}) as unknown as IEntityStorageProvider
		);
	});
});

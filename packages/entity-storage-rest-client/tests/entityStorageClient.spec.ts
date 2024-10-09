// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { EntityStorageClient } from "../src/entityStorageClient";

describe("EntityStorageClient", () => {
	test("Can create an instance", async () => {
		const client = new EntityStorageClient({ endpoint: "http://localhost:8080" });
		expect(client).toBeDefined();
	});
});

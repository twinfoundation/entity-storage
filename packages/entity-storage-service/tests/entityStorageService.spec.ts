// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { entity, EntitySchemaFactory, EntitySchemaHelper, property } from "@twin.org/entity";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { nameof } from "@twin.org/nameof";
import { EntityStorageService } from "../src/entityStorageService";

/**
 * Test Type Definition.
 */
@entity()
class TestType {
	/**
	 * Id.
	 */
	@property({ type: "string", isPrimary: true })
	public id!: string;

	/**
	 * Value1.
	 */
	@property({ type: "string", isSecondary: true })
	public value1!: string;

	/**
	 * Value2.
	 */
	@property({ type: "number", format: "uint8" })
	public value2!: number;
}

describe("EntityStorageService", () => {
	beforeEach(() => {
		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));

		const storage = new MemoryEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>()
		});

		EntityStorageConnectorFactory.register("test-type", () => storage);
	});

	test("can create the service", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });
		expect(service).toBeDefined();
	});
});

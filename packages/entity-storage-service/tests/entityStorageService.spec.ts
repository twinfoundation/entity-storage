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

const TEST_USER_IDENTITY = "test-user-identity";
const TEST_NODE_IDENTITY = "test-node-identity";
let storage: MemoryEntityStorageConnector<TestType>;

describe("EntityStorageService", () => {
	beforeEach(() => {
		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));

		storage = new MemoryEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>()
		});

		EntityStorageConnectorFactory.register("test-type", () => storage);
	});

	test("can create the service", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });
		expect(service).toBeDefined();
	});

	test("can set an entity with no nodeIdentity or userIdentity", async () => {
		const service = new EntityStorageService({
			entityStorageType: "test-type",
			config: { includeNodeIdentity: false, includeUserIdentity: false }
		});
		await service.set({ id: "1", value1: "value1", value2: 42 });

		expect(storage.getStore()).toEqual([{ id: "1", value1: "value1", value2: 42 }]);
	});

	test("can fail to set an entity with no userIdentity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		await expect(service.set({ id: "1", value1: "value1", value2: 42 })).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "userIdentity",
				value: "undefined"
			}
		});
	});

	test("can fail to set an entity with no nodeIdentity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		await expect(
			service.set({ id: "1", value1: "value1", value2: 42 }, TEST_USER_IDENTITY)
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "nodeIdentity",
				value: "undefined"
			}
		});
	});

	test("can set an entity with user and node identity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		await service.set(
			{ id: "1", value1: "value1", value2: 42 },
			TEST_USER_IDENTITY,
			TEST_NODE_IDENTITY
		);

		expect(storage.getStore()).toEqual([
			{
				id: "1",
				value1: "value1",
				value2: 42,
				userIdentity: TEST_USER_IDENTITY,
				nodeIdentity: TEST_NODE_IDENTITY
			}
		]);
	});

	test("can get an entity with no user and node identity", async () => {
		const service = new EntityStorageService({
			entityStorageType: "test-type",
			config: { includeNodeIdentity: false, includeUserIdentity: false }
		});

		await service.set({ id: "1", value1: "value1", value2: 42 });

		const item = await service.get("1");

		expect(item).toEqual({
			id: "1",
			value1: "value1",
			value2: 42
		});
	});

	test("can get an entity with user and node identity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		await service.set(
			{ id: "1", value1: "value1", value2: 42 },
			TEST_USER_IDENTITY,
			TEST_NODE_IDENTITY
		);

		const item = await service.get("1", undefined, TEST_USER_IDENTITY, TEST_NODE_IDENTITY);

		expect(item).toEqual({
			id: "1",
			value1: "value1",
			value2: 42
		});
	});

	test("can remove an entity with user and node identity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		await service.set(
			{ id: "1", value1: "value1", value2: 42 },
			TEST_USER_IDENTITY,
			TEST_NODE_IDENTITY
		);

		await service.remove("1", TEST_USER_IDENTITY, TEST_NODE_IDENTITY);

		expect(storage.getStore()).toEqual([]);
	});

	test("can remove an entity with no user and node identity", async () => {
		const service = new EntityStorageService({
			entityStorageType: "test-type",
			config: { includeNodeIdentity: false, includeUserIdentity: false }
		});

		await service.set({ id: "1", value1: "value1", value2: 42 });

		await service.remove("1");

		expect(storage.getStore()).toEqual([]);
	});

	test("can query entities with user and node identity", async () => {
		const service = new EntityStorageService({ entityStorageType: "test-type" });

		for (let i = 0; i < 10; i++) {
			await service.set(
				{ id: (i + 1).toString(), value1: "value1", value2: 42 },
				TEST_USER_IDENTITY,
				TEST_NODE_IDENTITY
			);
		}

		const result = await service.query(
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			TEST_USER_IDENTITY,
			TEST_NODE_IDENTITY
		);

		expect(result.entities.length).toEqual(10);
		expect(result.entities[0]).toEqual({
			id: "1",
			value1: "value1",
			value2: 42
		});
	});

	test("can query entities with no user and node identity", async () => {
		const service = new EntityStorageService({
			entityStorageType: "test-type",
			config: { includeNodeIdentity: false, includeUserIdentity: false }
		});

		for (let i = 0; i < 10; i++) {
			await service.set({ id: (i + 1).toString(), value1: "value1", value2: 42 });
		}

		const result = await service.query();

		expect(result.entities.length).toEqual(10);
		expect(result.entities[0]).toEqual({
			id: "1",
			value1: "value1",
			value2: 42
		});
	});
});

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/* eslint-disable max-classes-per-file */
/* eslint-disable jsdoc/require-jsdoc */

import { I18n } from "@twin.org/core";
import {
	ComparisonOperator,
	EntitySchemaFactory,
	EntitySchemaHelper,
	SortDirection,
	entity,
	property
} from "@twin.org/entity";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import {
	EntityStorageLoggingConnector,
	type LogEntry,
	initSchema
} from "@twin.org/logging-connector-entity-storage";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { TEST_SCYLLA_CONFIG } from "./setupTestEnv";
import type { IScyllaDBTableConfig } from "../src/models/IScyllaDBTableConfig";
import { ScyllaDBTableConnector } from "../src/scyllaDBTableConnector";

/**
 * Test SubType Definition.
 */
@entity()
class SubType {
	/**
	 * Field1.
	 */
	@property({ type: "string", format: "date-time" })
	public field1!: Date;
}

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

	/**
	 * Value3.
	 */
	@property({ type: "object", itemTypeRef: "SubType", optional: true })
	public value3!: SubType | undefined;
}

let memoryEntityStorage: MemoryEntityStorageConnector<LogEntry>;

describe("ScyllaDBTableConnector", () => {
	beforeAll(async () => {
		I18n.addDictionary("en", await import("../locales/en.json"));

		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));
		EntitySchemaFactory.register(nameof<SubType>(), () => EntitySchemaHelper.getSchema(SubType));
		initSchema();
	});

	beforeEach(() => {
		memoryEntityStorage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>()
		});
		EntityStorageConnectorFactory.register("log-entry", () => memoryEntityStorage);

		LoggingConnectorFactory.register("logging", () => new EntityStorageLoggingConnector());
		LoggingConnectorFactory.register("node-logging", () => new EntityStorageLoggingConnector());
	});

	afterEach(async () => {
		const entityStorage = new ScyllaDBTableConnector({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		try {
			await entityStorage.truncateTable();
		} catch {}
	});

	afterAll(async () => {
		const entityStorage = new ScyllaDBTableConnector({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.dropTable();
	});

	test("can fail to construct when there is no options", async () => {
		expect(
			() =>
				new ScyllaDBTableConnector(
					undefined as unknown as {
						loggingConnectorType?: string;
						entitySchema: string;
						config: IScyllaDBTableConfig;
					}
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "options",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no schema", async () => {
		expect(
			() =>
				new ScyllaDBTableConnector(
					{} as unknown as {
						loggingConnectorType?: string;
						entitySchema: string;
						config: IScyllaDBTableConfig;
					}
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.string",
				properties: {
					property: "options.entitySchema",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no config", async () => {
		expect(
			() =>
				new ScyllaDBTableConnector({ entitySchema: "test" } as unknown as {
					loggingConnectorType?: string;
					entitySchema: string;
					config: IScyllaDBTableConfig;
				})
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "options.config",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when config is empty", async () => {
		expect(
			() =>
				new ScyllaDBTableConnector({ entitySchema: "test", config: {} } as unknown as {
					loggingConnectorType?: string;
					entitySchema: string;
					config: IScyllaDBTableConfig;
				})
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.array",
				properties: {
					property: "options.config.hosts",
					value: "undefined"
				}
			})
		);
	});

	test("can construct", async () => {
		const entityStorage = new ScyllaDBTableConnector({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		expect(entityStorage).toBeDefined();
	});

	test.skip("can fail to bootstrap with invalid host", async () => {
		const entityStorage = new ScyllaDBTableConnector({
			entitySchema: nameof<TestType>(),
			config: {
				hosts: ["example.org"],
				tableName: "test1",
				localDataCenter: "datacenter1",
				keyspace: "test_keyspace"
			}
		});
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("tableCreating");
		expect(logs?.[1].message).toEqual("tableCreateFailed");

		expect(I18n.hasMessage("info.scyllaDBTableConnector.tableCreating")).toEqual(true);
		expect(I18n.hasMessage("error.scyllaDBTableConnector.tableCreateFailed")).toEqual(true);
	});

	test("can bootstrap and create table", async () => {
		const entityStorage = new ScyllaDBTableConnector({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(5);
		expect(logs?.[0].message).toEqual("tableCreating");
		expect(logs?.[1].message).toEqual("sql");
		expect(logs?.[2].message).toEqual("typeCreated");
		expect(logs?.[3].message).toEqual("sql");
		expect(logs?.[4].message).toEqual("tableCreated");

		expect(I18n.hasMessage("info.scyllaDBTableConnector.typeCreated")).toEqual(true);
		expect(I18n.hasMessage("info.scyllaDBTableConnector.sql")).toEqual(true);
	});

	test("can fail to set an item with no entity", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await expect(entityStorage.set(undefined as unknown as TestType)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.objectUndefined",
			properties: {
				property: "entity",
				value: "undefined"
			}
		});
	});

	test("can set an item", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date() }
		};
		await entityStorage.set(objectSet);

		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can set an item with a condition", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});

		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date() }
		};
		await entityStorage.set(objectSet, [{ property: "value1", value: "aaa" }]);

		const result = await entityStorage.get(entityId);
		expect(result?.id).toEqual(objectSet.id);
		expect(result?.value1).toEqual(objectSet.value1);
		expect(result?.value2).toEqual(objectSet.value2);
		expect(result?.value3).toEqual(objectSet.value3);
	});

	test("can set an item to update it", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date() }
		};
		await entityStorage.set(objectSet);

		objectSet.value2 = 99;
		await entityStorage.set(objectSet);

		const result = await entityStorage.get(entityId);
		expect(result?.id).toEqual(objectSet.id);
		expect(result?.value1).toEqual(objectSet.value1);
		expect(result?.value2).toEqual(objectSet.value2);
		expect(result?.value3).toEqual(objectSet.value3);
	});

	test("can fail to get an item with no id", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await expect(entityStorage.get(undefined as unknown as string)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "id",
				value: "undefined"
			}
		});
	});

	test("can not get an item", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const item = await entityStorage.get("20000");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.set({ id: "2", value1: "vvv", value2: 35, value3: undefined });
		const item = await entityStorage.get("2");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("2");
		expect(item?.value1).toEqual("vvv");
		expect(item?.value2).toEqual(35);
		expect(item?.value3).toBeUndefined();
	});

	test("can get an item by secondary index", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const secondaryValue = "zzz";
		await entityStorage.set({ id: "300", value1: secondaryValue, value2: 55, value3: undefined });
		const item = await entityStorage.get(secondaryValue, "value1");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("300");
		expect(item?.value1).toEqual("zzz");
		expect(item?.value2).toEqual(55);
	});

	test("can fail to remove an item with no id", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await expect(entityStorage.remove(undefined as unknown as string)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "id",
				value: "undefined"
			}
		});
	});

	test("can not remove an item", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.set({ id: "10001", value1: "aaa", value2: 5555, value3: undefined });

		const idToRemove = "1000999";
		await entityStorage.remove(idToRemove);
		// No exception should be thrown
	});

	test("can remove an item", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const idToRemove = "65432";
		await entityStorage.set({ id: idToRemove, value1: "aaa", value2: 99, value3: undefined });
		await entityStorage.remove(idToRemove);

		const result = await entityStorage.get(idToRemove);
		expect(result).toBeUndefined();
	});

	test("can fail remove an item with a condition", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const idToRemove = "65432";
		await entityStorage.set({ id: idToRemove, value1: "aaa", value2: 99, value3: undefined });
		await entityStorage.remove(idToRemove, [{ property: "value1", value: "aaa1" }]);

		const result = await entityStorage.get(idToRemove);
		expect(result).toBeDefined();
	});

	test("can remove an item with a condition", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const idToRemove = "65432";
		await entityStorage.set({ id: idToRemove, value1: "aaa", value2: 99, value3: undefined });
		await entityStorage.remove(idToRemove, [{ property: "value1", value: "aaa" }]);

		const result = await entityStorage.get(idToRemove);
		expect(result).toBeUndefined();
	});

	test("can query items with empty store", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with single entry", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		await entityStorage.set({ id: "1", value1: "aaa", value2: 95, value3: undefined });
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with multiple entries", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		for (let i = 0; i < 80; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 999,
				value3: undefined
			});
		}
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(40);
	});

	test("can query items with multiple entries and cursor", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		for (let i = 0; i < 50; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 5555,
				value3: undefined
			});
		}
		const result = await entityStorage.query();
		const result2 = await entityStorage.query(undefined, undefined, undefined, result.cursor);
		expect(result2).toBeDefined();
		expect(result2.entities.length).toEqual(10);
		expect(result2.cursor).toBeUndefined();
	});

	test("can query items with multiple entries and apply conditions", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: { field1: new Date() }
			});
		}

		const result = await entityStorage.query({
			property: "id",
			value: "20",
			comparison: ComparisonOperator.Equals
		});

		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with multiple entries and apply custom sort", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (30 - i).toString(),
				value1: (30 - i).toString(),
				value2: 7777,
				value3: undefined
			});
		}
		const result = await entityStorage.query(
			{
				conditions: [
					{
						property: "id",
						value: ["26", "20"],
						comparison: ComparisonOperator.In
					}
				]
			},
			[
				{
					property: "value1",
					sortDirection: SortDirection.Ascending
				}
			]
		);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(2);
		expect(result.entities[0].value1).toEqual("20");
	});

	test("can query items and get a reduced data set", async () => {
		const entityStorage = new ScyllaDBTableConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: TEST_SCYLLA_CONFIG
		});
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined
			});
		}
		const result = await entityStorage.query(undefined, undefined, ["id", "value1"]);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(30);
		expect(result.entities[0].value2).toBeUndefined();
		expect(result.entities[0].value3).toBeUndefined();
	});
});

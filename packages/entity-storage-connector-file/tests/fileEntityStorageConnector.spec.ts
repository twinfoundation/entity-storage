// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { readFile, rm } from "node:fs/promises";
import { Converter, I18n, RandomHelper } from "@gtsc/core";
import {
	ComparisonOperator,
	EntitySchemaFactory,
	EntitySchemaHelper,
	SortDirection,
	entity,
	property
} from "@gtsc/entity";
import { MemoryEntityStorageConnector } from "@gtsc/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@gtsc/entity-storage-models";
import {
	EntityStorageLoggingConnector,
	type LogEntry,
	initSchema
} from "@gtsc/logging-connector-entity-storage";
import { LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import { FileEntityStorageConnector } from "../src/fileEntityStorageConnector";
import type { IFileEntityStorageConnectorConfig } from "../src/models/IFileEntityStorageConnectorConfig";

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
	@property({ type: "string" })
	public value1!: string;

	/**
	 * Value2.
	 */
	@property({ type: "string" })
	public value2!: string;
}

let memoryEntityStorage: MemoryEntityStorageConnector<LogEntry>;

const TEST_DIRECTORY_ROOT = "./.tmp/";
const TEST_DIRECTORY = `${TEST_DIRECTORY_ROOT}test-data-${Converter.bytesToHex(RandomHelper.generate(8))}`;
const TEST_STORE_NAME = `${TEST_DIRECTORY}/store.json`;

describe("FileEntityStorageConnector", () => {
	beforeAll(async () => {
		I18n.addDictionary("en", await import("../locales/en.json"));

		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));
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
		try {
			await rm(TEST_DIRECTORY_ROOT, { recursive: true });
		} catch {}
	});

	test("can fail to construct when there is no options", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					undefined as unknown as {
						loggingConnectorType?: string;
						entitySchema: string;
						config: IFileEntityStorageConnectorConfig;
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
				new FileEntityStorageConnector(
					{} as unknown as {
						loggingConnectorType?: string;
						entitySchema: string;
						config: IFileEntityStorageConnectorConfig;
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
				new FileEntityStorageConnector({ entitySchema: "test" } as unknown as {
					loggingConnectorType?: string;
					entitySchema: string;
					config: IFileEntityStorageConnectorConfig;
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

	test("can fail to construct when there is no config directory", async () => {
		expect(
			() =>
				new FileEntityStorageConnector({ entitySchema: "test", config: {} } as unknown as {
					loggingConnectorType?: string;
					entitySchema: string;
					config: IFileEntityStorageConnectorConfig;
				})
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.string",
				properties: {
					property: "options.config.directory",
					value: "undefined"
				}
			})
		);
	});

	test("can construct", async () => {
		const entityStorage = new FileEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config: {
				directory: TEST_DIRECTORY
			}
		});
		expect(entityStorage).toBeDefined();
	});

	test("can fail to bootstrap with invalid directory", async () => {
		const entityStorage = new FileEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config: {
				directory: "|\0"
			}
		});
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreateFailed");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreating")).toEqual(true);
		expect(I18n.hasMessage("error.fileEntityStorageConnector.directoryCreateFailed")).toEqual(true);
	});

	test("can bootstrap and create directory", async () => {
		const entityStorage = new FileEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config: {
				directory: TEST_DIRECTORY
			}
		});
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreated");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreating")).toEqual(true);
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreated")).toEqual(true);
	});

	test("can bootstrap and skip existing directory", async () => {
		const entityStorage = new FileEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config: {
				directory: TEST_DIRECTORY
			}
		});
		await entityStorage.bootstrap();
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(3);
		expect(logs?.[2].message).toEqual("directoryExists");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryExists")).toEqual(true);
	});

	test("can fail to set an item with no entity", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
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
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(1);
		expect(store[0]).toBeDefined();
		expect(store[0].id).toEqual("1");
		expect(store[0].value1).toEqual("aaa");
		expect(store[0].value2).toEqual("bbb");
	});

	test("can set an item to update it", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });

		await entityStorage.set({ id: "1", value1: "ccc", value2: "ddd" });

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(1);
		expect(store[0]).toBeDefined();
		expect(store[0].id).toEqual("1");
		expect(store[0].value1).toEqual("ccc");
		expect(store[0].value2).toEqual("ddd");
	});

	test("can fail to get an item with no id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await expect(
			entityStorage.get(undefined as unknown as string, undefined)
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "id",
				value: "undefined"
			}
		});
	});

	test("can not get an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });
		const item = await entityStorage.get("2");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });
		const item = await entityStorage.get("1");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("1");
		expect(item?.value1).toEqual("aaa");
		expect(item?.value2).toEqual("bbb");
	});

	test("can get an item by secondary index", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });
		const item = await entityStorage.get("aaa", "value1");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("1");
		expect(item?.value1).toEqual("aaa");
		expect(item?.value2).toEqual("bbb");
	});

	test("can fail to remove an item with no id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
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
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });

		await entityStorage.remove("2");

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(1);
	});

	test("can remove an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });
		await entityStorage.remove("1");

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(0);
	});

	test("can query items with empty store", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.totalEntities).toEqual(0);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with single entry", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		await entityStorage.set({ id: "1", value1: "aaa", value2: "bbb" });
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.totalEntities).toEqual(1);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with multiple entries", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({ id: (i + 1).toString(), value1: "aaa", value2: "bbb" });
		}
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.totalEntities).toEqual(30);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toEqual("20");
	});

	test("can query items with multiple entries and cursor", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({ id: (i + 1).toString(), value1: "aaa", value2: "bbb" });
		}
		const result = await entityStorage.query();
		const result2 = await entityStorage.query(undefined, undefined, undefined, result.cursor);
		expect(result2).toBeDefined();
		expect(result2.entities.length).toEqual(10);
		expect(result2.totalEntities).toEqual(30);
		expect(result2.pageSize).toEqual(20);
		expect(result2.cursor).toBeUndefined();
	});

	test("can query items with multiple entries and apply conditions", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 100; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: i % 3 === 0 ? "ccc" : "bbb"
			});
		}
		const result = await entityStorage.query({
			property: "value2",
			value: "ccc",
			operator: ComparisonOperator.Equals
		});
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.totalEntities).toEqual(34);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toEqual("58");
	});

	test("can query items with multiple entries and apply custom sort", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({ id: (30 - i).toString(), value1: "aaa", value2: "bbb" });
		}
		const result = await entityStorage.query(undefined, [
			{
				property: "id",
				sortDirection: SortDirection.Ascending
			}
		]);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.entities[0].id).toEqual("1");
		expect(result.totalEntities).toEqual(30);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toEqual("20");
	});

	test("can query items and get a reduced data set", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config: { directory: TEST_DIRECTORY }
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({ id: (i + 1).toString(), value1: "aaa", value2: "bbb" });
		}
		const result = await entityStorage.query(undefined, undefined, ["id", "value1"]);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.entities[0].id).toEqual("1");
		expect(result.entities[0].value1).toEqual("aaa");
		expect(result.entities[0].value2).toBeUndefined();
	});
});

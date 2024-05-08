// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { readFile, rm } from "node:fs/promises";
import { Converter, I18n, RandomHelper } from "@gtsc/core";
import { ComparisonOperator, SortDirection, type IEntityDescriptor } from "@gtsc/entity";
import { MemoryEntityStorageConnector } from "@gtsc/entity-storage-connector-memory";
import {
	EntityStorageLoggingConnector,
	type IEntityLogEntry,
	EntityLogEntryDescriptor
} from "@gtsc/logging-connector-entity-storage";
import type { ILogging } from "@gtsc/logging-models";
import { LoggingService } from "@gtsc/logging-service";
import { nameof } from "@gtsc/nameof";
import { FileEntityStorageConnector } from "../src/fileEntityStorageConnector";
import type { IFileEntityStorageConnectorConfig } from "../src/models/IFileEntityStorageConnectorConfig";

/**
 * Test Type Definition.
 */
interface TestType {
	/**
	 * Id.
	 */
	id: string;
	/**
	 * Value1.
	 */
	value1: string;
	/**
	 * Value2.
	 */
	value2: string;
}

const testDescriptor: IEntityDescriptor<TestType> = {
	name: nameof<TestType>(),
	properties: [
		{
			property: "id",
			type: "string",
			isPrimary: true
		},
		{
			property: "value1",
			type: "string"
		},
		{
			property: "value2",
			type: "string"
		}
	]
};

let memoryEntityStorage: MemoryEntityStorageConnector<IEntityLogEntry>;
let testLogging: ILogging;

const TEST_DIRECTORY_ROOT = "./.tmp/";
const TEST_DIRECTORY = `${TEST_DIRECTORY_ROOT}test-data-${Converter.bytesToHex(RandomHelper.generate(8))}`;
const TEST_TENANT_ID = "test-tenant";
const TEST_TENANT_ID2 = "test-tenant2";
const TEST_STORE_NAME = `${TEST_DIRECTORY}/${TEST_TENANT_ID}.json`;

describe("FileEntityStorageConnector", () => {
	beforeAll(async () => {
		I18n.addDictionary("en", await import("../locales/en.json"));
	});

	beforeEach(() => {
		memoryEntityStorage = new MemoryEntityStorageConnector(EntityLogEntryDescriptor);
		const entityStorageLoggingConnector = new EntityStorageLoggingConnector({
			logEntryStorage: memoryEntityStorage
		});
		testLogging = new LoggingService({
			loggingConnector: entityStorageLoggingConnector
		});
	});

	afterAll(async () => {
		try {
			await rm(TEST_DIRECTORY_ROOT, { recursive: true });
		} catch {}
	});

	test("can fail to construct when there is no dependencies", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					undefined as unknown as { logging: ILogging },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "dependencies",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no logging", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					{} as unknown as { logging: ILogging },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "dependencies.logging",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no descriptor", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					{ logging: testLogging },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "entityDescriptor",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no descriptor properties", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					{ logging: testLogging },
					{} as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.array",
				properties: {
					property: "entityDescriptor.properties",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no config", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					{ logging: testLogging },
					testDescriptor,
					undefined as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "config",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no config directory", async () => {
		expect(
			() =>
				new FileEntityStorageConnector(
					{ logging: testLogging },
					testDescriptor,
					{} as unknown as IFileEntityStorageConnectorConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.string",
				properties: {
					property: "config.directory",
					value: "undefined"
				}
			})
		);
	});

	test("can construct", async () => {
		const entityStorage = new FileEntityStorageConnector({ logging: testLogging }, testDescriptor, {
			directory: TEST_DIRECTORY
		});
		expect(entityStorage).toBeDefined();
	});

	test("can fail to bootstrap with invalid directory", async () => {
		const entityStorage = new FileEntityStorageConnector({ logging: testLogging }, testDescriptor, {
			directory: "|\0"
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = memoryEntityStorage.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreateFailed");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreating")).toEqual(true);
		expect(I18n.hasMessage("error.fileEntityStorageConnector.directoryCreateFailed")).toEqual(true);
	});

	test("can bootstrap and create directory", async () => {
		const entityStorage = new FileEntityStorageConnector({ logging: testLogging }, testDescriptor, {
			directory: TEST_DIRECTORY
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = memoryEntityStorage.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreated");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreating")).toEqual(true);
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryCreated")).toEqual(true);
	});

	test("can bootstrap and skip existing directory", async () => {
		const entityStorage = new FileEntityStorageConnector({ logging: testLogging }, testDescriptor, {
			directory: TEST_DIRECTORY
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = memoryEntityStorage.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(1);
		expect(logs?.[0].message).toEqual("directoryExists");
		expect(I18n.hasMessage("info.fileEntityStorageConnector.directoryExists")).toEqual(true);
	});

	test("can fail to set an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(entityStorage.set({}, undefined as unknown as TestType)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "requestContext.tenantId",
				value: "undefined"
			}
		});
	});

	test("can fail to set an item with no entity", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(
			entityStorage.set({ tenantId: TEST_TENANT_ID }, undefined as unknown as TestType)
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.objectUndefined",
			properties: {
				property: "entity",
				value: "undefined"
			}
		});
	});

	test("can set an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{ directory: TEST_DIRECTORY }
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);

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
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{ directory: TEST_DIRECTORY }
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);

		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "ccc", value2: "ddd" }
		);

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(1);
		expect(store[0]).toBeDefined();
		expect(store[0].id).toEqual("1");
		expect(store[0].value1).toEqual("ccc");
		expect(store[0].value2).toEqual("ddd");
	});

	test("can fail to get an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(entityStorage.get({}, undefined as unknown as string)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "requestContext.tenantId",
				value: "undefined"
			}
		});
	});

	test("can fail to get an item with no id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(
			entityStorage.get({ tenantId: TEST_TENANT_ID }, undefined as unknown as string)
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
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const item = await entityStorage.get({ tenantId: TEST_TENANT_ID }, "2");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const item = await entityStorage.get({ tenantId: TEST_TENANT_ID }, "1");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("1");
		expect(item?.value1).toEqual("aaa");
		expect(item?.value2).toEqual("bbb");
		expect(item?.tenantId).toBeUndefined();
	});

	test("can get an item by secondary index", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const item = await entityStorage.get({ tenantId: TEST_TENANT_ID }, "aaa", "value1");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("1");
		expect(item?.value1).toEqual("aaa");
		expect(item?.value2).toEqual("bbb");
	});

	test("can get an item using wildcard tenant id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID2 },
			{ id: "2", value1: "ccc", value2: "ddd" }
		);
		const item = await entityStorage.get({ tenantId: "*" }, "2");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("2");
		expect(item?.value1).toEqual("ccc");
		expect(item?.value2).toEqual("ddd");
		expect(item?.tenantId).toEqual(TEST_TENANT_ID2);
	});

	test("can fail to remove an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(entityStorage.remove({}, undefined as unknown as string)).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "requestContext.tenantId",
				value: "undefined"
			}
		});
	});

	test("can fail to remove an item with no id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(
			entityStorage.remove({ tenantId: TEST_TENANT_ID }, undefined as unknown as string)
		).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "id",
				value: "undefined"
			}
		});
	});

	test("can not remove an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);

		await entityStorage.remove({ tenantId: TEST_TENANT_ID }, "2");

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(1);
	});

	test("can remove an item", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		await entityStorage.remove({ tenantId: TEST_TENANT_ID }, "1");

		const file = await readFile(TEST_STORE_NAME, "utf8");
		const store = JSON.parse(file);
		expect(store).toBeDefined();
		expect(store.length).toEqual(0);
	});

	test("can fail to find an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await expect(entityStorage.query({})).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "requestContext.tenantId",
				value: "undefined"
			}
		});
	});

	test("can query items with empty store", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.totalEntities).toEqual(0);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with single entry", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.totalEntities).toEqual(1);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with multiple entries", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.totalEntities).toEqual(30);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toEqual("20");
	});

	test("can query items with multiple entries and cursor", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID });
		const result2 = await entityStorage.query(
			{ tenantId: TEST_TENANT_ID },
			undefined,
			undefined,
			undefined,
			result.cursor
		);
		expect(result2).toBeDefined();
		expect(result2.entities.length).toEqual(10);
		expect(result2.totalEntities).toEqual(30);
		expect(result2.pageSize).toEqual(20);
		expect(result2.cursor).toBeUndefined();
	});

	test("can query items with multiple entries and apply conditions", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query(
			{ tenantId: TEST_TENANT_ID },
			{
				property: "id",
				value: "20",
				operator: ComparisonOperator.Equals
			}
		);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.totalEntities).toEqual(30);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can query items with multiple entries and apply custom sort", async () => {
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (30 - i).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID }, undefined, [
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
		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query({ tenantId: TEST_TENANT_ID }, undefined, undefined, [
			"id",
			"value1"
		]);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.entities[0].id).toEqual("1");
		expect(result.entities[0].value1).toEqual("aaa");
		expect(result.entities[0].value2).toBeUndefined();
	});

	test("can query items with wildcard tenant id", async () => {
		try {
			await rm(TEST_DIRECTORY_ROOT, { recursive: true });
		} catch {}

		const entityStorage = new FileEntityStorageConnector<TestType>(
			{ logging: testLogging },
			testDescriptor,
			{
				directory: TEST_DIRECTORY
			}
		);
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		for (let i = 0; i < 5; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		for (let i = 0; i < 5; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID2 },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.query({ tenantId: "*" });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(10);
		expect(result.entities[0].id).toEqual("1");
		expect(result.entities[0].value1).toEqual("aaa");
		expect(result.entities[0].value2).toEqual("bbb");
		expect(result.entities[0].tenantId).toEqual(TEST_TENANT_ID);
		expect(result.entities[5].id).toEqual("1");
		expect(result.entities[5].value1).toEqual("aaa");
		expect(result.entities[5].value2).toEqual("bbb");
		expect(result.entities[5].tenantId).toEqual(TEST_TENANT_ID2);
	});
});

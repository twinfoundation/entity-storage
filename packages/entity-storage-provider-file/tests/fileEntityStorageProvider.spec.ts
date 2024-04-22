// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { readFile, rm } from "node:fs/promises";
import { Converter, RandomHelper } from "@gtsc/core";
import { ComparisonOperator, SortDirection, type IEntityDescriptor } from "@gtsc/entity";
import { MemoryLoggingProvider } from "@gtsc/logging-provider-memory";
import type { ILoggingProvider } from "@gtsc/logging-provider-models";
import { nameof } from "@gtsc/nameof";
import { FileEntityStorageProvider } from "../src/fileEntityStorageProvider";
import type { IFileEntityStorageProviderConfig } from "../src/models/IFileEntityStorageProviderConfig";

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
			name: "id",
			type: "string",
			isPrimary: true
		},
		{
			name: "value1",
			type: "string"
		},
		{
			name: "value2",
			type: "string"
		}
	]
};

let loggingProvider = new MemoryLoggingProvider();

const TEST_DIRECTORY_ROOT = "./.tmp/";
const TEST_DIRECTORY = `${TEST_DIRECTORY_ROOT}test-data-${Converter.bytesToHex(RandomHelper.generate(8))}`;
const TEST_BASE_FILENAME = "test";
const TEST_TENANT_ID = "test-tenant";
const TEST_STORE_NAME = `${TEST_DIRECTORY}/${TEST_TENANT_ID}_${TEST_BASE_FILENAME}.json`;

describe("FileEntityStorageProvider", () => {
	afterAll(async () => {
		try {
			await rm(TEST_DIRECTORY_ROOT, { recursive: true });
		} catch {}
	});

	test("can fail to construct when there is no dependencies", async () => {
		expect(
			() =>
				new FileEntityStorageProvider(
					undefined as unknown as { loggingProvider: ILoggingProvider },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageProviderConfig
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

	test("can fail to construct when there is no logging provider", async () => {
		expect(
			() =>
				new FileEntityStorageProvider(
					{} as unknown as { loggingProvider: ILoggingProvider },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageProviderConfig
				)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.objectUndefined",
				properties: {
					property: "dependencies.loggingProvider",
					value: "undefined"
				}
			})
		);
	});

	test("can fail to construct when there is no descriptor", async () => {
		expect(
			() =>
				new FileEntityStorageProvider(
					{ loggingProvider },
					undefined as unknown as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageProviderConfig
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
				new FileEntityStorageProvider(
					{ loggingProvider },
					{} as IEntityDescriptor<unknown>,
					undefined as unknown as IFileEntityStorageProviderConfig
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
				new FileEntityStorageProvider(
					{ loggingProvider },
					testDescriptor,
					undefined as unknown as IFileEntityStorageProviderConfig
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
				new FileEntityStorageProvider(
					{ loggingProvider },
					testDescriptor,
					{} as unknown as IFileEntityStorageProviderConfig
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

	test("can fail to construct when there is no config base filename", async () => {
		expect(
			() =>
				new FileEntityStorageProvider({ loggingProvider }, testDescriptor, {
					directory: TEST_DIRECTORY
				} as unknown as IFileEntityStorageProviderConfig)
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.string",
				properties: {
					property: "config.baseFilename",
					value: "undefined"
				}
			})
		);
	});

	test("can construct", async () => {
		const entityStorage = new FileEntityStorageProvider({ loggingProvider }, testDescriptor, {
			directory: TEST_DIRECTORY,
			baseFilename: TEST_BASE_FILENAME
		});
		expect(entityStorage).toBeDefined();
	});

	test("can fail to bootstrap with invalid directory", async () => {
		loggingProvider = new MemoryLoggingProvider();
		const entityStorage = new FileEntityStorageProvider({ loggingProvider }, testDescriptor, {
			directory: "|\0",
			baseFilename: TEST_BASE_FILENAME
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = loggingProvider.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreateFailed");
	});

	test("can bootstrap and create directory", async () => {
		loggingProvider = new MemoryLoggingProvider();
		const entityStorage = new FileEntityStorageProvider({ loggingProvider }, testDescriptor, {
			directory: TEST_DIRECTORY,
			baseFilename: TEST_BASE_FILENAME
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = loggingProvider.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(2);
		expect(logs?.[0].message).toEqual("directoryCreating");
		expect(logs?.[1].message).toEqual("directoryCreated");
	});

	test("can bootstrap and skip existing directory", async () => {
		loggingProvider = new MemoryLoggingProvider();
		const entityStorage = new FileEntityStorageProvider({ loggingProvider }, testDescriptor, {
			directory: TEST_DIRECTORY,
			baseFilename: TEST_BASE_FILENAME
		});
		await entityStorage.bootstrap({ tenantId: TEST_TENANT_ID });
		const logs = loggingProvider.getStore(TEST_TENANT_ID);
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(1);
		expect(logs?.[0].message).toEqual("directoryExists");
	});

	test("can fail to set an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{ directory: TEST_DIRECTORY, baseFilename: TEST_BASE_FILENAME }
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{ directory: TEST_DIRECTORY, baseFilename: TEST_BASE_FILENAME }
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
	});

	test("can get an item by secondary index", async () => {
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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

	test("can fail to remove an item with no tenant id", async () => {
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
				name: "id",
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
		const entityStorage = new FileEntityStorageProvider<TestType>(
			{ loggingProvider },
			testDescriptor,
			{
				directory: TEST_DIRECTORY,
				baseFilename: TEST_BASE_FILENAME
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
});

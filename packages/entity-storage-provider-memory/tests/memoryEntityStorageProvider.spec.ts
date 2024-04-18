// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { ComparisonOperator, SortDirection, type IEntityDescriptor } from "@gtsc/entity";
import { nameof } from "@gtsc/nameof";
import { MemoryEntityStorageProvider } from "../src/memoryEntityStorageProvider";

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

const TEST_TENANT_ID = "test-tenant";

describe("MemoryEntityStorageProvider", () => {
	test("can fail to construct when there is no descriptor", async () => {
		expect(
			() => new MemoryEntityStorageProvider(undefined as unknown as IEntityDescriptor<unknown>)
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
		expect(() => new MemoryEntityStorageProvider({} as IEntityDescriptor<unknown>)).toThrow(
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

	test("can construct", async () => {
		const entityStorage = new MemoryEntityStorageProvider(testDescriptor);
		expect(entityStorage).toBeDefined();
	});

	test("can construct with initial values", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor, {
			initialValues: {
				[TEST_TENANT_ID]: [
					{
						id: "1",
						value1: "aaa",
						value2: "bbb"
					}
				]
			}
		});
		const store = entityStorage.getStore(TEST_TENANT_ID);
		expect(store?.length).toEqual(1);
	});

	test("can fail to set an item with no tenant id", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const store = entityStorage.getStore(TEST_TENANT_ID);
		expect(store).toBeDefined();
		expect(store?.length).toEqual(1);
		expect(store?.[0]).toBeDefined();
		expect(store?.[0].id).toEqual("1");
		expect(store?.[0].value1).toEqual("aaa");
		expect(store?.[0].value2).toEqual("bbb");
	});

	test("can set an item to update it", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);

		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "ccc", value2: "ddd" }
		);

		const store = entityStorage.getStore(TEST_TENANT_ID);
		expect(store).toBeDefined();
		expect(store?.length).toEqual(1);
		expect(store?.[0]).toBeDefined();
		expect(store?.[0].id).toEqual("1");
		expect(store?.[0].value1).toEqual("ccc");
		expect(store?.[0].value2).toEqual("ddd");
	});

	test("can fail to get an item with no tenant id", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const item = await entityStorage.get({ tenantId: TEST_TENANT_ID }, "2");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
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
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);

		await entityStorage.remove({ tenantId: TEST_TENANT_ID }, "2");

		const store = entityStorage.getStore(TEST_TENANT_ID);
		expect(store).toBeDefined();
		expect(store?.length).toEqual(1);
	});

	test("can remove an item", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		await entityStorage.remove({ tenantId: TEST_TENANT_ID }, "1");

		const store = entityStorage.getStore(TEST_TENANT_ID);
		expect(store).toBeDefined();
		expect(store?.length).toEqual(0);
	});

	test("can fail to find an item with no tenant id", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await expect(entityStorage.find({})).rejects.toMatchObject({
			name: "GuardError",
			message: "guard.string",
			properties: {
				property: "requestContext.tenantId",
				value: "undefined"
			}
		});
	});

	test("can find items with empty store", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		const result = await entityStorage.find({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.totalEntities).toEqual(0);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with single entry", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		await entityStorage.set(
			{ tenantId: TEST_TENANT_ID },
			{ id: "1", value1: "aaa", value2: "bbb" }
		);
		const result = await entityStorage.find({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.totalEntities).toEqual(1);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with multiple entries", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.find({ tenantId: TEST_TENANT_ID });
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(20);
		expect(result.totalEntities).toEqual(30);
		expect(result.pageSize).toEqual(20);
		expect(result.cursor).toEqual("20");
	});

	test("can find items with multiple entries and cursor", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.find({ tenantId: TEST_TENANT_ID });
		const result2 = await entityStorage.find(
			{ tenantId: TEST_TENANT_ID },
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

	test("can find items with multiple entries and apply conditions", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (i + 1).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.find(
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

	test("can find items with multiple entries and apply custom sort", async () => {
		const entityStorage = new MemoryEntityStorageProvider<TestType>(testDescriptor);
		for (let i = 0; i < 30; i++) {
			await entityStorage.set(
				{ tenantId: TEST_TENANT_ID },
				{ id: (30 - i).toString(), value1: "aaa", value2: "bbb" }
			);
		}
		const result = await entityStorage.find({ tenantId: TEST_TENANT_ID }, undefined, [
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
});

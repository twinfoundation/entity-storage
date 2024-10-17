// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/* eslint-disable max-classes-per-file */
import { GeneralError, I18n } from "@twin.org/core";
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
import { TestableFirestoreEntityStorageConnector } from "./setupTestEnv";
import { FirestoreEntityStorageConnector } from "../src/firestoreEntityStorageConnector";
import type { IFirestoreEntityStorageConnectorConfig } from "../src/models/IFirestoreEntityStorageConnectorConfig";

/**
 * Create a custom entity storage.
 * @param customConfig - The custom configuration.
 * @returns The custom entity storage.
 */
function createCustomEntityStorage(
	customConfig?: Partial<IFirestoreEntityStorageConnectorConfig>
): TestableFirestoreEntityStorageConnector<TestType> {
	return new TestableFirestoreEntityStorageConnector<TestType>({
		entitySchema: nameof<TestType>(),
		config: { ...config, ...customConfig }
	});
}

/**
 * Test SubType Definition.
 */
@entity()
class SubType {
	/**
	 * Field1.
	 */
	@property({ type: "string", format: "date-time" })
	public field1!: string;
}

/**
 * Value Type Definition.
 */
@entity()
class ValueType {
	@property({ type: "string" })
	public field!: string;

	@property({ type: "string" })
	public value!: string;
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
	public value3?: SubType;

	/**
	 * Value4.
	 */
	@property({ type: "object" })
	public valueObject?: {
		[id: string]: {
			value: string;
		};
	};

	/**
	 * Value5.
	 * Array of strings that will store the indexed values extracted from valueArray.
	 */
	@property({ type: "array", itemType: "string" })
	public valueArrayFields?: string[];

	/**
	 * Value6.
	 */
	@property({ type: "array", itemTypeRef: "ValueType" })
	public valueArray?: ValueType[];
}

const config: IFirestoreEntityStorageConnectorConfig = {
	projectId: "test-project",
	collectionName: "test-collection",
	emulatorHost: "localhost:8081"
};

let memoryEntityStorage: MemoryEntityStorageConnector<LogEntry>;
let entityStorage: FirestoreEntityStorageConnector<TestType>;

describe("FirestoreEntityStorageConnector", () => {
	beforeAll(async () => {
		I18n.addDictionary("en", await import("../locales/en.json"));

		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));
		EntitySchemaFactory.register(nameof<SubType>(), () => EntitySchemaHelper.getSchema(SubType));
		EntitySchemaFactory.register(nameof<ValueType>(), () =>
			EntitySchemaHelper.getSchema(ValueType)
		);

		initSchema();
	});

	beforeEach(async () => {
		memoryEntityStorage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>()
		});
		EntityStorageConnectorFactory.register("log-entry", () => memoryEntityStorage);
		LoggingConnectorFactory.register("logging", () => new EntityStorageLoggingConnector());
		LoggingConnectorFactory.register("node-logging", () => new EntityStorageLoggingConnector());

		entityStorage = new FirestoreEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
	});

	afterEach(async () => {
		try {
			await entityStorage.collectionDelete();
		} catch {}
	});

	test("can fail to construct when there are no options", async () => {
		expect(
			() =>
				new FirestoreEntityStorageConnector(
					undefined as unknown as {
						entitySchema: string;
						config: IFirestoreEntityStorageConnectorConfig;
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
				new FirestoreEntityStorageConnector(
					{} as unknown as {
						entitySchema: string;
						config: IFirestoreEntityStorageConnectorConfig;
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

	test("can construct and bootstrap", async () => {
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();
		expect(logs?.length).toEqual(1);
		expect(logs?.[0].message).toEqual("firestoreConnected");

		expect(I18n.hasMessage("info.firestoreEntityStorageConnector.firestoreConnected")).toEqual(
			true
		);
	});

	test("can fail to set an item with no entity", async () => {
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
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() }
		};
		await entityStorage.set(objectSet);

		const result = await entityStorage.get(entityId);
		expect(result?.id).toEqual(objectSet.id);
		expect(result?.value1).toEqual(objectSet.value1);
		expect(result?.value2).toEqual(objectSet.value2);
		expect(result?.value3).toEqual(objectSet.value3);
	});

	test("can set an item to update it", async () => {
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() }
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
		const item = await entityStorage.get("20000");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		await entityStorage.set({ id: "2", value1: "vvv", value2: 35, value3: undefined });
		const item = await entityStorage.get("2");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("2");
		expect(item?.value1).toEqual("vvv");
		expect(item?.value2).toEqual(35);
		expect(item?.value3).toBeUndefined();
	});

	test("can fail to remove an item with no id", async () => {
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
		await entityStorage.set({ id: "10001", value1: "aaa", value2: 5555, value3: undefined });

		const idToRemove = "1000999";
		await entityStorage.remove(idToRemove);
		// No exception should be thrown
	});

	test("can remove an item", async () => {
		const idToRemove = "65432";
		await entityStorage.set({ id: idToRemove, value1: "aaa", value2: 99, value3: undefined });
		await entityStorage.remove(idToRemove);

		const result = await entityStorage.get(idToRemove);
		expect(result).toBeUndefined();
	});

	test("can handle undefined values according to configuration", async () => {
		const customEntityStorage = createCustomEntityStorage({
			undefinedValueHandling: "convert-to-null"
		});
		await customEntityStorage.bootstrap();
		await customEntityStorage.set({ id: "3", value1: "test", value2: 42, value3: undefined });
		const item = await customEntityStorage.get("3");

		expect(item).toBeDefined();
		expect(item?.id).toEqual("3");
		expect(item?.value1).toEqual("test");
		expect(item?.value2).toEqual(42);
		expect(item?.value3).toBeNull();
	});

	test("can throw error for undefined values when configured", async () => {
		const customEntityStorage = createCustomEntityStorage({
			undefinedValueHandling: "throw-error"
		});
		await customEntityStorage.bootstrap();
		await expect(
			customEntityStorage.set({ id: "4", value1: "test", value2: 42, value3: undefined })
		).rejects.toThrow();
	});

	test("can find items with empty store", async () => {
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with single entry", async () => {
		await entityStorage.set({ id: "1", value1: "aaa", value2: 95, value3: undefined });
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with multiple entries", async () => {
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

	test("can find items with multiple entries and cursor", async () => {
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

	test("can find items with multiple entries and apply conditions", async () => {
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: { field1: new Date().toISOString() }
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

	test("can find items with multiple entries and apply custom sort", async () => {
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
						property: "value1",
						value: ["26", "20"],
						comparison: ComparisonOperator.In
					}
				]
			},
			[
				{
					property: "id",
					sortDirection: SortDirection.Ascending
				}
			]
		);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(2);
		expect(result.entities[0].value1).toEqual("20");
		expect(result.entities[1].value1).toEqual("26");
	});
	test("can query items and get a reduced data set", async () => {
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
	test("can query sub items in object", async () => {
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: { name: { value: "bob" } }
			});
		}
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 10).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: { name: { value: "fred" } }
			});
		}
		const result = await entityStorage.query({
			conditions: [
				{ property: "valueObject.name.value", value: "bob", comparison: ComparisonOperator.Equals }
			]
		});
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(5);
	});
	test("can query sub items in array using indexing field", async () => {
		// eslint-disable-next-line no-console
		console.log("Starting test: can query sub items in array");

		for (let i = 0; i < 5; i++) {
			const item = {
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueArray: [{ field: "name", value: "bob" }]
			};
			console.log(`Setting item ${i + 1}:`, JSON.stringify(item));
			await entityStorage.set(item);
		}

		for (let i = 0; i < 5; i++) {
			const item = {
				id: (i + 10).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueArray: [{ field: "name", value: "fred" }]
			};
			console.log(`Setting item ${i + 10}:`, JSON.stringify(item));
			await entityStorage.set(item);
		}

		const queryCondition = {
			conditions: [
				{
					property: "valueArrayFields",
					value: "name:bob",
					comparison: ComparisonOperator.Includes
				}
			]
		};
		// eslint-disable-next-line no-console
		console.log("Query condition:", JSON.stringify(queryCondition));

		const result = await entityStorage.query(queryCondition);
		// eslint-disable-next-line no-console
		console.log("Query result:", JSON.stringify(result));

		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(5); // Expecting 5 items with "bob"
	});

	describe("handleUndefinedValues", () => {
		test("converts undefined to null when configured", () => {
			const customEntityStorage = createCustomEntityStorage({
				undefinedValueHandling: "convert-to-null"
			});
			const customEntity = {
				id: "1",
				value1: "test",
				value2: undefined,
				value3: { nested: undefined }
			};
			const result = customEntityStorage.testHandleUndefinedValues(customEntity);
			expect(result).toEqual({ id: "1", value1: "test", value2: null, value3: { nested: null } });
		});

		test("throws error when undefined values are found and configured to do so", () => {
			const customEntityStorage = createCustomEntityStorage({
				undefinedValueHandling: "throw-error"
			});
			const customEntity = { id: "1", value1: "test", value2: undefined };
			expect(() => customEntityStorage.testHandleUndefinedValues(customEntity)).toThrow(
				GeneralError
			);
		});

		test("removes undefined properties when configured (default behavior)", () => {
			const customEntityStorage = createCustomEntityStorage();
			const customEntity = {
				id: "1",
				value1: "test",
				value2: undefined,
				value3: { nested: undefined }
			};
			const result = customEntityStorage.testHandleUndefinedValues(customEntity);
			expect(result).toEqual({ id: "1", value1: "test", value3: {} });
		});
	});

	describe("convertUndefinedToNull", () => {
		test("converts undefined to null in nested objects", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: undefined, c: { d: undefined, e: 2 }, f: [1, undefined, 3] };
			const result = customEntityStorage.testConvertUndefinedToNull(obj);
			expect(result).toEqual({ a: 1, b: null, c: { d: null, e: 2 }, f: [1, null, 3] });
		});

		test("handles arrays correctly", () => {
			const customEntityStorage = createCustomEntityStorage();
			const arr = [1, undefined, { a: undefined, b: 2 }, [undefined, 3]];
			const result = customEntityStorage.testConvertUndefinedToNull(arr);
			expect(result).toEqual([1, null, { a: null, b: 2 }, [null, 3]]);
		});

		test("returns non-object values as-is", () => {
			const customEntityStorage = createCustomEntityStorage();
			expect(customEntityStorage.testConvertUndefinedToNull(1)).toBe(1);
			expect(customEntityStorage.testConvertUndefinedToNull("test")).toBe("test");
			expect(customEntityStorage.testConvertUndefinedToNull(null)).toBe(null);
		});
	});

	describe("checkForUndefinedProperties", () => {
		test("throws error when undefined property is found", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: undefined };
			expect(() => customEntityStorage.testCheckForUndefinedProperties(obj)).toThrow(GeneralError);
		});

		test("checks nested objects", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: { c: undefined } };
			expect(() => customEntityStorage.testCheckForUndefinedProperties(obj)).toThrow(GeneralError);
		});

		test("checks arrays", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: [1, { c: undefined }] };
			expect(() => customEntityStorage.testCheckForUndefinedProperties(obj)).toThrow(GeneralError);
		});

		test("does not throw for objects without undefined properties", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: { c: null }, d: [1, 2, 3] };
			expect(() => customEntityStorage.testCheckForUndefinedProperties(obj)).not.toThrow();
		});
	});

	describe("removeUndefinedProperties", () => {
		test("removes undefined properties from nested objects", () => {
			const customEntityStorage = createCustomEntityStorage();
			const obj = { a: 1, b: undefined, c: { d: undefined, e: 2 }, f: [1, undefined, 3] };
			const result = customEntityStorage.testRemoveUndefinedProperties(obj);
			expect(result).toEqual({ a: 1, c: { e: 2 }, f: [1, 3] });
		});

		test("handles arrays correctly", () => {
			const customEntityStorage = createCustomEntityStorage();
			const arr = [1, undefined, { a: undefined, b: 2 }, [undefined, 3]];
			const result = customEntityStorage.testRemoveUndefinedProperties(arr);
			expect(result).toEqual([1, { b: 2 }, [3]]);
		});

		test("returns non-object values as-is", () => {
			const customEntityStorage = createCustomEntityStorage();
			expect(customEntityStorage.testRemoveUndefinedProperties(1)).toBe(1);
			expect(customEntityStorage.testRemoveUndefinedProperties("test")).toBe("test");
			expect(customEntityStorage.testRemoveUndefinedProperties(null)).toBe(null);
		});
	});
});

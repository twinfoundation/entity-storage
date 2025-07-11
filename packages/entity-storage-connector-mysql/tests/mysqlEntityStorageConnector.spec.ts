// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/* eslint-disable max-classes-per-file */
import { GeneralError, I18n, ObjectHelper } from "@twin.org/core";
import type { IJsonLdNodeObject } from "@twin.org/data-json-ld";
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
import { TEST_MYSQL_CONFIG } from "./setupTestEnv";
import type { IMySqlEntityStorageConnectorConfig } from "../src/models/IMySqlEntityStorageConnectorConfig";
import { MySqlEntityStorageConnector } from "../src/mysqlEntityStorageConnector";

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
	@property({ type: "object", optional: true })
	public valueObject?: {
		[id: string]: {
			value: string;
		};
	};

	/**
	 * Value5.
	 */
	@property({ type: "array", optional: true })
	public valueArray?: {
		field: string;
		value: string;
	}[];
}

/**
 * Class representing entry for the blob storage.
 */
@entity()
class BlobStorageEntry {
	@property({ type: "string", isPrimary: true })
	public id!: string;

	@property({ type: "string", format: "date-time", sortDirection: SortDirection.Descending })
	public dateCreated!: string;

	@property({
		type: "string",
		format: "date-time",
		sortDirection: SortDirection.Descending,
		optional: true
	})
	public dateModified?: string;

	@property({ type: "number" })
	public blobSize!: number;

	@property({ type: "string" })
	public blobHash!: string;

	@property({ type: "string", optional: true })
	public encodingFormat?: string;

	@property({ type: "string", optional: true })
	public fileExtension?: string;

	@property({ type: "object", itemTypeRef: "IJsonLdNodeObject", optional: true })
	public metadata?: IJsonLdNodeObject;

	@property({ type: "string", optional: true })
	public userIdentity?: string;

	@property({ type: "string", optional: true })
	public nodeIdentity?: string;
}

let memoryEntityStorage: MemoryEntityStorageConnector<LogEntry>;
const config: IMySqlEntityStorageConnectorConfig = TEST_MYSQL_CONFIG;

describe("MySqlEntityStorageConnector", () => {
	beforeAll(async () => {
		I18n.addDictionary("en", await import("../locales/en.json"));

		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));
		EntitySchemaFactory.register(nameof<SubType>(), () => EntitySchemaHelper.getSchema(SubType));
		EntitySchemaFactory.register(nameof<BlobStorageEntry>(), () =>
			EntitySchemaHelper.getSchema(BlobStorageEntry)
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
	});

	afterEach(async () => {
		const entityStorage = new MySqlEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.tableDrop();
	});

	test("can fail to construct when there are no options", async () => {
		expect(
			() =>
				new MySqlEntityStorageConnector(
					undefined as unknown as {
						entitySchema: string;
						config: IMySqlEntityStorageConnectorConfig;
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
				new MySqlEntityStorageConnector(
					{} as unknown as {
						entitySchema: string;
						config: IMySqlEntityStorageConnectorConfig;
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
		const entityStorage = new MySqlEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const logs = memoryEntityStorage.getStore();
		expect(logs).toBeDefined();

		expect(logs?.length).toEqual(3);
		expect(logs?.[0].message).toEqual("databaseCreating");
		expect(logs?.[1].message).toEqual("databaseExists");
		expect(logs?.[2].message).toEqual("tableExists");

		expect(I18n.hasMessage("info.mysqlEntityStorageConnector.databaseCreating")).toEqual(true);
		expect(I18n.hasMessage("info.mysqlEntityStorageConnector.databaseExists")).toEqual(true);
		expect(I18n.hasMessage("info.mysqlEntityStorageConnector.tableExists")).toEqual(true);
	});

	test("can fail to set an item with no entity", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
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

	test("can fail to set an item with an entity that do not match the table", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa"
		} as TestType;

		await expect(entityStorage.set(objectSet)).rejects.toThrowError(
			new GeneralError("EntitySchemaHelper", "invalidOptional", {
				property: "value2",
				type: "number",
				value: undefined
			})
		);
	});

	test("can set an item", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: "data test asd" as unknown as { [id: string]: { value: string } },
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};

		await entityStorage.set(objectSet);

		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can set an item with a condition", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};

		await entityStorage.set(objectSet, [{ property: "value1", value: "aaa" }]);

		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can set an item to update it", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();

		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(objectSet);

		objectSet.value2 = 99;
		await entityStorage.set(objectSet);

		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can set an item to update it with a condition", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};

		await entityStorage.set(objectSet);

		const objectUpdate = ObjectHelper.clone(objectSet);
		objectUpdate.value2 = 99;
		await entityStorage.set(objectUpdate, [{ property: "value1", value: "aaa" }]);

		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectUpdate);
	});

	test("can fail set an item to update it with an unmatched condition", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entityId = "1";
		const objectSet = {
			id: entityId,
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};

		await entityStorage.set(objectSet);
		const objectUpdate = ObjectHelper.clone(objectSet);
		objectUpdate.value2 = 99;

		await entityStorage.set(objectUpdate, [{ property: "value1", value: "bbb" }]);

		// Should still have original value set
		const result = await entityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can fail to get an item with no id", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
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
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const item = await entityStorage.get("20000");

		expect(item).toBeUndefined();
	});

	test("can get an item", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const object = {
			id: "2",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);
		const item = await entityStorage.get("2");

		expect(item).toBeDefined();
		expect(item).toEqual(object);
	});

	test("can get an item by secondary index", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});

		await entityStorage.bootstrap();
		const secondaryValue = "zzz";
		const object = {
			id: "2",
			value1: "zzz",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);
		const item = await entityStorage.get(secondaryValue, "value1");

		expect(item).toBeDefined();
		expect(item).toEqual(object);
	});

	test("can fail to remove an item with no id", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
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
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();

		const object = {
			id: "2",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);

		const idToRemove = "1000999";
		await entityStorage.remove(idToRemove);
		// No exception should be thrown
	});

	test("can remove an item", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const idToRemove = "65432";
		const object = {
			id: "65432",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);
		await entityStorage.remove(idToRemove);

		const result = await entityStorage.get(idToRemove);
		expect(result).toBeUndefined();
	});

	test("can fail to remove an item with conditions", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});

		await entityStorage.bootstrap();
		const object = {
			id: "1",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);
		await entityStorage.remove("1", [{ property: "value1", value: "aaa1" }]);

		const result = await entityStorage.get("1");
		expect(result).toBeDefined();
	});

	test("can remove an item with conditions", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});

		await entityStorage.bootstrap();
		const object = {
			id: "1",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(object);
		await entityStorage.remove("1", [{ property: "value1", value: "aaa" }]);

		const result = await entityStorage.get("1");
		expect(result).toBeUndefined();
	});

	test("can find items with empty store", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(0);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with single entry", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		const entry = {
			id: "1",
			value1: "aaa",
			value2: 35,
			value3: { field1: new Date().toISOString() },
			valueObject: {
				"1": {
					value: "bob"
				}
			},
			valueArray: [
				{
					field: "name",
					value: "bob"
				}
			]
		};
		await entityStorage.set(entry);
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		expect(result.entities[0]).toEqual(entry);
		expect(result.cursor).toBeUndefined();
	});

	test("can find items with multiple entries", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 80; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 999,
				value3: undefined,
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
			});
		}
		const result = await entityStorage.query();
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(40);
	});

	test("can find items with multiple entries and cursor", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 50; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 5555,
				value3: undefined,
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
			});
		}
		const result = await entityStorage.query();
		const result2 = await entityStorage.query(undefined, undefined, undefined, result.cursor);
		expect(result2).toBeDefined();
		expect(result2.entities.length).toEqual(10);
		expect(result2.cursor).toBeUndefined();
	});

	test("can find items with multiple entries and apply conditions", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: { field1: new Date().toISOString() },
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
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
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (30 - i).toString(),
				value1: (30 - i).toString(),
				value2: 7777,
				value3: undefined,
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
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

	test("can find items with multiple entries and apply custom sort on multiple properties", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (30 - i).toString(),
				value1: (30 - i).toString(),
				value2: i % 2 === 0 ? 100 : 200,
				value3: undefined,
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
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
					property: "value1",
					sortDirection: SortDirection.Descending
				},
				{
					property: "id",
					sortDirection: SortDirection.Ascending
				}
			]
		);

		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(2);
		expect(result.entities[0].value1).toEqual("26");
		expect(result.entities[1].value1).toEqual("20");
	});

	test("can query items and get a reduced data set", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 30; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: {
					"1": {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
			});
		}
		const result = await entityStorage.query(undefined, undefined, ["id", "value1"]);
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(30);
		expect(result.entities[0].value2).toBeUndefined();
		expect(result.entities[0].value3).toBeUndefined();
	});

	test("can query sub items in object", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: {
					name: {
						value: "bob"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
			});
		}
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 10).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: {
					name: {
						value: "fred"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
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

	test("can query sub items in array", async () => {
		const entityStorage = new MySqlEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>(),
			config
		});
		await entityStorage.bootstrap();
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 1).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: {
					name: {
						value: "fred"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "bob"
					}
				]
			});
		}
		for (let i = 0; i < 5; i++) {
			await entityStorage.set({
				id: (i + 10).toString(),
				value1: "aaa",
				value2: 7777,
				value3: undefined,
				valueObject: {
					name: {
						value: "fred"
					}
				},
				valueArray: [
					{
						field: "name",
						value: "fred"
					}
				]
			});
		}
		const result = await entityStorage.query({
			conditions: [
				{
					property: "valueArray",
					value: { field: "name", value: "bob" },
					comparison: ComparisonOperator.Includes
				}
			]
		});
		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(5);
	});

	test("can get an item with JSON object", async () => {
		const entityStorage = new MySqlEntityStorageConnector<BlobStorageEntry>({
			entitySchema: nameof<BlobStorageEntry>(),
			config
		});
		await entityStorage.bootstrap();
		const object = {
			id: "1",
			dateCreated: new Date().toISOString(),
			blobSize: 1024,
			blobHash: "hash123",
			metadata: { "@context": "https://schema.org", "@type": "Person", name: "John Doe" }
		};
		await entityStorage.set(object);
		const item = await entityStorage.get("1");

		expect(item).toBeDefined();
		for (const key in item) {
			if (item[key as keyof BlobStorageEntry] === null) {
				(item as Partial<BlobStorageEntry>)[key as keyof BlobStorageEntry] = undefined;
			}
		}
		expect(item).toEqual(object);
	});

	test("can get an item with JSON array", async () => {
		const entityStorage = new MySqlEntityStorageConnector<BlobStorageEntry>({
			entitySchema: nameof<BlobStorageEntry>(),
			config
		});
		await entityStorage.bootstrap();
		const object: BlobStorageEntry = {
			id: "2",
			dateCreated: new Date().toISOString(),
			blobSize: 2048,
			blobHash: "hash456",
			metadata: {
				"@context": "https://schema.org",
				"@type": "Person",
				name: "Jane Doe",
				knows: [{ "@type": "Person", name: "John Doe" }]
			}
		};
		await entityStorage.set(object);
		const item = await entityStorage.get("2");
		expect(item).toBeDefined();
		for (const key in item) {
			if (item[key as keyof BlobStorageEntry] === null) {
				(item as Partial<BlobStorageEntry>)[key as keyof BlobStorageEntry] = undefined;
			}
		}
		expect(item).toEqual(object);
	});

	test("can get an item with undefined optional fields", async () => {
		const entityStorage = new MySqlEntityStorageConnector<BlobStorageEntry>({
			entitySchema: nameof<BlobStorageEntry>(),
			config
		});
		await entityStorage.bootstrap();
		const object = {
			id: "3",
			dateCreated: new Date().toISOString(),
			blobSize: 4096,
			blobHash: "hash789"
		};
		await entityStorage.set(object);
		const item = await entityStorage.get("3");

		expect(item).toBeDefined();
		for (const key in item) {
			if (item[key as keyof BlobStorageEntry] === null) {
				(item as Partial<BlobStorageEntry>)[key as keyof BlobStorageEntry] = undefined;
			}
		}
		expect(item).toEqual(object);
	});

	test("can get an item with an object embedded condition", async () => {
		const entityStorage = new MySqlEntityStorageConnector<BlobStorageEntry>({
			entitySchema: nameof<BlobStorageEntry>(),
			config
		});
		await entityStorage.bootstrap();
		const object = {
			id: "4",
			dateCreated: new Date().toISOString(),
			blobSize: 512,
			blobHash: "hash101",
			metadata: { "@context": "https://schema.org", "@type": "Person", name: "Alice" }
		};
		await entityStorage.set(object);
		const result = await entityStorage.query({
			conditions: [
				{ property: "metadata.name", value: "Alice", comparison: ComparisonOperator.Equals }
			]
		});

		expect(result).toBeDefined();
		expect(result.entities.length).toEqual(1);
		const item = result.entities[0];
		for (const key in item) {
			if (item[key as keyof BlobStorageEntry] === null) {
				item[key as keyof BlobStorageEntry] = undefined;
			}
		}
		expect(item).toEqual(object);
	});

	test("can create a table with a bigint type and insert Date.getTime()", async () => {
		/**
		 * Test entity using a bigint field.
		 */
		@entity()
		class BigIntTestType {
			@property({ type: "string", isPrimary: true })
			public id!: string;

			@property({ type: "integer", format: "int64" })
			public timestamp!: number;
		}

		EntitySchemaFactory.register(nameof<BigIntTestType>(), () =>
			EntitySchemaHelper.getSchema(BigIntTestType)
		);

		const bigIntEntityStorage = new MySqlEntityStorageConnector<BigIntTestType>({
			entitySchema: nameof<BigIntTestType>(),
			config
		});
		await bigIntEntityStorage.bootstrap();

		const entityId = "1";
		const timestamp = Date.now();

		const objectSet = {
			id: entityId,
			timestamp
		};

		await bigIntEntityStorage.set(objectSet);

		const result = await bigIntEntityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});

	test("can create a table with a uuid type and insert a random value", async () => {
		/**
		 * Test entity using a uuid field.
		 */
		@entity()
		class UuidTestType {
			@property({ type: "string", isPrimary: true, format: "uuid" })
			public id!: string;

			@property({ type: "string" })
			public randomValue!: string;
		}

		EntitySchemaFactory.register(nameof<UuidTestType>(), () =>
			EntitySchemaHelper.getSchema(UuidTestType)
		);

		const uuidEntityStorage = new MySqlEntityStorageConnector<UuidTestType>({
			entitySchema: nameof<UuidTestType>(),
			config
		});
		await uuidEntityStorage.bootstrap();

		const entityId = crypto.randomUUID();
		const randomValue = Math.random().toString(36).slice(2);

		const objectSet = {
			id: entityId,
			randomValue
		};

		await uuidEntityStorage.set(objectSet);

		const result = await uuidEntityStorage.get(entityId);
		expect(result).toEqual(objectSet);
	});
});

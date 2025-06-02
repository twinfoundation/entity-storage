// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryBlobStorageConnector } from "@twin.org/blob-storage-connector-memory";
import { BlobStorageConnectorFactory } from "@twin.org/blob-storage-models";
import { Converter, I18n, ObjectHelper, RandomHelper } from "@twin.org/core";
import type { IJsonLdNodeObject } from "@twin.org/data-json-ld";
import { EntitySchemaFactory, EntitySchemaHelper, entity, property } from "@twin.org/entity";
import { MemoryEntityStorageConnector } from "@twin.org/entity-storage-connector-memory";
import { EntityStorageConnectorFactory } from "@twin.org/entity-storage-models";
import { IdentityConnectorFactory } from "@twin.org/identity-models";
import {
	EntityStorageLoggingConnector,
	type LogEntry,
	initSchema as initSchemaLogging
} from "@twin.org/logging-connector-entity-storage";
import { LoggingConnectorFactory } from "@twin.org/logging-models";
import { nameof } from "@twin.org/nameof";
import { ProofTypes } from "@twin.org/standards-w3c-did";
import {
	EntityStorageVerifiableStorageConnector,
	type VerifiableItem,
	initSchema as initSchemaVerifiableStorage
} from "@twin.org/verifiable-storage-connector-entity-storage";
import { VerifiableStorageConnectorFactory } from "@twin.org/verifiable-storage-models";
import { compressObject, decompressObject, setupTestEnv, TEST_NODE_IDENTITY } from "./setupTestEnv";
import { DecentralisedEntityStorageConnector } from "../src/decentralisedEntityStorageConnector";
import type { SyncSnapshotEntry } from "../src/entities/syncSnapshotEntry";
import type { IDecentralisedEntityStorageConnectorConfig } from "../src/models/IDecentralisedEntityStorageConnectorConfig";
import type { ISyncChangeSet } from "../src/models/ISyncChangeSet";
import type { ISyncSnapshot } from "../src/models/ISyncSnapshot";
import type { ISyncState } from "../src/models/ISyncState";
import type { IVerifiableSyncPointer } from "../src/models/IVerifiableSyncPointer";
import { initSchema } from "../src/schema";

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

	/**
	 * The node identity which owns the entry.
	 */
	@property({ type: "string" })
	public nodeIdentity!: string;
}

let loggingMemoryEntityStorage: MemoryEntityStorageConnector<LogEntry>;
let localSyncSnapshotEntryMemoryEntityStorage: MemoryEntityStorageConnector<SyncSnapshotEntry>;
let verifiableSyncPointerMemoryEntityStorage: MemoryEntityStorageConnector<VerifiableItem>;
let testTypeMemoryEntityStorage: MemoryEntityStorageConnector<TestType>;
let memoryBlobStorage: MemoryBlobStorageConnector;
let verifiableStorage: EntityStorageVerifiableStorageConnector;
let decentrialisedEntityStorage: DecentralisedEntityStorageConnector<TestType> | undefined;
const testTypeRemoteKey = "verifiable:entity-storage:11111111111111111111111111111111";

describe("DecentralisedEntityStorageConnector", () => {
	beforeAll(async () => {
		await setupTestEnv();

		I18n.addDictionary("en", await import("../locales/en.json"));

		EntitySchemaFactory.register(nameof<TestType>(), () => EntitySchemaHelper.getSchema(TestType));
		initSchemaLogging();
		initSchemaVerifiableStorage();
		initSchema();
	});

	beforeEach(() => {
		loggingMemoryEntityStorage = new MemoryEntityStorageConnector<LogEntry>({
			entitySchema: nameof<LogEntry>()
		});
		EntityStorageConnectorFactory.register("log-entry", () => loggingMemoryEntityStorage);

		localSyncSnapshotEntryMemoryEntityStorage = new MemoryEntityStorageConnector<SyncSnapshotEntry>(
			{
				entitySchema: nameof<SyncSnapshotEntry>()
			}
		);
		EntityStorageConnectorFactory.register(
			"sync-snapshot-entry",
			() => localSyncSnapshotEntryMemoryEntityStorage
		);

		verifiableSyncPointerMemoryEntityStorage = new MemoryEntityStorageConnector<VerifiableItem>({
			entitySchema: nameof<VerifiableItem>()
		});
		EntityStorageConnectorFactory.register(
			"verifiable-item",
			() => verifiableSyncPointerMemoryEntityStorage
		);

		testTypeMemoryEntityStorage = new MemoryEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>()
		});
		EntityStorageConnectorFactory.register("test-type", () => testTypeMemoryEntityStorage);

		verifiableStorage = new EntityStorageVerifiableStorageConnector();
		VerifiableStorageConnectorFactory.register("verifiable-storage", () => verifiableStorage);

		memoryBlobStorage = new MemoryBlobStorageConnector();
		BlobStorageConnectorFactory.register("blob-storage", () => memoryBlobStorage);

		LoggingConnectorFactory.register("logging", () => new EntityStorageLoggingConnector());
		LoggingConnectorFactory.register("node-logging", () => new EntityStorageLoggingConnector());

		let tickCounter = new Date(2025, 4, 29, 9, 0, 0).getTime();
		Date.now = vi.fn().mockImplementation(() => tickCounter++);

		let randomCounter = 2000;
		RandomHelper.generate = vi
			.fn()
			.mockImplementation(length => new Uint8Array(length).fill(randomCounter++));
	});

	afterEach(async () => {
		if (decentrialisedEntityStorage?.stop) {
			await decentrialisedEntityStorage.stop(TEST_NODE_IDENTITY, undefined);
		}
	});

	test("can fail to construct when there is no options", async () => {
		expect(
			() =>
				new DecentralisedEntityStorageConnector(
					undefined as unknown as {
						entityStorageConnectorType: string;
						loggingConnectorType?: string;
						entitySchema: string;
						config: IDecentralisedEntityStorageConnectorConfig;
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
				new DecentralisedEntityStorageConnector(
					{} as unknown as {
						entityStorageConnectorType: string;
						loggingConnectorType?: string;
						entitySchema: string;
						config: IDecentralisedEntityStorageConnectorConfig;
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

	test("can fail to construct when there is no entity storatge connector", async () => {
		expect(
			() =>
				new DecentralisedEntityStorageConnector({ entitySchema: "test" } as unknown as {
					entityStorageConnectorType: string;
					loggingConnectorType?: string;
					entitySchema: string;
					config: IDecentralisedEntityStorageConnectorConfig;
				})
		).toThrow(
			expect.objectContaining({
				name: "GuardError",
				message: "guard.string",
				properties: {
					property: "options.entityStorageConnectorType",
					value: "undefined"
				}
			})
		);
	});

	test("can construct an authoritative node", async () => {
		const entityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});
		expect(entityStorage).toBeDefined();
	});

	test("can construct a none authoritative node", async () => {
		const entityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: false,
				remoteSyncEndpoint: "http://localhost:3000/sync"
			}
		});
		expect(entityStorage).toBeDefined();
	});

	test("can start with no existing sync state", async () => {
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});
		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");
		expect(loggingMemoryEntityStorage.getStore()).toEqual([
			{
				id: "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000000,
				message: "verifiableSyncPointerRetrieving",
				data: {
					key: "verifiable:entity-storage:11111111111111111111111111111111"
				}
			},
			{
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000001,
				message: "verifiableSyncPointerNotFound",
				data: {
					key: "verifiable:entity-storage:11111111111111111111111111111111"
				}
			}
		]);
	});

	test("can start with existing empty sync state", async () => {
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});

		const syncState: ISyncState = {
			snapshots: []
		};
		const blobStorageId = await memoryBlobStorage.set(await compressObject(syncState));

		const verifiableSyncPointer: IVerifiableSyncPointer = {
			syncPointerId: blobStorageId
		};
		await verifiableSyncPointerMemoryEntityStorage.set({
			id: testTypeRemoteKey.split(":")[2],
			creator: TEST_NODE_IDENTITY,
			data: Converter.bytesToBase64(ObjectHelper.toBytes(verifiableSyncPointer)),
			allowList: [TEST_NODE_IDENTITY],
			maxAllowListSize: 10
		});
		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");
		expect(loggingMemoryEntityStorage.getStore()).toEqual([
			{
				id: "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000000,
				message: "verifiableSyncPointerRetrieving",
				data: {
					key: "verifiable:entity-storage:11111111111111111111111111111111"
				}
			},
			{
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000001,
				message: "verifiableSyncPointerRetrieved",
				data: {
					key: "verifiable:entity-storage:11111111111111111111111111111111",
					syncPointerId:
						"blob:memory:ac2742141cecd4f749a9ea278b11ebd48022112afb342771ac728b9bf88c6799"
				}
			},
			{
				id: "d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000002,
				message: "remoteSyncStateRetrieving",
				data: {
					syncPointerId:
						"blob:memory:ac2742141cecd4f749a9ea278b11ebd48022112afb342771ac728b9bf88c6799"
				}
			},
			{
				id: "d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3",
				level: "info",
				source: "RemoteSyncStateHelper",
				ts: 1748502000003,
				message: "remoteSyncStateRetrieved",
				data: {
					syncPointerId:
						"blob:memory:ac2742141cecd4f749a9ea278b11ebd48022112afb342771ac728b9bf88c6799",
					snapshotCount: 0
				}
			},
			{
				id: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
				level: "info",
				source: "LocalSyncStateHelper",
				ts: 1748502000004,
				message: "remoteSyncSynchronisation",
				data: {
					snapshotCount: 0
				}
			}
		]);
	});

	test("can start with existing empty local sync state and populated remote sync state", async () => {
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});

		const remoteSyncChangeSet: ISyncChangeSet & IJsonLdNodeObject = {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			dateModified: new Date(Date.now()).toISOString(),
			nodeIdentity: TEST_NODE_IDENTITY,
			changes: [
				{
					operation: "set",
					entity: {
						id: "111",
						value1: "value1",
						value2: "value2",
						nodeIdentity: TEST_NODE_IDENTITY
					}
				}
			]
		};

		const identityConnector = IdentityConnectorFactory.get("identity");
		remoteSyncChangeSet.proof = await identityConnector.createProof(
			TEST_NODE_IDENTITY,
			`${TEST_NODE_IDENTITY}#decentralised-storage-assertion`,
			ProofTypes.DataIntegrityProof,
			remoteSyncChangeSet
		);

		const remoteSyncChangeSetId = await memoryBlobStorage.set(
			await compressObject(remoteSyncChangeSet)
		);

		const remoteSyncSnapshotEntry: ISyncSnapshot = {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			changeSetStorageIds: [remoteSyncChangeSetId]
		};

		const remoteSyncState: ISyncState = {
			snapshots: [remoteSyncSnapshotEntry]
		};
		const blobStorageId = await memoryBlobStorage.set(await compressObject(remoteSyncState));

		const verifiableSyncPointer: IVerifiableSyncPointer = {
			syncPointerId: blobStorageId
		};
		await verifiableSyncPointerMemoryEntityStorage.set({
			id: testTypeRemoteKey.split(":")[2],
			creator: TEST_NODE_IDENTITY,
			data: Converter.bytesToBase64(ObjectHelper.toBytes(verifiableSyncPointer)),
			allowList: [TEST_NODE_IDENTITY],
			maxAllowListSize: 10
		});
		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([
			{
				dateCreated: "2025-05-29T07:00:00.003Z",
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				changeSetStorageIds: [remoteSyncChangeSetId]
			}
		]);
		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore).toEqual([
			{
				id: "111",
				value1: "value1",
				value2: "value2",
				nodeIdentity: TEST_NODE_IDENTITY
			}
		]);
		const blobStore = Object.values(memoryBlobStorage.getStore());
		expect(await decompressObject(blobStore[0])).toEqual({
			id: "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
			dateCreated: "2025-05-29T07:00:00.000Z",
			dateModified: "2025-05-29T07:00:00.001Z",
			nodeIdentity:
				"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
			changes: [
				{
					operation: "set",
					entity: {
						id: "111",
						value1: "value1",
						value2: "value2",
						nodeIdentity:
							"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101"
					}
				}
			],
			proof: {
				"@context": "https://www.w3.org/ns/credentials/v2",
				type: "DataIntegrityProof",
				cryptosuite: "eddsa-jcs-2022",
				created: "2025-05-29T07:00:00.002Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#decentralised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z5kWjDTA4DVrNmNkJRnDuGergo8eHVB7r97Nmhuud9UNgPgRQjDLk3XLfJLnQhLTrNyiptREsFe3fdMxHbhr7rDSD"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:bcd23d6cd8002e30f7f5e1b7f6aadb749f9e9ed21a2b86ea5732e60be2df6e33"
					]
				}
			]
		});
	});

	test("can start with existing populated local sync state and populated remote sync state", async () => {
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});

		const remoteSyncChangeSet: ISyncChangeSet & IJsonLdNodeObject = {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			dateModified: new Date(Date.now()).toISOString(),
			nodeIdentity: TEST_NODE_IDENTITY,
			changes: [
				{
					operation: "delete",
					id: "111"
				},
				{
					operation: "set",
					entity: {
						id: "222",
						value1: "value4",
						value2: "value5",
						nodeIdentity: TEST_NODE_IDENTITY
					}
				}
			]
		};

		const identityConnector = IdentityConnectorFactory.get("identity");
		remoteSyncChangeSet.proof = await identityConnector.createProof(
			TEST_NODE_IDENTITY,
			`${TEST_NODE_IDENTITY}#decentralised-storage-assertion`,
			ProofTypes.DataIntegrityProof,
			remoteSyncChangeSet
		);

		const remoteSyncChangeSetId = await memoryBlobStorage.set(
			await compressObject(remoteSyncChangeSet)
		);

		const remoteSyncSnapshotEntry: ISyncSnapshot = {
			id: Converter.bytesToHex(RandomHelper.generate(32)),
			dateCreated: new Date(Date.now()).toISOString(),
			changeSetStorageIds: [remoteSyncChangeSetId]
		};

		const remoteSyncState: ISyncState = {
			snapshots: [remoteSyncSnapshotEntry]
		};
		const remoteBlobStorageId = await memoryBlobStorage.set(await compressObject(remoteSyncState));

		const verifiableSyncPointer: IVerifiableSyncPointer = {
			syncPointerId: remoteBlobStorageId
		};
		await verifiableSyncPointerMemoryEntityStorage.set({
			id: testTypeRemoteKey.split(":")[2],
			creator: TEST_NODE_IDENTITY,
			data: Converter.bytesToBase64(ObjectHelper.toBytes(verifiableSyncPointer)),
			allowList: [TEST_NODE_IDENTITY],
			maxAllowListSize: 10
		});

		await testTypeMemoryEntityStorage.set({
			id: "111",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY
		});

		await testTypeMemoryEntityStorage.set({
			id: "222",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY
		});

		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([
			{
				dateCreated: "2025-05-29T07:00:00.003Z",
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				changeSetStorageIds: [remoteSyncChangeSetId]
			}
		]);
		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore).toEqual([
			{
				id: "222",
				value1: "value4",
				value2: "value5",
				nodeIdentity: TEST_NODE_IDENTITY
			}
		]);
		const blobStore = Object.values(memoryBlobStorage.getStore());

		expect(await decompressObject(blobStore[0])).toEqual({
			id: "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0",
			dateCreated: "2025-05-29T07:00:00.000Z",
			dateModified: "2025-05-29T07:00:00.001Z",
			nodeIdentity:
				"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
			changes: [
				{
					operation: "delete",
					id: "111"
				},
				{
					operation: "set",
					entity: {
						id: "222",
						value1: "value4",
						value2: "value5",
						nodeIdentity:
							"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101"
					}
				}
			],
			proof: {
				"@context": "https://www.w3.org/ns/credentials/v2",
				type: "DataIntegrityProof",
				cryptosuite: "eddsa-jcs-2022",
				created: "2025-05-29T07:00:00.002Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#decentralised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"zGEbKdeUhXWwUg1WymVPvPuaELm6CQjnqA1oqnXd24kBwWEsamSYekCa7yEwrUzHzBhsXaBVcw69pRE765WuiFWr"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:dd01408dac921b8eff96ad94fd7ad266bb4569daf316baf49622c5782faa900a"
					]
				}
			]
		});
	});

	test("can start with no local data, perform operations and create change set", async () => {
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true
			}
		});

		await decentrialisedEntityStorage.set({
			id: "111",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY
		});

		await decentrialisedEntityStorage.set({
			id: "222",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY
		});

		await decentrialisedEntityStorage.remove("111");

		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");

		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore).toEqual([
			{
				id: "222",
				value1: "value1",
				value2: "value2"
			}
		]);

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([]);

		const blobStore = memoryBlobStorage.getStore();
		const blobStoreValues = Object.values(blobStore);
		const blobStorageKeys = Object.keys(blobStore);
		expect(blobStorageKeys.length).toBe(2);
		expect(blobStorageKeys[0]).toEqual(
			"49e2d03a48ad9a04061fbac2d409b21f94c8710bab7e620512591fe6852260ab"
		);
		expect(blobStorageKeys[1]).toEqual(
			"9bc8c65ce1486a0b57c97c64ed8eb826b6588ea6c3311fbe0574339a741ded7a"
		);

		expect(await decompressObject(blobStoreValues[0])).toEqual({
			id: "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6",
			dateCreated: "2025-05-29T07:00:00.006Z",
			changes: [
				{
					operation: "set",
					entity: {
						id: "222",
						value1: "value1",
						value2: "value2"
					}
				},
				{
					operation: "delete",
					id: "111"
				}
			],
			nodeIdentity:
				"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
			proof: {
				"@context": "https://www.w3.org/ns/credentials/v2",
				type: "DataIntegrityProof",
				cryptosuite: "eddsa-jcs-2022",
				created: "2025-05-29T07:00:00.007Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#decentralised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z5sKVbxhbUH7Hf3VMRpJVByvZFP6JZEdk8q3zDmwLXWao2D4hQwNReSC29BLASqjMGFaeiLWc2Tz4pdXBH2D8R6Qs"
			}
		});
		expect(await decompressObject(blobStoreValues[1])).toEqual({
			snapshots: [
				{
					id: "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
					dateCreated: "2025-05-29T07:00:00.005Z",
					changeSetStorageIds: [
						"blob:memory:49e2d03a48ad9a04061fbac2d409b21f94c8710bab7e620512591fe6852260ab"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6OWJjOGM2NWNlMTQ4NmEwYjU3Yzk3YzY0ZWQ4ZWI4MjZiNjU4OGVhNmMzMzExZmJlMDU3NDMzOWE3NDFkZWQ3YSJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:9bc8c65ce1486a0b57c97c64ed8eb826b6588ea6c3311fbe0574339a741ded7a"
		});
	});
});

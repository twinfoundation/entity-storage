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
	 * The date the entry was created.
	 */
	@property({ type: "string", isSecondary: true })
	public dateCreated!: string;

	/**
	 * The node identity which owns the entry.
	 */
	@property({ type: "string", isSecondary: true })
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
			}
		});

		const remoteSyncChangeSet: ISyncChangeSet<TestType> & IJsonLdNodeObject = {
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
						nodeIdentity: TEST_NODE_IDENTITY,
						dateCreated: "2025-05-29T07:00:00.000Z"
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
				nodeIdentity: TEST_NODE_IDENTITY,
				dateCreated: "2025-05-29T07:00:00.000Z"
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
							"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
						dateCreated: "2025-05-29T07:00:00.000Z"
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
					"z7igkZ4XbXMrpM7BgDvq9RzvfLSVMftGaUAzsUKQdaCjuVWpsv8aRtqqbfuoktr3dGJ6ef7WXhHFPFxP8W3gPGPM"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:57436996d6050ac2dabd719cdbcd949dde88ec11e3b35a2e976a249079634b56"
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
			}
		});

		const remoteSyncChangeSet: ISyncChangeSet<TestType> & IJsonLdNodeObject = {
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
						nodeIdentity: TEST_NODE_IDENTITY,
						dateCreated: "2025-05-29T07:00:00.000Z"
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
			nodeIdentity: TEST_NODE_IDENTITY,
			dateCreated: "2025-05-29T07:00:00.000Z"
		});

		await testTypeMemoryEntityStorage.set({
			id: "222",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY,
			dateCreated: "2025-05-29T07:00:00.000Z"
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
				nodeIdentity: TEST_NODE_IDENTITY,
				dateCreated: "2025-05-29T07:00:00.000Z"
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
							"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
						dateCreated: "2025-05-29T07:00:00.000Z"
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
					"z3DDmd8tfy5J2JkTRWuWc9QvyoMRQmrqoxNnAwWrd66UUWY43kWgWAg2THWSPcABJw2QJV2xbiH9QtYPHRdfSSKwG"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:29270af6ba930d8b327c085d4451269a7a1b980f145e6b6b92ab914ca83dabaf"
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
				isAuthoritativeNode: true,
				consolidationIntervalMs: 0
			}
		});

		await decentrialisedEntityStorage.set({
			id: "111",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY,
			dateCreated: "2025-05-29T07:00:00.000Z"
		});

		await decentrialisedEntityStorage.set({
			id: "222",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY,
			dateCreated: "2025-05-29T07:00:00.000Z"
		});

		await decentrialisedEntityStorage.remove("111");

		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");

		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore).toEqual([
			{
				id: "222",
				value1: "value1",
				value2: "value2",
				dateCreated: "2025-05-29T07:00:00.002Z"
			}
		]);

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([]);

		const blobStore = memoryBlobStorage.getStore();
		const blobStoreValues = Object.values(blobStore);
		const blobStorageKeys = Object.keys(blobStore);
		expect(blobStorageKeys.length).toBe(2);
		expect(blobStorageKeys[0]).toEqual(
			"b8bbd25194fe71d6ca8b1a3ad6653bc2aee4b741c9a704084bb6812d07786a73"
		);
		expect(blobStorageKeys[1]).toEqual(
			"63c71295a3d45a0ca9a42f9da869fa5f9ac6058f58d5155aebab9a87e2a0599c"
		);

		expect(await decompressObject(blobStoreValues[0])).toEqual({
			id: "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6",
			dateCreated: "2025-05-29T07:00:00.010Z",
			changes: [
				{
					operation: "set",
					entity: {
						id: "222",
						value1: "value1",
						value2: "value2",
						dateCreated: "2025-05-29T07:00:00.002Z"
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
				created: "2025-05-29T07:00:00.011Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#decentralised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z432VkdNab2bXsKVXjcJTTaoKYH3wzevKGWoKkDeV5GikbLxeyhxvunHZmsGcE62ApkrqZmD18gyevd8cgiCa97Ua"
			}
		});
		expect(await decompressObject(blobStoreValues[1])).toEqual({
			snapshots: [
				{
					id: "d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5d5",
					dateCreated: "2025-05-29T07:00:00.009Z",
					changeSetStorageIds: [
						"blob:memory:b8bbd25194fe71d6ca8b1a3ad6653bc2aee4b741c9a704084bb6812d07786a73"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6NjNjNzEyOTVhM2Q0NWEwY2E5YTQyZjlkYTg2OWZhNWY5YWM2MDU4ZjU4ZDUxNTVhZWJhYjlhODdlMmEwNTk5YyJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:63c71295a3d45a0ca9a42f9da869fa5f9ac6058f58d5155aebab9a87e2a0599c"
		});
	});

	test("can perform a consolidation", async () => {
		for (let i = 0; i < 20; i++) {
			await testTypeMemoryEntityStorage.set({
				id: i.toString(),
				value1: "value1",
				value2: "value2",
				nodeIdentity: TEST_NODE_IDENTITY,
				dateCreated: "2025-05-29T07:00:00.000Z"
			});
		}

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				verifiableStorageKey: testTypeRemoteKey,
				isAuthoritativeNode: true,
				entityUpdateIntervalMs: 0,
				consolidationBatchSize: 5
			}
		});

		await decentrialisedEntityStorage.start(TEST_NODE_IDENTITY, "node-logging");

		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore.length).toEqual(20);

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([]);

		const blobStore = memoryBlobStorage.getStore();
		const blobStoreValues = Object.values(blobStore);
		const blobStorageKeys = Object.keys(blobStore);
		expect(blobStorageKeys).toEqual([
			"5dd2257d13ff3bbf9d0504f31d11293abd9613ad2e3a69c70527cea5904d5c58",
			"65d2243772324f3427bf08da7fceef26880087d99bf7e0fda8e76d7df3ec7896",
			"43479fb66b6e9be73a31c88198d4012ef64f1ced451e69c4370375d08253359d",
			"41096748bd87e2aed6b12d833a8692d78e7774b171d630dc51eb83d19eda8c28",
			"5ba037f5f0e02c89862e1cf6ad2e7070a29a729395b4727341e9ddead57c243d"
		]);

		expect(await decompressObject(blobStoreValues[0])).toEqual({
			id: "d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2",
			dateCreated: "2025-05-29T07:00:00.002Z",
			entities: [
				{
					id: "0",
					value1: "value1",
					value2: "value2",
					nodeIdentity:
						"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
					dateCreated: "2025-05-29T07:00:00.000Z"
				},
				{
					id: "1",
					value1: "value1",
					value2: "value2",
					nodeIdentity:
						"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
					dateCreated: "2025-05-29T07:00:00.000Z"
				},
				{
					id: "2",
					value1: "value1",
					value2: "value2",
					nodeIdentity:
						"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
					dateCreated: "2025-05-29T07:00:00.000Z"
				},
				{
					id: "3",
					value1: "value1",
					value2: "value2",
					nodeIdentity:
						"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
					dateCreated: "2025-05-29T07:00:00.000Z"
				},
				{
					id: "4",
					value1: "value1",
					value2: "value2",
					nodeIdentity:
						"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
					dateCreated: "2025-05-29T07:00:00.000Z"
				}
			],
			nodeIdentity:
				"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
			proof: {
				"@context": "https://www.w3.org/ns/credentials/v2",
				type: "DataIntegrityProof",
				cryptosuite: "eddsa-jcs-2022",
				created: "2025-05-29T07:00:00.003Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#decentralised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z5mVSdSKp1qKpsTZb7N8XhRm1jsj8smfkvFEmyfuCehEstTNLp1HfRZDV3HfGGGZm4Wi62s5umXEu3F1DxH6R6RWv"
			}
		});

		expect(await decompressObject(blobStoreValues[4])).toEqual({
			snapshots: [
				{
					id: "dededededededededededededededededededededededededededededededede",
					dateCreated: "2025-05-29T07:00:00.018Z",
					changeSetStorageIds: [
						"blob:memory:5dd2257d13ff3bbf9d0504f31d11293abd9613ad2e3a69c70527cea5904d5c58",
						"blob:memory:65d2243772324f3427bf08da7fceef26880087d99bf7e0fda8e76d7df3ec7896",
						"blob:memory:43479fb66b6e9be73a31c88198d4012ef64f1ced451e69c4370375d08253359d",
						"blob:memory:41096748bd87e2aed6b12d833a8692d78e7774b171d630dc51eb83d19eda8c28"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6NWJhMDM3ZjVmMGUwMmM4OTg2MmUxY2Y2YWQyZTcwNzBhMjlhNzI5Mzk1YjQ3MjczNDFlOWRkZWFkNTdjMjQzZCJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:5ba037f5f0e02c89862e1cf6ad2e7070a29a729395b4727341e9ddead57c243d"
		});
	});
});

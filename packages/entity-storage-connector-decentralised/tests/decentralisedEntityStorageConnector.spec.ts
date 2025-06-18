// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { MemoryBlobStorageConnector } from "@twin.org/blob-storage-connector-memory";
import { BlobStorageConnectorFactory } from "@twin.org/blob-storage-models";
import { ComponentFactory, Converter, I18n, ObjectHelper, RandomHelper } from "@twin.org/core";
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
import {
	compressObject,
	decompressObject,
	setupTestEnv,
	TEST_NODE_IDENTITY,
	TEST_NODE_IDENTITY_2
} from "./setupTestEnv";
import { DecentralisedEntityStorageConnector } from "../src/decentralisedEntityStorageConnector";
import type { SyncSnapshotEntry } from "../src/entities/syncSnapshotEntry";
import type { IDecentralisedEntityStorageConnectorConfig } from "../src/models/IDecentralisedEntityStorageConnectorConfig";
import type { ISyncChangeSet } from "../src/models/ISyncChangeSet";
import type { ISyncPointer } from "../src/models/ISyncPointer";
import type { ISyncSnapshot } from "../src/models/ISyncSnapshot";
import type { ISyncState } from "../src/models/ISyncState";
import { initSchema } from "../src/schema";
import { SynchronisedStorageService } from "../src/synchronisedStorageService";
import { TrustedSynchronisedStorageService } from "../src/trustedSynchronisedStorageService";

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
let trustedSyncSnapshotEntryMemoryEntityStorage: MemoryEntityStorageConnector<SyncSnapshotEntry>;
let trustedTestTypeMemoryEntityStorage: MemoryEntityStorageConnector<TestType>;

let synchronisedStorageService: SynchronisedStorageService<TestType>;
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

		// These are the local storage connectors for the decentralised entity storage connector.
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

		// These are the trusted version of the node
		trustedSyncSnapshotEntryMemoryEntityStorage =
			new MemoryEntityStorageConnector<SyncSnapshotEntry>({
				entitySchema: nameof<SyncSnapshotEntry>()
			});
		EntityStorageConnectorFactory.register(
			"trusted-sync-snapshot-entry",
			() => trustedSyncSnapshotEntryMemoryEntityStorage
		);

		trustedTestTypeMemoryEntityStorage = new MemoryEntityStorageConnector<TestType>({
			entitySchema: nameof<TestType>()
		});
		EntityStorageConnectorFactory.register(
			"trusted-test-type",
			() => trustedTestTypeMemoryEntityStorage
		);

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
		if (synchronisedStorageService?.stop) {
			await synchronisedStorageService.stop(TEST_NODE_IDENTITY, undefined);
		}
	});

	test("can fail to construct when there is no options", async () => {
		expect(
			() =>
				new DecentralisedEntityStorageConnector(
					undefined as unknown as {
						entityStorageConnectorType: string;
						synchronisedStorageConnectorType: string;
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
						synchronisedStorageConnectorType: string;
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

	test("can fail to construct when there is no entity storage connector", async () => {
		expect(
			() =>
				new DecentralisedEntityStorageConnector({ entitySchema: "test" } as unknown as {
					entityStorageConnectorType: string;
					synchronisedStorageConnectorType: string;
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

	test("can construct a trusted node", async () => {
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		const entityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});
		expect(entityStorage).toBeDefined();
	});

	test("can construct a none trusted node", async () => {
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			trustedSynchronisedStorageComponentType: "synchronised-storage",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: false
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);
		const entityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});
		expect(entityStorage).toBeDefined();
	});

	test("can start with no existing sync state", async () => {
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});
		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");
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
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});

		const syncState: ISyncState = {
			snapshots: []
		};
		const blobStorageId = await memoryBlobStorage.set(await compressObject(syncState));

		const verifiableSyncPointer: ISyncPointer = {
			syncPointerId: blobStorageId
		};
		await verifiableSyncPointerMemoryEntityStorage.set({
			id: testTypeRemoteKey.split(":")[2],
			creator: TEST_NODE_IDENTITY,
			data: Converter.bytesToBase64(ObjectHelper.toBytes(verifiableSyncPointer)),
			allowList: [TEST_NODE_IDENTITY],
			maxAllowListSize: 10
		});
		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");
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
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
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
			`${TEST_NODE_IDENTITY}#synchronised-storage-assertion`,
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

		const verifiableSyncPointer: ISyncPointer = {
			syncPointerId: blobStorageId
		};
		await verifiableSyncPointerMemoryEntityStorage.set({
			id: testTypeRemoteKey.split(":")[2],
			creator: TEST_NODE_IDENTITY,
			data: Converter.bytesToBase64(ObjectHelper.toBytes(verifiableSyncPointer)),
			allowList: [TEST_NODE_IDENTITY],
			maxAllowListSize: 10
		});
		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([
			{
				dateCreated: "2025-05-29T07:00:00.003Z",
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				context: "test-type",
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
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#synchronised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"zuLrYd81cAnL7UxXCFBKEwGdqTmxrE2733qFBZg5UUZyT2b8FsUKCWD768RV9ccm2xFsZpm8PbXvskQYweoidKL2"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:0e9b13cbdd49b37587ed8bd8a409f303edecb9d7dc2b00f7c3525e148007d0aa"
					]
				}
			]
		});
	});

	test("can start with existing populated local sync state and populated remote sync state", async () => {
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
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
			`${TEST_NODE_IDENTITY}#synchronised-storage-assertion`,
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

		const verifiableSyncPointer: ISyncPointer = {
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

		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([
			{
				dateCreated: "2025-05-29T07:00:00.003Z",
				id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
				context: "test-type",
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
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#synchronised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z4BkpfR9YMQ4BtB9wZGjTBFN4T7vKwqd3JFd5Eefkhvmh3o6dnNTKahnSq14YfffaVBC2G7VKGfpD6BFi3C68gfw8"
			}
		});
		expect(await decompressObject(blobStore[1])).toEqual({
			snapshots: [
				{
					id: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
					dateCreated: "2025-05-29T07:00:00.003Z",
					changeSetStorageIds: [
						"blob:memory:a8355dda135329030bfd326c6988a52ddbcf3b54c93d286b6f143637af0fe20b"
					]
				}
			]
		});
	});

	test("can start with no local data, perform operations and create change set", async () => {
		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
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

		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");

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
			"487b1bd3ceea686db2258d39b1b50a1d99bdb8419a8cacd6ffe03708a8f3c18c"
		);
		expect(blobStorageKeys[1]).toEqual(
			"bcac87cffb7fb1320f7003c99a13e070ee17243c4402be67d830beaa57ee8176"
		);

		expect(await decompressObject(blobStoreValues[0])).toEqual({
			id: "d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3",
			dateCreated: "2025-05-29T07:00:00.007Z",
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
				created: "2025-05-29T07:00:00.008Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#synchronised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z6WU24WHAUDrCt2EWyYnECuUsqqqmr5JxmLGpe9WUtzp9JMfpRCHhAMg5ZkBthZ4GjPSYM9csNS6i1eJCgAbLbBA"
			}
		});
		expect(await decompressObject(blobStoreValues[1])).toEqual({
			snapshots: [
				{
					id: "d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8d8",
					dateCreated: "2025-05-29T07:00:00.013Z",
					changeSetStorageIds: [
						"blob:memory:487b1bd3ceea686db2258d39b1b50a1d99bdb8419a8cacd6ffe03708a8f3c18c"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6YmNhYzg3Y2ZmYjdmYjEzMjBmNzAwM2M5OWExM2UwNzBlZTE3MjQzYzQ0MDJiZTY3ZDgzMGJlYWE1N2VlODE3NiJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:bcac87cffb7fb1320f7003c99a13e070ee17243c4402be67d830beaa57ee8176"
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

		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				entityUpdateIntervalMs: 0,
				consolidationBatchSize: 5
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});

		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");

		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore.length).toEqual(20);

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([]);

		const blobStore = memoryBlobStorage.getStore();
		const blobStoreValues = Object.values(blobStore);
		const blobStorageKeys = Object.keys(blobStore);
		expect(blobStorageKeys).toEqual([
			"964ed034343e8af33eba21c6e057c6037061f0655b84001cc053539024cb8a3b",
			"d7d5da00a64191553ec5c976082e09d86c49f9ba6b46d3da8e08eb4f17cdfcf6",
			"543341d0cff2aeccda5b04301fe2bf6bfaa2e9c38ef6ef03dc0f3bd40cd8b03d",
			"aedbb2d785e89fad9f3759985d1533039371592a6813190227872897b8f8a152",
			"0cfe37807c62fbdab528d188a69694e12f7d53c7b624c8f224b606c2bb837744"
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
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#synchronised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z3uLt6ZnBmikdZG9viPZWenVcZjvKLErgQNftGXh5mEMTVWnjfpa1MhT31CVtADoMNTnedFNuwuKURic3De7ndmV9"
			}
		});

		expect(await decompressObject(blobStoreValues[4])).toEqual({
			snapshots: [
				{
					id: "dededededededededededededededededededededededededededededededede",
					dateCreated: "2025-05-29T07:00:00.018Z",
					changeSetStorageIds: [
						"blob:memory:964ed034343e8af33eba21c6e057c6037061f0655b84001cc053539024cb8a3b",
						"blob:memory:d7d5da00a64191553ec5c976082e09d86c49f9ba6b46d3da8e08eb4f17cdfcf6",
						"blob:memory:543341d0cff2aeccda5b04301fe2bf6bfaa2e9c38ef6ef03dc0f3bd40cd8b03d",
						"blob:memory:aedbb2d785e89fad9f3759985d1533039371592a6813190227872897b8f8a152"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6MGNmZTM3ODA3YzYyZmJkYWI1MjhkMTg4YTY5Njk0ZTEyZjdkNTNjN2I2MjRjOGYyMjRiNjA2YzJiYjgzNzc0NCJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:0cfe37807c62fbdab528d188a69694e12f7d53c7b624c8f224b606c2bb837744"
		});
	});

	test("can synchronise with a trusted node", async () => {
		const remoteSynchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "trusted-test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: true,
				consolidationIntervalMs: 0
			}
		});
		ComponentFactory.register(
			"remote-synchronised-storage",
			() => remoteSynchronisedStorageService
		);

		const remoteTrustedSynchronisedStorageService = new TrustedSynchronisedStorageService({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "trusted-test-type",
			config: {
				synchronisedStorageKey: testTypeRemoteKey
			}
		});
		ComponentFactory.register(
			"trusted-remote-synchronised-storage",
			() => remoteTrustedSynchronisedStorageService
		);

		synchronisedStorageService = new SynchronisedStorageService<TestType>({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			trustedSynchronisedStorageComponentType: "trusted-remote-synchronised-storage",
			syncSnapshotStorageConnectorType: "trusted-sync-snapshot-entry",
			config: {
				synchronisedStorageKey: testTypeRemoteKey,
				isTrustedNode: false
			}
		});
		ComponentFactory.register("synchronised-storage", () => synchronisedStorageService);

		decentrialisedEntityStorage = new DecentralisedEntityStorageConnector({
			entitySchema: nameof<TestType>(),
			entityStorageConnectorType: "test-type",
			synchronisedStorageConnectorType: "synchronised-storage"
		});

		await decentrialisedEntityStorage.set({
			id: "111",
			value1: "value1",
			value2: "value2",
			nodeIdentity: TEST_NODE_IDENTITY,
			dateCreated: "2025-05-29T07:00:00.000Z"
		});

		await synchronisedStorageService.start(TEST_NODE_IDENTITY, "node-logging");
		await remoteSynchronisedStorageService.start(TEST_NODE_IDENTITY_2, "node-logging");

		const localEntityStore = testTypeMemoryEntityStorage.getStore();
		expect(localEntityStore.length).toEqual(1);

		const trustedLocalEntityStore = trustedTestTypeMemoryEntityStorage.getStore();
		expect(trustedLocalEntityStore.length).toEqual(1);

		const localSyncSnapshotStore = localSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(localSyncSnapshotStore).toEqual([]);

		const trustedSyncSnapshotStore = trustedSyncSnapshotEntryMemoryEntityStorage.getStore();
		expect(trustedSyncSnapshotStore).toEqual([]);

		const blobStore = memoryBlobStorage.getStore();
		const blobStoreValues = Object.values(blobStore);
		const blobStorageKeys = Object.keys(blobStore);
		expect(blobStorageKeys).toEqual([
			"f970d728ac67e4a46eda46ceffe51870e9f2898133c98d784c9628caacd32e3c",
			"f2f0e9aec58e62933acc10090b0e6c73c6049b19c1b8d2d5ac591118363ad2dd"
		]);

		expect(await decompressObject(blobStoreValues[0])).toEqual({
			id: "d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3",
			dateCreated: "2025-05-29T07:00:00.004Z",
			changes: [
				{
					operation: "set",
					entity: {
						id: "111",
						value1: "value1",
						value2: "value2",
						dateCreated: "2025-05-29T07:00:00.000Z"
					}
				}
			],
			nodeIdentity:
				"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101",
			proof: {
				"@context": "https://www.w3.org/ns/credentials/v2",
				type: "DataIntegrityProof",
				cryptosuite: "eddsa-jcs-2022",
				created: "2025-05-29T07:00:00.005Z",
				verificationMethod:
					"did:entity-storage:0x0101010101010101010101010101010101010101010101010101010101010101#synchronised-storage-assertion",
				proofPurpose: "assertionMethod",
				proofValue:
					"z3dU47sjjophunTNBTu61EBBUUzzxjDTBGP3YApaFEwn1Q3SfRf4mXad24jbqTjLpvrKqA1WaqifX2Ls8gsEY7qnT"
			}
		});

		expect(await decompressObject(blobStoreValues[1])).toEqual({
			snapshots: [
				{
					id: "d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6",
					dateCreated: "2025-05-29T07:00:00.008Z",
					changeSetStorageIds: [
						"blob:memory:f970d728ac67e4a46eda46ceffe51870e9f2898133c98d784c9628caacd32e3c"
					]
				}
			]
		});

		const verifiableSyncPointerStore = verifiableSyncPointerMemoryEntityStorage.getStore();
		expect(verifiableSyncPointerStore).toEqual([
			{
				id: "d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7d7",
				creator: "verifiable:entity-storage:11111111111111111111111111111111",
				data: "eyJzeW5jUG9pbnRlcklkIjoiYmxvYjptZW1vcnk6ZjJmMGU5YWVjNThlNjI5MzNhY2MxMDA5MGIwZTZjNzNjNjA0OWIxOWMxYjhkMmQ1YWM1OTExMTgzNjNhZDJkZCJ9",
				allowList: ["verifiable:entity-storage:11111111111111111111111111111111"],
				maxAllowListSize: 100
			}
		]);

		expect(
			ObjectHelper.fromBytes(Converter.base64ToBytes(verifiableSyncPointerStore[0].data))
		).toEqual({
			syncPointerId: "blob:memory:f2f0e9aec58e62933acc10090b0e6c73c6049b19c1b8d2d5ac591118363ad2dd"
		});
	});
});

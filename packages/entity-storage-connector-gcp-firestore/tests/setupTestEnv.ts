// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";
import { FirestoreEntityStorageConnector } from "../src/firestoreEntityStorageConnector";
import type { IFirestoreEntityStorageConnectorConfig } from "../src/models/IFirestoreEntityStorageConnectorConfig";

dotenv.config({ path: [path.join(__dirname, ".env"), path.join(__dirname, ".env.dev")] });

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_FIRESTORE_PROJECT_ID", process.env.TEST_FIRESTORE_PROJECT_ID);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_COLLECTION_NAME",
	process.env.TEST_FIRESTORE_COLLECTION_NAME
);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_CLIENT_EMAIL",
	process.env.TEST_FIRESTORE_CLIENT_EMAIL
);
Guards.stringValue("TestEnv", "TEST_FIRESTORE_PRIVATE_KEY", process.env.TEST_FIRESTORE_PRIVATE_KEY);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_UNDEFINED_VALUE_HANDLING",
	process.env.TEST_FIRESTORE_UNDEFINED_VALUE_HANDLING
);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_KEY_FILENAME",
	process.env.TEST_FIRESTORE_KEY_FILENAME
);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_EMULATOR_HOST",
	process.env.TEST_FIRESTORE_EMULATOR_HOST
);
Guards.stringValue(
	"TestEnv",
	"TEST_FIRESTORE_MAX_IDLE_CHANNELS",
	process.env.TEST_FIRESTORE_MAX_IDLE_CHANNELS
);
Guards.stringValue("TestEnv", "TEST_FIRESTORE_TIMEOUT", process.env.TEST_FIRESTORE_TIMEOUT);

export const TEST_FIRESTORE_CONFIG: IFirestoreEntityStorageConnectorConfig = {
	projectId: process.env.TEST_FIRESTORE_PROJECT_ID ?? "",
	collectionName: process.env.TEST_FIRESTORE_COLLECTION_NAME ?? "",
	keyFilename: process.env.TEST_FIRESTORE_KEY_FILENAME,
	emulatorHost: process.env.TEST_FIRESTORE_EMULATOR_HOST,
	settings: {
		maxIdleChannels: Number(process.env.TEST_FIRESTORE_MAX_IDLE_CHANNELS),
		timeout: Number(process.env.TEST_FIRESTORE_TIMEOUT)
	},
	credentials: {
		// eslint-disable-next-line camelcase
		client_email: process.env.TEST_FIRESTORE_CLIENT_EMAIL ?? "",
		// eslint-disable-next-line camelcase
		private_key: process.env.TEST_FIRESTORE_PRIVATE_KEY ?? ""
	},
	undefinedValueHandling: process.env.TEST_FIRESTORE_UNDEFINED_VALUE_HANDLING as
		| "remove"
		| "convert-to-null"
		| "throw-error"
		| undefined
};

/**
 * TestableFirestoreEntityStorageConnector.
 */
export class TestableFirestoreEntityStorageConnector<T> extends FirestoreEntityStorageConnector<T> {
	/**
	 * Test handle undefined values.
	 * @param customEntity The entity to handle undefined values in
	 * @returns The entity with undefined values handled
	 */
	public testHandleUndefinedValues(customEntity: unknown): unknown {
		return this.handleUndefinedValues(customEntity);
	}

	/**
	 * Test convert undefined to null.
	 * @param obj The object to convert undefined values to
	 * @returns The object with undefined values converted to null
	 */
	public testConvertUndefinedToNull(obj: unknown): unknown {
		return this.convertUndefinedToNull(obj);
	}

	/**
	 * Test check for undefined properties.
	 * @param obj The object to check for undefined properties in
	 * @returns Nothing.
	 */
	public testCheckForUndefinedProperties(obj: unknown): void {
		return this.checkForUndefinedProperties(obj);
	}

	/**
	 * Test remove undefined properties.
	 * @param obj The object to remove undefined properties from
	 * @returns The object with undefined properties removed
	 */
	public testRemoveUndefinedProperties(obj: unknown): unknown {
		return this.removeUndefinedProperties(obj);
	}
}

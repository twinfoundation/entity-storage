// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Configuration for the Firestore Entity Storage Connector.
 */
export interface IFirestoreEntityStorageConnectorConfig {
	/**
	 * The GCP project ID.
	 */
	projectId: string;

	/**
	 * The name of the collection for the storage.
	 */
	collectionName: string;

	/**
	 * The path to the service account key file (optional for production when using default credentials).
	 */
	keyFilename?: string;

	/**
	 * The emulator host for local testing (e.g., "localhost:8080").
	 */
	emulatorHost?: string;

	/**
	 * Optional settings for Firestore client initialization.
	 */
	settings?: {
		/**
		 * The maximum number of idle channels to keep open.
		 */
		maxIdleChannels?: number;

		/**
		 * The custom timeout for requests (in milliseconds).
		 */
		timeout?: number;
	};

	/**
	 * The GCP credentials (optional for local development or when using default credentials).
	 */
	credentials?: {
		client_email: string;
		private_key: string;
	};

	/**
	 * Specifies how to handle undefined values when storing data in Firestore.
	 * - 'remove': Remove properties with undefined values (default)
	 * - 'convert-to-null': Convert undefined values to null
	 * - 'throw-error': Throw an error if undefined values are encountered
	 */
	undefinedValueHandling?: "remove" | "convert-to-null" | "throw-error";
}

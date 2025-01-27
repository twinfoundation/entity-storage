// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";
import type { IMongoDbEntityStorageConnectorConfig } from "../src/models/IMongoDbEntityStorageConnectorConfig";

dotenv.config({ path: [path.join(__dirname, ".env"), path.join(__dirname, ".env.dev")] });

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_MONGODB_ENDPOINT", process.env.TEST_MONGODB_ENDPOINT);
Guards.stringValue("TestEnv", "TEST_MONGODB_PORT", process.env.TEST_MONGODB_PORT);
Guards.stringValue("TestEnv", "TEST_MONGODB_DATABASE", process.env.TEST_MONGODB_DATABASE);
Guards.stringValue("TestEnv", "TEST_MONGODB_COLLECTION", process.env.TEST_MONGODB_COLLECTION);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const TEST_MONGODB_CONFIG: IMongoDbEntityStorageConnectorConfig = {
	host: process.env.TEST_MONGODB_ENDPOINT,
	port: process.env.TEST_MONGODB_PORT,
	database: process.env.TEST_MONGODB_DATABASE,
	collection: process.env.TEST_MONGODB_COLLECTION
};

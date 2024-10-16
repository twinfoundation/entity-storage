// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";
import type { ICosmosDbEntityStorageConnectorConfig } from "../src/models/ICosmosDbEntityStorageConnectorConfig";

dotenv.config({ path: [path.join(__dirname, ".env"), path.join(__dirname, ".env.dev")] });

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_COSMOS_ENDPOINT", process.env.TEST_COSMOS_ENDPOINT);
Guards.stringValue("TestEnv", "TEST_COSMOS_KEY", process.env.TEST_COSMOS_KEY);
Guards.stringValue("TestEnv", "TEST_COSMOS_DATABASE", process.env.TEST_COSMOS_DATABASE);
Guards.stringValue("TestEnv", "TEST_COSMOS_CONTAINER", process.env.TEST_COSMOS_CONTAINER);

export const TEST_COSMOS_CONFIG: ICosmosDbEntityStorageConnectorConfig = {
	endpoint: process.env.TEST_COSMOS_ENDPOINT,
	key: process.env.TEST_COSMOS_KEY,
	databaseId: process.env.TEST_COSMOS_DATABASE,
	containerId: process.env.TEST_COSMOS_CONTAINER
};

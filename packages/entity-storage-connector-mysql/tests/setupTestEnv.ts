// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";
import type { IMySqlEntityStorageConnectorConfig } from "../src/models/IMySqlEntityStorageConnectorConfig";

dotenv.config({ path: [path.join(__dirname, ".env"), path.join(__dirname, ".env.dev")] });

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_MYSQL_ENDPOINT", process.env.TEST_MYSQL_ENDPOINT);
Guards.stringValue("TestEnv", "TEST_MYSQL_PORT", process.env.TEST_MYSQL_PORT);
Guards.stringValue("TestEnv", "TEST_MYSQL_USER", process.env.TEST_MYSQL_USER);
Guards.stringValue("TestEnv", "TEST_MYSQL_KEY", process.env.TEST_MYSQL_KEY);
Guards.stringValue("TestEnv", "TEST_MYSQL_DATABASE", process.env.TEST_MYSQL_DATABASE);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const TEST_MYSQL_CONFIG: IMySqlEntityStorageConnectorConfig = {
	host: process.env.TEST_MYSQL_ENDPOINT,
	port: process.env.TEST_MYSQL_PORT,
	user: process.env.TEST_MYSQL_USER,
	password: process.env.TEST_MYSQL_KEY,
	database: process.env.TEST_MYSQL_DATABASE
};

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import path from "node:path";
import { Guards } from "@twin.org/core";
import * as dotenv from "dotenv";
import type { IPostgresSqlEntityStorageConnectorConfig } from "../src/models/IPostgresSqlEntityStorageConnectorConfig";

dotenv.config({ path: [path.join(__dirname, ".env"), path.join(__dirname, ".env.dev")] });

console.debug("Setting up test environment from .env and .env.dev files");

Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_HOST", process.env.TEST_POSTGRESSQL_HOST);
Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_PORT", process.env.TEST_POSTGRESSQL_PORT);
Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_USER", process.env.TEST_POSTGRESSQL_USER);
Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_PASSWORD", process.env.TEST_POSTGRESSQL_PASSWORD);
Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_DATABASE", process.env.TEST_POSTGRESSQL_DATABASE);
Guards.stringValue("TestEnv", "TEST_POSTGRESSQL_TABLE", process.env.TEST_POSTGRESSQL_TABLE);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export const TEST_POSTGRESSQL_CONFIG: IPostgresSqlEntityStorageConnectorConfig = {
	host: process.env.TEST_POSTGRESSQL_HOST,
	port: Number.parseInt(process.env.TEST_POSTGRESSQL_PORT, 10),
	user: process.env.TEST_POSTGRESSQL_USER,
	password: process.env.TEST_POSTGRESSQL_PASSWORD,
	database: process.env.TEST_POSTGRESSQL_DATABASE,
	tableName: process.env.TEST_POSTGRESSQL_TABLE
};

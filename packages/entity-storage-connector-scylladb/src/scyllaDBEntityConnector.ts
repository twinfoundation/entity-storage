// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import { BaseError, Coerce, Guards, Is, ObjectHelper } from "@gtsc/core";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { nameof } from "@gtsc/nameof";
import { AbstractScyllaDBEntity } from "./abstractScyllaDBEntity";

/**
 * Store entities using ScyllaDB.
 */
export class ScyllaDBEntityStorage<T = unknown> extends AbstractScyllaDBEntity<T>
implements IEntityStorageConnector<T> {
    /**
     * Limit the number of entities when finding.
     * @internal
     */
    private static readonly _PAGE_SIZE: number = 40;

    /**
     * Runtime name for the class.
     * @internal
     */
    protected override readonly CLASS_NAME: string = nameof<ScyllaDBEntityStorage>();

    /**
     * Bootstrap the service by creating and initializing any resources it needs.
     * @param requestContext The request context for bootstrapping.
     * @returns The response of the bootstrapping as log entries.
     */
    public async bootstrap(requestContext: IRequestContext): Promise<ILogEntry[]> {
        const log: ILogEntry[] = [];

        log.push({
            level: "info",
            source: this.CLASS_NAME,
            ts: Date.now(),
            message: "tableCreating",
            data: this.fullTableName
        });

        try {
            let dbConnection = await this.openConnection(this._config);

            await this.createKeyspace(dbConnection, this._config.keyspace);

            // Connection has to be closed and now open a new one with our keyspace
            await this.closeConnection(dbConnection);
            dbConnection = await this.openConnection(this._config);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const structuredTypes: IStructuredTypeDescriptor<any>[] = this._entityDescriptor.structuredTypes ?? [];

            // Creating the structured types
            for (const structuredType of structuredTypes) {
                const typeFields: string[] = [];
                for (const field of structuredType.fields) {
                    typeFields.push(`"${String(field.name)}" ${this.toDbField(field)}`);
                }

                const sql = `CREATE TYPE IF NOT EXISTS
                                "${structuredType.name}" (${typeFields.join(",")})`;

                await this._logger?.log(requestContext, {
                    level: "info",
                    source: this.CLASS_NAME,
                    ts: Date.now(),
                    message: "entityStorage.sqlCreateType",
                    data: sql
                });

                await this.execute(dbConnection, sql);
            }

            const fields: string[] = [];
            const primaryKeys: string[] = [];
            const secondaryKeys: string[] = [];

            for (const field of this._entityDescriptor.properties) {
                fields.push(`"${String(field.name)}" ${this.toDbField(field)}`);
                if (field.isPrimary) {
                    primaryKeys.push(`"${field.name as string}"`);
                }
                if (field.isSecondary) {
                    secondaryKeys.push(`"${field.name as string}"`);
                }
            }
            fields.push(`PRIMARY KEY ( (${primaryKeys.join(",")})`);
            if (secondaryKeys.length > 0) {
                fields.push(`${secondaryKeys.join(",")})`);
            } else {
                fields[fields.length - 1] += ")";
            }

            const sql = `CREATE TABLE IF NOT EXISTS "${this.fullTableName}" (${fields.join(",")})`;

            await this._logger?.log(requestContext, {
                level: "info",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "entityStorage.sqlCreateTable",
                data: sql
            });

            await this.execute(dbConnection, sql);

            log.push({
                level: "info",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "tableCreated",
                data: this.fullTableName
            });
        } catch (err) {
            if (BaseError.isErrorCode(err, "ResourceInUseException")) {
                log.push({
                    level: "info",
                    source: this.CLASS_NAME,
                    ts: Date.now(),
                    message: "tableExists",
                    data: this.fullTableName
                });
            } else {
                log.push({
                    level: "error",
                    source: this.CLASS_NAME,
                    ts: Date.now(),
                    message: "tableCreateFailed",
                    error: err,
                    data: this.fullTableName
                });
            }
        }

        return log;
    }

    /**
     * Set an entity.
     * @param requestContext The context for the request.
     * @param entity The entity to set.
     */
    public async set(requestContext: IRequestContext, entity: T): Promise<void> {
        Guards.object<T>(this.CLASS_NAME, nameof(entity), entity);

        let connection;
        const id = entity[this._primaryKey?.name];
        try {
            const propNames = this._entityDescriptor.properties.map(f => `"${String(f.name)}"`);
            const propValues: unknown[] = [];
            const preparedValues: string[] = [];

            const entityAsKeyValues = entity as unknown as { [key: string]: unknown };

            for (const propDesc of this._entityDescriptor.properties) {
                const value = entityAsKeyValues[propDesc.name as string];
                propValues.push(this.propertyToDbValue(value, propDesc));
                preparedValues.push("?");
            }

            const sql = `INSERT INTO "${this.fullTableName}" (${propNames.join(",")}) VALUES (${preparedValues.join(
                ","
            )})`;

            await this._logger?.log(requestContext, {
                level: "info",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "entityStorage.sqlSet",
                data: sql
            });

            connection = await this.openConnection(this._config);

            await this.execute(connection, sql, propValues);
        } catch (error) {
            await this._logger?.log(requestContext, {
                level: "error",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "entityStorage.setFailed",
                error
            });

            throw new GeneralError(
                this.CLASS_NAME,
                "entityStorage.setFailed",
                {
                    id
                },
                error
            );
        } finally {
            await this.closeConnection(connection);
        }
    }

    /**
     * Delete the entity.
     * @param requestContext The context for the request.
     * @param id The id of the entity to remove.
     */
    public async remove(requestContext: IRequestContext, id: string): Promise<void> {
        Guards.stringValue(this.CLASS_NAME, nameof(id), id);

        let connection;
        const primaryFieldValue = this.propertyToDbValue(id, this._primaryKey);

        try {
            const sql = `DELETE FROM "${this.fullTableName}" WHERE "${String(this._primaryKey?.name)}"=?`;

            await this._logger?.log(requestContext, {
                level: "info",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "entityStorage.sqlRemove",
                data: sql
            });

            connection = await this.openConnection(this._config);

            await this.execute(connection, sql, [primaryFieldValue]);
        } catch (error) {
            throw new GeneralError(
                this.CLASS_NAME,
                "entityStorage.removeFailed",
                {
                    id
                },
                error
            );
        } finally {
            await this.closeConnection(connection);
        }
    }

    /**
     * Get the default page size of the entity storage.
     * @returns The entitty storage page size.
     */
    public pageSize(): number {
        return ScyllaDBEntityStorage._PAGE_SIZE;
    }

    /**
     * Check if the services that tlip depends on are running ok.
     */
    public async healthCheck(): Promise<boolean> {
        const tempKeyspace = `health_check_${Date.now()}`;
        const testTable = "test_table";
        const testId = crypto.randomUUID();
        const testData = crypto.randomUUID();
        const connection = await this.openConnection(this._config);

        try {
            await this.execute(
                connection,
                `CREATE KEYSPACE ${tempKeyspace} WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}`
            );
            await this.execute(connection, `USE ${tempKeyspace}`);
            await this.execute(connection, `CREATE TABLE ${testTable} ( id uuid PRIMARY KEY, test_value text)`);
            await this.execute(connection, `INSERT INTO ${testTable} (id, test_value) VALUES (?, ?) `, [
                testId,
                testData
            ]);

            const result = await this.execute(connection, `SELECT * FROM ${testTable} WHERE id = ? `, [testId]);
            if (result.rows[0].test_value !== "test_data") {
                throw new GeneralError(this.CLASS_NAME, "scyllaDbEntityStorage.healthCheckFailed", undefined);
            }

            return true;
        } finally {
            await this.execute(connection, `DROP KEYSPACE IF EXISTS ${tempKeyspace}`);
        }
    }

    /**
     * Transform a logically descripted field into a DB field.
     * @param logicalField The logical field description.
     * @returns The DB type.
     * @throws GeneralException if no mapping found.
     */
    private toDbField(logicalField: IEntityPropertyDescriptor<T> | IStructuredTypeFieldDescriptor<T>): string {
        let dbType: string;

        const simpleTypes = new Set<string>(["string", "UUID", "float", "double", "integer", "timestamp", "boolean"]);

        switch (logicalField.type) {
            case "string":
                dbType = "TEXT";
                break;
            case "UUID":
                dbType = "UUID";
                break;
            case "float":
                dbType = "FLOAT";
                break;
            case "double":
                dbType = "DOUBLE";
                break;
            case "integer":
                if (logicalField.size === 1) {
                    dbType = "TINYINT";
                } else if (logicalField.size === 2) {
                    dbType = "SMALLINT";
                } else if (logicalField.size === 3) {
                    dbType = "INT";
                } else if (logicalField.size === 8) {
                    dbType = "BIGINT";
                } else {
                    dbType = "INT";
                }
                break;
            case "timestamp":
                dbType = "TIMESTAMP";
                break;
            case "boolean":
                dbType = "BOOLEAN";
                break;
            case "structure":
                if (!logicalField.itemType) {
                    throw new GeneralError(this.CLASS_NAME, "itemTypeNotDefined", {
                        type: logicalField.type,
                        table: this.fullTableName
                    });
                }
                if (simpleTypes.has(logicalField.itemType)) {
                    throw new GeneralError(this.CLASS_NAME, "itemTypeNotValid", {
                        type: logicalField.type,
                        table: this.fullTableName
                    });
                }
                dbType = `frozen<"${logicalField.itemType}">`;
                break;
            case "list":
                if (!logicalField.itemType) {
                    throw new GeneralError(this.CLASS_NAME, "itemTypeNotDefined", {
                        type: logicalField.type,
                        table: this.fullTableName
                    });
                }
                if (simpleTypes.has(logicalField.itemType)) {
                    dbType = `SET<${this.toDbField({
                        name: logicalField.name,
                        type: logicalField.itemType as EntityPropertyDescriptorDataType
                    })}>`;
                } else {
                    dbType = `SET<frozen<"${logicalField.itemType}">>`;
                }
                break;
            case "object":
                dbType = "TEXT";
                break;
            default:
                throw new GeneralError(this.CLASS_NAME, "unknownFieldType", {
                    type: logicalField.type,
                    table: this.fullTableName
                });
        }

        return dbType;
    }
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import {
    BaseError,
    type IEntityDescriptor,
    type IEntityPropertyDescriptor,
    type IViewDescriptor
} from "@gtsc/framework/core";
import type { ILogEntry, IRequestContext } from "@gtsc/framework/services";
import type { IEntityView, ILogger } from "@gtsc/services/models";
import { nameof } from "nameof-ts-transform";
import type { IScyllaDBViewConfig } from "../models/config/IScyllaDBViewConfig";
import { AbstractScyllaDBEntity } from "./abstractScyllaDBEntity";

/**
 * Store entities using MySQL DB.
 */
export class ScyllaDBEntityView<T, U> extends AbstractScyllaDBEntity<U> implements IEntityView<U> {
    /**
     * Runtime name for the class.
     * @internal
     */
    protected override readonly CLASS_NAME: string = nameof<ScyllaDBEntityView<T, U>>();

    /** The view descriptor. */
    private readonly _viewDefinition: IViewDescriptor<T, U>;

    /**
     * Create a new instance of ScyllaDBEntityStorage.
     * @param config The config for the DB connection.
     * @param viewDefinition The descriptor for the entity.
     * @param logger Logger.
     */
    constructor(config: IScyllaDBViewConfig, viewDefinition: IViewDescriptor<T, U>, logger: ILogger) {
        // We need this conversion so that types can match in the superclass and reuse the get method
        super(config, viewDefinition.entity as unknown as IEntityDescriptor<U>, logger);

        // As this is a view only a subset of the entity properties will be in scope
        const properties: IEntityPropertyDescriptor<U>[] = this._entityDescriptor.properties;

        const filteredProperties = properties.filter(property => {
            for (const member of this._viewDefinition.members) {
                const pName = property.name as string;
                const mName = member.name as string;
                if (pName === mName) {
                    return true;
                }
            }
            return false;
        });
        // Now only the view properties are in scope so that we can find accurately
        this._entityDescriptor.properties = filteredProperties;

        this._viewDefinition = viewDefinition;
        // Ensuring queries are made over view
        this.fullTableName = config.viewName;
    }

    /**
     * Bootstrap the service by creating and initializing any resources it needs.
     * @param requestContext The request context for bootstrapping.
     * @returns The response of the bootstrapping as log entries.
     */
    public async bootstrap(requestContext: IRequestContext): Promise<ILogEntry[]> {
        const log: ILogEntry[] = [];

        if (!requestContext.tenantId) {
            log.push({
                level: "error",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "noTenantSpecified",
                data: this.fullTableName
            });

            return log;
        }

        log.push({
            level: "info",
            source: this.CLASS_NAME,
            ts: Date.now(),
            message: "viewCreating",
            data: this.fullTableName
        });

        try {
            const tenantId = requestContext.tenantId;
            const config: IScyllaDBViewConfig = this._config as IScyllaDBViewConfig;

            const dbConnection = await this.openConnection(this._config);

            await this.createKeyspace(dbConnection, tenantId);

            const fields: string[] = [];
            const primaryKeys: string[] = [];

            for (const field of this._viewDefinition.members) {
                fields.push(`"${String(field.name)}" IS NOT NULL `);
                if (field.isPrimary) {
                    primaryKeys.push(field.name as string);
                }
            }
            fields.push(`PRIMARY KEY (${primaryKeys.join(",")})`);

            const sql = `CREATE MATERIALIZED VIEW IF NOT EXISTS ${tenantId}.${config.viewName}
            AS SELECT * FROM ${tenantId}.${this._config.tableName} WHERE
            ${this.fullTableName} (${fields.join(" AND ")})`;

            await this.execute(dbConnection, sql);

            log.push({
                level: "info",
                source: this.CLASS_NAME,
                ts: Date.now(),
                message: "viewCreated",
                data: this.fullTableName
            });
        } catch (err) {
            if (BaseError.isErrorCode(err, "ResourceInUseException")) {
                log.push({
                    level: "info",
                    source: this.CLASS_NAME,
                    ts: Date.now(),
                    message: "viewExists",
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
}

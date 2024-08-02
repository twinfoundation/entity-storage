// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, GeneralError, Is, StringHelper, type IError } from "@gtsc/core";
import { EntitySchemaHelper, type IEntitySchema } from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { LoggingConnectorFactory } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import { AbstractScyllaDBConnector } from "./abstractScyllaDBConnector";
import type { IScyllaDBViewConfig } from "./models/IScyllaDBViewConfig";

/**
 * Manage entities using ScyllaDB Views.
 */
export class ScyllaDBViewConnector<T>
	extends AbstractScyllaDBConnector<T>
	implements IEntityStorageConnector<T>
{
	/**
	 * The view descriptor.
	 */
	private readonly _viewSchema: IEntitySchema<T>;

	/**
	 * The name of the database table.
	 * @internal
	 */
	private readonly _originalFullTableName: string;

	/**
	 * Create a new instance of ScyllaDBViewConnector.
	 * @param options The options for the connector.
	 * @param options.loggingConnectorType The type of logging connector to use, defaults to "logging".
	 * @param options.entitySchema The name of the entity schema.
	 * @param options.viewSchema The name of the view schema.
	 * @param options.config The configuration for the connector.
	 */
	constructor(options: {
		loggingConnectorType?: string;
		entitySchema: string;
		viewSchema: string;
		config: IScyllaDBViewConfig;
	}) {
		// We need this conversion so that types can match in the superclass and reuse the get method
		super(
			{
				loggingConnectorType: options.loggingConnectorType,
				entitySchema: options.viewSchema,
				config: options.config
			},
			nameof(ScyllaDBViewConnector)
		);

		this._viewSchema = EntitySchemaHelper.getSchema<T>(options.viewSchema);

		// We need the underlying class to use the view name for lookups
		// so substitute the view name for the entity name
		// but store the original table name to use when bootstrapping the view
		this._originalFullTableName = this._fullTableName;
		this._fullTableName = StringHelper.camelCase(
			Is.stringValue(options.config.viewName) ? options.config.viewName : options.entitySchema
		);
	}

	/**
	 * Bootstrap the connector by creating and initializing any resources it needs.
	 * @param systemLoggingConnectorType The system logging connector type, defaults to "system-logging".
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(systemLoggingConnectorType?: string): Promise<void> {
		const systemLogging = LoggingConnectorFactory.getIfExists(
			systemLoggingConnectorType ?? "system-logging"
		);

		systemLogging?.log({
			level: "info",
			source: this.CLASS_NAME,
			ts: Date.now(),
			message: "viewCreating",
			data: { view: this._fullTableName }
		});

		try {
			const dbConnection = await this.openConnection(true);

			await this.createKeyspace(dbConnection, this._config.keyspace);

			const fields: string[] = [];
			const primaryKeys: string[] = [];

			for (const field of this._viewSchema.properties ?? []) {
				fields.push(`"${String(field.property)}" IS NOT NULL `);
				if (field.isPrimary) {
					primaryKeys.push(field.property as string);
				}
			}
			fields.push(`PRIMARY KEY (${primaryKeys.join(",")})`);

			const sql = `CREATE MATERIALIZED VIEW IF NOT EXISTS ${this._config.keyspace}.${this._fullTableName}
            AS SELECT * FROM ${this._config.keyspace}.${this._originalFullTableName} WHERE
            ${this._fullTableName} (${fields.join(" AND ")})`;

			await this.execute(dbConnection, sql);

			systemLogging?.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "viewCreated",
				data: { view: this._fullTableName }
			});
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceInUseException")) {
				systemLogging?.log({
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "viewExists",
					data: { view: this._fullTableName }
				});
			} else {
				systemLogging?.log({
					level: "error",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "viewCreateFailed",
					error: err as IError,
					data: { view: this._fullTableName }
				});
			}
		}
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param requestContext The context for the request.
	 */
	public async set(entity: T, requestContext?: IServiceRequestContext): Promise<void> {
		throw new GeneralError(this.CLASS_NAME, "entityStorage.setReadonlyView", {});
	}

	/**
	 * Delete the entity.
	 * @param id The id of the entity to remove.
	 * @param requestContext The context for the request.
	 */
	public async remove(id: string, requestContext?: IServiceRequestContext): Promise<void> {
		throw new GeneralError(this.CLASS_NAME, "entityStorage.removeReadonlyView", {});
	}
}

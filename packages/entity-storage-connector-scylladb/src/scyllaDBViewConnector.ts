// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, GeneralError, type IError } from "@gtsc/core";
import { EntitySchemaHelper, type IEntitySchema } from "@gtsc/entity";
import type { IEntityStorageConnector } from "@gtsc/entity-storage-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import { AbstractScyllaDBConnector } from "./abstractScyllaDBConnector";
import type { IScyllaDBViewConfig } from "./models/IScyllaDBViewConfig";

/**
 * Manage entities using ScyllaDB Views.
 */
export class ScyllaDBViewConnector<T, U>
	extends AbstractScyllaDBConnector<U>
	implements IEntityStorageConnector<U>
{
	/**
	 * Runtime name for the class.
	 * @internal
	 */
	public override readonly CLASS_NAME: string = nameof<ScyllaDBViewConnector<T, U>>();

	/**
	 * The view descriptor.
	 */
	private readonly _viewSchema: IEntitySchema<U>;

	/**
	 * Create a new instance of ScyllaDBEntityStorage.
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
		super({
			loggingConnectorType: options.loggingConnectorType,
			entitySchema: options.viewSchema,
			config: options.config
		});

		this._viewSchema = EntitySchemaHelper.getSchema<U>(options.viewSchema);

		// Ensuring queries are made over view
		this.fullTableName = options.config.viewName;
	}

	/**
	 * Bootstrap the service by creating and initializing any resources it needs.
	 * @param systemPartitionId The system partition ID.
	 * @returns The response of the bootstrapping as log entries.
	 */
	public async bootstrap(systemPartitionId: string): Promise<void> {
		this._logging.log({
			level: "info",
			source: this.CLASS_NAME,
			ts: Date.now(),
			message: "viewCreating",
			data: { view: this.fullTableName }
		});

		try {
			const tenantId = systemPartitionId;
			const config: IScyllaDBViewConfig = this._config as IScyllaDBViewConfig;

			const dbConnection = await this.openConnection(this._config, tenantId);

			await this.createKeyspace(dbConnection, tenantId);

			const fields: string[] = [];
			const primaryKeys: string[] = [];

			for (const field of this._viewSchema.properties ?? []) {
				fields.push(`"${String(field.property)}" IS NOT NULL `);
				if (field.isPrimary) {
					primaryKeys.push(field.property as string);
				}
			}
			fields.push(`PRIMARY KEY (${primaryKeys.join(",")})`);

			const sql = `CREATE MATERIALIZED VIEW IF NOT EXISTS ${tenantId}.${config.viewName}
            AS SELECT * FROM ${tenantId}.${this._config.tableName} WHERE
            ${this.fullTableName} (${fields.join(" AND ")})`;

			await this.execute(dbConnection, sql);

			this._logging.log({
				level: "info",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "viewCreated",
				data: { view: this.fullTableName }
			});
		} catch (err) {
			if (BaseError.isErrorCode(err, "ResourceInUseException")) {
				this._logging.log({
					level: "info",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "viewExists",
					data: { view: this.fullTableName }
				});
			} else {
				this._logging.log({
					level: "error",
					source: this.CLASS_NAME,
					ts: Date.now(),
					message: "viewCreateFailed",
					error: err as IError,
					data: { view: this.fullTableName }
				});
			}
		}
	}

	/**
	 * Set an entity.
	 * @param entity The entity to set.
	 * @param requestContext The context for the request.
	 */
	public async set(entity: U, requestContext?: IServiceRequestContext): Promise<void> {
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

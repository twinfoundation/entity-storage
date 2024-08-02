# Interface: IScyllaDBViewConfig

Definition of MySQL DB configuration.

## Extends

- [`IScyllaDBTableConfig`](IScyllaDBTableConfig.md)

## Properties

### hosts

> **hosts**: `string`[]

The host to contact to.

#### Inherited from

[`IScyllaDBTableConfig`](IScyllaDBTableConfig.md).[`hosts`](IScyllaDBTableConfig.md#hosts)

***

### localDataCenter

> **localDataCenter**: `string`

The local data center.

#### Inherited from

[`IScyllaDBTableConfig`](IScyllaDBTableConfig.md).[`localDataCenter`](IScyllaDBTableConfig.md#localdatacenter)

***

### keyspace?

> `optional` **keyspace**: `string`

The keyspace to use.

#### Inherited from

[`IScyllaDBTableConfig`](IScyllaDBTableConfig.md).[`keyspace`](IScyllaDBTableConfig.md#keyspace)

***

### tableName

> **tableName**: `string`

The name of the table for the storage.

#### Inherited from

[`IScyllaDBTableConfig`](IScyllaDBTableConfig.md).[`tableName`](IScyllaDBTableConfig.md#tablename)

***

### viewName

> **viewName**: `string`

The name of view.

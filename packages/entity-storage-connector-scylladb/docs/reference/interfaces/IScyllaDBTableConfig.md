# Interface: IScyllaDBTableConfig

Definition of MySQL DB configuration.

## Extends

- `IScyllaDBConfig`

## Extended by

- [`IScyllaDBViewConfig`](IScyllaDBViewConfig.md)

## Properties

### hosts

> **hosts**: `string`[]

The host to contact to.

#### Inherited from

`IScyllaDBConfig.hosts`

***

### localDataCenter

> **localDataCenter**: `string`

The local data center.

#### Inherited from

`IScyllaDBConfig.localDataCenter`

***

### keyspace?

> `optional` **keyspace**: `string`

The keyspace to use.

#### Inherited from

`IScyllaDBConfig.keyspace`

***

### tableName

> **tableName**: `string`

The name of the table for the storage.

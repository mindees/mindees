/**
 * Standard Schema — the validator-agnostic interface (types only, vendored).
 *
 * Quantum validates search/route params through {@link StandardSchemaV1}, the
 * common interface co-designed by the authors of Zod, Valibot, and ArkType. Any
 * compliant validator (Zod ≥ 3.24 / all of 4.x, Valibot ≥ 1, ArkType ≥ 2, and
 * 20+ others) exposes a `~standard` property and is accepted **directly** — no
 * per-library adapters, no lock-in.
 *
 * These ~60 lines are **vendored on purpose** (the spec FAQ explicitly blesses
 * copy/paste; the project guarantees no breaking change without a major version
 * bump). Vendoring means `@mindees/router` takes **zero runtime dependency** to
 * support every validator — the "batteries included, dependencies excluded"
 * doctrine.
 *
 * This is the spec's **v1 validation interface** (`StandardSchemaV1`). `validate`
 * is typed single-argument — the subset Quantum needs; a spec 1.1.0 validator's
 * optional second `options` argument remains assignable (fewer-params rule), so
 * Zod 4 / Valibot 1 / ArkType 2 schemas are accepted directly.
 *
 * Portions adapted from `@standard-schema/spec`, MIT License,
 * Copyright (c) 2024 Colin McDonnell. Permission is hereby granted, free of
 * charge, to any person obtaining a copy of this software and associated
 * documentation files, to deal in the Software without restriction. The above
 * copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * @see https://standardschema.dev
 * @see https://github.com/standard-schema/standard-schema
 * @module
 */

/** A schema that conforms to the Standard Schema specification. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  export interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1
    /** The vendor name of the schema library. */
    readonly vendor: string
    /** Validates unknown input values. May be synchronous or asynchronous. */
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>
    /** Inferred types associated with the schema (present only at the type level). */
    readonly types?: Types<Input, Output> | undefined
  }

  /** The result interface of the validate function. */
  export type Result<Output> = SuccessResult<Output> | FailureResult

  /** The result interface if validation succeeds. */
  export interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output
    /** The non-existent issues. */
    readonly issues?: undefined
  }

  /** The result interface if validation fails. */
  export interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>
  }

  /** The issue interface of the failure output. */
  export interface Issue {
    /** The error message of the issue. */
    readonly message: string
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
  }

  /** The path segment interface of the issue. */
  export interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey
  }

  /** The Standard Schema types interface. */
  export interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input
    /** The output type of the schema. */
    readonly output: Output
  }

  /** Infers the input type of a Standard Schema. */
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['input']

  /** Infers the output type of a Standard Schema. */
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
    Schema['~standard']['types']
  >['output']
}

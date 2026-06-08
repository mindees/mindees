/**
 * `useForm` — a built-in form-state hook with **Standard Schema** validation (Zod/Valibot/ArkType/…),
 * the thing RN and Flutter make you reach for react-hook-form / formik / a custom solution to get.
 * Field values, errors, and touched state are signals, so a field binding re-renders only itself.
 * Validation is synchronous (a Standard Schema that returns a Promise is rejected, mirroring the
 * router) and maps each issue to its field via the issue path.
 *
 * @module
 */

import { type Accessor, batch, signal, untrack } from '@mindees/core'
import type { StandardSchemaV1 } from '@mindees/router'
import { AtlasError } from './errors'

/** A bound field: reactive value/error/touched plus setters. */
export interface Field<V> {
  /** Reactive current value. */
  readonly value: Accessor<V>
  /** Set the value (re-validates when `validateOnChange`). */
  set(value: V): void
  /** Reactive validation error for this field, or `undefined`. */
  readonly error: Accessor<string | undefined>
  /** Reactive touched flag (set on blur or submit). */
  readonly touched: Accessor<boolean>
  /** Mark the field touched (re-validates when `validateOnChange`). */
  onBlur(): void
}

/** The form controller returned by {@link useForm}. */
export interface FormApi<T extends object> {
  /** Reactive current values. */
  readonly values: Accessor<T>
  /** Reactive per-field error messages. */
  readonly errors: Accessor<Partial<Record<keyof T, string>>>
  /** Reactive: no current errors. */
  readonly isValid: Accessor<boolean>
  /** Reactive: a submit is in flight. */
  readonly isSubmitting: Accessor<boolean>
  /** Bind a field by name. */
  field<K extends keyof T>(name: K): Field<T[K]>
  /** Set one field's value (re-validates when `validateOnChange`). */
  setValue<K extends keyof T>(name: K, value: T[K]): void
  /** Run validation now; returns whether the form is valid. */
  validate(): boolean
  /** Validate, mark all fields touched, and call `onSubmit` with the values if valid. */
  handleSubmit(): Promise<void>
  /** Reset values/errors/touched to the initial state. */
  reset(): void
}

/** Options for {@link useForm}. */
export interface UseFormOptions<T extends object> {
  readonly initialValues: T
  /** A Standard Schema (Zod/Valibot/ArkType/…) validating the whole values object. */
  readonly schema?: StandardSchemaV1<unknown, T>
  /** Called with the validated values on a valid submit. */
  readonly onSubmit: (values: T) => void | Promise<void>
  /** Re-validate on every change/blur (default: validate on submit only). */
  readonly validateOnChange?: boolean
}

/** Create a form controller with signal-backed state + Standard Schema validation. */
export function useForm<T extends object>(options: UseFormOptions<T>): FormApi<T> {
  const values = signal<T>({ ...options.initialValues })
  const errors = signal<Partial<Record<keyof T, string>>>({})
  const touched = signal<Partial<Record<keyof T, boolean>>>({})
  const submitting = signal(false)

  /** Validate `vals` against the schema; return a per-field error map (empty = valid). */
  const computeErrors = (vals: T): Partial<Record<keyof T, string>> => {
    if (!options.schema) return {}
    const result = options.schema['~standard'].validate(vals)
    if (result instanceof Promise) {
      throw new AtlasError(
        'ASYNC_SCHEMA',
        'useForm: async Standard Schema validation is not supported (use a sync schema)',
      )
    }
    if (!result.issues) return {}
    const map: Partial<Record<keyof T, string>> = {}
    for (const issue of result.issues) {
      const seg = issue.path?.[0]
      const key = (typeof seg === 'object' && seg !== null ? seg.key : seg) as keyof T | undefined
      if (key !== undefined && map[key] === undefined) map[key] = issue.message // first issue per field
    }
    return map
  }

  const validate = (): boolean => {
    const errs = computeErrors(untrack(values))
    errors.set(errs)
    return Object.keys(errs).length === 0
  }

  const setValue = <K extends keyof T>(name: K, value: T[K]): void => {
    values.set({ ...untrack(values), [name]: value } as T)
    if (options.validateOnChange) validate()
  }

  const field = <K extends keyof T>(name: K): Field<T[K]> => ({
    value: () => values()[name],
    set: (value) => setValue(name, value),
    error: () => errors()[name],
    touched: () => touched()[name] === true,
    onBlur: () => {
      touched.set({ ...untrack(touched), [name]: true })
      if (options.validateOnChange) validate()
    },
  })

  const handleSubmit = async (): Promise<void> => {
    // Guard against double submission (double-tap, or a re-entrant call before a slow onSubmit
    // settles) — the documented `isSubmitting` state now actually prevents a second concurrent submit.
    if (untrack(submitting)) return
    // mark every field touched so all errors show
    const allTouched: Partial<Record<keyof T, boolean>> = {}
    for (const k of Object.keys(untrack(values)) as (keyof T)[]) allTouched[k] = true
    touched.set(allTouched)
    if (!validate()) return
    batch(() => submitting.set(true))
    try {
      await options.onSubmit(untrack(values))
    } finally {
      submitting.set(false)
    }
  }

  const reset = (): void => {
    batch(() => {
      values.set({ ...options.initialValues })
      errors.set({})
      touched.set({})
    })
  }

  return {
    values: () => values(),
    errors: () => errors(),
    // Derive validity from the schema against CURRENT values (reactive), not the last-written `errors`
    // signal — so a fresh form with invalid initialValues reports invalid before any validate() runs.
    isValid: () => Object.keys(computeErrors(values())).length === 0,
    isSubmitting: () => submitting(),
    field,
    setValue,
    validate,
    handleSubmit,
    reset,
  }
}

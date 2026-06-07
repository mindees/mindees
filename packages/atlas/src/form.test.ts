import type { StandardSchemaV1 } from '@mindees/router'
import { describe, expect, it, vi } from 'vitest'
import { useForm } from './form'

interface Values {
  name: string
  age: number
}

/** A hand-rolled Standard Schema (no Zod dep) — proves schema-agnosticism. */
const schema: StandardSchemaV1<unknown, Values> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (input: unknown) => {
      const v = (input ?? {}) as Partial<Values>
      const issues: { message: string; path: [string] }[] = []
      if (typeof v.name !== 'string' || v.name.length === 0)
        issues.push({ message: 'Name is required', path: ['name'] })
      if (typeof v.age !== 'number' || v.age < 0)
        issues.push({ message: 'Age must be ≥ 0', path: ['age'] })
      return issues.length > 0 ? { issues } : { value: v as Values }
    },
  },
}

describe('useForm', () => {
  it('with no schema, submits the current values', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Values>({ initialValues: { name: 'Ada', age: 36 }, onSubmit })
    expect(form.values()).toEqual({ name: 'Ada', age: 36 })
    form.setValue('age', 37)
    expect(form.values().age).toBe(37)
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', age: 37 })
  })

  it('blocks submit and surfaces per-field errors when invalid', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Values>({ initialValues: { name: '', age: -1 }, schema, onSubmit })
    await form.handleSubmit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(form.errors().name).toBe('Name is required')
    expect(form.errors().age).toBe('Age must be ≥ 0')
    expect(form.isValid()).toBe(false)
    // submit marks fields touched so errors can show
    expect(form.field('name').touched()).toBe(true)
  })

  it('submits once valid', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Values>({ initialValues: { name: '', age: 0 }, schema, onSubmit })
    form.setValue('name', 'Grace')
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Grace', age: 0 })
    expect(form.isValid()).toBe(true)
  })

  it('validateOnChange re-validates each edit', () => {
    const form = useForm<Values>({
      initialValues: { name: '', age: 0 },
      schema,
      onSubmit: () => {},
      validateOnChange: true,
    })
    form.setValue('name', '') // still invalid
    expect(form.field('name').error()).toBe('Name is required')
    form.setValue('name', 'Lin')
    expect(form.field('name').error()).toBeUndefined()
  })

  it('field() binding reads value/error/touched and sets/blurs', () => {
    const form = useForm<Values>({
      initialValues: { name: 'X', age: 1 },
      schema,
      onSubmit: () => {},
    })
    const name = form.field('name')
    expect(name.value()).toBe('X')
    name.set('Y')
    expect(form.values().name).toBe('Y')
    expect(name.touched()).toBe(false)
    name.onBlur()
    expect(name.touched()).toBe(true)
  })

  it('reset restores the initial state', () => {
    const form = useForm<Values>({
      initialValues: { name: 'A', age: 1 },
      schema,
      onSubmit: () => {},
    })
    form.setValue('name', 'B')
    form.validate()
    form.reset()
    expect(form.values()).toEqual({ name: 'A', age: 1 })
    expect(form.errors()).toEqual({})
    expect(form.field('name').touched()).toBe(false)
  })

  it('rejects an async schema', () => {
    const asyncSchema: StandardSchemaV1<unknown, Values> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => Promise.resolve({ value: { name: 'a', age: 1 } }),
      },
    }
    const form = useForm<Values>({
      initialValues: { name: '', age: 0 },
      schema: asyncSchema,
      onSubmit: () => {},
    })
    expect(() => form.validate()).toThrow(/async/)
  })

  it('does not double-submit when a submit is already in flight', async () => {
    let release: (() => void) | undefined
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r
        }),
    )
    const form = useForm<Values>({ initialValues: { name: 'Ada', age: 36 }, onSubmit })
    const p1 = form.handleSubmit() // in flight (onSubmit unresolved)
    const p2 = form.handleSubmit() // re-entrant → must be ignored
    release?.()
    await Promise.all([p1, p2])
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('isValid() reflects invalid initialValues before any validate() runs', () => {
    const form = useForm<Values>({
      initialValues: { name: '', age: -1 },
      schema,
      onSubmit: vi.fn(),
    })
    expect(form.isValid()).toBe(false) // schema-derived, not the stale empty errors map
  })
})

import { describe, expect, it } from 'vitest'
import {
  EMPTY_BOOK_FORM,
  findDuplicate,
  parseAmount,
  toBookPatch,
  toNewBookInput,
  validateBookForm,
  valuesFromBook,
  type BookFormValues,
} from '@/features/books/bookForm'
import type { Book } from '@/types/library'

const valid: BookFormValues = { title: 'Dune', author: 'Herbert', purchaseDate: '2025-12-31', pricePaid: '500', marketPrice: '1,200.50', categories: [], language: '' }
const saved: Book = { id: 'B-0001', title: 'Dune', author: 'Herbert', purchaseDate: '2025-12-31', pricePaid: 500, marketPrice: 1200.5 }

describe('parseAmount', () => {
  it.each([
    ['1299.50', 1299.5],
    ['1,299.50', 1299.5],
    [' 42 ', 42],
    ['0', 0],
    ['', undefined],
    ['   ', undefined],
  ])('reads %j as %s', (text, expected) => expect(parseAmount(text)).toBe(expected))

  it.each(['abc', '-5', '1.234', '12a', '1..2', '₹100', '1e3'])('rejects %j', (text) => expect(parseAmount(text)).toBe('invalid'))
})

describe('validateBookForm', () => {
  it('accepts a complete form and one with only the required fields', () => {
    expect(validateBookForm(valid)).toEqual({})
    expect(validateBookForm({ ...EMPTY_BOOK_FORM, title: 'Dune', author: 'Herbert' })).toEqual({})
  })

  it('requires a title and an author, ignoring whitespace', () => {
    expect(validateBookForm({ ...valid, title: '   ', author: '' })).toEqual({
      title: 'Title is required.',
      author: 'Author is required.',
    })
  })

  it.each(['31/12/2025', '2025-1-1', '2026-02-30', '2025-13-01', 'yesterday'])('rejects the date %j', (date) => {
    expect(validateBookForm({ ...valid, purchaseDate: date }).purchaseDate).toMatch(/valid date/)
  })

  it('accepts a leap day and rejects it in a non-leap year', () => {
    expect(validateBookForm({ ...valid, purchaseDate: '2024-02-29' })).toEqual({})
    expect(validateBookForm({ ...valid, purchaseDate: '2025-02-29' }).purchaseDate).toBeDefined()
  })

  it('reports each bad amount on its own field', () => {
    expect(validateBookForm({ ...valid, pricePaid: 'free', marketPrice: '-1' })).toEqual({
      pricePaid: 'Enter an amount such as 1299.50.',
      marketPrice: 'Enter an amount such as 1299.50.',
    })
  })
})

describe('toNewBookInput', () => {
  it('trims text, converts amounts, and turns empty optional fields into undefined', () => {
    expect(toNewBookInput({ ...EMPTY_BOOK_FORM, title: '  Dune ', author: ' Herbert', pricePaid: '1,500' })).toEqual({
      title: 'Dune',
      author: 'Herbert',
      purchaseDate: undefined,
      pricePaid: 1500,
      marketPrice: undefined,
      categories: undefined,
      language: undefined,
    })
  })

  it('carries categories and a trimmed language', () => {
    expect(toNewBookInput({ ...valid, categories: ['Business', 'Self-help'], language: ' Hindi ' })).toMatchObject({
      categories: ['Business', 'Self-help'],
      language: 'Hindi',
    })
  })
})

describe('categories and language in the patch', () => {
  const tagged: Book = { ...saved, categories: ['Business', 'Self-help'], language: 'English' }

  it('a book with categories and language round-trips with no patch', () => {
    expect(valuesFromBook(tagged)).toMatchObject({ categories: ['Business', 'Self-help'], language: 'English' })
    expect(toBookPatch(valuesFromBook(tagged), tagged)).toEqual({})
  })

  it('the order of categories is not a change', () => {
    expect(toBookPatch({ ...valuesFromBook(tagged), categories: ['Self-help', 'Business'] }, tagged)).toEqual({})
  })

  it('adding, removing and clearing', () => {
    expect(toBookPatch({ ...valuesFromBook(tagged), categories: ['Business', 'Self-help', 'Psychology'] }, tagged)).toEqual({ categories: ['Business', 'Self-help', 'Psychology'] })
    expect(toBookPatch({ ...valuesFromBook(tagged), categories: [] }, tagged)).toEqual({ categories: null })
    expect(toBookPatch({ ...valuesFromBook(tagged), language: '' }, tagged)).toEqual({ language: null })
    expect(toBookPatch({ ...valuesFromBook(saved), language: 'Hindi' }, saved)).toEqual({ language: 'Hindi' })
  })
})

describe('valuesFromBook / toBookPatch', () => {
  it('round-trips a saved book with no changes', () => {
    expect(toBookPatch(valuesFromBook(saved), saved)).toEqual({})
  })

  it('fills empty strings for missing optional fields', () => {
    expect(valuesFromBook({ id: 'B-0002', title: 'Emma', author: 'Austen' })).toEqual({
      title: 'Emma',
      author: 'Austen',
      purchaseDate: '',
      pricePaid: '',
      marketPrice: '',
      categories: [],
      language: '',
    })
  })

  it('includes only the fields that changed', () => {
    expect(toBookPatch({ ...valuesFromBook(saved), title: 'Dune Messiah', marketPrice: '999' }, saved)).toEqual({
      title: 'Dune Messiah',
      marketPrice: 999,
    })
  })

  it('uses null to clear an optional field that was emptied', () => {
    expect(toBookPatch({ ...valuesFromBook(saved), purchaseDate: '', pricePaid: '' }, saved)).toEqual({ purchaseDate: null, pricePaid: null })
  })

  it('does not treat spacing or an equal number typed differently as a change', () => {
    expect(toBookPatch({ ...valuesFromBook(saved), title: '  Dune  ', pricePaid: '500.00', marketPrice: '1,200.5' }, saved)).toEqual({})
  })

  it('sets a value for a field that was empty', () => {
    const bare: Book = { id: 'B-0002', title: 'Emma', author: 'Austen' }
    expect(toBookPatch({ ...valuesFromBook(bare), pricePaid: '250' }, bare)).toEqual({ pricePaid: 250 })
  })
})

describe('findDuplicate', () => {
  const books: Book[] = [saved, { id: 'B-0002', title: 'Emma', author: 'Jane Austen' }]

  it('matches title and author ignoring case and surrounding spaces', () => {
    expect(findDuplicate(books, ' dune ', 'HERBERT')?.id).toBe('B-0001')
  })

  it('needs both to match', () => {
    expect(findDuplicate(books, 'Dune', 'Someone Else')).toBeUndefined()
    expect(findDuplicate(books, 'Other', 'Herbert')).toBeUndefined()
  })

  it('ignores the book being edited', () => {
    expect(findDuplicate(books, 'Dune', 'Herbert', 'B-0001')).toBeUndefined()
  })

  it('does not warn until both fields are filled in', () => {
    expect(findDuplicate(books, 'Dune', '')).toBeUndefined()
    expect(findDuplicate(books, '', 'Herbert')).toBeUndefined()
  })
})

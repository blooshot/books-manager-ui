import { describe, expect, it } from 'vitest'
import { SheetSchemaError } from '@/services/sheets/errors'
import {
  bookCells,
  buildRow,
  columnLetter,
  escapeText,
  parseBooks,
  parseLoans,
  parseNumber,
  resolveColumns,
  BOOK_COLUMNS,
} from '@/services/sheets/mapping'
import { BOOK_HEADER, LOAN_HEADER } from '@/test/fakeSheets'

describe('parseNumber', () => {
  it.each([
    ['₹1,299.50', 1299.5],
    ['1200', 1200],
    ['-5', -5],
    ['', undefined],
    ['n/a', undefined],
    ['.', undefined],
  ])('%s -> %s', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected)
  })
})

describe('columnLetter', () => {
  it.each([
    [0, 'A'],
    [7, 'H'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
  ])('%i -> %s', (index, letter) => {
    expect(columnLetter(index)).toBe(letter)
  })
})

describe('escapeText', () => {
  it('forces text for values that would become formulas', () => {
    expect(escapeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(escapeText('+1')).toBe("'+1")
    expect(escapeText('-x')).toBe("'-x")
    expect(escapeText('@home')).toBe("'@home")
  })
  it('leaves normal text alone', () => {
    expect(escapeText('Dune')).toBe('Dune')
  })
})

describe('resolveColumns', () => {
  it('matches headers ignoring case and surrounding spaces', () => {
    const { columns } = resolveColumns('Books', [' book id', 'TITLE', 'Author ', 'Purchase Date', 'Price paid', 'Current market price', 'Photo', 'Added at'], BOOK_COLUMNS)
    expect(columns.id).toBe(0)
    expect(columns.title).toBe(1)
    expect(columns.purchaseDate).toBe(3)
  })

  it('lists every missing column', () => {
    expect(() => resolveColumns('Books', ['Book ID', 'Title'], BOOK_COLUMNS)).toThrow(SheetSchemaError)
    try {
      resolveColumns('Books', ['Book ID', 'Title'], BOOK_COLUMNS)
    } catch (e) {
      expect((e as Error).message).toContain('Author')
      expect((e as Error).message).toContain('Photo')
    }
  })

  it('fails clearly on an empty tab', () => {
    expect(() => parseBooks(undefined)).toThrow(SheetSchemaError)
  })
})

describe('parseBooks', () => {
  it('reads by header name when columns are reordered and extra columns exist', () => {
    const header = ['Notes', 'Title', 'Book ID', 'Author', 'Added at', 'Photo', 'Current market price', 'Price paid', 'Purchase date']
    const table = parseBooks([
      header,
      ['first edition', 'Dune', 'B-0001', 'Herbert', '2026-01-01T00:00:00.000Z', 'https://drive/x', '₹2,000', '₹1,500.50', '2025-12-31'],
    ])
    expect(table.rows).toEqual([
      {
        row: 2,
        value: {
          id: 'B-0001',
          title: 'Dune',
          author: 'Herbert',
          purchaseDate: '2025-12-31',
          pricePaid: 1500.5,
          marketPrice: 2000,
          photoUrl: 'https://drive/x',
          addedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ])
  })

  it('treats empty and missing trailing cells as undefined and skips rows without an ID', () => {
    const table = parseBooks([BOOK_HEADER, ['B-0001', 'Dune', 'Herbert'], ['', 'stray', 'row'], [], ['B-0002', 'Emma', 'Austen', '', '250']])
    expect(table.rows.map((r) => r.row)).toEqual([2, 5])
    expect(table.rows[0].value.pricePaid).toBeUndefined()
    expect(table.rows[0].value.photoUrl).toBeUndefined()
    expect(table.rows[1].value.pricePaid).toBe(250)
  })
})

describe('parseLoans', () => {
  it('parses Yes/No and optional return fields, keyed by book and row', () => {
    const table = parseLoans([
      LOAN_HEADER,
      ['B-0001', 'Ravi', '2026-02-01', '10:30', 'Office', 'No'],
      ['B-0002', 'Asha', '2026-02-02', '11:00', 'Home', 'yes', '2026-02-09', '18:15'],
    ])
    expect(table.rows[0].value).toMatchObject({ key: 'B-0001|2', returned: false, returnedDate: undefined })
    expect(table.rows[1].value).toMatchObject({ key: 'B-0002|3', returned: true, returnedDate: '2026-02-09', returnedTime: '18:15' })
  })
})

describe('bookCells', () => {
  it('writes Added at as forced text so the exact ISO string reads back (the outbox uses it as an idempotency key)', () => {
    const cells = bookCells({ id: 'B-0001', title: 'Dune', author: 'Herbert', addedAt: '2026-09-18T14:05:00.000Z' })
    expect(cells.addedAt).toBe("'2026-09-18T14:05:00.000Z")
  })

  it('leaves Added at empty when there is none', () => {
    expect(bookCells({ id: 'B-0001', title: 'Dune', author: 'Herbert' }).addedAt).toBe('')
  })
})

describe('buildRow', () => {
  it('places cells by column and pads to the header width', () => {
    const { columns, width } = resolveColumns('Books', ['Notes', ...BOOK_HEADER], BOOK_COLUMNS)
    const row = buildRow(columns, width, { id: 'B-0001', title: 'Dune' })
    expect(row).toHaveLength(9)
    expect(row[1]).toBe('B-0001')
    expect(row[2]).toBe('Dune')
    expect(row[0]).toBe('') // unknown column left empty
  })
})

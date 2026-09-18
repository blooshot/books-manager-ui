import { describe, it, expect } from 'vitest'
import { calculateResizedDimensions } from './image'

describe('calculateResizedDimensions', () => {
  it('returns original dimensions if smaller than maxLongEdge', () => {
    expect(calculateResizedDimensions(800, 600)).toEqual({ width: 800, height: 600 })
    expect(calculateResizedDimensions(500, 1000)).toEqual({ width: 500, height: 1000 })
  })

  it('scales down landscape images proportionally', () => {
    expect(calculateResizedDimensions(2000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(calculateResizedDimensions(4000, 3000, 1000)).toEqual({ width: 1000, height: 750 })
  })

  it('scales down portrait images proportionally', () => {
    expect(calculateResizedDimensions(1000, 2000)).toEqual({ width: 500, height: 1000 })
    expect(calculateResizedDimensions(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 })
  })

  it('handles square images', () => {
    expect(calculateResizedDimensions(2000, 2000)).toEqual({ width: 1000, height: 1000 })
  })

  it('handles negative or zero dimensions', () => {
    expect(calculateResizedDimensions(0, 500)).toEqual({ width: 0, height: 0 })
    expect(calculateResizedDimensions(500, 0)).toEqual({ width: 0, height: 0 })
    expect(calculateResizedDimensions(-100, 500)).toEqual({ width: 0, height: 0 })
  })

  it('rounds to nearest integer', () => {
    expect(calculateResizedDimensions(1500, 1000)).toEqual({ width: 1000, height: 667 })
  })
})

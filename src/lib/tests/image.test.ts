import { describe, it, expect } from 'vitest'
import { calculateResizedDimensions, createCoverVariants, resizeToJpeg, type ImageDeps } from '@/lib/image'

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

describe('resizeToJpeg', () => {
  function fakeDeps(width: number, height: number, opts: { context?: boolean; encoded?: boolean } = {}) {
    const calls = { canvas: [] as number[], draw: [] as number[], encode: [] as unknown[], closed: false }
    const bitmap = { width, height, close: () => (calls.closed = true) } as unknown as ImageBitmap
    const deps: ImageDeps = {
      decode: async () => bitmap,
      createCanvas: (w, h) => {
        calls.canvas.push(w, h)
        return {
          getContext2d: () =>
            opts.context === false
              ? null
              : ({ drawImage: (_i: unknown, _x: number, _y: number, dw: number, dh: number) => calls.draw.push(dw, dh) } as unknown as CanvasRenderingContext2D),
          toBlob: (cb, type, quality) => {
            calls.encode.push(type, quality)
            cb(opts.encoded === false ? null : new Blob(['jpeg'], { type: 'image/jpeg' }))
          },
        }
      },
    }
    return { deps, calls }
  }

  it('draws at the scaled size and encodes JPEG at the requested quality', async () => {
    const { deps, calls } = fakeDeps(4000, 3000)
    const blob = await resizeToJpeg(new Blob(['x']), 1000, 0.8, deps)
    expect(blob.type).toBe('image/jpeg')
    expect(calls.canvas).toEqual([1000, 750])
    expect(calls.draw).toEqual([1000, 750])
    expect(calls.encode).toEqual(['image/jpeg', 0.8])
  })

  it('does not enlarge small images', async () => {
    const { deps, calls } = fakeDeps(300, 200)
    await resizeToJpeg(new Blob(['x']), 1000, 0.8, deps)
    expect(calls.canvas).toEqual([300, 200])
  })

  it('releases the decoded bitmap even when encoding fails', async () => {
    const { deps, calls } = fakeDeps(2000, 1000, { encoded: false })
    await expect(resizeToJpeg(new Blob(['x']), 1000, 0.8, deps)).rejects.toThrow('encode')
    expect(calls.closed).toBe(true)
  })

  it('fails clearly when there is no 2D context or the image has no size', async () => {
    await expect(resizeToJpeg(new Blob(['x']), 1000, 0.8, fakeDeps(2000, 1000, { context: false }).deps)).rejects.toThrow('not available')
    await expect(resizeToJpeg(new Blob(['x']), 1000, 0.8, fakeDeps(0, 0).deps)).rejects.toThrow('could not be read')
  })
})

describe('createCoverVariants', () => {
  it('produces a 1000px full image and a 240px thumbnail from one photo', async () => {
    const sizes: number[][] = []
    const deps: ImageDeps = {
      decode: async () => ({ width: 4000, height: 3000, close: () => undefined }) as unknown as ImageBitmap,
      createCanvas: (w, h) => {
        sizes.push([w, h])
        return {
          getContext2d: () => ({ drawImage: () => undefined }) as unknown as CanvasRenderingContext2D,
          toBlob: (cb) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })),
        }
      },
    }
    const { full, thumb } = await createCoverVariants(new Blob(['x']), deps)
    expect(sizes).toEqual([
      [1000, 750],
      [240, 180],
    ])
    expect(full.type).toBe('image/jpeg')
    expect(thumb.type).toBe('image/jpeg')
  })
})

/**
 * Calculates the new dimensions for an image, scaling it down proportionally
 * so that its longest edge does not exceed `maxLongEdge`.
 * If the image is already smaller than `maxLongEdge`, it returns the original dimensions.
 */
export function calculateResizedDimensions(width: number, height: number, maxLongEdge = 1000): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 }
  }

  const longestEdge = Math.max(width, height)
  
  if (longestEdge <= maxLongEdge) {
    return { width, height }
  }

  const ratio = maxLongEdge / longestEdge

  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

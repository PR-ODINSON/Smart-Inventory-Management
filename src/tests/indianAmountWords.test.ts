import { describe, expect, it } from 'vitest'
import { amountInWordsInr } from '../services/indianAmountWords'

describe('amountInWordsInr', () => {
  it('formats lakh and crore', () => {
    expect(amountInWordsInr(42480)).toContain('Forty Two Thousand')
    expect(amountInWordsInr(100000)).toContain('Lakh')
    expect(amountInWordsInr(10000000)).toContain('Crore')
  })
})

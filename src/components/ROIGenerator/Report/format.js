// Re-exports the shared formatter — see src/lib/roi/format.ts (single source,
// also used by roiCalculator.ts and assembleReport.ts).
export {
  addCommas,
  currencySymbolFor,
  fmtNumber,
  fmtCurrency,
  fmtCurrencyShort,
} from '@/src/lib/roi/format'

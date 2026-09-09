export type TaxRegime = "NEW" | "OLD";

export interface TaxDeclarations {
  otherIncome?: number;
  hraExemption?: number;
  deduction80C?: number;
  deduction80D?: number;
  deduction80CCD1B?: number;
  deduction80TTA?: number;
  previousTds?: number;
}

export interface TaxCalculation {
  taxRegime: TaxRegime;
  taxYear: number;
  annualGrossIncome: number;
  standardDeduction: number;
  totalDeductions: number;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  annualTax: number;
  slabBreakdown: {
    from: number;
    to: number | null;
    rate: number;
    taxableAmount: number;
    tax: number;
  }[];
}

const NEW_SLABS = [
  { limit: 400000, rate: 0 },
  { limit: 800000, rate: 0.05 },
  { limit: 1200000, rate: 0.1 },
  { limit: 1600000, rate: 0.15 },
  { limit: 2000000, rate: 0.2 },
  { limit: 2400000, rate: 0.25 },
  { limit: Infinity, rate: 0.3 },
] as const;

const OLD_SLABS_UNDER_60 = [
  { limit: 250000, rate: 0 },
  { limit: 500000, rate: 0.05 },
  { limit: 1000000, rate: 0.2 },
  { limit: Infinity, rate: 0.3 },
] as const;

const OLD_SLABS_60_TO_79 = [
  { limit: 300000, rate: 0 },
  { limit: 500000, rate: 0.05 },
  { limit: 1000000, rate: 0.2 },
  { limit: Infinity, rate: 0.3 },
] as const;

const OLD_SLABS_80_PLUS = [
  { limit: 500000, rate: 0 },
  { limit: 1000000, rate: 0.2 },
  { limit: Infinity, rate: 0.3 },
] as const;

function roundMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function calculateSlabTax(
  income: number,
  slabs: readonly { limit: number; rate: number }[],
) {
  let tax = 0;
  let previous = 0;
  const slabBreakdown: TaxCalculation["slabBreakdown"] = [];
  for (const slab of slabs) {
    if (income <= previous) break;
    const taxableInSlab = Math.max(0, Math.min(income, slab.limit) - previous);
    const slabTax = taxableInSlab * slab.rate;
    tax += slabTax;
    slabBreakdown.push({
      from: previous,
      to: Number.isFinite(slab.limit) ? slab.limit : null,
      rate: slab.rate,
      taxableAmount: roundMoney(taxableInSlab),
      tax: roundMoney(slabTax),
    });
    previous = slab.limit;
  }
  return { tax: roundMoney(tax), slabBreakdown };
}

function ageOnTaxYearStart(
  dateOfBirth: string | null | undefined,
  taxYear: number,
) {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  const taxYearStart = new Date(taxYear, 3, 1);
  let age = taxYearStart.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    taxYearStart.getMonth() < dob.getMonth() ||
    (taxYearStart.getMonth() === dob.getMonth() &&
      taxYearStart.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function surchargeRate(annualIncome: number, regime: TaxRegime) {
  if (annualIncome <= 5000000) return 0;
  if (annualIncome <= 10000000) return 0.1;
  if (annualIncome <= 20000000) return 0.15;
  if (annualIncome <= 50000000) return 0.25;
  return regime === "OLD" ? 0.37 : 0.25;
}

export function calculateAnnualTax(params: {
  taxYear: number;
  regime: TaxRegime;
  dateOfBirth?: string | null;
  monthlySalaryIncome: number;
  declarations?: TaxDeclarations;
}): TaxCalculation {
  const declarations = params.declarations ?? {};
  const annualGrossIncome = roundMoney(
    Math.max(0, params.monthlySalaryIncome) * 12 +
      Math.max(0, Number(declarations.otherIncome ?? 0)),
  );

  // Standard deduction applicable to salary income for the current tax year.
  const standardDeduction = params.regime === "NEW" ? 75000 : 50000;
  const hraExemption =
    params.regime === "OLD"
      ? Math.min(
          Math.max(0, Number(declarations.hraExemption ?? 0)),
          annualGrossIncome,
        )
      : 0;

  const deduction80C =
    params.regime === "OLD"
      ? Math.min(Math.max(0, Number(declarations.deduction80C ?? 0)), 150000)
      : 0;
  const deduction80D =
    params.regime === "OLD"
      ? Math.min(Math.max(0, Number(declarations.deduction80D ?? 0)), 100000)
      : 0;
  const deduction80CCD1B =
    params.regime === "OLD"
      ? Math.min(Math.max(0, Number(declarations.deduction80CCD1B ?? 0)), 50000)
      : 0;
  const deduction80TTA =
    params.regime === "OLD"
      ? Math.min(Math.max(0, Number(declarations.deduction80TTA ?? 0)), 10000)
      : 0;

  const totalDeductions = roundMoney(
    standardDeduction +
      hraExemption +
      deduction80C +
      deduction80D +
      deduction80CCD1B +
      deduction80TTA,
  );
  const taxableIncome = roundMoney(
    Math.max(0, annualGrossIncome - totalDeductions),
  );

  let slabs: readonly { limit: number; rate: number }[] = NEW_SLABS;
  if (params.regime === "OLD") {
    const age = ageOnTaxYearStart(params.dateOfBirth, params.taxYear);
    slabs =
      age >= 80
        ? OLD_SLABS_80_PLUS
        : age >= 60
          ? OLD_SLABS_60_TO_79
          : OLD_SLABS_UNDER_60;
  }

  const slabResult = calculateSlabTax(taxableIncome, slabs);
  const slabTax = slabResult.tax;
  const rebateLimit = params.regime === "NEW" ? 1200000 : 500000;
  const rebateMax = params.regime === "NEW" ? 60000 : 12500;
  const rebate =
    taxableIncome <= rebateLimit ? Math.min(slabTax, rebateMax) : 0;
  const taxAfterRebate = Math.max(0, slabTax - rebate);
  const surcharge = roundMoney(
    taxAfterRebate * surchargeRate(annualGrossIncome, params.regime),
  );
  const cess = roundMoney((taxAfterRebate + surcharge) * 0.04);
  const annualTax = roundMoney(taxAfterRebate + surcharge + cess);

  return {
    taxRegime: params.regime,
    taxYear: params.taxYear,
    annualGrossIncome,
    standardDeduction,
    totalDeductions,
    taxableIncome,
    slabTax,
    rebate,
    surcharge,
    cess,
    annualTax,
    slabBreakdown: slabResult.slabBreakdown,
  };
}

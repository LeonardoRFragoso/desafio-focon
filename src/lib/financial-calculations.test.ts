import { describe, it, expect } from 'vitest';
import {
  calculateTax,
  calculateResult,
  calculateMargin,
  calculateProjectFinancialSummary,
  calculateAggregatedFinancialSummary,
} from './financial-calculations';

describe('Financial Calculations', () => {
  describe('calculateTax', () => {
    it('should calculate tax correctly', () => {
      const tax = calculateTax(100000, 0.08);
      expect(tax).toBe(8000);
    });

    it('should handle zero revenue', () => {
      const tax = calculateTax(0, 0.08);
      expect(tax).toBe(0);
    });

    it('should handle zero tax rate', () => {
      const tax = calculateTax(100000, 0);
      expect(tax).toBe(0);
    });
  });

  describe('calculateResult', () => {
    it('should calculate result correctly', () => {
      const result = calculateResult(100000, 20000, 8000, 5000);
      expect(result).toBe(67000);
    });

    it('should handle negative result', () => {
      const result = calculateResult(50000, 40000, 5000, 10000);
      expect(result).toBe(-5000);
    });
  });

  describe('calculateMargin', () => {
    it('should calculate margin correctly', () => {
      const margin = calculateMargin(80000, 100000);
      expect(margin).toBe(80);
    });

    it('should return 0 when revenue is 0', () => {
      const margin = calculateMargin(0, 0);
      expect(margin).toBe(0);
    });

    it('should handle negative margin', () => {
      const margin = calculateMargin(-5000, 50000);
      expect(margin).toBe(-10);
    });
  });

  describe('Residencial Aurora - Demo Project', () => {
    it('should calculate correct financial summary', () => {
      const summary = calculateProjectFinancialSummary({
        contractedRevenue: 120000,
        taxRate: 0.08,
        indirectCost: 5000,
        laborCost: 9300,
      });

      expect(summary.contractedRevenue).toBe(120000);
      expect(summary.laborCost).toBe(9300);
      expect(summary.tax).toBe(9600);
      expect(summary.indirectCost).toBe(5000);
      expect(summary.result).toBe(96100);
      expect(summary.margin).toBeCloseTo(80.08, 1);
    });
  });

  describe('Edifício Horizonte - Demo Project', () => {
    it('should calculate correct financial summary', () => {
      const summary = calculateProjectFinancialSummary({
        contractedRevenue: 80000,
        taxRate: 0.08,
        indirectCost: 5000,
        laborCost: 4900,
      });

      expect(summary.contractedRevenue).toBe(80000);
      expect(summary.laborCost).toBe(4900);
      expect(summary.tax).toBe(6400);
      expect(summary.indirectCost).toBe(5000);
      expect(summary.result).toBe(63700);
      expect(summary.margin).toBeCloseTo(79.63, 1);
    });
  });

  describe('Aggregated Financial Summary', () => {
    it('should calculate correct aggregated summary', () => {
      const summary = calculateAggregatedFinancialSummary([
        {
          contractedRevenue: 120000,
          taxRate: 0.08,
          indirectCost: 5000,
          laborCost: 9300,
        },
        {
          contractedRevenue: 80000,
          taxRate: 0.08,
          indirectCost: 5000,
          laborCost: 4900,
        },
      ]);

      expect(summary.contractedRevenue).toBe(200000);
      expect(summary.laborCost).toBe(14200);
      expect(summary.tax).toBe(16000);
      expect(summary.indirectCost).toBe(10000);
      expect(summary.result).toBe(159800);
      expect(summary.margin).toBeCloseTo(79.9, 1);
    });
  });

  describe('Time Entry Validation', () => {
    it('should reject invalid duration', () => {
      const isValidDuration = (duration: number) => duration > 0 && duration <= 1440;

      expect(isValidDuration(0)).toBe(false);
      expect(isValidDuration(-1)).toBe(false);
      expect(isValidDuration(1441)).toBe(false);
      expect(isValidDuration(480)).toBe(true);
    });

    it('should reject invalid description', () => {
      const isValidDescription = (description: string) =>
        description.length >= 10 && description.length <= 500;

      const validDescription = 'This is a valid description';
      const tooShort = 'short';
      const tooLong = 'a'.repeat(501);

      expect(isValidDescription(validDescription)).toBe(true);
      expect(isValidDescription(tooShort)).toBe(false);
      expect(isValidDescription(tooLong)).toBe(false);
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Money } from '../../src/values/Money.js';

describe('Money', () => {
  describe('constructor', () => {
    it('should create a Money instance with valid amount and currency', () => {
      const money = Money.CHF(99.95);
      assert.strictEqual(money.amount, 99.95);
      assert.strictEqual(money.currency, 'CHF');
    });

    it('should round amount to 2 decimal places', () => {
      const money = Money.CHF(99.956);
      assert.strictEqual(money.amount, 99.96);
    });

    it('should throw error for negative amount', () => {
      assert.throws(() => Money.CHF(-10), /Amount cannot be negative/);
    });

    it('should throw error for non-finite amount', () => {
      assert.throws(() => Money.CHF(Infinity), /Amount must be a finite number/);
    });
  });

  describe('static methods', () => {
    it('should create CHF money', () => {
      const money = Money.CHF(100);
      assert.strictEqual(money.currency, 'CHF');
      assert.strictEqual(money.amount, 100);
    });

    it('should create money with custom currency', () => {
      const money = Money.of(50, 'EUR');
      assert.strictEqual(money.currency, 'EUR');
      assert.strictEqual(money.amount, 50);
    });

    it('should create from JSON', () => {
      const json = { amount: 75.5, currency: 'CHF' };
      const money = Money.fromJSON(json);
      assert.strictEqual(money.amount, 75.5);
      assert.strictEqual(money.currency, 'CHF');
    });

    it('should throw error for invalid JSON', () => {
      assert.throws(() => Money.fromJSON({ invalid: 'data' }), /Invalid Money JSON format/);
    });
  });

  describe('operations', () => {
    it('should add money with same currency', () => {
      const money1 = Money.CHF(50);
      const money2 = Money.CHF(25.5);
      const result = money1.add(money2);
      assert.strictEqual(result.amount, 75.5);
      assert.strictEqual(result.currency, 'CHF');
    });

    it('should throw error when adding different currencies', () => {
      const money1 = Money.CHF(50);
      const money2 = Money.of(25, 'EUR');
      assert.throws(() => money1.add(money2), /Cannot add different currencies/);
    });

    it('should subtract money with same currency', () => {
      const money1 = Money.CHF(100);
      const money2 = Money.CHF(25.5);
      const result = money1.subtract(money2);
      assert.strictEqual(result.amount, 74.5);
    });

    it('should multiply by factor', () => {
      const money = Money.CHF(50);
      const result = money.multiply(1.5);
      assert.strictEqual(result.amount, 75);
    });
  });

  describe('comparisons', () => {
    it('should check equality correctly', () => {
      const money1 = Money.CHF(100);
      const money2 = Money.CHF(100);
      const money3 = Money.CHF(50);

      assert.strictEqual(money1.equals(money2), true);
      assert.strictEqual(money1.equals(money3), false);
    });

    it('should compare amounts', () => {
      const money1 = Money.CHF(100);
      const money2 = Money.CHF(50);

      assert.strictEqual(money1.compareTo(money2) > 0, true);
      assert.strictEqual(money2.compareTo(money1) < 0, true);
      assert.strictEqual(money1.compareTo(money1), 0);
    });

    it('should check if zero', () => {
      const zero = Money.CHF(0);
      const nonZero = Money.CHF(10);

      assert.strictEqual(zero.isZero(), true);
      assert.strictEqual(nonZero.isZero(), false);
    });

    it('should check if positive', () => {
      const positive = Money.CHF(10);
      const zero = Money.CHF(0);

      assert.strictEqual(positive.isPositive(), true);
      assert.strictEqual(zero.isPositive(), false);
    });
  });

  describe('formatting', () => {
    it('should format as string', () => {
      const money = Money.CHF(99.95);
      assert.strictEqual(money.toString(), 'CHF 99.95');
    });

    it('should convert to JSON', () => {
      const money = Money.CHF(75.5);
      const json = money.toJSON();
      assert.deepStrictEqual(json, {
        amount: 75.5,
        currency: 'CHF',
      });
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  TwintClient,
  Environment,
  Money,
  OrderStatus,
  UnfiledMerchantTransactionReference,
  StoreUuid,
} from '../src/index.js';

describe('Integration Tests', () => {
  describe('Module Imports', () => {
    it('should import all main modules', () => {
      assert.ok(TwintClient, 'TwintClient should be imported');
      assert.ok(Environment, 'Environment should be imported');
      assert.ok(Money, 'Money should be imported');
      assert.ok(OrderStatus, 'OrderStatus should be imported');
      assert.ok(
        UnfiledMerchantTransactionReference,
        'UnfiledMerchantTransactionReference should be imported',
      );
      assert.ok(StoreUuid, 'StoreUuid should be imported');
    });
  });

  describe('Value Objects Integration', () => {
    it('should create and use Money instances', () => {
      const amount = Money.CHF(99.95);
      assert.strictEqual(amount.amount, 99.95);
      assert.strictEqual(amount.currency, 'CHF');

      const doubled = amount.multiply(2);
      assert.strictEqual(doubled.amount, 199.9);
    });

    it('should create and use OrderStatus', () => {
      const status = OrderStatus.IN_PROGRESS();
      assert.ok(status.isInProgress());
      assert.ok(status.requiresUserInteraction());
      assert.ok(!status.isFinal());
    });

    it('should create merchant references', () => {
      const ref1 = UnfiledMerchantTransactionReference.generate();
      assert.ok(ref1.value.startsWith('ORDER-'));

      const ref2 = UnfiledMerchantTransactionReference.fromString('TEST-123');
      assert.strictEqual(ref2.value, 'TEST-123');
    });

    it('should create UUIDs', () => {
      const storeId = StoreUuid.generate();
      assert.ok(storeId.value);
      assert.strictEqual(storeId.value.length, 36); // UUID v4 format
    });
  });

  describe('Environment Configuration', () => {
    it('should have predefined environments', () => {
      assert.ok(Environment.PRODUCTION);
      assert.ok(Environment.INTEGRATION);
      assert.ok(Environment.STAGING);

      assert.ok(Environment.PRODUCTION.isProduction());
      assert.ok(!Environment.INTEGRATION.isProduction());
    });

    it('should create custom environment', () => {
      const custom = Environment.custom('test', 'https://test.example.com');
      assert.strictEqual(custom.name, 'test');
      assert.strictEqual(custom.url, 'https://test.example.com');
    });
  });

  describe('Money Operations', () => {
    it('should perform arithmetic operations', () => {
      const price = Money.CHF(100);
      const tax = Money.CHF(8);
      const discount = Money.CHF(10);

      const subtotal = price.add(tax);
      assert.strictEqual(subtotal.amount, 108);

      const total = subtotal.subtract(discount);
      assert.strictEqual(total.amount, 98);

      assert.ok(total.isPositive());
      assert.ok(!total.isZero());
    });

    it('should handle comparisons', () => {
      const amount1 = Money.CHF(100);
      const amount2 = Money.CHF(100);
      const amount3 = Money.CHF(50);

      assert.ok(amount1.equals(amount2));
      assert.ok(!amount1.equals(amount3));
      assert.ok(amount1.compareTo(amount3) > 0);
      assert.ok(amount3.compareTo(amount1) < 0);
    });

    it('should serialize to JSON', () => {
      const amount = Money.CHF(99.95);
      const json = amount.toJSON();

      assert.deepStrictEqual(json, {
        amount: 99.95,
        currency: 'CHF',
      });

      const restored = Money.fromJSON(json);
      assert.ok(amount.equals(restored));
    });
  });

  describe('Order Status Flow', () => {
    it('should simulate order status transitions', () => {
      // Start with in-progress
      let status = OrderStatus.IN_PROGRESS();
      assert.ok(status.requiresUserInteraction());

      // Move to pending confirmation
      status = OrderStatus.PENDING_CONFIRMATION();
      assert.ok(status.requiresUserInteraction());
      assert.ok(!status.isFinal());

      // Confirm the order
      status = OrderStatus.CONFIRMED();
      assert.ok(status.isConfirmed());
      assert.ok(!status.requiresUserInteraction());

      // Final success
      status = OrderStatus.SUCCESS();
      assert.ok(status.isSuccessful());
      assert.ok(status.isFinal());
    });
  });
});

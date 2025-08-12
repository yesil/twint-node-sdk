import { describe, it } from 'node:test';
import assert from 'node:assert';
import { OrderStatus } from '../../src/values/OrderStatus.js';

describe('OrderStatus', () => {
  describe('factory methods', () => {
    it('should create IN_PROGRESS status', () => {
      const status = OrderStatus.IN_PROGRESS();
      assert.strictEqual(status.toString(), 'IN_PROGRESS');
      assert.strictEqual(status.isInProgress(), true);
    });

    it('should create SUCCESS status', () => {
      const status = OrderStatus.SUCCESS();
      assert.strictEqual(status.toString(), 'SUCCESS');
      assert.strictEqual(status.isSuccessful(), true);
    });

    it('should create FAILURE status', () => {
      const status = OrderStatus.FAILURE();
      assert.strictEqual(status.toString(), 'FAILURE');
      assert.strictEqual(status.isFailed(), true);
    });

    it('should create CANCELLED status', () => {
      const status = OrderStatus.CANCELLED();
      assert.strictEqual(status.toString(), 'CANCELLED');
      assert.strictEqual(status.isCancelled(), true);
    });

    it('should create CONFIRMED status', () => {
      const status = OrderStatus.CONFIRMED();
      assert.strictEqual(status.toString(), 'CONFIRMED');
      assert.strictEqual(status.isConfirmed(), true);
    });

    it('should create PENDING_CONFIRMATION status', () => {
      const status = OrderStatus.PENDING_CONFIRMATION();
      assert.strictEqual(status.toString(), 'PENDING_CONFIRMATION');
      assert.strictEqual(status.isPendingConfirmation(), true);
    });
  });

  describe('fromString', () => {
    it('should create from valid string', () => {
      const status = OrderStatus.fromString('SUCCESS');
      assert.strictEqual(status.toString(), 'SUCCESS');
      assert.strictEqual(status.isSuccessful(), true);
    });

    it('should throw error for invalid string', () => {
      assert.throws(() => OrderStatus.fromString('INVALID'), /Invalid OrderStatus value: INVALID/);
    });
  });

  describe('status checks', () => {
    it('should check if requires user interaction', () => {
      const inProgress = OrderStatus.IN_PROGRESS();
      const pending = OrderStatus.PENDING_CONFIRMATION();
      const success = OrderStatus.SUCCESS();

      assert.strictEqual(inProgress.requiresUserInteraction(), true);
      assert.strictEqual(pending.requiresUserInteraction(), true);
      assert.strictEqual(success.requiresUserInteraction(), false);
    });

    it('should check if final state', () => {
      const success = OrderStatus.SUCCESS();
      const failure = OrderStatus.FAILURE();
      const cancelled = OrderStatus.CANCELLED();
      const inProgress = OrderStatus.IN_PROGRESS();

      assert.strictEqual(success.isFinal(), true);
      assert.strictEqual(failure.isFinal(), true);
      assert.strictEqual(cancelled.isFinal(), true);
      assert.strictEqual(inProgress.isFinal(), false);
    });
  });

  describe('equality', () => {
    it('should check equality correctly', () => {
      const status1 = OrderStatus.SUCCESS();
      const status2 = OrderStatus.SUCCESS();
      const status3 = OrderStatus.FAILURE();

      assert.strictEqual(status1.equals(status2), true);
      assert.strictEqual(status1.equals(status3), false);
    });
  });

  describe('serialization', () => {
    it('should convert to JSON', () => {
      const status = OrderStatus.SUCCESS();
      assert.strictEqual(status.toJSON(), 'SUCCESS');
    });
  });
});

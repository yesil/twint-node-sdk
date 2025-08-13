/**
 * Represents the status of a TWINT order
 */
export class OrderStatus {
  static #VALUES = {
    IN_PROGRESS: 'IN_PROGRESS',
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
    CANCELLED: 'CANCELLED',
    CONFIRMED: 'CONFIRMED',
    PENDING_CONFIRMATION: 'PENDING_CONFIRMATION',
  };

  #value;

  constructor(value) {
    if (!Object.values(OrderStatus.#VALUES).includes(value)) {
      throw new Error(`Invalid OrderStatus value: ${value}`);
    }
    this.#value = value;
  }

  /**
   * Order is in progress
   * @returns {OrderStatus}
   */
  static IN_PROGRESS() {
    return new OrderStatus(OrderStatus.#VALUES.IN_PROGRESS);
  }

  /**
   * Order completed successfully
   * @returns {OrderStatus}
   */
  static SUCCESS() {
    return new OrderStatus(OrderStatus.#VALUES.SUCCESS);
  }

  /**
   * Order failed
   * @returns {OrderStatus}
   */
  static FAILURE() {
    return new OrderStatus(OrderStatus.#VALUES.FAILURE);
  }

  /**
   * Order was cancelled
   * @returns {OrderStatus}
   */
  static CANCELLED() {
    return new OrderStatus(OrderStatus.#VALUES.CANCELLED);
  }

  /**
   * Order is confirmed
   * @returns {OrderStatus}
   */
  static CONFIRMED() {
    return new OrderStatus(OrderStatus.#VALUES.CONFIRMED);
  }

  /**
   * Order is pending confirmation
   * @returns {OrderStatus}
   */
  static PENDING_CONFIRMATION() {
    return new OrderStatus(OrderStatus.#VALUES.PENDING_CONFIRMATION);
  }

  /**
   * Create from string value
   * @param {string} value
   * @returns {OrderStatus}
   */
  static fromString(value) {
    return new OrderStatus(value);
  }

  /**
   * Check if order is in progress
   * @returns {boolean}
   */
  isInProgress() {
    return this.#value === OrderStatus.#VALUES.IN_PROGRESS;
  }

  /**
   * Check if order is successful
   * @returns {boolean}
   */
  isSuccessful() {
    return this.#value === OrderStatus.#VALUES.SUCCESS;
  }

  /**
   * Check if order failed
   * @returns {boolean}
   */
  isFailed() {
    return this.#value === OrderStatus.#VALUES.FAILURE;
  }

  /**
   * Check if order was cancelled
   * @returns {boolean}
   */
  isCancelled() {
    return this.#value === OrderStatus.#VALUES.CANCELLED;
  }

  /**
   * Check if order is confirmed
   * @returns {boolean}
   */
  isConfirmed() {
    return this.#value === OrderStatus.#VALUES.CONFIRMED;
  }

  /**
   * Check if order is pending confirmation
   * @returns {boolean}
   */
  isPendingConfirmation() {
    return this.#value === OrderStatus.#VALUES.PENDING_CONFIRMATION;
  }

  /**
   * Check if order is pending (either in progress or pending confirmation)
   * @returns {boolean}
   */
  isPending() {
    return this.isInProgress() || this.isPendingConfirmation();
  }

  /**
   * Check if order requires user interaction
   * @returns {boolean}
   */
  requiresUserInteraction() {
    return this.isInProgress() || this.isPendingConfirmation();
  }

  /**
   * Check if order is in final state
   * @returns {boolean}
   */
  isFinal() {
    return this.isSuccessful() || this.isFailed() || this.isCancelled();
  }

  /**
   * Check equality
   * @param {OrderStatus} other
   * @returns {boolean}
   */
  equals(other) {
    return this.#value === other.toString();
  }

  /**
   * Get string value
   * @returns {string}
   */
  toString() {
    return this.#value;
  }

  /**
   * Convert to JSON
   * @returns {string}
   */
  toJSON() {
    return this.#value;
  }
}

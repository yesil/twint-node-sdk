/**
 * Base class for merchant transaction references
 */
class MerchantTransactionReference {
  static #MAX_LENGTH = 50;
  static #PATTERN = /^[a-zA-Z0-9\-_.]+$/;

  #value;

  constructor(value) {
    this.#validate(value);
    this.#value = value;
  }

  #validate(value) {
    if (!value || value.trim().length === 0) {
      throw new Error('Merchant transaction reference cannot be empty');
    }

    if (value.length > MerchantTransactionReference.#MAX_LENGTH) {
      throw new Error(
        `Merchant transaction reference cannot exceed ${MerchantTransactionReference.#MAX_LENGTH} characters`,
      );
    }

    if (!MerchantTransactionReference.#PATTERN.test(value)) {
      throw new Error(
        'Merchant transaction reference can only contain alphanumeric characters, hyphens, underscores, and dots',
      );
    }
  }

  /**
   * Get the reference value
   * @returns {string}
   */
  get value() {
    return this.#value;
  }

  /**
   * String representation
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

  /**
   * Check equality
   * @param {MerchantTransactionReference} other
   * @returns {boolean}
   */
  equals(other) {
    return this.#value === other.value;
  }
}

/**
 * Represents an unfiled merchant transaction reference
 * (not yet sent to TWINT)
 */
export class UnfiledMerchantTransactionReference extends MerchantTransactionReference {
  /**
   * Create from string
   * @param {string} value
   * @returns {UnfiledMerchantTransactionReference}
   */
  static fromString(value) {
    return new UnfiledMerchantTransactionReference(value);
  }

  /**
   * Generate a new reference with timestamp
   * @param {string} prefix
   * @returns {UnfiledMerchantTransactionReference}
   */
  static generate(prefix = 'ORDER') {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return new UnfiledMerchantTransactionReference(`${prefix}-${timestamp}-${random}`);
  }
}

/**
 * Represents a filed merchant transaction reference
 * (already sent to TWINT)
 */
export class FiledMerchantTransactionReference extends MerchantTransactionReference {
  /**
   * Create from string
   * @param {string} value
   * @returns {FiledMerchantTransactionReference}
   */
  static fromString(value) {
    return new FiledMerchantTransactionReference(value);
  }

  /**
   * Create from unfiled reference
   * @param {UnfiledMerchantTransactionReference} unfiled
   * @returns {FiledMerchantTransactionReference}
   */
  static fromUnfiled(unfiled) {
    return new FiledMerchantTransactionReference(unfiled.value);
  }
}

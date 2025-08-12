import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * Represents a UUID value
 */
export class Uuid {
  #value;

  constructor(value) {
    if (!uuidValidate(value)) {
      throw new Error(`Invalid UUID format: ${value}`);
    }
    this.#value = value;
  }

  /**
   * Generate a new random UUID
   * @returns {Uuid}
   */
  static generate() {
    return new Uuid(uuidv4());
  }

  /**
   * Create from string
   * @param {string} value
   * @returns {Uuid}
   */
  static fromString(value) {
    return new Uuid(value);
  }

  /**
   * Try to create from string, return null if invalid
   * @param {string} value
   * @returns {Uuid|null}
   */
  static tryFromString(value) {
    try {
      return new Uuid(value);
    } catch {
      return null;
    }
  }

  /**
   * Get the UUID value
   * @returns {string}
   */
  get value() {
    return this.#value;
  }

  /**
   * Check equality
   * @param {Uuid} other
   * @returns {boolean}
   */
  equals(other) {
    return this.#value.toLowerCase() === other.value.toLowerCase();
  }

  /**
   * Get string representation
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

/**
 * Store UUID for TWINT merchant identification
 */
export class StoreUuid extends Uuid {
  /**
   * @param {string} value
   * @returns {StoreUuid}
   */
  static fromString(value) {
    return new StoreUuid(value);
  }

  /**
   * @returns {StoreUuid}
   */
  static generate() {
    return new StoreUuid(uuidv4());
  }
}

/**
 * Order ID UUID
 */
export class OrderId extends Uuid {
  /**
   * @param {string} value
   * @returns {OrderId}
   */
  static fromString(value) {
    return new OrderId(value);
  }

  /**
   * @returns {OrderId}
   */
  static generate() {
    return new OrderId(uuidv4());
  }
}

/**
 * Pairing UUID for fast checkout
 */
export class PairingUuid extends Uuid {
  /**
   * @param {string} value
   * @returns {PairingUuid}
   */
  static fromString(value) {
    return new PairingUuid(value);
  }

  /**
   * @returns {PairingUuid}
   */
  static generate() {
    return new PairingUuid(uuidv4());
  }
}

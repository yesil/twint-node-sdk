/**
 * Represents a monetary amount with currency
 */
export class Money {
  static #CHF_CURRENCY = 'CHF';

  #amount;
  #currency;

  constructor(amount, currency) {
    // Validate amount
    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }
    if (!Number.isFinite(amount)) {
      throw new Error('Amount must be a finite number');
    }
    // Round to 2 decimal places
    this.#amount = Math.round(amount * 100) / 100;
    this.#currency = currency;
  }

  /**
   * Create a Money instance with Swiss Francs
   * @param {number} amount
   * @returns {Money}
   */
  static CHF(amount) {
    return new Money(amount, Money.#CHF_CURRENCY);
  }

  /**
   * Create a Money instance with a custom currency
   * @param {number} amount
   * @param {string} currency
   * @returns {Money}
   */
  static of(amount, currency) {
    return new Money(amount, currency);
  }

  /**
   * Create Money from a JSON object
   * @param {Object} json
   * @returns {Money}
   */
  static fromJSON(json) {
    if (!json || typeof json.amount !== 'number' || typeof json.currency !== 'string') {
      throw new Error('Invalid Money JSON format');
    }
    return new Money(json.amount, json.currency);
  }

  /**
   * Get the amount
   * @returns {number}
   */
  get amount() {
    return this.#amount;
  }

  /**
   * Get the currency code
   * @returns {string}
   */
  get currency() {
    return this.#currency;
  }

  /**
   * Check if this is CHF currency
   * @returns {boolean}
   */
  isCHF() {
    return this.#currency === Money.#CHF_CURRENCY;
  }

  /**
   * Add another money amount (must be same currency)
   * @param {Money} other
   * @returns {Money}
   */
  add(other) {
    if (this.#currency !== other.currency) {
      throw new Error(`Cannot add different currencies: ${this.#currency} and ${other.currency}`);
    }
    return new Money(this.#amount + other.amount, this.#currency);
  }

  /**
   * Subtract another money amount (must be same currency)
   * @param {Money} other
   * @returns {Money}
   */
  subtract(other) {
    if (this.#currency !== other.currency) {
      throw new Error(
        `Cannot subtract different currencies: ${this.#currency} and ${other.currency}`,
      );
    }
    return new Money(this.#amount - other.amount, this.#currency);
  }

  /**
   * Multiply by a factor
   * @param {number} factor
   * @returns {Money}
   */
  multiply(factor) {
    return new Money(this.#amount * factor, this.#currency);
  }

  /**
   * Check equality
   * @param {Money} other
   * @returns {boolean}
   */
  equals(other) {
    return this.#amount === other.amount && this.#currency === other.currency;
  }

  /**
   * Compare amounts (must be same currency)
   * @param {Money} other
   * @returns {number}
   */
  compareTo(other) {
    if (this.#currency !== other.currency) {
      throw new Error(
        `Cannot compare different currencies: ${this.#currency} and ${other.currency}`,
      );
    }
    return this.#amount - other.amount;
  }

  /**
   * Check if amount is zero
   * @returns {boolean}
   */
  isZero() {
    return this.#amount === 0;
  }

  /**
   * Check if amount is positive
   * @returns {boolean}
   */
  isPositive() {
    return this.#amount > 0;
  }

  /**
   * Format as string
   * @returns {string}
   */
  toString() {
    return `${this.#currency} ${this.#amount.toFixed(2)}`;
  }

  /**
   * Convert to JSON
   * @returns {{amount: number, currency: string}}
   */
  toJSON() {
    return {
      amount: this.#amount,
      currency: this.#currency,
    };
  }
}

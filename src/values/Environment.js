/**
 * Represents the TWINT API environment
 */
export class Environment {
  #name;
  #url;

  constructor(name, url) {
    this.#name = name;
    this.#url = url;
  }

  /**
   * Production environment
   */
  static PRODUCTION = new Environment(
    'production',
    'https://service.twint.ch/merchant/service/TWINTMerchantServicev8_6',
  );

  /**
   * Integration/Testing environment
   */
  static INTEGRATION = new Environment(
    'integration',
    'https://int.service.twint.ch/merchant/service/TWINTMerchantServicev8_6',
  );

  /**
   * Staging environment
   */
  static STAGING = new Environment(
    'staging',
    'https://stage.service.twint.ch/merchant/service/TWINTMerchantServicev8_6',
  );

  /**
   * Get the environment name
   * @returns {string}
   */
  get name() {
    return this.#name;
  }

  /**
   * Get the API URL for this environment
   * @returns {string}
   */
  get url() {
    return this.#url;
  }

  /**
   * Check if this is production environment
   * @returns {boolean}
   */
  isProduction() {
    return this === Environment.PRODUCTION;
  }

  /**
   * String representation
   * @returns {string}
   */
  toString() {
    return this.#name;
  }

  /**
   * Create a custom environment
   * @param {string} name
   * @param {string} url
   * @returns {Environment}
   */
  static custom(name, url) {
    return new Environment(name, url);
  }
}

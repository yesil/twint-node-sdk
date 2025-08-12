import fs from 'fs/promises';
import path from 'path';

/**
 * PKCS12 Certificate (.p12/.pfx files)
 */
export class Pkcs12Certificate {
  #buffer;
  #passphrase;
  #filePath;

  constructor(buffer, passphrase, filePath = null) {
    this.#buffer = buffer;
    this.#passphrase = passphrase;
    this.#filePath = filePath;
  }

  /**
   * Load from file
   * @param {string} filePath
   * @param {string} passphrase
   * @returns {Promise<Pkcs12Certificate>}
   */
  static async fromFile(filePath, passphrase) {
    const buffer = await fs.readFile(filePath);
    return new Pkcs12Certificate(buffer, passphrase, filePath);
  }

  /**
   * Get the PFX buffer
   * @returns {Buffer}
   */
  get buffer() {
    return this.#buffer;
  }

  /**
   * Get the passphrase
   * @returns {string|null}
   */
  get passphrase() {
    return this.#passphrase;
  }

  /**
   * Get the file path if loaded from file
   * @returns {string|null}
   */
  get filePath() {
    return this.#filePath;
  }
}

/**
 * Certificate container for managing certificate formats
 * Currently only supports PKCS12 (.p12/.pfx) format
 */
export class CertificateContainer {
  #certificate;

  constructor(certificate) {
    this.#certificate = certificate;
  }

  /**
   * Load from file - only supports .p12/.pfx
   * @param {string} filePath
   * @param {string} passphrase
   * @returns {Promise<CertificateContainer>}
   */
  static async fromFile(filePath, passphrase = null) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.p12' || ext === '.pfx') {
      const cert = await Pkcs12Certificate.fromFile(filePath, passphrase);
      return new CertificateContainer(cert);
    } else {
      throw new Error(`Unsupported certificate format: ${ext}. Only .p12 and .pfx files are supported.`);
    }
  }

  /**
   * Get PKCS12 options for SOAP client
   * @returns {{pfx: Buffer, passphrase: string}}
   */
  getPfxOptions() {
    return {
      pfx: this.#certificate.buffer,
      passphrase: this.#certificate.passphrase,
    };
  }

  /**
   * Get TLS options for HTTPS/SOAP client
   * @returns {{pfx: Buffer, passphrase?: string}}
   */
  getTlsOptions() {
    const options = this.getPfxOptions();
    if (!options.passphrase) {
      delete options.passphrase;
    }
    return options;
  }
}
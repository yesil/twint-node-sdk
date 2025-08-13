import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Generic crypto utilities for securing sensitive data
 */
export class CryptoUtil {
  #key;
  #algorithm = 'aes-256-gcm';
  
  /**
   * Initialize with a secret key
   * @param {string} secret - Secret key for encryption/decryption
   * @param {string} [salt='twint-crypto-salt'] - Salt for key derivation
   */
  constructor(secret, salt = 'twint-crypto-salt') {
    if (!secret || secret.length < 8) {
      throw new Error('Secret key must be at least 8 characters long');
    }
    // Derive a 256-bit key from the secret
    this.#key = scryptSync(secret, salt, 32);
  }
  
  /**
   * Encrypt data
   * @param {string} data - The data to encrypt
   * @returns {string} Base64url encoded encrypted string
   */
  encrypt(data) {
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.#algorithm, this.#key, iv);
      
      let encrypted = cipher.update(data, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const authTag = cipher.getAuthTag();
      
      // Combine iv + authTag + encrypted data
      const combined = Buffer.concat([iv, authTag, encrypted]);
      
      // Return base64url encoded string (URL safe)
      return combined.toString('base64url');
    } catch (error) {
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }
  
  /**
   * Decrypt encrypted data
   * @param {string} encryptedData - Base64url encoded encrypted string
   * @returns {string} The original data
   */
  decrypt(encryptedData) {
    try {
      // Decode from base64url
      const combined = Buffer.from(encryptedData, 'base64url');
      
      // Extract components using subarray (modern API)
      const iv = combined.subarray(0, 16);
      const authTag = combined.subarray(16, 32);
      const encrypted = combined.subarray(32);
      
      const decipher = createDecipheriv(this.#algorithm, this.#key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }
  
  /**
   * Create a default instance with a generated secret
   * WARNING: In production, use a proper secret from environment variables
   * @returns {CryptoUtil}
   */
  static createDefault() {
    // This should be replaced with a proper secret in production
    const defaultSecret = process.env.TWINT_CRYPTO_SECRET || 'default-twint-crypto-secret-change-me';
    return new CryptoUtil(defaultSecret);
  }
}
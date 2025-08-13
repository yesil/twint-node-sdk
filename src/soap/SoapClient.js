import soap from 'soap';
import path from 'path';
import { fileURLToPath } from 'url';
import xmlFormatter from 'xml-formatter';
import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SOAP client wrapper for TWINT API
 */
export class TwintSoapClient {
  #client;
  #certificate;
  #environment;
  #version;
  #logger;

  constructor(certificate, environment, version = 'v8.6') {
    this.#certificate = certificate;
    this.#environment = environment;
    this.#version = version;
    
    // Configure logger
    this.#logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
              // For SOAP messages, just print the message directly
              if (meta.soap) {
                return message;
              }
              return `${timestamp} ${level}: ${message}`;
            })
          )
        }),
        new winston.transports.File({ 
          filename: 'server.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    });
  }

  /**
   * Initialize the SOAP client
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const wsdlPath = path.join(
        __dirname,
        '../../wsdl',
        this.#version,
        `TWINTMerchantService_${this.#version}.wsdl`,
      );

      if (process.env.SOAP_DEBUG === 'true') {
        this.#logger.info('📋 Loading WSDL from: ' + wsdlPath, { soap: true });
        this.#logger.info('🔗 TWINT endpoint: ' + this.#environment.url, { soap: true });
        this.#logger.info('🌍 Environment: ' + this.#environment.name, { soap: true });
      }

      const tlsOptions = this.#certificate.getTlsOptions();
      const options = {
        endpoint: this.#environment.url,
        pfx: tlsOptions.pfx,
        passphrase: tlsOptions.passphrase,
        rejectUnauthorized: false, // Temporarily for debugging
        wsdl_headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
        },
      };

      this.#client = await soap.createClientAsync(wsdlPath, options);
      
      // Add request/response logging if debug is enabled
      if (process.env.SOAP_DEBUG === 'true') {
        this.#addLogging();
        this.#logger.info('✅ SOAP client created successfully', { soap: true });
      }

      // Add security with PFX
      if (this.#certificate) {
        const pfxOptions = this.#certificate.getPfxOptions();
        if (process.env.SOAP_DEBUG === 'true') {
          this.#logger.info(`🔐 PFX certificate loaded, size: ${pfxOptions.pfx.length} bytes`, { soap: true });
        }
        
        this.#client.setSecurity(
          new soap.ClientSSLSecurityPFX(
            pfxOptions.pfx,
            pfxOptions.passphrase,
            {
              rejectUnauthorized: false, // Temporarily disable for debugging
            },
          ),
        );
      }
    } catch (error) {
      if (process.env.SOAP_DEBUG === 'true') {
        this.#logger.error('❌ Failed to initialize SOAP client: ' + error.message, { soap: true, error });
      }
      throw error;
    }
  }

  /**
   * Set SOAP headers for the next request
   * @private
   * @param {Object|null} headers The headers to set, or null to clear headers
   */
  #setHeaders(headers) {
    this.#client.clearSoapHeaders();
    if (headers) {
      this.#client.addSoapHeader(headers);
    }
  }

  /**
   * Execute SOAP method with specific headers
   * @private
   * @param {string} methodName The SOAP method name
   * @param {Object} request The request object
   * @param {Object|null} headers The headers to include (null for no headers)
   * @returns {Promise<Object>}
   */
  async #executeMethod(methodName, request, headers = null) {
    if (!this.#client) {
      await this.initialize();
    }

    // Set SOAP headers for this request
    this.#setHeaders(headers);

    // Set HTTP headers for this specific request
    const options = {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': methodName,
      }
    };

    try {
      const [result] = await this.#client[`${methodName}Async`](request, options);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Add logging for SOAP requests and responses
   * @private
   */
  #addLogging() {
    const formatXml = (xml) => {
      try {
        return xmlFormatter(xml, {
          indentation: '  ',
          collapseContent: true,
          lineSeparator: '\n'
        });
      } catch (error) {
        return xml; // Return unformatted if formatting fails
      }
    };

    // Log outgoing requests
    this.#client.on('request', (xml, eid) => {
      const formattedXml = formatXml(xml);
      const logMessage = [
        '',
        '═'.repeat(80),
        '📤 SOAP REQUEST',
        '═'.repeat(80),
        formattedXml,
        '═'.repeat(80),
        ''
      ].join('\n');
      
      this.#logger.info(logMessage, { 
        soap: true,
        type: 'request',
        xml: formattedXml 
      });
    });

    // Log incoming responses
    this.#client.on('response', (xml, response, eid) => {
      const formattedXml = formatXml(xml);
      const logMessage = [
        '',
        '═'.repeat(80),
        '📥 SOAP RESPONSE',
        '═'.repeat(80),
        formattedXml,
        '═'.repeat(80),
        ''
      ].join('\n');
      
      this.#logger.info(logMessage, { 
        soap: true,
        type: 'response',
        xml: formattedXml 
      });
    });

    // Log SOAP faults
    this.#client.on('soapError', (error, eid) => {
      let errorContent = '';
      if (error.response?.data) {
        errorContent = formatXml(error.response.data);
      } else {
        errorContent = JSON.stringify(error, null, 2);
      }
      
      const logMessage = [
        '',
        '═'.repeat(80),
        '⚠️  SOAP FAULT',
        '═'.repeat(80),
        errorContent,
        '═'.repeat(80),
        ''
      ].join('\n');
      
      this.#logger.error(logMessage, { 
        soap: true,
        type: 'fault',
        error: errorContent 
      });
    });
  }

  /**
   * Check system status
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async checkSystemStatus(request, headers = null) {
    return this.#executeMethod('CheckSystemStatus', request, headers);
  }

  /**
   * Start an order
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async startOrder(request, headers = null) {
    return this.#executeMethod('StartOrder', request, headers);
  }

  /**
   * Monitor an order
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async monitorOrder(request, headers = null) {
    return this.#executeMethod('MonitorOrder', request, headers);
  }

  /**
   * Confirm an order
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async confirmOrder(request, headers = null) {
    return this.#executeMethod('ConfirmOrder', request, headers);
  }

  /**
   * Cancel an order
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async cancelOrder(request, headers = null) {
    return this.#executeMethod('CancelOrder', request, headers);
  }

  /**
   * Reverse an order (refund)
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async reverseOrder(request, headers = null) {
    return this.#executeMethod('ReverseOrder', request, headers);
  }

  /**
   * Request fast checkout check-in
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async requestFastCheckoutCheckIn(request, headers = null) {
    return this.#executeMethod('RequestFastCheckoutCheckIn', request, headers);
  }

  /**
   * Monitor fast checkout check-in
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async monitorFastCheckoutCheckIn(request, headers = null) {
    return this.#executeMethod('MonitorFastCheckoutCheckIn', request, headers);
  }

  /**
   * Cancel check-in
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async cancelCheckIn(request, headers = null) {
    return this.#executeMethod('CancelCheckIn', request, headers);
  }

  /**
   * Enroll cash register
   * @param {Object} request
   * @param {Object|null} headers
   * @returns {Promise<Object>}
   */
  async enrollCashRegister(request, headers = null) {
    return this.#executeMethod('EnrollCashRegister', request, headers);
  }

  /**
   * Get the raw SOAP client (for advanced usage)
   * @returns {Object}
   */
  getRawClient() {
    return this.#client;
  }
}
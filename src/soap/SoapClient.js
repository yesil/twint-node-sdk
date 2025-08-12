import soap from 'soap';
import path from 'path';
import { fileURLToPath } from 'url';
import xmlFormatter from 'xml-formatter';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

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
        forceSoap12Headers: true,
        pfx: tlsOptions.pfx,
        passphrase: tlsOptions.passphrase,
        rejectUnauthorized: false, // Temporarily for debugging
        wsdl_headers: {
          'Content-Type': 'text/xml;charset=UTF-8',
        },
      };

      this.#client = await soap.createClientAsync(wsdlPath, options);
      
      // Add SOAP headers for every request
      this.#addRequestHeaders();
      
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
   * Add required SOAP headers for TWINT
   * @private
   */
  #addRequestHeaders() {
    // Create header with MessageId, ClientSoftwareName, and ClientSoftwareVersion
    const createHeader = () => {
      const messageId = uuidv4();
      const header = {
        RequestHeaderElement: {
          MessageId: messageId,
          ClientSoftwareName: 'TWINT PHP SDK',
          ClientSoftwareVersion: '1.6.2',
          attributes: {
            xmlns: 'http://service.twint.ch/header/types/v8_6'
          }
        }
      };
      return header;
    };
    
    // Add header to each request
    this.#client.addSoapHeader(createHeader());
    
    // Hook into the request to regenerate MessageId for each call
    const originalRequest = this.#client._invoke.bind(this.#client);
    this.#client._invoke = function(...args) {
      // Clear existing headers and add new ones with fresh MessageId
      this.clearSoapHeaders();
      this.addSoapHeader(createHeader());
      return originalRequest.apply(this, args);
    };
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
   * @returns {Promise<Object>}
   */
  async checkSystemStatus(request) {
    try {
      if (!this.#client) {
        await this.initialize();
      }
      const result = await this.#client.CheckSystemStatusAsync(request);
      return result[0] || result;
    } catch (error) {
      if (process.env.SOAP_DEBUG === 'true') {
        this.#logger.error('❌ CheckSystemStatus failed: ' + error.message, { soap: true, error });
      }
      throw error;
    }
  }

  /**
   * Start an order
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async startOrder(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.StartOrderAsync(request);
    return result;
  }

  /**
   * Monitor an order
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async monitorOrder(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.MonitorOrderAsync(request);
    return result;
  }

  /**
   * Confirm an order
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async confirmOrder(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.ConfirmOrderAsync(request);
    return result;
  }

  /**
   * Cancel an order
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async cancelOrder(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.CancelOrderAsync(request);
    return result;
  }

  /**
   * Reverse an order (refund)
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async reverseOrder(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.ReverseOrderAsync(request);
    return result;
  }

  /**
   * Request fast checkout check-in
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async requestFastCheckoutCheckIn(request) {
    if (!this.#client) {
      await this.initialize();
    }
    const [result] = await this.#client.RequestFastCheckoutCheckInAsync(request);
    return result;
  }

  /**
   * Get the raw SOAP client (for advanced usage)
   * @returns {Object}
   */
  getRawClient() {
    return this.#client;
  }
}
import { EventEmitter } from 'events';
import path from 'path';
import { TwintSoapClient } from '../soap/SoapClient.js';
import { OrderStatus } from '../values/OrderStatus.js';
import { OrderId, StoreUuid } from '../values/Uuid.js';
import { FiledMerchantTransactionReference, UnfiledMerchantTransactionReference } from '../values/MerchantTransactionReference.js';
import { CryptoUtil } from '../utils/crypto.js';
import { v4 as uuidv4 } from 'uuid';
import { CertificateContainer } from '../certificates/Certificate.js';
import { Environment } from '../values/Environment.js';
import { Money } from '../values/Money.js';

/**
 * Main TWINT SDK client with event-driven architecture
 */
export class TwintClient extends EventEmitter {
  #soapClient;
  #storeUuid;
  #cashRegisterId;
  #enrollmentDetails;
  #initialized;
  #crypto;
  #activeMonitors;
  #maxConcurrentMonitors;
  #monitoringInterval;
  #orderStore;
  #logger;

  /**
   * @param {Object} config
   * @param {import('../certificates/Certificate.js').CertificateContainer} config.certificate
   * @param {string|import('../values/Uuid.js').StoreUuid} config.storeUuid
   * @param {import('../values/Environment.js').Environment} config.environment
   * @param {string} config.cashRegisterId Required cash register ID
   * @param {Object} [config.handlers] Optional event handlers
   * @param {Function} [config.handlers.success] Handler for successful payments
   * @param {Function} [config.handlers.cancel] Handler for cancelled payments
   * @param {Function} [config.handlers.error] Handler for errors
   * @param {Function} [config.handlers.statusChange] Optional handler for status changes
   * @param {Object} [config.logger] Optional logger instance
   * @param {string} [config.version='v8.6']
   * @param {string} [config.orderSecret] Secret key for encrypting order IDs
   * @param {number} [config.maxConcurrentMonitors=100] Maximum concurrent order monitors
   * @param {number} [config.monitoringInterval=2000] Monitoring interval in milliseconds
   */
  constructor(config) {
    super();
    const { 
      certificate, 
      storeUuid, 
      environment, 
      cashRegisterId,
      handlers = {},
      logger = console,
      version = 'v8.6',
      orderSecret,
      maxConcurrentMonitors = 100,
      monitoringInterval = 2000
    } = config;

    if (!cashRegisterId) {
      throw new Error('cashRegisterId is required');
    }

    // Register event handlers if provided
    if (handlers.success && typeof handlers.success === 'function') {
      this.on('success', handlers.success);
    }
    if (handlers.cancel && typeof handlers.cancel === 'function') {
      this.on('cancel', handlers.cancel);
    }
    if (handlers.error && typeof handlers.error === 'function') {
      this.on('error', handlers.error);
    }
    if (handlers.statusChange && typeof handlers.statusChange === 'function') {
      this.on('statusChange', handlers.statusChange);
    }

    // Set up internal handlers for order store management
    this.on('success', (order) => this.#updateOrderStore(order, 'SUCCESS'));
    this.on('cancel', (order) => this.#updateOrderStore(order, 'CANCELLED'));
    this.on('statusChange', (order) => this.#updateOrderStore(order));

    this.#soapClient = new TwintSoapClient(certificate, environment, version);
    this.#storeUuid = typeof storeUuid === 'string' ? StoreUuid.fromString(storeUuid) : storeUuid;
    this.#cashRegisterId = cashRegisterId;
    this.#enrollmentDetails = null;
    this.#initialized = true;
    
    // Initialize crypto with provided secret or default
    this.#crypto = orderSecret ? new CryptoUtil(orderSecret) : CryptoUtil.createDefault();
    
    // Initialize monitoring state
    this.#activeMonitors = new Map();
    this.#maxConcurrentMonitors = maxConcurrentMonitors;
    this.#monitoringInterval = monitoringInterval;
    
    // Initialize order store and logger
    this.#orderStore = new Map();
    this.#logger = logger;
    
    // Bind middleware method to preserve context
    this.middleware = this.middleware.bind(this);
  }

  /**
   * Create a TwintClient instance from environment variables
   * @param {Object} options Optional configuration
   * @param {Object} [options.logger] Logger instance
   * @returns {Promise<TwintClient>}
   */
  static async fromEnvironment(options = {}) {
    const { logger = console } = options;
    
    // Check for required environment variables
    if (!process.env.TWINT_CERTIFICATE_PATH || !process.env.TWINT_STORE_UUID) {
      throw new Error(
        'Missing required environment variables: TWINT_CERTIFICATE_PATH and TWINT_STORE_UUID'
      );
    }

    // Load certificate
    const certificatePath = path.resolve(process.env.TWINT_CERTIFICATE_PATH);
    logger.info?.(`Loading certificate from: ${certificatePath}`) || console.log(`Loading certificate from: ${certificatePath}`);

    const certificate = await CertificateContainer.fromFile(
      certificatePath,
      process.env.TWINT_CERTIFICATE_PASSWORD || null
    );

    // Determine environment
    let environment;
    switch (process.env.TWINT_ENVIRONMENT) {
    case 'PRODUCTION':
      environment = Environment.PRODUCTION;
      break;
    case 'INTEGRATION':
      environment = Environment.INTEGRATION;
      break;
    case 'STAGING':
      environment = Environment.STAGING;
      break;
    default:
      environment = Environment.INTEGRATION; // Default to integration for dev
    }

    // Check for required cash register ID
    if (!process.env.TWINT_CASH_REGISTER_ID) {
      throw new Error('TWINT_CASH_REGISTER_ID is required in environment variables');
    }

    const cashRegisterId = process.env.TWINT_CASH_REGISTER_ID;

    // Create default handlers that update order store
    const handlers = {
      success: (order) => {
        logger.info?.('✅ Payment successful', { 
          orderId: order.id.toString(),
          amount: order.amount,
          reference: order.merchantTransactionReference?.toString()
        }) || console.log('✅ Payment successful', order.id.toString());
      },
      cancel: (order) => {
        logger.warn?.('❌ Payment cancelled', {
          orderId: order.id.toString(),
          status: order.status.toString(),
          reason: order.transactionStatus
        }) || console.log('❌ Payment cancelled', order.id.toString());
      },
      error: (error, order) => {
        logger.error?.('⚠️ Payment error', {
          orderId: order?.id?.toString(),
          error: error.message
        }) || console.error('⚠️ Payment error', error.message);
      },
      statusChange: (order) => {
        logger.debug?.('📊 Order status update', {
          orderId: order.id.toString(),
          status: order.status.toString(),
          transactionStatus: order.transactionStatus
        }) || console.log('📊 Order status update', order.id.toString());
      }
    };

    // Initialize client
    const client = new TwintClient({
      certificate,
      storeUuid: process.env.TWINT_STORE_UUID,
      environment,
      cashRegisterId,
      handlers,
      logger,
      monitoringInterval: 2000
    });

    logger.info?.('TWINT client initialized', {
      environment: environment.name,
      storeUuid: process.env.TWINT_STORE_UUID,
      cashRegisterId: cashRegisterId,
    }) || console.log('TWINT client initialized');

    // Enroll the cash register at startup
    try {
      logger.info?.('Enrolling cash register with TWINT...', { cashRegisterId }) || console.log('Enrolling cash register...');
      const enrollmentResult = await client.enrollCashRegister('EPOS', cashRegisterId);
      logger.info?.('Cash register enrolled successfully', {
        cashRegisterId: enrollmentResult.cashRegisterId,
        beaconUuid: enrollmentResult.beaconUuid,
        majorId: enrollmentResult.majorId,
        minorId: enrollmentResult.minorId,
      }) || console.log('Cash register enrolled successfully');
    } catch (enrollError) {
      logger.warn?.('Cash register enrollment failed (may already be enrolled)', {
        cashRegisterId: cashRegisterId,
        error: enrollError.message,
      }) || console.warn('Cash register enrollment failed (may already be enrolled)');
    }

    return client;
  }

  /**
   * Express middleware method
   * Usage: app.use('/twint', twintClient.middleware)
   * Handles all TWINT routes internally
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @param {Function} next Express next function
   */
  middleware(req, res, next) {
    // Attach client to request for direct access if needed
    req.twint = this;
    
    // Extract the path without query parameters
    const path = req.path;
    
    // Route handling
    if (req.method === 'POST' && path === '/orders/start') {
      return this.#handleStartOrder(req, res);
    }
    
    if (req.method === 'GET' && path.match(/^\/orders\/([^\/]+)$/)) {
      const match = path.match(/^\/orders\/([^\/]+)$/);
      return this.#handleGetOrder(req, res, match[1]);
    }
    
    if (req.method === 'POST' && path.match(/^\/orders\/([^\/]+)\/stop-monitoring$/)) {
      const match = path.match(/^\/orders\/([^\/]+)\/stop-monitoring$/);
      return this.#handleStopMonitoring(req, res, match[1]);
    }
    
    if (req.method === 'POST' && path.match(/^\/orders\/([^\/]+)\/confirm$/)) {
      const match = path.match(/^\/orders\/([^\/]+)\/confirm$/);
      return this.#handleConfirmOrder(req, res, match[1]);
    }
    
    if (req.method === 'POST' && path.match(/^\/orders\/([^\/]+)\/cancel$/)) {
      const match = path.match(/^\/orders\/([^\/]+)\/cancel$/);
      return this.#handleCancelOrder(req, res, match[1]);
    }
    
    if (req.method === 'GET' && path === '/health') {
      return this.#handleHealth(req, res);
    }
    
    // Not a TWINT route, pass to next middleware
    next();
  }


  /**
   * Set the cash register ID for subsequent operations
   * @param {string} cashRegisterId
   */
  setCashRegisterId(cashRegisterId) {
    this.#cashRegisterId = cashRegisterId;
  }

  /**
   * Generate SOAP headers for TWINT requests
   * @private
   * @returns {Object} The SOAP headers
   */
  #generateHeaders() {
    return {
      RequestHeaderElement: {
        MessageId: uuidv4(),
        ClientSoftwareName: 'TWINT PHP SDK',
        ClientSoftwareVersion: '1.6.2',
        attributes: {
          xmlns: 'http://service.twint.ch/header/types/v8_6'
        }
      }
    };
  }

  /**
   * Enroll cash register
   * @param {string} [cashRegisterType='EPOS'] Type of cash register (EPOS, POS-Serviced, POS-Selfservice, POS-VendingMachine, MPOS)
   * @param {string} [formerCashRegisterId] Optional former cash register ID for re-enrollment
   * @returns {Promise<Object>}
   */
  async enrollCashRegister(cashRegisterType = 'EPOS', formerCashRegisterId = null) {
    try {
      // Generate a cash register ID if not re-enrolling
      // Format: wc|{node_version},{npm_version}|{sdk_version}|D|{unique_id}
      // Example: wc|10.1.0,6.8.2|1.5.1|D|bddbddf1
      const nodeVersion = process.version.replace('v', '');
      const uniqueId = Math.random().toString(16).substring(2, 10);
      const generatedCashRegisterId = formerCashRegisterId || 
        `wc|${nodeVersion},8.0.0|1.0.0|D|${uniqueId}`;

      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: generatedCashRegisterId,
        },
        CashRegisterType: cashRegisterType,
      };

      // Add FormerCashRegisterId if re-enrolling
      if (formerCashRegisterId) {
        request.FormerCashRegisterId = formerCashRegisterId;
      }

      // EnrollCashRegister needs headers
      const headers = this.#generateHeaders();
      const response = await this.#soapClient.enrollCashRegister(request, headers);

      if (!response || !response.BeaconSecurity) {
        throw new Error('Invalid response from TWINT API');
      }

      const beaconSecurity = response.BeaconSecurity;
      
      // Store the cash register ID we used for enrollment
      this.#cashRegisterId = generatedCashRegisterId;
      
      return {
        beaconUuid: beaconSecurity.BeaconUuid,
        majorId: beaconSecurity.MajorId,
        minorId: beaconSecurity.MinorId,
        beaconInitString: beaconSecurity.BeaconInitString,
        beaconSecret: beaconSecurity.BeaconSecret,
        cashRegisterId: generatedCashRegisterId, // Return the ID we generated/used
      };
    } catch (error) {
      throw new Error(`Failed to enroll cash register: ${error.message}`);
    }
  }

  /**
   * Build merchant information with optional cash register ID
   * @private
   * @returns {Object}
   */
  #buildMerchantInformation() {
    const merchantInfo = {
      MerchantUuid: this.#storeUuid.toString(),
    };
    
    if (this.#cashRegisterId) {
      merchantInfo.CashRegisterId = this.#cashRegisterId;
    }
    
    return merchantInfo;
  }

  /**
   * Get enrollment details
   * @returns {Object|null} The enrollment details if enrolled
   */
  getEnrollmentDetails() {
    return this.#enrollmentDetails;
  }

  /**
   * Check TWINT system status
   * @returns {Promise<{status: string, available: boolean}>}
   */
  async checkSystemStatus() {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
      };

      const response = await this.#soapClient.checkSystemStatus(request, this.#generateHeaders());
      
      if (!response) {
        throw new Error('Empty response from TWINT API');
      }

      return {
        status: response.Status || 'UNKNOWN',
        available: response.Status === 'OK',
      };
    } catch (error) {
      throw new Error(`Failed to check system status: ${error.message || error}`);
    }
  }

  /**
   * Start monitoring an order
   * @private
   * @param {string} orderId Order ID to monitor
   * @param {Object} initialOrder Initial order data
   */
  #startMonitoring(orderId, initialOrder) {
    // Check if already monitoring
    if (this.#activeMonitors.has(orderId)) {
      return;
    }

    // Check max concurrent monitors
    if (this.#activeMonitors.size >= this.#maxConcurrentMonitors) {
      this.emit('error', new Error('Maximum concurrent monitors reached'), initialOrder);
      return;
    }

    let lastStatus = initialOrder.status?.toString();
    
    const intervalId = setInterval(async () => {
      try {
        const order = await this.monitorOrder(orderId);
        const currentStatus = order.status.toString();
        
        // Emit status change if different
        if (currentStatus !== lastStatus) {
          lastStatus = currentStatus;
          this.emit('statusChange', order);
          
          // Check for final states
          if (order.status.isSuccessful() || order.status.isConfirmed()) {
            this.emit('success', order);
            this.#stopMonitoring(orderId);
          } else if (order.status.isCancelled() || order.status.isFailed()) {
            this.emit('cancel', order);
            this.#stopMonitoring(orderId);
          }
        }
      } catch (error) {
        // Emit error but continue monitoring
        this.emit('error', error, { id: orderId });
      }
    }, this.#monitoringInterval);
    
    this.#activeMonitors.set(orderId, intervalId);
  }

  /**
   * Stop monitoring an order
   * @param {string} orderId Order ID to stop monitoring
   * @returns {boolean} True if monitoring was stopped, false if not found
   */
  stopMonitoring(orderId) {
    return this.#stopMonitoring(orderId);
  }

  /**
   * Stop monitoring an order (internal)
   * @private
   * @param {string} orderId Order ID to stop monitoring
   * @returns {boolean} True if monitoring was stopped, false if not found
   */
  #stopMonitoring(orderId) {
    const intervalId = this.#activeMonitors.get(orderId);
    if (intervalId) {
      clearInterval(intervalId);
      this.#activeMonitors.delete(orderId);
      return true;
    }
    return false;
  }

  /**
   * Get number of active monitors
   * @returns {number} Number of orders being monitored
   */
  getActiveMonitorsCount() {
    return this.#activeMonitors.size;
  }

  /**
   * Stop all active monitors
   */
  stopAllMonitoring() {
    for (const [orderId, intervalId] of this.#activeMonitors) {
      clearInterval(intervalId);
    }
    this.#activeMonitors.clear();
  }

  /**
   * Start a new payment order with automatic monitoring
   * @param {Object} params
   * @param {string|import('../values/MerchantTransactionReference.js').UnfiledMerchantTransactionReference} params.reference
   * @param {import('../values/Money.js').Money} params.amount
   * @param {boolean} [params.confirmationNeeded=true]
   * @param {boolean} [params.autoMonitor=true] Automatically start monitoring the order
   * @returns {Promise<Object>}
   */
  async startOrder({ reference, amount, confirmationNeeded = true, autoMonitor = true }) {
    try {
      const merchantRef = typeof reference === 'string' ? reference : reference.value;

      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        Order: {
          PostingType: 'GOODS',
          RequestedAmount: {
            Amount: amount.amount,
            Currency: amount.currency,
          },
          MerchantTransactionReference: merchantRef,
          attributes: {
            type: 'PAYMENT_IMMEDIATE',
            confirmationNeeded: confirmationNeeded,
          },
        },
        UnidentifiedCustomer: true,
        QRCodeRendering: true,
      };

      const response = await this.#soapClient.startOrder(request, this.#generateHeaders());

      // Handle different possible response structures from SOAP
      let statusValue, reasonValue;
      
      // Check different possible paths for Status value
      if (response.OrderStatus?.Status?.$value) {
        statusValue = response.OrderStatus.Status.$value;
      } else if (response.OrderStatus?.Status?._) {
        statusValue = response.OrderStatus.Status._;
      } else if (typeof response.OrderStatus?.Status === 'string') {
        statusValue = response.OrderStatus.Status;
      } else {
        console.error('OrderStatus structure:', JSON.stringify(response.OrderStatus, null, 2));
        throw new Error('Unable to parse OrderStatus from response');
      }

      // Check different possible paths for Reason value
      if (response.OrderStatus?.Reason?.$value) {
        reasonValue = response.OrderStatus.Reason.$value;
      } else if (response.OrderStatus?.Reason?._) {
        reasonValue = response.OrderStatus.Reason._;
      } else if (typeof response.OrderStatus?.Reason === 'string') {
        reasonValue = response.OrderStatus.Reason;
      } else {
        reasonValue = 'UNKNOWN';
      }

      const order = {
        id: OrderId.fromString(response.OrderUuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(merchantRef),
        status: OrderStatus.fromString(statusValue),
        transactionStatus: reasonValue,
        amount: amount,
        pairingStatus: response.PairingStatus,
        pairingToken: response.Token,
        qrCode: response.QRCode,
      };
      
      // Automatically start monitoring if requested
      if (autoMonitor) {
        this.#startMonitoring(order.id.toString(), order);
      }
      
      return order;
    } catch (error) {
      throw new Error(`Failed to start order: ${error.message}`);
    }
  }

  /**
   * Monitor an existing order
   * @param {string|import('../values/Uuid.js').OrderId} orderIdOrReference
   * @returns {Promise<Object>}
   */
  async monitorOrder(orderIdOrReference) {
    try {
      const isUuid = orderIdOrReference
        .toString()
        .match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
      };

      if (isUuid) {
        request.OrderUuid = orderIdOrReference.toString();
      } else {
        request.MerchantTransactionReference = orderIdOrReference.toString();
      }
      
      request.WaitForResponse = false;

      const response = await this.#soapClient.monitorOrder(request, this.#generateHeaders());
      const order = response.Order;

      // Handle different possible response structures from SOAP
      let statusValue, reasonValue;
      
      // Check different possible paths for Status value
      if (order.Status?.Status?.$value) {
        statusValue = order.Status.Status.$value;
      } else if (order.Status?.Status?._) {
        statusValue = order.Status.Status._;
      } else if (typeof order.Status?.Status === 'string') {
        statusValue = order.Status.Status;
      } else {
        statusValue = 'UNKNOWN';
      }

      // Check different possible paths for Reason value
      if (order.Status?.Reason?.$value) {
        reasonValue = order.Status.Reason.$value;
      } else if (order.Status?.Reason?._) {
        reasonValue = order.Status.Reason._;
      } else if (typeof order.Status?.Reason === 'string') {
        reasonValue = order.Status.Reason;
      } else {
        reasonValue = 'UNKNOWN';
      }

      return {
        id: OrderId.fromString(order.Uuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(
          order.MerchantTransactionReference,
        ),
        status: OrderStatus.fromString(statusValue),
        transactionStatus: reasonValue,
        amount: {
          amount: order.RequestedAmount.Amount,
          currency: order.RequestedAmount.Currency,
        },
        pairingStatus: order.PairingStatus || null,
        customerInfo: order.CustomerInfo || null,
      };
    } catch (error) {
      throw new Error(`Failed to monitor order: ${error.message}`);
    }
  }

  /**
   * Confirm an order
   * @param {string|import('../values/Uuid.js').OrderId} orderId
   * @param {import('../values/Money.js').Money} amount
   * @returns {Promise<Object>}
   */
  async confirmOrder(orderId, amount) {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        OrderUuid: orderId.toString(),
        RequestedAmount: {
          Amount: amount.amount,
          Currency: amount.currency,
        },
      };

      const response = await this.#soapClient.confirmOrder(request, this.#generateHeaders());
      const order = response.Order;

      // Handle different possible response structures from SOAP
      let statusValue = 'CONFIRMED';
      let reasonValue = 'CONFIRMED';
      
      if (order?.Status) {
        // Check different possible paths for Status value
        if (order.Status?.Status?.$value) {
          statusValue = order.Status.Status.$value;
        } else if (order.Status?.Status?._) {
          statusValue = order.Status.Status._;
        } else if (typeof order.Status?.Status === 'string') {
          statusValue = order.Status.Status;
        }

        // Check different possible paths for Reason value
        if (order.Status?.Reason?.$value) {
          reasonValue = order.Status.Reason.$value;
        } else if (order.Status?.Reason?._) {
          reasonValue = order.Status.Reason._;
        } else if (typeof order.Status?.Reason === 'string') {
          reasonValue = order.Status.Reason;
        }
      }

      return {
        id: OrderId.fromString(order.Uuid),
        status: OrderStatus.fromString(statusValue),
        transactionStatus: reasonValue,
        confirmed: true,
      };
    } catch (error) {
      throw new Error(`Failed to confirm order: ${error.message}`);
    }
  }

  /**
   * Cancel an order
   * @param {string|import('../values/Uuid.js').OrderId} orderId
   * @returns {Promise<Object>}
   */
  async cancelOrder(orderId) {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        OrderUuid: orderId.toString(),
      };

      const response = await this.#soapClient.cancelOrder(request, this.#generateHeaders());

      return {
        id: orderId,
        status: OrderStatus.CANCELLED(),
        cancelled: true,
        cancellationStatus: response.Status,
      };
    } catch (error) {
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Reverse (refund) an order
   * @param {Object} params
   * @param {string|import('../values/MerchantTransactionReference.js').UnfiledMerchantTransactionReference} params.reversalReference
   * @param {string|import('../values/Uuid.js').OrderId} params.originalOrderId
   * @param {import('../values/Money.js').Money} params.amount
   * @param {string} [params.reason='REFUND']
   * @returns {Promise<Object>}
   */
  async reverseOrder({ reversalReference, originalOrderId, amount, reason = 'REFUND' }) {
    try {
      const merchantRef =
        typeof reversalReference === 'string' ? reversalReference : reversalReference.value;

      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        Order: {
          PostingType: 'GOODS',
          RequestedAmount: {
            Amount: amount.amount,
            Currency: amount.currency,
          },
          MerchantTransactionReference: merchantRef,
          LinkedOrderUuid: originalOrderId.toString(),
          attributes: {
            type: 'REVERSAL',
            confirmationNeeded: false,
          },
        },
        ReversalReason: reason,
      };

      const response = await this.#soapClient.startOrder(request, this.#generateHeaders());

      // Handle different possible response structures from SOAP
      let statusValue, reasonValue;
      
      // Check different possible paths for Status value
      if (response.OrderStatus?.Status?.$value) {
        statusValue = response.OrderStatus.Status.$value;
      } else if (response.OrderStatus?.Status?._) {
        statusValue = response.OrderStatus.Status._;
      } else if (typeof response.OrderStatus?.Status === 'string') {
        statusValue = response.OrderStatus.Status;
      } else {
        statusValue = 'UNKNOWN';
      }

      // Check different possible paths for Reason value
      if (response.OrderStatus?.Reason?.$value) {
        reasonValue = response.OrderStatus.Reason.$value;
      } else if (response.OrderStatus?.Reason?._) {
        reasonValue = response.OrderStatus.Reason._;
      } else if (typeof response.OrderStatus?.Reason === 'string') {
        reasonValue = response.OrderStatus.Reason;
      } else {
        reasonValue = 'UNKNOWN';
      }

      return {
        id: OrderId.fromString(response.OrderUuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(merchantRef),
        status: OrderStatus.fromString(statusValue),
        transactionStatus: reasonValue,
        amount: amount,
        originalOrderId: originalOrderId,
        reversalSuccessful: statusValue === 'SUCCESS',
      };
    } catch (error) {
      throw new Error(`Failed to reverse order: ${error.message}`);
    }
  }

  /**
   * Request fast checkout check-in
   * @param {Object} params
   * @param {import('../values/Money.js').Money} params.amount
   * @param {Array<string>} params.requestedScopes
   * @param {Array<Object>} params.shippingMethods
   * @returns {Promise<Object>}
   */
  async requestFastCheckoutCheckIn({ amount, requestedScopes, shippingMethods }) {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        RequestedAmount: {
          Amount: amount.amount,
          Currency: amount.currency,
        },
        RequestedCustomerDataScopes: requestedScopes,
        ShippingMethods: shippingMethods.map((method) => ({
          Id: method.id,
          Name: method.name,
          Cost: {
            Amount: method.cost,
            Currency: amount.currency,
          },
        })),
        QRCodeRendering: true,
      };

      const response = await this.#soapClient.requestFastCheckoutCheckIn(request, this.#generateHeaders());

      return {
        pairingUuid: response.PairingUuid,
        pairingToken: response.Token,
        qrCode: response.QRCode,
        status: response.Status,
      };
    } catch (error) {
      throw new Error(`Failed to request fast checkout: ${error.message}`);
    }
  }

  /**
   * Monitor fast checkout check-in
   * @param {string} pairingUuid
   * @returns {Promise<Object>}
   */
  async monitorFastCheckoutCheckIn(pairingUuid) {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        PairingUuid: pairingUuid,
        WaitForResponse: false,
      };

      const response = await this.#soapClient.monitorFastCheckoutCheckIn(request, this.#generateHeaders());

      return {
        pairingUuid: pairingUuid,
        status: response.Status,
        customerData: response.CustomerData || null,
        selectedShippingMethodId: response.SelectedShippingMethodId || null,
        checkInComplete: response.Status === 'CHECKED_IN',
      };
    } catch (error) {
      throw new Error(`Failed to monitor fast checkout: ${error.message}`);
    }
  }

  /**
   * Cancel fast checkout check-in
   * @param {string} pairingUuid
   * @returns {Promise<Object>}
   */
  async cancelFastCheckoutCheckIn(pairingUuid) {
    try {
      const request = {
        MerchantInformation: this.#buildMerchantInformation(),
        PairingUuid: pairingUuid,
      };

      const response = await this.#soapClient.cancelCheckIn(request, this.#generateHeaders());

      return {
        pairingUuid: pairingUuid,
        cancelled: true,
        status: response.Status,
      };
    } catch (error) {
      throw new Error(`Failed to cancel fast checkout: ${error.message}`);
    }
  }

  /**
   * Encrypt an order ID for secure URL transmission
   * @param {string} orderId - The order ID to encrypt
   * @returns {string} Encrypted order ID (URL-safe base64)
   */
  encryptOrderId(orderId) {
    return this.#crypto.encrypt(orderId);
  }

  /**
   * Decrypt an encrypted order ID
   * @param {string} encryptedOrderId - The encrypted order ID
   * @returns {string} The original order ID
   */
  decryptOrderId(encryptedOrderId) {
    return this.#crypto.decrypt(encryptedOrderId);
  }

  /**
   * Get the order ID from an encrypted value
   * @param {string} encryptedValue - The encrypted order ID value
   * @returns {string} The decrypted order ID
   */
  getOrderIdFromEncrypted(encryptedValue) {
    try {
      return this.decryptOrderId(encryptedValue);
    } catch (error) {
      throw new Error(`Invalid encrypted order ID: ${error.message}`);
    }
  }

  /**
   * Update the order store with order data
   * @private
   * @param {Object} order Order object
   * @param {string} [status] Optional status override
   */
  #updateOrderStore(order, status) {
    if (!order?.id) return;
    
    const orderId = order.id.toString();
    const storedOrder = this.#orderStore.get(orderId) || {};
    
    const updatedOrder = {
      ...storedOrder,
      id: orderId,
      status: status || order.status?.toString() || storedOrder.status,
      transactionStatus: order.transactionStatus,
      lastUpdated: new Date().toISOString()
    };
    
    if (status === 'SUCCESS') {
      updatedOrder.completedAt = new Date().toISOString();
    } else if (status === 'CANCELLED') {
      updatedOrder.cancelledAt = new Date().toISOString();
    }
    
    this.#orderStore.set(orderId, updatedOrder);
  }

  /**
   * Handle start order route
   * @private
   */
  async #handleStartOrder(req, res) {
    try {
      const { reference, amount, confirmationNeeded = true } = req.body;

      if (!reference || !amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request: reference and positive amount are required',
        });
      }

      this.#logger.info?.('Starting order', { reference, amount, confirmationNeeded }) || 
        console.log('Starting order', { reference, amount, confirmationNeeded });

      // Start real TWINT order - monitoring begins automatically
      const order = await this.startOrder({
        reference: reference || UnfiledMerchantTransactionReference.generate(),
        amount: Money.CHF(amount),
        confirmationNeeded,
        autoMonitor: true // Enable automatic monitoring
      });

      // Use the QR code directly from TWINT response
      if (!order.qrCode) {
        this.#logger.error?.('No QR code received from TWINT API') || 
          console.error('No QR code received from TWINT API');
        return res.status(500).json({
          success: false,
          error: 'TWINT API did not return a QR code',
        });
      }
      
      if (!order.pairingToken) {
        this.#logger.error?.('No pairing token received from TWINT API') || 
          console.error('No pairing token received from TWINT API');
        return res.status(500).json({
          success: false,
          error: 'TWINT API did not return a pairing token',
        });
      }

      const orderData = {
        id: order.id.toString(),
        reference,
        amount: {
          value: amount,
          currency: 'CHF',
        },
        status: order.status.toString(),
        pairingToken: order.pairingToken,
        qrCode: order.qrCode,
        confirmationNeeded,
        createdAt: new Date().toISOString(),
      };

      this.#orderStore.set(orderData.id, orderData);

      this.#logger.info?.('Order started with automatic monitoring', {
        orderId: orderData.id,
        reference: orderData.reference,
        amount: orderData.amount.value,
        monitoring: 'active'
      }) || console.log('Order started with automatic monitoring');

      res.json({
        success: true,
        data: orderData,
        message: 'Order started and monitoring automatically'
      });
    } catch (error) {
      this.#logger.error?.('Failed to start order:', error.message) || 
        console.error('Failed to start order:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle get order route
   * @private
   */
  async #handleGetOrder(req, res, orderId) {
    try {
      // Check if order exists in store (updated by event handlers)
      const storedOrder = this.#orderStore.get(orderId);
      
      if (!storedOrder) {
        // If not in store, try to fetch it
        this.#logger.info?.('Fetching order status', { orderId }) || 
          console.log('Fetching order status', { orderId });
        const order = await this.monitorOrder(orderId);
        
        const orderData = {
          id: orderId,
          amount: {
            value: order.amount?.amount || 0,
            currency: order.amount?.currency || 'CHF',
          },
          status: order.status.toString(),
          transactionStatus: order.transactionStatus?.toString(),
          updatedAt: new Date().toISOString(),
        };
        
        this.#orderStore.set(orderId, orderData);
        
        res.json({
          success: true,
          data: orderData,
          monitoring: false
        });
      } else {
        // Return stored order (being updated by event handlers)
        res.json({
          success: true,
          data: storedOrder,
          monitoring: this.#activeMonitors.has(orderId)
        });
      }
    } catch (error) {
      this.#logger.error?.('Failed to monitor order:', error.message) || 
        console.error('Failed to monitor order:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle stop monitoring route
   * @private
   */
  async #handleStopMonitoring(req, res, orderId) {
    try {
      const stopped = this.stopMonitoring(orderId);

      this.#logger.info?.('Stopped monitoring order', { orderId, stopped }) || 
        console.log('Stopped monitoring order', { orderId, stopped });

      res.json({
        success: true,
        stopped,
        message: stopped ? 'Monitoring stopped' : 'Order was not being monitored'
      });
    } catch (error) {
      this.#logger.error?.('Failed to stop monitoring:', error.message) || 
        console.error('Failed to stop monitoring:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle confirm order route
   * @private
   */
  async #handleConfirmOrder(req, res, orderId) {
    try {
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid amount',
        });
      }

      this.#logger.info?.('Confirming order', { orderId, amount }) || 
        console.log('Confirming order', { orderId, amount });

      // Confirm real TWINT order
      const order = await this.confirmOrder(orderId, Money.CHF(amount));

      const storedOrder = this.#orderStore.get(orderId) || {};
      const orderData = {
        ...storedOrder,
        id: orderId,
        status: order.status.toString(),
        transactionStatus: order.transactionStatus?.toString(),
        confirmedAt: new Date().toISOString(),
      };

      this.#orderStore.set(orderId, orderData);

      this.#logger.info?.('Order confirmed', {
        orderId,
        status: orderData.status,
      }) || console.log('Order confirmed', { orderId });

      res.json({
        success: true,
        data: orderData,
      });
    } catch (error) {
      this.#logger.error?.('Failed to confirm order:', error.message) || 
        console.error('Failed to confirm order:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle cancel order route
   * @private
   */
  async #handleCancelOrder(req, res, orderId) {
    try {
      this.#logger.info?.('Cancelling order', { orderId }) || 
        console.log('Cancelling order', { orderId });

      // Cancel real TWINT order
      const order = await this.cancelOrder(orderId);

      const storedOrder = this.#orderStore.get(orderId) || {};
      const orderData = {
        ...storedOrder,
        id: orderId,
        status: order.status.toString(),
        cancelledAt: new Date().toISOString(),
      };

      this.#orderStore.set(orderId, orderData);

      this.#logger.info?.('Order cancelled', {
        orderId,
        status: orderData.status,
      }) || console.log('Order cancelled', { orderId });

      res.json({
        success: true,
        data: orderData,
      });
    } catch (error) {
      this.#logger.error?.('Failed to cancel order:', error.message) || 
        console.error('Failed to cancel order:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Handle health check route
   * @private
   */
  async #handleHealth(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      twintClient: true,
      cashRegister: {
        enrolled: this.#cashRegisterId !== null,
        id: this.#cashRegisterId ? this.#cashRegisterId.substring(0, 8) + '...' : null,
      },
      monitoring: {
        active: this.getActiveMonitorsCount(),
        enabled: true
      }
    };

    try {
      const systemStatus = await this.checkSystemStatus();
      health.twintSystem = systemStatus;
    } catch (error) {
      health.twintSystem = {
        available: false,
        error: error.message,
      };
    }

    res.json(health);
  }
}
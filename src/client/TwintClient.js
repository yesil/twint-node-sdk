import { EventEmitter } from 'events';
import { TwintSoapClient } from '../soap/SoapClient.js';
import { OrderStatus } from '../values/OrderStatus.js';
import { OrderId, StoreUuid } from '../values/Uuid.js';
import { FiledMerchantTransactionReference } from '../values/MerchantTransactionReference.js';
import { CryptoUtil } from '../utils/crypto.js';
import { v4 as uuidv4 } from 'uuid';

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

  /**
   * @param {Object} config
   * @param {import('../certificates/Certificate.js').CertificateContainer} config.certificate
   * @param {string|import('../values/Uuid.js').StoreUuid} config.storeUuid
   * @param {import('../values/Environment.js').Environment} config.environment
   * @param {string} config.cashRegisterId Required cash register ID
   * @param {Object} config.handlers Required event handlers
   * @param {Function} config.handlers.success Handler for successful payments
   * @param {Function} config.handlers.cancel Handler for cancelled payments
   * @param {Function} config.handlers.error Handler for errors
   * @param {Function} [config.handlers.statusChange] Optional handler for status changes
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
      handlers,
      version = 'v8.6',
      orderSecret,
      maxConcurrentMonitors = 100,
      monitoringInterval = 2000
    } = config;

    if (!cashRegisterId) {
      throw new Error('cashRegisterId is required');
    }

    // Validate mandatory handlers
    if (!handlers || typeof handlers !== 'object') {
      throw new Error('handlers object is required');
    }
    if (!handlers.success || typeof handlers.success !== 'function') {
      throw new Error('handlers.success function is mandatory');
    }
    if (!handlers.cancel || typeof handlers.cancel !== 'function') {
      throw new Error('handlers.cancel function is mandatory');
    }
    if (!handlers.error || typeof handlers.error !== 'function') {
      throw new Error('handlers.error function is mandatory');
    }

    // Register event handlers
    this.on('success', handlers.success);
    this.on('cancel', handlers.cancel);
    this.on('error', handlers.error);
    if (handlers.statusChange && typeof handlers.statusChange === 'function') {
      this.on('statusChange', handlers.statusChange);
    }

    this.#soapClient = new TwintSoapClient(certificate, environment, version);
    this.#storeUuid = typeof storeUuid === 'string' ? StoreUuid.fromString(storeUuid) : storeUuid;
    this.#cashRegisterId = cashRegisterId;
    this.#enrollmentDetails = null;
    this.#initialized = true; // No need for async initialization anymore
    
    // Initialize crypto with provided secret or default
    this.#crypto = orderSecret ? new CryptoUtil(orderSecret) : CryptoUtil.createDefault();
    
    // Initialize monitoring state
    this.#activeMonitors = new Map();
    this.#maxConcurrentMonitors = maxConcurrentMonitors;
    this.#monitoringInterval = monitoringInterval;
    
    // Bind middleware method to preserve context
    this.middleware = this.middleware.bind(this);
  }

  /**
   * Express middleware method
   * Usage: app.use(twintClient.middleware)
   * @param {Object} req Express request object
   * @param {Object} res Express response object
   * @param {Function} next Express next function
   */
  middleware(req, res, next) {
    req.twint = this;
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
}
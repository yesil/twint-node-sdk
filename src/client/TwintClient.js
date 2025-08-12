import { TwintSoapClient } from '../soap/SoapClient.js';
import { OrderStatus } from '../values/OrderStatus.js';
import { OrderId, StoreUuid } from '../values/Uuid.js';
import { FiledMerchantTransactionReference } from '../values/MerchantTransactionReference.js';

/**
 * Main TWINT SDK client
 */
export class TwintClient {
  #soapClient;
  #storeUuid;
  #cashRegisterId;
  #enrolledCashRegisters = new Set();

  /**
   * @param {Object} config
   * @param {import('../certificates/Certificate.js').CertificateContainer} config.certificate
   * @param {string|import('../values/Uuid.js').StoreUuid} config.storeUuid
   * @param {import('../values/Environment.js').Environment} config.environment
   * @param {string} [config.cashRegisterId]
   * @param {string} [config.version='v8.6']
   */
  constructor(config) {
    const { certificate, storeUuid, environment, cashRegisterId, version = 'v8.6' } = config;

    this.#soapClient = new TwintSoapClient(certificate, environment, version);
    this.#storeUuid = typeof storeUuid === 'string' ? StoreUuid.fromString(storeUuid) : storeUuid;
    this.#cashRegisterId = cashRegisterId || `SDK-${this.#storeUuid.toString().substring(0, 8)}`;
  }

  /**
   * Check TWINT system status
   * @returns {Promise<{status: string, available: boolean}>}
   */
  async checkSystemStatus() {
    try {
      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId || '',
        },
      };

      const response = await this.#soapClient.checkSystemStatus(request);
      
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
   * Enroll cash register if not already enrolled
   * @private
   */
  async #enrollCashRegister() {
    if (this.#enrolledCashRegisters.has(this.#cashRegisterId)) {
      return;
    }

    try {
      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        CashRegisterType: 'EPOS',
        ForceEnrollment: true,
      };

      await this.#soapClient.enrollCashRegister(request);
      this.#enrolledCashRegisters.add(this.#cashRegisterId);
    } catch (error) {
      // Cash register might already be enrolled
      if (!error.message?.includes('ALREADY_ENROLLED')) {
        throw new Error(`Failed to enroll cash register: ${error.message}`);
      }
      this.#enrolledCashRegisters.add(this.#cashRegisterId);
    }
  }

  /**
   * Start a new payment order
   * @param {Object} params
   * @param {string|import('../values/MerchantTransactionReference.js').UnfiledMerchantTransactionReference} params.reference
   * @param {import('../values/Money.js').Money} params.amount
   * @param {boolean} [params.confirmationNeeded=true]
   * @returns {Promise<Object>}
   */
  async startOrder({ reference, amount, confirmationNeeded = true }) {
    await this.#enrollCashRegister();

    try {
      const merchantRef = typeof reference === 'string' ? reference : reference.value;

      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        Order: {
          RequestedAmount: {
            Amount: amount.amount,
            Currency: amount.currency,
          },
          MerchantTransactionReference: merchantRef,
          Type: 'PAYMENT_IMMEDIATE',
          PostingType: 'GOODS',
          ConfirmationNeeded: confirmationNeeded,
        },
        QRCodeRendering: true,
        UnidentifiedCustomer: true,
      };

      const response = await this.#soapClient.startOrder(request);

      return {
        id: OrderId.fromString(response.OrderUuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(merchantRef),
        status: OrderStatus.fromString(response.OrderStatus.Status._),
        transactionStatus: response.OrderStatus.Reason._,
        amount: amount,
        pairingStatus: response.PairingStatus,
        pairingToken: response.Token,
        qrCode: response.QRCode,
      };
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
    await this.#enrollCashRegister();

    try {
      const isUuid = orderIdOrReference
        .toString()
        .match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        WaitForResponse: false,
      };

      if (isUuid) {
        request.OrderUuid = orderIdOrReference.toString();
      } else {
        request.MerchantTransactionReference = orderIdOrReference.toString();
      }

      const response = await this.#soapClient.monitorOrder(request);
      const order = response.Order;

      return {
        id: OrderId.fromString(order.Uuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(
          order.MerchantTransactionReference,
        ),
        status: OrderStatus.fromString(order.Status.Status._),
        transactionStatus: order.Status.Reason._,
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
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        OrderUuid: orderId.toString(),
        RequestedAmount: {
          Amount: amount.amount,
          Currency: amount.currency,
        },
      };

      const response = await this.#soapClient.confirmOrder(request);
      const order = response.Order;

      return {
        id: OrderId.fromString(order.Uuid),
        status: OrderStatus.fromString(order.Status.Status._),
        transactionStatus: order.Status.Reason._,
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
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        OrderUuid: orderId.toString(),
        Reason: 'PAYMENT_ABORT',
      };

      const response = await this.#soapClient.cancelOrder(request);

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
    await this.#enrollCashRegister();

    try {
      const merchantRef =
        typeof reversalReference === 'string' ? reversalReference : reversalReference.value;

      const request = {
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
          CashRegisterId: this.#cashRegisterId,
        },
        Order: {
          RequestedAmount: {
            Amount: amount.amount,
            Currency: amount.currency,
          },
          MerchantTransactionReference: merchantRef,
          Type: 'REVERSAL',
          PostingType: 'GOODS',
          LinkedOrderUuid: originalOrderId.toString(),
        },
        ReversalReason: reason,
      };

      const response = await this.#soapClient.startOrder(request);

      return {
        id: OrderId.fromString(response.OrderUuid),
        merchantTransactionReference: FiledMerchantTransactionReference.fromString(merchantRef),
        status: OrderStatus.fromString(response.OrderStatus.Status._),
        transactionStatus: response.OrderStatus.Reason._,
        amount: amount,
        originalOrderId: originalOrderId,
        reversalSuccessful: response.OrderStatus.Status._ === 'SUCCESS',
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
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
        },
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

      const response = await this.#soapClient.requestFastCheckoutCheckIn(request);

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
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
        },
        PairingUuid: pairingUuid,
        WaitForResponse: false,
      };

      const response = await this.#soapClient.monitorFastCheckoutCheckIn(request);

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
        MerchantInformation: {
          MerchantUuid: this.#storeUuid.toString(),
        },
        PairingUuid: pairingUuid,
      };

      const response = await this.#soapClient.cancelCheckIn(request);

      return {
        pairingUuid: pairingUuid,
        cancelled: true,
        status: response.Status,
      };
    } catch (error) {
      throw new Error(`Failed to cancel fast checkout: ${error.message}`);
    }
  }
}

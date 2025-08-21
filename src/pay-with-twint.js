import { LitElement, html, css, nothing } from 'lit';
import { twintApps } from './twint-apps.js';

/**
 * PayWithTwint Web Component
 * 
 * A reusable TWINT payment component for integrators.
 * 
 * @element pay-with-twint
 * 
 * @property {string} reference - Payment reference
 * @property {number} amount - Payment amount in CHF
 * @property {boolean} start - Auto-start payment when true (requires reference and amount)
 * @property {string} apiUrl - Base API URL (default: '/twint')
 * @property {boolean} confirmationNeeded - Whether manual confirmation is required (default: true)
 * 
 * @fires payment-started - When payment is initiated
 * @fires payment-completed - When payment is successfully completed
 * @fires payment-failed - When payment fails
 * @fires payment-cancelled - When payment is cancelled
 * @fires status-changed - When payment status changes
 * @fires payment-error - When an error occurs
 */
export class PayWithTwint extends LitElement {
  // Private fields
  #pollingTimer = null;
  #isPolling = false;
  #encryptedOrderId = null;
  #showingAppSelector = false;
  #twintApps = twintApps;

  static properties = {
    // Payment properties
    reference: { type: String },
    amount: { type: Number },
    apiUrl: { type: String, attribute: 'api-url' },
    confirmationNeeded: { type: Boolean, attribute: 'confirmation-needed' },
    merchantName: { type: String, attribute: 'merchant-name' },
    theme: { type: String },
    redirectUrl: { type: String, attribute: 'redirect-url' },
    cancelOrderCallbackUrl: { type: String, attribute: 'cancel-order-callback-url' },
    
    // Text literals (customizable)
    textCancelCheckout: { type: String, attribute: 'text-cancel-checkout' },
    textScanInstruction: { type: String, attribute: 'text-scan-instruction' },
    textFollowInstruction: { type: String, attribute: 'text-follow-instruction' },
    textProcessing: { type: String, attribute: 'text-processing' },
    textPaymentSuccess: { type: String, attribute: 'text-payment-success' },
    textThankYou: { type: String, attribute: 'text-thank-you' },
    textOrderComplete: { type: String, attribute: 'text-order-complete' },
    textPaymentCancelled: { type: String, attribute: 'text-payment-cancelled' },
    textOrderCancelled: { type: String, attribute: 'text-order-cancelled' },
    textMissingOrderData: { type: String, attribute: 'text-missing-order-data' },
    textErrorPairingToken: { type: String, attribute: 'text-error-pairing-token' },
    textErrorQrCode: { type: String, attribute: 'text-error-qr-code' },
    textErrorInvalidQr: { type: String, attribute: 'text-error-invalid-qr' },
    textOrderIdLabel: { type: String, attribute: 'text-order-id-label' },
    textReferenceLabel: { type: String, attribute: 'text-reference-label' },
    textMerchantLabel: { type: String, attribute: 'text-merchant-label' },
    textTotalAmountLabel: { type: String, attribute: 'text-total-amount-label' },
    textAmountLabel: { type: String, attribute: 'text-amount-label' },
    textChooseApp: { type: String, attribute: 'text-choose-app' },
    textOtherBanks: { type: String, attribute: 'text-other-banks' },
    textEnterCode: { type: String, attribute: 'text-enter-code' },
    
    // Control attributes
    start: { type: Boolean },
    success: { type: Boolean },
    cancelled: { type: Boolean },
    
    // Internal state
    order: { type: Object, state: true },
    status: { type: String, state: true },
    loading: { type: Boolean, state: true }
  };

  static styles = css`
    :host {
      display: block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: #333;
      box-sizing: border-box;
    }

    /* Hide slotted content */
    ::slotted([slot="bank-images"]),
    ::slotted([slot="logo"]) {
      display: none;
    }

    :host([theme='dark']) {
      color: #e0e0e0;
    }

    * {
      box-sizing: border-box;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #f5f5f5;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    }

    :host([theme='dark']) .container {
      background: #2a2a2a;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }

    .header {
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    :host([theme='dark']) .header {
      background: #1a1a1a;
      border-bottom: 1px solid #444;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
    }

    .cancel-button {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      color: #666;
      font-size: 14px;
      cursor: pointer;
      padding: 0;
      font-family: inherit;
    }

    .cancel-button:hover {
      color: #000;
    }

    :host([theme='dark']) .cancel-button {
      color: #999;
    }

    :host([theme='dark']) .cancel-button:hover {
      color: #fff;
    }

    .cancel-icon {
      font-size: 20px;
      font-weight: 300;
    }

    .twint-logo-header {
      height: 58px;
      display: flex;
      align-items: center;
    }

    .twint-logo-header svg,
    .twint-logo-header img {
      height: 58px;
      width: auto;
    }

    .payment-content {
      display: flex;
      background: white;
      padding: 40px;
      gap: 60px;
      align-items: center;
      justify-content: center;
    }

    :host([theme='dark']) .payment-content {
      background: #1a1a1a;
    }

    .payment-left {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }

    .payment-right {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 40px;
      background: #f8f8f8;
      border-radius: 12px;
      min-width: 200px;
    }

    :host([theme='dark']) .payment-right {
      background: #333;
    }

    .qr-code-container {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    :host([theme='dark']) .qr-code-container {
      background: #f0f0f0;
    }

    .qr-code-container img {
      display: block;
      width: 240px;
      height: 240px;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
      filter: contrast(1.2);
    }


    .pairing-token-display {
      font-size: 28px;
      font-weight: bold;
      letter-spacing: 0.15em;
      color: #000;
      font-family: 'Courier New', monospace;
    }

    :host([theme='dark']) .pairing-token-display {
      color: #fff;
    }

    .amount-display {
      background: #000;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-align: center;
    }

    .amount-value {
      font-size: 24px;
      font-weight: 600;
    }

    .merchant-name {
      font-size: 16px;
      font-weight: 500;
      color: #333;
      text-align: center;
      padding: 8px 16px;
      background: #d4e4f7;
      border-radius: 6px;
    }

    :host([theme='dark']) .merchant-name {
      color: #e0e0e0;
      background: #4a5568;
    }

    .payment-instructions {
      display: flex;
      gap: 40px;
      padding: 30px 40px;
      background: #f8f8f8;
      border-top: 1px solid #e0e0e0;
    }

    :host([theme='dark']) .payment-instructions {
      background: #2a2a2a;
      border-top: 1px solid #444;
    }

    .instruction-left,
    .instruction-right {
      flex: 1;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .qr-icon,
    .user-icon {
      font-size: 24px;
      background: white;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    :host([theme='dark']) .qr-icon,
    :host([theme='dark']) .user-icon {
      background: #444;
    }

    .payment-instructions p {
      margin: 0;
      color: #666;
      font-size: 14px;
      line-height: 1.5;
    }

    :host([theme='dark']) .payment-instructions p {
      color: #b0b0b0;
    }



    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #000;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }

    :host([theme='dark']) .spinner {
      border: 3px solid #444;
      border-top: 3px solid #fff;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .loading-text {
      color: #6c757d;
      font-size: 14px;
    }

    :host([theme='dark']) .loading-text {
      color: #b0b0b0;
    }

    .error-message {
      background: #f8d7da;
      color: #721c24;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 16px;
      font-size: 14px;
    }


    .success-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      background: white;
    }

    :host([theme='dark']) .success-container {
      background: #1a1a1a;
    }

    .success-icon {
      width: 80px;
      height: 80px;
      background: #28a745;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      animation: scaleIn 0.3s ease-out;
    }

    .success-icon svg {
      width: 40px;
      height: 40px;
      fill: white;
    }

    @keyframes scaleIn {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      50% {
        transform: scale(1.1);
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }

    .success-title {
      font-size: 28px;
      font-weight: 600;
      color: #155724;
      margin: 0 0 12px 0;
    }

    .success-subtitle {
      font-size: 18px;
      color: #666;
      margin: 0 0 32px 0;
    }

    :host([theme='dark']) .success-subtitle {
      color: #b0b0b0;
    }

    .order-details {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
      width: 100%;
      max-width: 400px;
    }

    :host([theme='dark']) .order-details {
      background: #2a2a2a;
    }

    .order-detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 14px;
    }

    .order-detail-row:last-child {
      margin-bottom: 0;
      padding-top: 12px;
      border-top: 1px solid #dee2e6;
      font-weight: 600;
      font-size: 16px;
    }

    :host([theme='dark']) .order-detail-row:last-child {
      border-top: 1px solid #444;
    }

    .order-detail-label {
      color: #495057;
    }

    .order-detail-value {
      color: #212529;
      font-weight: 500;
      word-break: break-all;
    }

    :host([theme='dark']) .order-detail-label {
      color: #999;
    }

    :host([theme='dark']) .order-detail-value {
      color: #e0e0e0;
    }

    .cancelled-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
      background: white;
    }

    :host([theme='dark']) .cancelled-container {
      background: #1a1a1a;
    }

    .cancelled-icon {
      width: 80px;
      height: 80px;
      background: #6c757d;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      animation: scaleIn 0.3s ease-out;
    }

    .cancelled-icon svg {
      width: 40px;
      height: 40px;
      fill: white;
    }

    .cancelled-title {
      font-size: 28px;
      font-weight: 600;
      color: #6c757d;
      margin: 0 0 12px 0;
    }

    .cancelled-subtitle {
      font-size: 18px;
      color: #666;
      margin: 0 0 32px 0;
    }

    :host([theme='dark']) .cancelled-subtitle {
      color: #b0b0b0;
    }

    @media (max-width: 480px) {
      .payment-content {
        flex-direction: column;
        gap: 30px;
      }

      .payment-instructions {
        flex-direction: column;
        gap: 20px;
      }
    }

    /* Pay with TWINT Button Styles */
    .pay-button-container {
      display: inline-block;
      position: relative;
      overflow: hidden;
      border-radius: 8px;
    }

    .pay-button-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, 
        transparent, 
        rgba(255, 255, 255, 0.2), 
        transparent
      );
      transition: left 0.5s ease-in-out;
      pointer-events: none;
      z-index: 1;
    }

    .pay-button-container:hover::before {
      left: 100%;
    }

    .pay-with-twint-button {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #000;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: transform 0.1s, box-shadow 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      position: relative;
    }

    .pay-with-twint-button:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .pay-with-twint-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .pay-with-twint-button svg {
      width: 24px;
      height: 24px;
    }

    /* Mobile App Selector Styles */
    .mobile-app-selector {
      background: white;
      padding: 24px;
      min-height: 400px;
    }

    :host([theme='dark']) .mobile-app-selector {
      background: #1a1a1a;
    }

    .app-selector-title {
      text-align: center;
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 24px;
      color: #333;
    }

    :host([theme='dark']) .app-selector-title {
      color: #e0e0e0;
    }

    .twint-apps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      max-width: 400px;
      margin: 0 auto 24px;
    }

    .twint-app-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .twint-app-item:hover {
      transform: scale(1.05);
    }

    .twint-app-logo {
      width: 80px;
      height: 80px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin-bottom: 8px;
    }

    .twint-app-name {
      font-size: 12px;
      text-align: center;
      color: #666;
    }

    :host([theme='dark']) .twint-app-name {
      color: #b0b0b0;
    }

    .other-banks-container {
      max-width: 400px;
      margin: 0 auto 24px;
    }

    .other-banks-select {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      font-family: inherit;
    }

    :host([theme='dark']) .other-banks-select {
      background: #2a2a2a;
      border-color: #444;
      color: #e0e0e0;
    }

    .or-divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    .or-divider::before,
    .or-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #ddd;
    }

    :host([theme='dark']) .or-divider::before,
    :host([theme='dark']) .or-divider::after {
      background: #444;
    }

    .or-divider span {
      padding: 0 16px;
      color: #999;
      font-size: 14px;
    }

    .pairing-code-section {
      text-align: center;
      padding: 24px;
      background: #f8f8f8;
      border-radius: 12px;
      max-width: 400px;
      margin: 0 auto;
    }

    :host([theme='dark']) .pairing-code-section {
      background: #2a2a2a;
    }

    .pairing-code-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 12px;
    }

    :host([theme='dark']) .pairing-code-label {
      color: #b0b0b0;
    }

    .pairing-code {
      font-size: 36px;
      font-weight: bold;
      letter-spacing: 0.2em;
      color: #000;
      font-family: 'Courier New', monospace;
    }

    :host([theme='dark']) .pairing-code {
      color: #fff;
    }

    @media (max-width: 480px) {
      .twint-apps-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }

      .twint-app-logo {
        width: 64px;
        height: 64px;
      }

      .twint-app-name {
        font-size: 11px;
      }
    }
  `;

  constructor() {
    super();
    
    // Payment properties
    this.reference = '';
    this.amount = null;
    this.apiUrl = '/twint';
    this.confirmationNeeded = true;
    this.merchantName = '';
    this.theme = 'light';
    this.redirectUrl = '';
    this.cancelOrderCallbackUrl = '';
    
    // Text literals with defaults
    this.textCancelCheckout = 'Cancel checkout';
    this.textScanInstruction = 'Scan this QR Code with your TWINT app to complete the checkout.';
    this.textFollowInstruction = 'Follow the instructions in the app to confirm your order.';
    this.textProcessing = 'Processing payment...';
    this.textPaymentSuccess = 'Payment Successful!';
    this.textThankYou = 'Thank you for your payment';
    this.textOrderComplete = 'Your order has been completed successfully.';
    this.textPaymentCancelled = 'Payment Cancelled';
    this.textOrderCancelled = 'Your order has been cancelled.';
    this.textMissingOrderData = 'Missing order data';
    this.textErrorPairingToken = 'Error: Pairing token not received';
    this.textErrorQrCode = 'Error: QR code not received from TWINT API';
    this.textErrorInvalidQr = 'Error: Invalid QR code format received';
    this.textOrderIdLabel = 'Order ID';
    this.textReferenceLabel = 'Reference';
    this.textMerchantLabel = 'Merchant';
    this.textTotalAmountLabel = 'Total Amount';
    this.textAmountLabel = 'Amount';
    this.textChooseApp = 'Choose your TWINT app:';
    this.textOtherBanks = 'Other banks';
    this.textEnterCode = 'Enter this code in your TWINT app:';
    
    // Control attributes
    this.start = false;
    this.success = false;
    this.cancelled = false;
    
    // Internal state
    this.order = null;
    this.status = 'idle'; // idle, loading, active, success, failed, cancelled
    this.loading = false;
  }

  connectedCallback() {
    super.connectedCallback();
    
    // Only auto-start payment if start attribute is present along with reference and amount
    if (this.start && this.reference && this.amount) {
      this.startPayment().catch(error => {
        console.error('Auto-start payment failed:', error);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  render() {
    // On mobile while showing app selector
    if (this.#showingAppSelector && this.order) {
      return html`
        <slot name="logo" style="display: none"></slot>
        <slot name="bank-images" style="display: none"></slot>
        <div class="container">
          ${this.renderHeader()}
          ${this.renderMobileAppSelector()}
        </div>
      `;
    }


    // Show Pay with TWINT button if not started yet
    if (!this.start && !this.order && !this.loading && !this.success && !this.cancelled) {
      return html`
        <slot name="logo" style="display: none"></slot>
        <slot name="bank-images" style="display: none"></slot>
        ${this.renderPayButton()}
      `;
    }

    // Don't render anything if no order and not in a special state
    if (!this.order && !this.loading && !this.success && !this.cancelled) {
      return nothing;
    }

    return html`
      <slot name="logo" style="display: none"></slot>
      <slot name="bank-images" style="display: none"></slot>
      <div class="container">
        ${this.renderHeader()}
        ${this.renderContent()}
      </div>
    `;
  }

  renderPayButton() {
    const isDisabled = (!this.reference || !this.amount);
    
    // Get logo from slot
    const logoElement = this.querySelector('[slot="logo"]');
    const logoSrc = logoElement ? (logoElement.src || logoElement.getAttribute('src')) : null;
    
    return html`
      <div class="pay-button-container">
        <button 
          class="pay-with-twint-button" 
          @click="${() => this.startPayment()}"
          ?disabled="${isDisabled}"
        >
          <span>Pay with</span>
          ${logoSrc ? html`
            <img src="${logoSrc}" alt="TWINT" style="height: 24px; width: auto;" />
          ` : ''}
        </button>
      </div>
    `;
  }

  renderHeader() {
    const isSuccess = this.success || this.status === 'success' || this.order?.status === 'SUCCESS' || this.order?.status === 'CONFIRMED';
    const isCancelled = this.cancelled || this.status === 'cancelled' || this.order?.status === 'CANCELLED';
    const hideCancel = isSuccess || isCancelled;
    
    return html`
      <div class="header">
        <div class="header-top">
          ${!hideCancel ? html`
            <button class="cancel-button" @click="${() => this.cancelPayment()}">
              <span class="cancel-icon">×</span>
              <span>${this.textCancelCheckout}</span>
            </button>
          ` : html`
            <div></div>
          `}
          <div class="twint-logo-header">
            ${this.renderTwintLogo()}
          </div>
        </div>
      </div>
    `;
  }

  renderStatusBadge() {
    if (!this.order) return '';
    
    const statusClass = this.getStatusClass();
    const statusLabel = this.getStatusLabel();
    
    return html`
      <div class="status-badge ${statusClass}">${statusLabel}</div>
    `;
  }

  renderContent() {
    if (this.loading) {
      return this.renderLoading();
    }

    // Show success screen for completed orders or when success attribute is set (for testing)
    if (this.success || this.status === 'success' || this.order?.status === 'SUCCESS' || this.order?.status === 'CONFIRMED') {
      return this.renderSuccessScreen();
    }

    // Show cancelled screen for cancelled orders or when cancelled attribute is set (for testing)
    if (this.cancelled || this.status === 'cancelled' || this.order?.status === 'CANCELLED') {
      return this.renderCancelledScreen();
    }

    return this.renderPaymentStatus();
  }

  renderLoading() {
    return html`
      <div class="loading-container">
        <div class="spinner"></div>
        <div class="loading-text">${this.textProcessing}</div>
      </div>
    `;
  }

  renderSuccessScreen() {
    // Only show success screen if we have order data or required attributes
    if (!this.order && (!this.reference || !this.amount)) {
      return html`<div class="error-message">${this.textMissingOrderData}</div>`;
    }
    
    const orderId = this.order?.id;
    const reference = this.order?.reference || this.reference;
    const amount = this.order?.amount?.value || this.amount;
    
    return html`
      <div class="success-container">
        <div class="success-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
        </div>
        <h2 class="success-title">${this.textPaymentSuccess}</h2>
        <p class="success-subtitle">${this.textThankYou}</p>
        
        <div class="order-details">
          ${orderId ? html`
            <div class="order-detail-row">
              <span class="order-detail-label">${this.textOrderIdLabel}</span>
              <span class="order-detail-value">${orderId}</span>
            </div>
          ` : ''}
          <div class="order-detail-row">
            <span class="order-detail-label">${this.textReferenceLabel}</span>
            <span class="order-detail-value">${reference}</span>
          </div>
          <div class="order-detail-row">
            <span class="order-detail-label">${this.textMerchantLabel}</span>
            <span class="order-detail-value">${this.merchantName || 'Night Shop'}</span>
          </div>
          <div class="order-detail-row">
            <span class="order-detail-label">${this.textTotalAmountLabel}</span>
            <span class="order-detail-value">CHF ${Number(amount).toFixed(2)}</span>
          </div>
        </div>
        
        <p class="success-subtitle">${this.textOrderComplete}</p>
      </div>
    `;
  }

  renderCancelledScreen() {
    const reference = this.order?.reference || this.reference || '';
    const amount = this.order?.amount?.value || this.amount || 0;
    
    return html`
      <div class="cancelled-container">
        <div class="cancelled-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </div>
        <h2 class="cancelled-title">${this.textPaymentCancelled}</h2>
        <p class="cancelled-subtitle">${this.textOrderCancelled}</p>
        
        <div class="order-details">
          ${reference ? html`
            <div class="order-detail-row">
              <span class="order-detail-label">${this.textReferenceLabel}</span>
              <span class="order-detail-value">${reference}</span>
            </div>
          ` : ''}
          ${this.merchantName ? html`
            <div class="order-detail-row">
              <span class="order-detail-label">${this.textMerchantLabel}</span>
              <span class="order-detail-value">${this.merchantName}</span>
            </div>
          ` : ''}
          ${amount ? html`
            <div class="order-detail-row">
              <span class="order-detail-label">${this.textAmountLabel}</span>
              <span class="order-detail-value">CHF ${Number(amount).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderPaymentStatus() {
    // Always render QR code section - it will show error if missing
    return html`
      <div class="payment-content">
        <div class="payment-left">
          ${this.renderQRCode()}
          ${this.order.pairingToken ? html`
            <div class="pairing-token-display">
              ${this.formatPairingToken(this.order.pairingToken)}
            </div>
          ` : html`
            <div class="error-message">
              ${this.textErrorPairingToken}
            </div>
          `}
        </div>
        <div class="payment-right">
          <div class="amount-display">
            <span class="amount-value">${this.order.amount?.value?.toFixed(0) || '0'} CHF</span>
          </div>
          <div class="merchant-name">
            ${this.merchantName}
          </div>
        </div>
      </div>
      <div class="payment-instructions">
        <div class="instruction-left">
          <div class="qr-icon">📱</div>
          <p>${this.textScanInstruction}</p>
        </div>
        <div class="instruction-right">
          <div class="user-icon">👤</div>
          <p>${this.textFollowInstruction}</p>
        </div>
      </div>
    `;
  }


  renderQRCode() {
    if (!this.order.qrCode) {
      return html`
        <div class="error-message">
          ${this.textErrorQrCode}
        </div>
      `;
    }

    if (!this.order.qrCode.startsWith('data:image')) {
      return html`
        <div class="error-message">
          ${this.textErrorInvalidQr}
        </div>
      `;
    }

    return html`
      <div class="qr-code-container">
        <img src="${this.order.qrCode}" alt="TWINT QR Code" />
      </div>
    `;
  }

  renderOrderInfo() {
    return html`
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Order ID</div>
          <div class="info-value">${this.order.id || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Reference</div>
          <div class="info-value">${this.order.reference || '-'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Amount</div>
          <div class="info-value">CHF ${this.order.amount?.value?.toFixed(2) || '0.00'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value">${this.getStatusLabel()}</div>
        </div>
      </div>
    `;
  }

  renderActionButtons() {
    if (!this.isPaymentActive()) return '';

    return html`
      <div class="button-group">
        ${this.order.status === 'PENDING_CONFIRMATION' ? html`
          <button class="btn-primary" @click="${() => this.confirmPayment()}">
            Confirm Payment
          </button>
        ` : ''}
        <button class="btn-danger" @click="${() => this.cancelPayment()}">
          Cancel Payment
        </button>
      </div>
    `;
  }

  renderTwintLogo() {
    // Get logo from slot
    const logoElement = this.querySelector('[slot="logo"]');
    const logoSrc = logoElement ? (logoElement.src || logoElement.getAttribute('src')) : null;
    
    if (logoSrc) {
      return html`<img src="${logoSrc}" alt="TWINT" />`;
    }
    
    return html`
      <svg width="120" height="40" viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">
        <rect width="120" height="40" rx="4" fill="#000"/>
        <text x="60" y="28" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">TWINT</text>
      </svg>
    `;
  }

  renderMobileAppSelector() {
    if (!this.order?.pairingToken) {
      return html`
        <div class="error-message">
          ${this.textErrorPairingToken}
        </div>
      `;
    }

    // Get bank images from slot
    const bankImagesSlot = this.querySelector('slot[name="bank-images"]');
    const bankImages = {};
    
    // Get all images from the bank-images slot
    const slottedImages = this.querySelectorAll('[slot="bank-images"]');
    slottedImages.forEach(img => {
      const bankName = img.getAttribute('data-name');
      if (bankName) {
        bankImages[bankName] = img.src || img.getAttribute('src');
      }
    });

    return html`
      <div class="mobile-app-selector">
        <div class="app-selector-title">${this.textChooseApp}</div>
        
        <div class="twint-apps-grid">
          ${this.#twintApps.mainApps.map((app) => {
            const imageUrl = bankImages[app.name] || '';
            
            return html`
              <div class="twint-app-item" @click="${() => this.#openTwintApp(app.scheme)}">
                ${imageUrl ? html`
                  <img 
                    src="${imageUrl}" 
                    alt="${app.name}"
                    class="twint-app-logo"
                  />
                ` : html`
                  <div class="twint-app-logo" style="background: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #666;">
                    ${app.name.replace(' TWINT', '').substring(0, 3)}
                  </div>
                `}
                <span class="twint-app-name">${app.name.replace(' TWINT', '')}</span>
              </div>
            `;
          })}
        </div>

        <div class="other-banks-container">
          <select 
            class="other-banks-select" 
            @change="${(e) => {
              if (e.target.value) {
                this.#openTwintApp(e.target.value);
                e.target.value = '';
              }
            }}"
          >
            <option value="">${this.textOtherBanks}</option>
            ${this.#twintApps.otherBanks.map(bank => html`
              <option value="${bank.scheme}">${bank.name}</option>
            `)}
          </select>
        </div>

        <div class="or-divider">
          <span>or</span>
        </div>

        <div class="pairing-code-section">
          <div class="pairing-code-label">${this.textEnterCode}</div>
          <div class="pairing-code">
            ${this.formatPairingToken(this.order.pairingToken)}
          </div>
        </div>
      </div>
    `;
  }

  // Public API Methods

  /**
   * Start a payment using the element's attributes
   */
  async startPayment() {
    if (!this.reference || !this.amount) {
      throw new Error('Reference and amount attributes are required');
    }

    this.loading = true;
    this.start = true;
    this.status = 'loading';

    try {
      const endpoint = `${this.apiUrl}/orders/start`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reference: this.reference, 
          amount: this.amount, 
          confirmationNeeded: this.confirmationNeeded 
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start payment');
      }

      this.order = data.data;
      this.status = 'active';
      
      // Store encrypted order ID privately if provided in response
      if (data.data.encryptedOrderId) {
        this.#encryptedOrderId = data.data.encryptedOrderId;
      }
      
      this.dispatchEvent(new CustomEvent('payment-started', { 
        detail: this.order,
        bubbles: true,
        composed: true
      }));

      // Check if mobile device and show app selector
      if (this.#isMobileDevice()) {
        // Show app selector interface
        this.#showingAppSelector = true;
        // Don't start polling on mobile
      } else {
        // Start polling automatically for desktop
        this.startPolling();
      }
      
      return this.order;
    } catch (error) {
      this.status = 'failed';
      this.dispatchEvent(new CustomEvent('payment-error', { 
        detail: { error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Confirm a pending payment
   */
  async confirmPayment() {
    if (!this.order) return;

    this.loading = true;

    try {
      const endpoint = `${this.apiUrl}/orders/${this.order.id}/confirm`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: this.order.amount.value })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to confirm payment');
      }

      this.order = data.data;
      this.status = 'success';
      this.stopPolling();
      
      this.dispatchEvent(new CustomEvent('payment-completed', { 
        detail: this.order,
        bubbles: true,
        composed: true
      }));
      
      return this.order;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('payment-error', { 
        detail: { error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Cancel the current payment
   */
  async cancelPayment() {
    if (!this.order) return;

    this.loading = true;

    try {
      const endpoint = `${this.apiUrl}/orders/${this.order.id}/cancel`;
      const response = await fetch(endpoint, {
        method: 'POST'
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to cancel payment');
      }

      this.order = data.data;
      this.status = 'cancelled';
      this.#showingAppSelector = false; // Hide app selector when cancelled
      this.stopPolling();
      
      this.dispatchEvent(new CustomEvent('payment-cancelled', { 
        detail: this.order,
        bubbles: true,
        composed: true
      }));
      
      return this.order;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('payment-error', { 
        detail: { error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Reset the component to initial state
   */
  reset() {
    this.order = null;
    this.status = 'idle';
    this.loading = false;
    this.stopPolling();
  }

  /**
   * Start automatic status polling
   */
  startPolling() {
    if (this.#isPolling || !this.order) return;

    this.#isPolling = true;
    this.#pollingTimer = setInterval(async () => {
      if (!this.order || this.isOrderFinal()) {
        this.stopPolling();
        return;
      }

      try {
        const endpoint = `${this.apiUrl}/orders/${this.order.id}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to check status');
        }

        this.order = data.data;
        
        this.dispatchEvent(new CustomEvent('status-changed', { 
          detail: this.order,
          bubbles: true,
          composed: true
        }));

        this.#handleStatusUpdate(this.order);
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Stop automatic status polling
   */
  stopPolling() {
    if (this.#pollingTimer) {
      clearInterval(this.#pollingTimer);
      this.#pollingTimer = null;
    }
    this.#isPolling = false;
  }

  // Private helper methods

  #isMobileDevice() {
    return /Android|iPhone|iPad/i.test(navigator.userAgent);
  }

  #generateDeepLink(scheme, token) {
    // Use the template from twint-apps.json
    let deepLink = this.#twintApps.deeplinkTemplate;
    
    // Replace placeholders
    deepLink = deepLink.replace('{{scheme}}', scheme);
    deepLink = deepLink.replace('{{token}}', token);
    
    return deepLink;
  }

  #openTwintApp(scheme) {
    if (!this.order?.pairingToken) {
      console.error('No pairing token available');
      return;
    }

    const deepLink = this.#generateDeepLink(scheme, this.order.pairingToken);
    
    // Try to open the app
    window.location.href = deepLink;
    
    // Start polling after attempting to open the app
    setTimeout(() => {
      this.startPolling();
    }, 2000);
  }


  #handleStatusUpdate(order) {
    if (this.isOrderFinal()) {
      this.stopPolling();
      this.#showingAppSelector = false; // Hide app selector when order is final
      
      switch (order.status) {
        case 'SUCCESS':
        case 'CONFIRMED':
          this.status = 'success';
          this.dispatchEvent(new CustomEvent('payment-completed', { 
            detail: order,
            bubbles: true,
            composed: true
          }));
          break;
        case 'FAILED':
        case 'TIMEOUT':
          this.status = 'failed';
          this.dispatchEvent(new CustomEvent('payment-failed', { 
            detail: order,
            bubbles: true,
            composed: true
          }));
          break;
        case 'CANCELLED':
          this.status = 'cancelled';
          this.dispatchEvent(new CustomEvent('payment-cancelled', { 
            detail: order,
            bubbles: true,
            composed: true
          }));
          break;
      }
    } else if (order.status === 'PENDING_CONFIRMATION') {
      this.stopPolling();
      this.#showingAppSelector = false; // Hide app selector when confirmation is needed
    }
  }

  isOrderFinal() {
    if (!this.order) return false;
    const finalStatuses = ['SUCCESS', 'CONFIRMED', 'FAILED', 'CANCELLED', 'TIMEOUT'];
    return finalStatuses.includes(this.order.status);
  }

  isPaymentActive() {
    return this.order && !this.isOrderFinal();
  }

  shouldShowInstructions() {
    return this.order && this.order.status === 'IN_PROGRESS';
  }

  getStatusLabel() {
    if (!this.order) return 'No Payment';
    
    const statusLabels = {
      'IN_PROGRESS': 'In Progress',
      'PENDING_CONFIRMATION': 'Pending Confirmation',
      'SUCCESS': 'Payment Successful',
      'CONFIRMED': 'Confirmed',
      'FAILED': 'Payment Failed',
      'CANCELLED': 'Cancelled',
      'TIMEOUT': 'Timeout'
    };
    
    return statusLabels[this.order.status] || this.order.status;
  }

  getStatusClass() {
    if (!this.order) return '';
    
    switch (this.order.status) {
      case 'SUCCESS':
      case 'CONFIRMED':
        return 'success';
      case 'FAILED':
      case 'CANCELLED':
      case 'TIMEOUT':
        return 'failed';
      case 'PENDING_CONFIRMATION':
        return 'pending';
      default:
        return 'in-progress';
    }
  }

  formatPairingToken(token) {
    if (!token) return '------';
    const str = token.toString();
    if (str.length === 6) {
      return `${str.substring(0, 3)} ${str.substring(3)}`;
    }
    return str;
  }
}

// Register the custom element
customElements.define('pay-with-twint', PayWithTwint);

// Export for use
export default PayWithTwint;
import { LitElement, html, css } from 'lit';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/src/themes.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/card/sp-card.js';
import '@spectrum-web-components/progress-circle/sp-progress-circle.js';
import '@spectrum-web-components/divider/sp-divider.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-checkmark-circle.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-alert.js';
import '@spectrum-web-components/icons-workflow/icons/sp-icon-close-circle.js';

/**
 * PayWithTwint Web Component
 * 
 * A reusable TWINT payment component for integrators.
 * 
 * @element pay-with-twint
 * 
 * @property {string} reference - Payment reference (if provided, auto-starts payment)
 * @property {number} amount - Payment amount in CHF (required with reference)
 * @property {string} apiUrl - Base API URL (default: '/api')
 * @property {string} theme - Theme: 'light' | 'dark' (default: 'light')
 * @property {string} scale - Scale: 'small' | 'medium' | 'large' (default: 'medium')
 * @property {boolean} confirmationNeeded - Whether manual confirmation is required (default: true)
 * @property {boolean} autoPolling - Enable automatic status polling (default: true)
 * @property {number} pollingInterval - Polling interval in ms (default: 2000)
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

  static properties = {
    // Payment properties
    reference: { type: String },
    amount: { type: Number },
    apiUrl: { type: String, attribute: 'api-url' },
    confirmationNeeded: { type: Boolean, attribute: 'confirmation-needed' },
    
    // UI properties
    theme: { type: String },
    scale: { type: String },
    
    // Behavior properties
    autoPolling: { type: Boolean, attribute: 'auto-polling' },
    pollingInterval: { type: Number, attribute: 'polling-interval' },
    
    // Internal state
    order: { type: Object, state: true },
    status: { type: String, state: true },
    loading: { type: Boolean, state: true }
  };

  static styles = css`
    :host {
      display: block;
      font-family: var(--spectrum-alias-body-text-font-family, adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: var(--spectrum-global-dimension-size-300);
    }

    .header {
      text-align: center;
      margin-bottom: var(--spectrum-global-dimension-size-400);
    }

    .twint-logo {
      display: inline-block;
      margin-bottom: var(--spectrum-global-dimension-size-200);
    }

    .twint-logo svg {
      width: 120px;
      height: auto;
    }

    .status-section {
      margin-top: var(--spectrum-global-dimension-size-200);
    }

    .qr-section {
      text-align: center;
      padding: var(--spectrum-global-dimension-size-400);
    }

    .qr-code-container {
      display: inline-block;
      background: white;
      padding: var(--spectrum-global-dimension-size-200);
      border-radius: var(--spectrum-alias-border-radius-regular);
      margin-bottom: var(--spectrum-global-dimension-size-200);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .qr-code-container img {
      display: block;
      width: 250px;
      height: 250px;
    }

    .qr-placeholder {
      width: 250px;
      height: 250px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      color: #999;
      font-size: 14px;
    }

    .pairing-token {
      font-size: var(--spectrum-global-dimension-font-size-500);
      font-weight: var(--spectrum-alias-body-text-font-weight-bold);
      letter-spacing: 0.3em;
      margin-top: var(--spectrum-global-dimension-size-200);
      color: var(--spectrum-global-dimension-color-gray-800);
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--spectrum-global-dimension-size-200);
      margin-top: var(--spectrum-global-dimension-size-300);
    }

    .info-item {
      padding: var(--spectrum-global-dimension-size-150);
      background: var(--spectrum-alias-background-color-gray-100);
      border-radius: var(--spectrum-alias-border-radius-small);
    }

    .info-label {
      font-size: var(--spectrum-global-dimension-font-size-75);
      color: var(--spectrum-alias-text-color-secondary);
      margin-bottom: var(--spectrum-global-dimension-size-50);
    }

    .info-value {
      font-weight: var(--spectrum-alias-body-text-font-weight-bold);
      word-break: break-all;
    }

    .button-group {
      display: flex;
      gap: var(--spectrum-global-dimension-size-100);
      justify-content: center;
      margin-top: var(--spectrum-global-dimension-size-300);
      flex-wrap: wrap;
    }

    .instructions {
      background: var(--spectrum-alias-background-color-blue-100);
      padding: var(--spectrum-global-dimension-size-200);
      border-radius: var(--spectrum-alias-border-radius-regular);
      margin: var(--spectrum-global-dimension-size-300) 0;
    }

    .instructions h3 {
      color: var(--spectrum-alias-text-color-blue);
      margin-bottom: var(--spectrum-global-dimension-size-100);
      font-size: var(--spectrum-global-dimension-font-size-200);
    }

    .instructions ol {
      margin-left: var(--spectrum-global-dimension-size-300);
      color: var(--spectrum-alias-text-color);
      line-height: 1.6;
    }

    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spectrum-global-dimension-size-600);
      text-align: center;
    }

    .loading-text {
      margin-top: var(--spectrum-global-dimension-size-200);
      color: var(--spectrum-alias-text-color-secondary);
    }

    .error-message {
      background: var(--spectrum-semantic-negative-color-background);
      color: var(--spectrum-semantic-negative-color-default);
      padding: var(--spectrum-global-dimension-size-200);
      border-radius: var(--spectrum-alias-border-radius-regular);
      margin-top: var(--spectrum-global-dimension-size-200);
    }

    .success-message {
      background: var(--spectrum-semantic-positive-color-background);
      color: var(--spectrum-semantic-positive-color-default);
      padding: var(--spectrum-global-dimension-size-200);
      border-radius: var(--spectrum-alias-border-radius-regular);
      margin-top: var(--spectrum-global-dimension-size-200);
    }
  `;

  constructor() {
    super();
    
    // Payment properties
    this.reference = '';
    this.amount = null;
    this.apiUrl = '/api';
    this.confirmationNeeded = true;
    
    // UI properties
    this.theme = 'light';
    this.scale = 'medium';
    
    // Behavior properties
    this.autoPolling = true;
    this.pollingInterval = 2000;
    
    // Internal state
    this.order = null;
    this.status = 'idle'; // idle, loading, active, success, failed, cancelled
    this.loading = false;
    
  }

  connectedCallback() {
    super.connectedCallback();
    
    // Auto-start payment if reference and amount are provided
    if (this.reference && this.amount) {
      this.#autoStartPayment();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    super.attributeChangedCallback(name, oldVal, newVal);
    
    // If reference or amount changes and both are set, auto-start payment
    if ((name === 'reference' || name === 'amount') && this.reference && this.amount && !this.order) {
      this.#autoStartPayment();
    }
  }

  render() {
    return html`
      <sp-theme theme="spectrum" scale="${this.scale}" color="${this.theme}">
        <div class="container">
          ${this.renderHeader()}
          ${this.renderContent()}
        </div>
      </sp-theme>
    `;
  }

  renderHeader() {
    return html`
      <div class="header">
        <div class="twint-logo">
          ${this.renderTwintLogo()}
        </div>
        <h2>TWINT Payment</h2>
      </div>
    `;
  }

  renderContent() {
    if (this.loading) {
      return this.renderLoading();
    }

    if (!this.order) {
      return this.renderNoOrder();
    }

    return this.renderPaymentStatus();
  }

  renderLoading() {
    return html`
      <div class="loading-overlay">
        <sp-progress-circle indeterminate size="l"></sp-progress-circle>
        <div class="loading-text">Processing payment...</div>
      </div>
    `;
  }

  renderNoOrder() {
    return html`
      <sp-card>
        <div slot="heading">No Active Payment</div>
        <p>Waiting for payment to be initiated...</p>
        ${this.reference ? html`
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Reference</div>
              <div class="info-value">${this.reference}</div>
            </div>
            ${this.amount ? html`
              <div class="info-item">
                <div class="info-label">Amount</div>
                <div class="info-value">CHF ${this.amount.toFixed(2)}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </sp-card>
    `;
  }

  renderPaymentStatus() {
    const statusIcon = this.getStatusIcon();
    const statusColor = this.getStatusColor();

    return html`
      <sp-card class="status-section">
        <div slot="heading">
          Payment Status
          <span style="float: right; color: ${statusColor}">
            ${statusIcon} ${this.getStatusLabel()}
          </span>
        </div>

        ${this.shouldShowInstructions() ? this.renderPaymentInstructions() : ''}
        ${this.order.qrCode ? this.renderQRCode() : ''}
        
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

        ${this.renderActionButtons()}
      </sp-card>
    `;
  }

  renderPaymentInstructions() {
    return html`
      <div class="instructions">
        <h3>How to Pay</h3>
        <ol>
          <li>Open the TWINT app on your mobile phone</li>
          <li>Scan the QR code below OR enter the pairing token</li>
          <li>Confirm the payment in your TWINT app</li>
        </ol>
      </div>
    `;
  }

  renderQRCode() {
    return html`
      <div class="qr-section">
        <div class="qr-code-container">
          ${this.order.qrCode.startsWith('data:image') ? html`
            <img src="${this.order.qrCode}" alt="TWINT QR Code" />
          ` : html`
            <div class="qr-placeholder">QR Code Loading...</div>
          `}
        </div>
        ${this.order.pairingToken ? html`
          <div>
            <div class="info-label">Pairing Token</div>
            <div class="pairing-token">
              ${this.formatPairingToken(this.order.pairingToken)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderActionButtons() {
    const buttons = [];

    if (this.isPaymentActive()) {
      if (this.order.status === 'PENDING_CONFIRMATION') {
        buttons.push(html`
          <sp-button variant="accent" @click="${() => this.confirmPayment()}">
            Confirm Payment
          </sp-button>
        `);
      }

      buttons.push(html`
        <sp-button variant="secondary" @click="${() => this.checkStatus()}">
          ${this.#isPolling ? html`
            <sp-progress-circle indeterminate size="s"></sp-progress-circle>
            Monitoring...
          ` : 'Check Status'}
        </sp-button>
      `);

      buttons.push(html`
        <sp-button variant="negative" @click="${() => this.cancelPayment()}">
          Cancel Payment
        </sp-button>
      `);
    }

    return buttons.length > 0 ? html`
      <sp-divider></sp-divider>
      <div class="button-group">${buttons}</div>
    ` : '';
  }

  renderTwintLogo() {
    return html`
      <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <rect width="512" height="512" rx="64" fill="#000"/>
        <path fill="#fff" d="M120 200h80v40h-80v80h-40v-80h-40v-40h40v-80h40v80zm140-80h40v200h-40V120zm80 0h40v80h80v40h-80v80h-40v-80h-80v-40h80v-80zm-160 0h40v200h-40V120z"/>
      </svg>
    `;
  }

  // Public API Methods

  /**
   * Start a payment
   * @param {string} reference - Payment reference
   * @param {number} amount - Amount in CHF
   * @param {boolean} confirmationNeeded - Whether manual confirmation is required
   */
  async startPayment(reference, amount, confirmationNeeded = true) {
    if (!reference || !amount) {
      throw new Error('Reference and amount are required');
    }

    this.loading = true;
    this.status = 'loading';

    try {
      const endpoint = `${this.apiUrl}/orders/start`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, amount, confirmationNeeded })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start payment');
      }

      this.order = data.data;
      this.status = 'active';
      
      this.dispatchEvent(new CustomEvent('payment-started', { 
        detail: this.order,
        bubbles: true,
        composed: true
      }));

      if (this.autoPolling) {
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
   * Check payment status
   */
  async checkStatus() {
    if (!this.order) return;

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
      
      return this.order;
    } catch (error) {
      this.dispatchEvent(new CustomEvent('payment-error', { 
        detail: { error: error.message },
        bubbles: true,
        composed: true
      }));
      throw error;
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
        await this.checkStatus();
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, this.pollingInterval);
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

  async #autoStartPayment() {
    // Small delay to ensure component is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await this.startPayment(this.reference, this.amount, this.confirmationNeeded);
    } catch (error) {
      console.error('Auto-start payment failed:', error);
    }
  }

  #handleStatusUpdate(order) {
    if (this.isOrderFinal()) {
      this.stopPolling();
      
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
      'SUCCESS': 'Success',
      'CONFIRMED': 'Confirmed',
      'FAILED': 'Failed',
      'CANCELLED': 'Cancelled',
      'TIMEOUT': 'Timeout'
    };
    
    return statusLabels[this.order.status] || this.order.status;
  }

  getStatusIcon() {
    if (!this.order) return '';
    
    switch (this.order.status) {
      case 'SUCCESS':
      case 'CONFIRMED':
        return html`<sp-icon-checkmark-circle></sp-icon-checkmark-circle>`;
      case 'FAILED':
      case 'CANCELLED':
      case 'TIMEOUT':
        return html`<sp-icon-close-circle></sp-icon-close-circle>`;
      default:
        return html`<sp-icon-alert></sp-icon-alert>`;
    }
  }

  getStatusColor() {
    if (!this.order) return 'var(--spectrum-alias-text-color)';
    
    switch (this.order.status) {
      case 'SUCCESS':
      case 'CONFIRMED':
        return 'var(--spectrum-semantic-positive-color-default)';
      case 'FAILED':
      case 'CANCELLED':
      case 'TIMEOUT':
        return 'var(--spectrum-semantic-negative-color-default)';
      default:
        return 'var(--spectrum-semantic-informative-color-default)';
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
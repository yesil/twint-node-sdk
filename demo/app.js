/**
 * TWINT Payment Demo Application
 * 
 * Demonstrates how to use the pay-with-twint component.
 */

import '../src/components/pay-with-twint.js';

class TwintDemoApp {
  constructor() {
    this.paymentComponent = null;
    this.eventLog = [];
    
    this.initializeUI();
    this.attachEventListeners();
  }

  initializeUI() {
    // Get DOM elements
    this.container = document.getElementById('demo-container');
    this.formSection = document.getElementById('form-section');
    this.componentSection = document.getElementById('component-section');
    this.eventLogContainer = document.getElementById('event-log');
    
    // Form elements
    this.referenceInput = document.getElementById('reference');
    this.amountInput = document.getElementById('amount');
    this.confirmationSelect = document.getElementById('confirmation');
    
    // Control buttons
    this.startBtn = document.getElementById('start-payment');
    this.resetBtn = document.getElementById('reset-demo');
    
    // Theme controls
    this.themeSelect = document.getElementById('theme-select');
    this.scaleSelect = document.getElementById('scale-select');
    
    // Generate initial reference
    this.generateReference();
  }

  attachEventListeners() {
    // Form submission
    this.startBtn.addEventListener('click', () => this.handleStartPayment());
    this.resetBtn.addEventListener('click', () => this.handleReset());
    
    // Theme controls
    this.themeSelect?.addEventListener('change', (e) => {
      if (this.paymentComponent) {
        this.paymentComponent.theme = e.target.value;
        this.logEvent('SETTINGS', `Theme changed to ${e.target.value}`);
      }
    });
    
    this.scaleSelect?.addEventListener('change', (e) => {
      if (this.paymentComponent) {
        this.paymentComponent.scale = e.target.value;
        this.logEvent('SETTINGS', `Scale changed to ${e.target.value}`);
      }
    });
    
    // Auto-format amount
    this.amountInput.addEventListener('blur', () => {
      const value = parseFloat(this.amountInput.value);
      if (!isNaN(value)) {
        this.amountInput.value = value.toFixed(2);
      }
    });
  }

  generateReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.referenceInput.value = `DEMO-${timestamp}-${random}`;
  }

  async handleStartPayment() {
    const reference = this.referenceInput.value.trim();
    const amount = parseFloat(this.amountInput.value);
    const confirmationNeeded = this.confirmationSelect.value === 'true';
    
    if (!reference || isNaN(amount) || amount <= 0) {
      this.showError('Please enter valid payment details');
      return;
    }
    
    this.clearMessages();
    
    this.startWithAutoComponent(reference, amount, confirmationNeeded);
  }

  startWithAutoComponent(reference, amount, confirmationNeeded) {
    this.logEvent('DEMO', 'Starting payment with auto-start component');
    
    // Clear existing component
    this.componentSection.innerHTML = '';
    
    // Create component with attributes for auto-start
    const componentHTML = `
      <pay-with-twint 
        reference="${reference}"
        amount="${amount}"
        api-url="/api"
        theme="${this.themeSelect.value}"
        scale="${this.scaleSelect.value}"
        confirmation-needed="${confirmationNeeded}"
      ></pay-with-twint>
    `;
    
    this.componentSection.innerHTML = componentHTML;
    this.paymentComponent = this.componentSection.querySelector('pay-with-twint');
    
    // Attach event listeners
    this.attachComponentListeners();
    
    this.showComponentSection();
    this.logEvent('COMPONENT', 'Auto-start component created');
  }

  attachComponentListeners() {
    if (!this.paymentComponent) return;
    
    this.paymentComponent.addEventListener('payment-started', (e) => {
      this.logEvent('PAYMENT_STARTED', `Order ID: ${e.detail.id}`);
    });
    
    this.paymentComponent.addEventListener('payment-completed', (e) => {
      this.logEvent('PAYMENT_COMPLETED', `Order ${e.detail.id} completed`);
      this.showSuccess('Payment completed successfully!');
    });
    
    this.paymentComponent.addEventListener('payment-failed', (e) => {
      this.logEvent('PAYMENT_FAILED', `Order ${e.detail.id} failed`);
      this.showError('Payment failed');
    });
    
    this.paymentComponent.addEventListener('payment-cancelled', (e) => {
      this.logEvent('PAYMENT_CANCELLED', `Order ${e.detail.id} cancelled`);
      this.showInfo('Payment cancelled');
    });
    
    this.paymentComponent.addEventListener('status-changed', (e) => {
      this.logEvent('STATUS_CHANGED', `Order ${e.detail.id}: ${e.detail.status}`);
    });
    
    this.paymentComponent.addEventListener('payment-error', (e) => {
      this.logEvent('PAYMENT_ERROR', e.detail.error);
      this.showError(e.detail.error);
    });
  }

  handleReset() {
    this.logEvent('DEMO', 'Resetting demo');
    
    // Reset component
    if (this.paymentComponent) {
      this.paymentComponent.reset();
    }
    
    // Clear component section
    this.componentSection.innerHTML = '';
    this.paymentComponent = null;
    
    // Generate new reference
    this.generateReference();
    this.amountInput.value = '';
    
    // Show form section
    this.showFormSection();
    
    // Clear messages
    this.clearMessages();
  }

  showFormSection() {
    this.formSection.style.display = 'block';
    this.componentSection.style.display = 'none';
  }

  showComponentSection() {
    this.formSection.style.display = 'none';
    this.componentSection.style.display = 'block';
  }

  logEvent(type, message) {
    const entry = {
      time: new Date().toLocaleTimeString(),
      type,
      message
    };
    
    this.eventLog.unshift(entry);
    
    // Keep only last 50 events
    if (this.eventLog.length > 50) {
      this.eventLog = this.eventLog.slice(0, 50);
    }
    
    // Update UI
    this.updateEventLog();
  }

  updateEventLog() {
    if (!this.eventLogContainer) return;
    
    const html = this.eventLog.map(entry => `
      <div class="event-entry">
        <span class="event-time">${entry.time}</span>
        <span class="event-type">${entry.type}</span>
        <span class="event-message">${entry.message}</span>
      </div>
    `).join('');
    
    this.eventLogContainer.innerHTML = html;
  }

  showError(message) {
    this.showMessage(message, 'error');
  }

  showSuccess(message) {
    this.showMessage(message, 'success');
  }

  showInfo(message) {
    this.showMessage(message, 'info');
  }

  showMessage(message, type) {
    const container = document.getElementById('message-container');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    container.appendChild(messageDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }

  clearMessages() {
    const container = document.getElementById('message-container');
    if (container) {
      container.innerHTML = '';
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.twintDemo = new TwintDemoApp();
  });
} else {
  window.twintDemo = new TwintDemoApp();
}

// Export for console access
export default TwintDemoApp;
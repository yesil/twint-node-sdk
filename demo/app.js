/**
 * TWINT Payment Demo Application
 * 
 * Clean demo controller for the pay-with-twint component
 */

// Import the pay-with-twint component
import '../src/pay-with-twint.js';

class TwintDemo {
  constructor() {
    this.component = document.getElementById('payment-component');
    this.eventLog = document.getElementById('event-log');
    this.referenceInput = document.getElementById('reference');
    this.amountInput = document.getElementById('amount');
    this.confirmationSelect = document.getElementById('confirmation');
    
    this.init();
  }
  
  init() {
    this.attachFormHandlers();
    this.attachComponentListeners();
    this.attachDemoComponentListeners();
    this.generateReference();
    this.logEvent('READY', 'Demo application initialized');
  }
  
  attachFormHandlers() {
    // Update component attributes when form fields change
    this.referenceInput?.addEventListener('input', () => {
      if (this.component) {
        this.component.reference = this.referenceInput.value.trim();
      }
    });
    
    this.amountInput?.addEventListener('input', () => {
      const value = parseFloat(this.amountInput.value);
      if (this.component && !isNaN(value)) {
        this.component.amount = value;
      }
    });
    
    this.confirmationSelect?.addEventListener('change', () => {
      if (this.component) {
        this.component.confirmationNeeded = this.confirmationSelect.value === 'true';
      }
    });
    
    // Auto-format amount on blur
    this.amountInput?.addEventListener('blur', () => {
      const value = parseFloat(this.amountInput.value);
      if (!isNaN(value)) {
        this.amountInput.value = value.toFixed(2);
        if (this.component) {
          this.component.amount = value;
        }
      }
    });
  }
  
  attachComponentListeners() {
    if (!this.component) return;
    
    // Payment started
    this.component.addEventListener('payment-started', (e) => {
      this.logEvent('STARTED', `Order ID: ${e.detail.id}`);
    });
    
    // Payment completed
    this.component.addEventListener('payment-completed', (e) => {
      this.logEvent('COMPLETED', `Order ${e.detail.id} completed successfully`);
    });
    
    // Payment failed
    this.component.addEventListener('payment-failed', (e) => {
      this.logEvent('FAILED', `Order ${e.detail.id} failed`);
    });
    
    // Payment cancelled
    this.component.addEventListener('payment-cancelled', (e) => {
      this.logEvent('CANCELLED', `Order ${e.detail.id} was cancelled`);
    });
    
    // Status changed
    this.component.addEventListener('status-changed', (e) => {
      this.logEvent('STATUS', `${e.detail.id}: ${e.detail.status}`);
    });
    
    // Payment error
    this.component.addEventListener('payment-error', (e) => {
      this.logEvent('ERROR', e.detail.error);
    });
  }
  
  attachDemoComponentListeners() {
    // Get all demo components
    const demoComponents = [
      { id: 'example-success', label: 'SUCCESS_DEMO' },
      { id: 'example-cancelled', label: 'CANCEL_DEMO' },
      { id: 'example-german', label: 'GERMAN_DEMO' },
      { id: 'example-dark', label: 'DARK_DEMO' }
    ];
    
    demoComponents.forEach(({ id, label }) => {
      const component = document.getElementById(id);
      if (!component) return;
      
      // Add event listeners for each demo component
      component.addEventListener('payment-started', (e) => {
        this.logEvent(label, `Payment started - Order: ${e.detail?.id || 'N/A'}`);
      });
      
      component.addEventListener('payment-completed', (e) => {
        this.logEvent(label, `Payment completed - Order: ${e.detail?.id || e.detail?.reference || 'N/A'}`);
      });
      
      component.addEventListener('payment-failed', (e) => {
        this.logEvent(label, `Payment failed - Order: ${e.detail?.id || 'N/A'}`);
      });
      
      component.addEventListener('payment-cancelled', (e) => {
        this.logEvent(label, `Payment cancelled - Order: ${e.detail?.id || e.detail?.reference || 'N/A'}`);
      });
      
      component.addEventListener('status-changed', (e) => {
        this.logEvent(label, `Status changed to: ${e.detail?.status || 'N/A'}`);
      });
      
      component.addEventListener('payment-error', (e) => {
        this.logEvent(label, `Error: ${e.detail?.error || 'Unknown error'}`);
      });
    });
    
    // Log when demo components are ready
    this.logEvent('DEMO', 'All demo components initialized with event listeners');
  }
  
  
  generateReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const reference = `DEMO-${timestamp}-${random}`;
    if (this.referenceInput) {
      this.referenceInput.value = reference;
    }
    if (this.component) {
      this.component.reference = reference;
    }
    return reference;
  }
  
  logEvent(type, message) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'event-entry';
    entry.innerHTML = `
      <span class="event-time">${time}</span>
      <span class="event-type">${type}</span>
      <span class="event-message">${message}</span>
    `;
    
    // Insert at the beginning
    this.eventLog.insertBefore(entry, this.eventLog.firstChild);
    
    // Keep only last 20 entries
    while (this.eventLog.children.length > 20) {
      this.eventLog.removeChild(this.eventLog.lastChild);
    }
  }
  
  /**
   * Public method to start a new payment
   */
  startPayment() {
    this.logEvent('API', `Starting payment via API: ${this.component.reference}`);
    return this.component.startPayment();
  }
  
  /**
   * Public method to reset the component
   */
  reset() {
    this.logEvent('API', 'Resetting component');
    this.component.reset();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.twintDemo = new TwintDemo();
    console.log('TWINT Payment Demo loaded. Use window.twintDemo to access the demo.');
  });
} else {
  window.twintDemo = new TwintDemo();
  console.log('TWINT Payment Demo loaded. Use window.twintDemo to access the demo.');
}

// Export for module usage
export default TwintDemo;
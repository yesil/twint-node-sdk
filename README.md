# TWINT Node.js SDK

A Node.js SDK for TWINT payment integration using pure ES modules.

## ⚠️ Disclaimer

**This is an experimental, unofficial SDK that is NOT affiliated with or supported by TWINT AG in any way.** 

This SDK is provided as-is without any guarantees or warranty. Users are responsible for testing and validating all functionality before using in production environments. Use at your own risk.

## Requirements

- Node.js 20.0.0 or higher
- TWINT merchant certificate (.p12 format) with password
- TWINT merchant credentials (Store UUID)

## Installation

```bash
npm install git@github.com:yesil/twint-node-sdk.git#stable
```

## Usage

```javascript
import { 
  TwintClient, 
  Environment, 
  Money, 
  CertificateContainer 
} from 'twint-sdk';

// Initialize
const certificate = await CertificateContainer.fromFile('./certificate.p12', 'password');
const client = new TwintClient({
  certificate,
  storeUuid: 'your-store-uuid',
  cashRegisterId: 'your-cash-register-id', // Required
  environment: Environment.PRODUCTION
});

// Start payment
const order = await client.startOrder({
  reference: 'ORDER-123',
  amount: Money.CHF(99.95),
  confirmationNeeded: true
});

// Monitor status
const status = await client.monitorOrder(order.id);

// Confirm payment
if (status.isPendingConfirmation()) {
  await client.confirmOrder(order.id, order.amount);
}
```

## API Reference

### Client Configuration

```javascript
const client = new TwintClient({
  certificate,                     // Required: Certificate container
  storeUuid: 'your-store-uuid',    // Required: TWINT Store UUID
  cashRegisterId: 'cash-reg-id',   // Required: Cash register ID
  environment: Environment.PRODUCTION, // Required: Environment
  version: 'v8.6'                  // Optional: API version (default: 'v8.6')
});
```

**Note:** The `cashRegisterId` is required for all TWINT operations. This ID identifies your point of sale system to TWINT.

### Client Methods

- `startOrder({ reference, amount, confirmationNeeded })` - Start new payment
- `monitorOrder(orderId)` - Check payment status
- `confirmOrder(orderId, amount)` - Confirm pending payment
- `cancelOrder(orderId)` - Cancel payment
- `reverseOrder({ reversalReference, originalOrderId, amount })` - Refund payment
- `checkSystemStatus()` - Check TWINT availability

### Environments

- `Environment.PRODUCTION` - Live payments

### Value Objects

- `Money.CHF(amount)` - Create amount in Swiss Francs
- `OrderStatus` - Payment status constants

## Web Component

The SDK includes a ready-to-use web component for TWINT payments.

### Basic Usage

```html
<script type="module">
  import 'twint-sdk/src/components/pay-with-twint.js';
</script>

<pay-with-twint 
  reference="ORDER-123"
  amount="99.95"
  api-url="/api">
</pay-with-twint>
```

### Usage Methods

#### Method 1: Programmatic Start (Recommended)

```html
<pay-with-twint 
  id="payment"
  api-url="/twint"
  merchant-name="Your Store">
</pay-with-twint>

<script>
  // Start payment programmatically
  const payment = document.getElementById('payment');
  payment.startPayment('ORDER-123', 99.95, true);
</script>
```

#### Method 2: Auto-start with 'start' Attribute

```html
<!-- Payment starts automatically when component loads -->
<pay-with-twint 
  start
  reference="ORDER-123"
  amount="99.95"
  api-url="/twint"
  merchant-name="Your Store">
</pay-with-twint>
```

#### Method 3: Form Integration

```html
<form id="payment-form">
  <input type="text" id="ref" placeholder="Order Reference">
  <input type="number" id="amt" placeholder="Amount">
  <button type="submit">Pay with TWINT</button>
</form>

<pay-with-twint 
  id="payment"
  api-url="/twint"
  merchant-name="Your Store">
</pay-with-twint>

<script>
  document.getElementById('payment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ref = document.getElementById('ref').value;
    const amt = parseFloat(document.getElementById('amt').value);
    document.getElementById('payment').startPayment(ref, amt, true);
  });
</script>
```

#### Dark Theme Support

```html
<pay-with-twint 
  theme="dark"
  reference="ORDER-123"
  amount="99.95"
  api-url="/twint"
  merchant-name="Your Store">
</pay-with-twint>
```

### Component Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `reference` | string | - | Payment reference |
| `amount` | number | - | Amount in CHF |
| `api-url` | string | `/twint` | API base URL |
| `confirmation-needed` | boolean | `true` | Require confirmation |
| `merchant-name` | string | - | Merchant display name |
| `logo-url` | string | - | Custom logo URL |
| `theme` | string | `light` | Theme mode (`light` or `dark`) |
| `start` | boolean | `false` | Auto-start payment on load |
| `success` | boolean | `false` | Show success state (for testing) |
| `cancelled` | boolean | `false` | Show cancelled state (for testing) |

### Component Events

- `payment-started` - Payment initiated
- `payment-completed` - Payment successful
- `payment-failed` - Payment failed
- `payment-cancelled` - Payment cancelled
- `payment-error` - Error occurred
- `status-changed` - Payment status changed

### Event Handling Example

```javascript
const payment = document.getElementById('payment');

payment.addEventListener('payment-started', (e) => {
  console.log('Payment started:', e.detail);
});

payment.addEventListener('payment-completed', (e) => {
  console.log('Payment completed:', e.detail);
  // Redirect to success page
  window.location.href = '/success';
});

payment.addEventListener('payment-error', (e) => {
  console.error('Payment error:', e.detail.error);
});
```

### Component Methods

- `startPayment(reference, amount, confirmationNeeded)` - Start a new payment
- `confirmPayment()` - Confirm pending payment
- `cancelPayment()` - Cancel current payment
- `reset()` - Reset component to initial state
- `startPolling()` - Start automatic status polling
- `stopPolling()` - Stop status polling

## Error Handling

```javascript
try {
  const order = await client.startOrder({
    reference: 'ORDER-123',
    amount: Money.CHF(99.95)
  });
} catch (error) {
  console.error('Payment failed:', error.message);
}
```

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup.

## License

MIT
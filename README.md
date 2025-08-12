# TWINT Node.js SDK

A Node.js SDK for TWINT payment integration using pure ES modules.

## Requirements

- Node.js 20.0.0 or higher
- TWINT merchant certificate (.p12 format) with password
- TWINT merchant credentials (Store UUID)

## Installation

```bash
npm install git@github.com:yesil/twint-node-sdk.git
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

### Component Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `reference` | string | - | Payment reference |
| `amount` | number | - | Amount in CHF |
| `api-url` | string | `/api` | API base URL |
| `confirmation-needed` | boolean | `true` | Require confirmation |

### Component Events

- `payment-started` - Payment initiated
- `payment-completed` - Payment successful
- `payment-failed` - Payment failed
- `payment-cancelled` - Payment cancelled
- `payment-error` - Error occurred

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
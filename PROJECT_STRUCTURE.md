# TWINT Node.js SDK - Project Structure

## Overview
Pure Node.js ES modules implementation of TWINT payment SDK.

## Directory Structure

```
twint-node-sdk/
│
├── src/                     # Source code (ES modules)
│   ├── certificates/        # Certificate handling
│   │   └── Certificate.js   # PKCS12/PKCS8 certificate support
│   │
│   ├── client/             # Main client
│   │   └── TwintClient.js  # TWINT API client
│   │
│   ├── soap/               # SOAP integration
│   │   └── SoapClient.js   # SOAP client wrapper
│   │
│   ├── values/             # Value objects
│   │   ├── Environment.js  # API environments
│   │   ├── Money.js        # Money handling
│   │   ├── OrderStatus.js  # Order status enum
│   │   ├── Uuid.js         # UUID types
│   │   └── MerchantTransactionReference.js
│   │
│   └── index.js            # Main exports
│
├── test/                   # Tests (Node.js test runner)
│   ├── values/            # Value object tests
│   │   ├── Money.test.js
│   │   └── OrderStatus.test.js
│   └── integration.test.js # Integration tests
│
├── wsdl/                   # TWINT WSDL/XSD definitions
│   ├── v8.5/              # API v8.5
│   │   ├── TWINTMerchantService_v8.5.wsdl
│   │   └── *.xsd          # Schema definitions
│   │
│   └── v8.6/              # API v8.6 (current)
│       ├── TWINTMerchantService_v8.6.wsdl
│       └── *.xsd          # Schema definitions
│
├── dev-server.js          # Express development server
├── package.json           # NPM configuration
├── README.md              # Documentation
└── PROJECT_STRUCTURE.md   # This file
```

## Key Features

- **ES Modules**: Modern import/export syntax
- **Private Fields**: Uses `#` syntax for encapsulation
- **Native Test Runner**: Uses Node.js built-in test runner
- **SOAP/WSDL**: Full TWINT API integration via SOAP

## File Count Summary

- **JavaScript files**: 13
- **WSDL/XSD files**: 11
- **Test files**: 3
- **Configuration**: 6 files

## Requirements

- Node.js 18.0.0+
- ES modules support
- npm dependencies (soap, node-forge, express, etc.)

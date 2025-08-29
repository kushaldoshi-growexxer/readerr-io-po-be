# Purchase Order API

A simple Node.js Express API for creating purchase orders with MySQL database integration, using an existing database structure.

## Project Overview

This project implements a single API endpoint for creating purchase orders with line items, using Node.js, Express, and MySQL. It's designed to work with an existing database (`psi_test_db`) and its tables.

## Features

- **Single API endpoint** to create purchase orders with line items
- **MySQL Integration** with connection pooling and existing database
- **Transaction Support** for data integrity
- **Error Handling** for robustness
- **Database validation** to ensure references are valid

## Database Schema (Existing)

The API works with the following existing tables:
- `purchase_order`: Stores purchase order header information
- `purchase_order_line_items`: Stores line items for each purchase order
- `PSI_Products`: Product catalog
- `crm_classes`: Supplier information
- `crm_vendors`: Vendor information
- `postatus`: Order status tracking

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- MySQL Server (v8.0 or later)
- npm or yarn

### Installation

1. Install dependencies
   ```bash
   npm install
   ```
2. Configure environment variables in `.env` file
   ```
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=order_management
   DB_PORT=3306
   PORT=3000
   ```
3. Start the server
   ```bash
   npm start
   ```

## API Endpoints

### Create Purchase Order

**URL**: `POST /api/purchase-orders`

**Request Body**: JSON object with purchase order details and line items. See `sample-request.json` for example.

**Sample Request**:
```bash
curl -X POST http://localhost:3000/api/purchase-orders \
  -H "Content-Type: application/json" \
  -d @sample-request.json
```

### Database Information (For Debugging)

**URL**: `GET /api/db-info`

Returns information about the database structure, including tables, columns, and row counts.

## Data Structure

### Purchase Order Fields
- Supplier Name (`client_id` - references `crm_classes` table)
- Vendor Name (`vendor_id` - references `crm_vendors` table)
- Destination
- Location Group Id (`location_group`)
- Location Id (`location`)
- Order Date (`po_date`)
- Estimated Delivery Date (`due_date`)
- Currency Code
- Currency Conversion Rate
- Supplier Reference
- Customer SO
- Assignee
- Payment Terms
- Shipping Terms
- Carrier ID
- Carrier Mode ID
- FOB
- Special Instruction
- Sailing Date
- Origin Ship Date
- Load ID

### Line Item Fields
- Product ID (`item_number.value` - references `PSI_Products` table)
- Quantity (`pack_quantity.value`)
- Unit (`case_quantity.value`)
- Unit Price (`unit_price.value`)
- Foreign Unit Price
- Vintage
- UPC
- Weight (`weight.value`)

## Development

For development with automatic server restart on file changes:
```
npm run dev
```

## Tools for Development

- **Postman**: For testing API endpoints
- **MySQL Workbench** or **DBeaver**: For database management

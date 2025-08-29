/**
 * Simple Express server with MySQL database integration
 * Single API endpoint to create a Purchase Order
 */

const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(bodyParser.json({ limit: '50mb' })); // For handling large JSON payloads
app.use(morgan('dev')); // HTTP request logging

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'psi_test_db',  // Use your existing database
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize database schema
const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    try {
      console.log('Creating purchase_orders table...');
      
      // Create psi_purchase_orders table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS psi_purchase_orders (
          unique_order_id VARCHAR(100) PRIMARY KEY,
          client_id VARCHAR(100) COMMENT 'Supplier Name',
          vendor_id VARCHAR(100) COMMENT 'Vendor Name',
          destination VARCHAR(255),
          location_group VARCHAR(100),
          location VARCHAR(100),
          po_date DATE COMMENT 'Order Date',
          due_date DATE COMMENT 'Estimated Delivery Date',
          currency_code VARCHAR(3),
          currency_conversion_rate DECIMAL(10, 6),
          supplier_reference VARCHAR(100),
          customer_so VARCHAR(100),
          assignee VARCHAR(100),
          payment_terms VARCHAR(100),
          shipping_terms VARCHAR(100),
          carrier_id VARCHAR(100),
          carrier_mode_id VARCHAR(100),
          fob VARCHAR(100),
          special_instruction TEXT,
          sailing_date DATE,
          origin_ship_date DATE COMMENT 'Origin Ship Date',
          load_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      console.log('Creating psi_purchase_order_items table...');

      // Create psi_purchase_order_items table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS psi_purchase_order_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          purchase_order_id VARCHAR(100) NOT NULL,
          product_id VARCHAR(100),
          quantity INT,
          unit VARCHAR(50),
          unit_price DECIMAL(10, 2),
          foreign_unit_price DECIMAL(10, 2),
          vintage VARCHAR(50),
          upc VARCHAR(100),
          weight DECIMAL(10, 2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (purchase_order_id) REFERENCES psi_purchase_orders(unique_order_id) ON DELETE CASCADE
        )
      `);
      
      console.log('Database schema created successfully');
    } finally {
      connection.release(); // Always release the connection
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

// Helper function to execute transactions
const executeTransaction = async (callback) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Create Purchase Order API endpoint
app.post('/api/purchase-orders', async (req, res) => {
  try {
    // Check if the request contains the new format (extracted_json)
    if (req.body.extracted_json) {
      console.log("Processing extracted JSON format request with multiple pages");
      
      // Get all pages from the extracted JSON
      const extractedJson = req.body.extracted_json;
      const pageKeys = Object.keys(extractedJson).filter(key => key.startsWith('page_'));
      
      if (pageKeys.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid extracted_json format: no pages found'
        });
      }
      
      console.log(`Found ${pageKeys.length} pages in extracted JSON`);
      
      // Use page_1 as the primary page for header information
      const primaryPage = extractedJson.page_1;
      
      if (!primaryPage) {
        return res.status(400).json({
          success: false,
          message: 'Invalid extracted_json format: missing page_1'
        });
      }
      
      // Collect line items from all pages
      const allLineItems = [];

      for (const pageKey of pageKeys) {
        const page = extractedJson[pageKey];
        if (page?.priority_fields?.line_items && Array.isArray(page.priority_fields.line_items)) {
          allLineItems.push(...page.priority_fields.line_items);
        }
      }
      
      // Map the extracted data to our expected format
      req.body = {
        unique_order_id: primaryPage.priority_fields.po_number?.value || null,
        client_id: primaryPage.priority_fields.customer_details.buyer_info?.value || null,
        vendor_id: primaryPage.priority_fields.vendor_details.vendor_id?.value || null,
        destination: primaryPage.priority_fields.shipping_details.ship_to?.value || null,
        location_group: null,
        location: null,
        order_date: primaryPage.priority_fields.po_date?.value || null,
        estimated_delivery_date: primaryPage.priority_fields.due_date?.value || null,
        currency_code: '',
        currency_conversion_rate: 1.0,
        supplier_reference: null,
        customer_so: null,
        assignee: null,
        payment_terms: null,
        shipping_terms: null,
        carrier_id: null,
        carrier_mode_id: null,
        fob: null,
        special_instruction: primaryPage.priority_fields.shipping_details.shipping_instruction?.value || null,
        sailing_date: null,
        origin_ship_date: primaryPage.priority_fields.shipping_details.ship_date?.value || null,
        load_id: null,
        line_items: allLineItems.map(item => {
          // Create a structured line item
          return {
            product_id: { 
              value: item.item_number?.value|| null 
            },
            quantity: { 
              value: parseInt(item.pack_quantity?.value || 0) 
            },
            unit: { 
              value: item.case_quantity?.value || null 
            },
            unit_price: { 
              value: parseFloat(item.unit_price?.value || 0) 
            },
            foreign_unit_price: null,
            vintage: null,
            upc: null,
            weight: { 
              value: parseFloat(item.weight?.value || 0) 
            }
          };
        }) || []
      };
      
      console.log(`Processed ${req.body.line_items.length} line items from all pages`);
    }

    const { 
      unique_order_id,client_id, vendor_id, destination, location_group, location,
      order_date, estimated_delivery_date, currency_code, 
      currency_conversion_rate, supplier_reference, customer_so,
      assignee, payment_terms, shipping_terms, carrier_id,
      carrier_mode_id, fob, special_instruction, sailing_date,
      origin_ship_date, load_id, line_items 
    } = req.body;

    // console.log(req.body, "Req Body")

    // Validate required fields with more flexibility
    if (!client_id) {
      console.warn('Warning: Supplier Name (client_id) is missing')
    }

    let client_main_id, location_grp_id = null;

    // Lookup of client_id from crm_classes table
    if (client_id) {
      try {
        const [clientExists] = await pool.query(`
          SELECT id, name FROM crm_classes WHERE name LIKE ? ORDER BY name ASC
        `, [`%${client_id}%`]);

        console.log('Client Exists:', clientExists[0].id);

        if (clientExists && clientExists.length > 0) {
          client_main_id = clientExists[0].id;
        } else {
          console.warn(`Supplier with Name ${client_id} not found in crm_classes table`);
          // For extracted documents, we might want to be more flexible
          client_main_id = client_id; // Use the name directly if not found in database
        }
      } catch (error) {
        console.warn('Warning: Could not verify client_id in crm_classes:', error.message);
        client_main_id = client_id; // Use the name directly if verification fails
      }
    }
    
    // Lookup of vendor_id from crm_vendors table
    if (vendor_id) {
      try {
        let [vendorExists] = await pool.query(`
          SELECT * FROM crm_vendors WHERE id = ?
        `, [vendor_id]);

        // let [vendorExists] = await pool.query(`
        //     SELECT v.id, v.name
        //     FROM crm_vendors AS v
        //     LEFT JOIN crm_companies_vendors AS cv ON cv.vendor_id = v.id
        //     LEFT JOIN crm_companies AS c ON c.id = cv.company_id
        //     WHERE v.name LIKE ? 
        //         AND c.status = 1 
        //         AND c.active = 1 
        //         AND c.deleted = 0
        //     ORDER BY v.name
        // `, [`%${vendor_id}%`]);

        console.log('Vendor Exists:', vendorExists[0]);

        if (vendorExists && vendorExists.length === 0) {
          console.warn(`Vendor with ID ${vendor_id} not found in crm_vendors table, but continuing anyway`);
          // For documents from OCR, we'll continue anyway
        }
      } catch (error) {
        console.warn('Warning: Could not verify vendor_id in crm_vendors:', error.message);
        // Continue with the insertion even if verification fails
      }
    }

    // Lookup of location group from PSI_Location_Groups
    if (location_group) {
        try {
        const [locationGroupExists] = await pool.query(
            `SELECT DISTINCT TRIM(name) AS name, TRIM(name) AS id, id AS uid
             FROM PSI_Location_Groups
             ${location_group ? 'WHERE name LIKE ? ' : ''}
             ORDER BY name ASC`,
            [...(location_group ? [`%${location_group}%`] : [])]
        );
        location_grp_id = locationGroupExists[0]?.id || null;

          if (locationGroupExists && locationGroupExists.length > 0) {
            console.log('Location Group Exists:', locationGroupExists[0]);
          } else {
            console.warn(`Location Group with ID ${location_group} not found in PSI_Location_Groups table`);
          }
        } catch (error) {
          console.warn('Warning: Could not verify location_group in PSI_Location_Groups:', error.message);
        }
    }

    // Lookup of locations from PSI_Locations with PSI_Location_Groups id
    if (location) {
        try {
            const [locationExists] = await pool.query(
                `SELECT location AS id, location AS name FROM PSI_Locations WHERE location_group LIKE ? AND is_active=1${ location ? ' AND location LIKE ?' : '' } ORDER BY location`,
                [`%${location_group}%`, ...(location ? [`%${location}%`] : [])]
            );

            if (locationExists && locationExists.length > 0) {
                console.log('Location Exists:', locationExists[0]);
            } else {
                console.warn(`Location with ID ${location} not found in PSI_Locations table`);
            }
        } catch (error) {
            console.warn('Warning: Could not verify location in PSI_Locations:', error.message);
        }
    }

    // Lookup of destination from st_destinations
    if (destination) {
        try {
            const [destinations] = await pool.query(
                "SELECT id, name FROM st_destinations WHERE name LIKE ? ORDER BY sort_order",
                [`%${destination}%`]
            );

            console.log('Destination Lookup Result:', destinations);
        } catch (error) {
            console.warn('Warning: Could not verify destination in st_destinations:', error.message);
        }
    }

    const result = await executeTransaction(async (connection) => {
      // Parse dates from different formats
      const parseDate = (dateStr) => {
        if (!dateStr) return null;
        
        // Special case for text values like "ASAP"
        if (typeof dateStr === 'string' && dateStr.toUpperCase() === 'ASAP') {
        //   console.log('Date value is "ASAP", setting to current date');
          const today = new Date();
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        
        try {
          // Try to parse MM/DD/YYYY format
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            // Check if we have 3 parts and if the year part is length 4
            if (parts.length === 3) {
              const [month, day, year] = parts;
              return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
          }
          
          // Try to parse as a date object if not already in expected format
          if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            }
          }
          
          // If already in YYYY-MM-DD format or other format, return as is
          return dateStr;
        } catch (error) {
          console.warn(`Warning: Could not parse date "${dateStr}":`, error.message);
          return null;
        }
      };
      
      // Parse dates
      const parsedOrderDate = parseDate(order_date);
      const parsedDeliveryDate = parseDate(estimated_delivery_date);
      const parsedSailingDate = parseDate(sailing_date);
      const parsedShipDate = parseDate(origin_ship_date);
      
      // Insert purchase order into your existing table structure
      const [orderResult] = await connection.query(`
        INSERT INTO psi_purchase_orders (
          unique_order_id, client_id, vendor_id, destination, location_group, location,
          po_date, due_date, currency_code, currency_conversion_rate, 
          supplier_reference, customer_so, assignee, payment_terms, 
          shipping_terms, carrier_id, carrier_mode_id, fob, 
          special_instruction, sailing_date, origin_ship_date, load_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        unique_order_id, client_main_id, vendor_id, destination, location_group, location,
        parsedOrderDate, parsedDeliveryDate, currency_code,
        currency_conversion_rate, supplier_reference, customer_so,
        assignee, payment_terms, shipping_terms, carrier_id,
        carrier_mode_id, fob, special_instruction, parsedSailingDate,
        parsedShipDate, load_id, Date.now(), Date.now()
      ]);

      const orderId = orderResult.insertId;

       // Insert line items if they exist
      if (line_items && line_items.length > 0) {
        for (const item of line_items) {
            // Verify if product exists in PSI_Products
            const [products] = await connection.query(
                `SELECT 
                    product_id AS id,
                    \`desc\`,
                    price,
                    UOM    AS uom,
                    product_id AS value,
                    CONCAT(\`desc\`, ' - (', product_id, ')') AS name
                FROM PSI_Products 
                WHERE product_id = ?`, 
                [item.product_id?.value]
            );
            console.log('Product Lookup Result:', products);

          const productId = item.product_id?.value;
          
          // Safe extraction of values with fallbacks
          const quantity = parseFloat(item.quantity?.value) || 0;
          const unit = typeof item.unit?.value === 'string' ? item.unit.value : (item.size?.value || 'EACH');

          const unitPrice = parseFloat(item.unit_price?.value) || 0;          
          // Remove currency symbol if present
          const cleanUnitPrice = typeof unitPrice === 'string' ?  parseFloat(unitPrice.replace(/[$€£¥]/g, '')) : unitPrice;

          const weight = parseFloat(item.weight?.value) || null;

          console.log(`Inserting line item: ${productId}, quantity: ${quantity}`);

          await connection.query(`
            INSERT INTO psi_purchase_order_items (
              purchase_order_id, product_id, quantity, unit, unit_price,
              foreign_unit_price, vintage, upc, weight,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, [
            unique_order_id,
            productId,                    // product_id
            quantity,                     // quantity
            unit,                         // unit
            cleanUnitPrice,               // unit_price
            item.foreign_unit_price || null,
            item.vintage || null,
            item.upc || null,
            weight
          ]);
        }
      }

      // Get the created purchase order with its items
      const [order] = await connection.query(`
        SELECT po.*, c.name AS supplier_name, v.name AS vendor_name
        FROM psi_purchase_orders po
        LEFT JOIN crm_classes c ON po.client_id = c.id
        LEFT JOIN crm_vendors v ON po.vendor_id = v.id
        WHERE po.unique_order_id = ?
      `, [orderId]);

      // Get the line items for the created purchase order
      const [items] = await connection.query(`
        SELECT poli.*, p.desc AS product_name
        FROM psi_purchase_order_items poli
        LEFT JOIN PSI_Products p ON poli.product_id = p.product_id
        WHERE poli.purchase_order_id = ?
      `, [orderId]);

      return {
        order: order[0],
        items: items
      };
    });

    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      data: result
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase order',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Purchase Order API is running' });
});

// Database info endpoint for debugging
app.get('/api/db-info', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Get tables in the database
      const [tables] = await connection.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '${process.env.DB_NAME || 'psi_test_db'}'
      `);
      
      // Get schema information
      const tablesInfo = {};
      
      for (const table of tables) {
        const tableName = table.TABLE_NAME || table.table_name;
        
        // Get columns for each table
        const [columns] = await connection.query(`
          SELECT 
            COLUMN_NAME as name, 
            DATA_TYPE as type,
            IS_NULLABLE as nullable,
            COLUMN_KEY as key
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE 
            TABLE_SCHEMA = '${process.env.DB_NAME || 'psi_test_db'}' AND 
            TABLE_NAME = ?
        `, [tableName]);
        
        // Count rows in each table (limit to avoid performance issues)
        const [count] = await connection.query(`
          SELECT COUNT(*) as count FROM \`${tableName}\` LIMIT 10000
        `);
        
        tablesInfo[tableName] = {
          columns: columns,
          rowCount: count[0].count
        };
      }
      
      res.json({
        database: process.env.DB_NAME || 'psi_test_db',
        tables: tables.map(t => t.TABLE_NAME || t.table_name),
        schema: tablesInfo
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error getting database info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get database info',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Initialize database schema
    await initDatabase();
    
    // Start listening for requests
    app.listen(PORT, () => {
      console.log(`
===========================================================
 Purchase Order API Server Running on Port: ${PORT}
 Environment: ${process.env.NODE_ENV || 'development'}
 Database: ${process.env.DB_NAME || 'psi_test_db'} (existing)
===========================================================
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

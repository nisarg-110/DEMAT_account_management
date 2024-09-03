// Import required modules
const { pool } = require("./dbConfig");
const bcrypt = require('bcrypt');
const dematgen = require('./utils/dematgen')

const getUserByDematId = async (demat_id) => {
  try {
    const queryText = `
      SELECT *
      FROM users u
      JOIN demat d ON u.pan_number = d.pan_number
      JOIN demat_details dd ON d.demat_id = dd.demat_id
      JOIN demat_broker db ON d.demat_id = db.demat_id
      JOIN broker b ON db.broker_name = b.broker_name
      WHERE d.demat_id = $1
    `;
    const result = await pool.query(queryText, [demat_id]);
    console.log(result.rows[0]);
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Return the user data and broker details
    const data = result.rows[0];
    const balance = await pool.query('SELECT balance FROM balance WHERE account_number = $1', [data.account_number]);
    data.balance = balance.rows[0].balance;

    const phone_number = await pool.query('SELECT phone_number FROM broker_phoneno WHERE broker_id = $1', [data.broker_id]);
    data.phone_number = phone_number.rows[0].phone_number;
    return data;
  } catch (err) {
    throw err;
  }
};

const getBrokerDetails = async (broker_id) => {
  try {
    const queryText = `
      SELECT *
      FROM broker b
      JOIN broker_account ba ON b.broker_id = ba.broker_id
      JOIN balance bl ON ba.account_number = bl.account_number
      WHERE b.broker_id = $1
    `;
    const result = await pool.query(queryText, [broker_id]);

    if (result.rows.length === 0) {
      throw new Error('Broker not found');
    }


    // Return the broker data and account details
    const data = result.rows[0];
    const phone_number = await pool.query('SELECT phone_number FROM broker_phoneno WHERE broker_id = $1', [broker_id]);
    data.phone_number = phone_number.rows[0].phone_number;
    return data;
  } catch (err) {
    throw err;
  }
};

const approvedStocks = async (symbol, brokerId) => {
  try {
    // Get the list of all demat IDs and their respective quantities for the given symbol
    const { rows: brokerBuyRows } = await pool.query(`
      SELECT demat_id, quantity, exchange_name
      FROM broker_buy
      WHERE symbol = $1
    `, [symbol]);

    const totalQuantity = await pool.query(
      `
      SELECT SUM(quantity) AS total_quantity from broker_buy WHERE symbol = $1
      `, [symbol]
    )
    
    const total_quantity = (totalQuantity.rows[0].total_quantity)

      // Call the stored procedure to update the quantity of shares in the companies table
      await pool.query(`
      CALL process_trade($1, $2, $3)
    `, [symbol, total_quantity, brokerId]);

    // For each demat ID, calculate the amount to be deducted from the balance
    for (const { demat_id, quantity, exchange_name } of brokerBuyRows) {

      // Get the commission for the broker from the broker_account table
    const { rows: brokerAccountRows } = await pool.query(`
    SELECT commission
    FROM broker_account
    WHERE broker_id = $1
  `, [brokerId]);
  const brokerCommissionPercent = brokerAccountRows[0].commission;

  console.log('Broker Commission: ', brokerCommissionPercent);
  console.log('Broker ID: ', brokerId);
  console.log("brokerBuyRows: ", brokerBuyRows);
  // Get the price of the symbol from the companies table
  const { rows: companyRows } = await pool.query(`
    SELECT price
    FROM companies
    WHERE symbol = $1
  `, [symbol]);
  const price = companyRows[0].price;

  // Calculate the amount to be deducted from the demat account balance
  const amount = price * quantity  ;
  const commissionAmount = amount * (brokerCommissionPercent / 100);
  const totalAmount = amount + commissionAmount;

      console.log('Demat ID: ', demat_id);
      console.log('Symbol: ', symbol);
      console.log('Quantity: ', quantity);
      console.log('Amount: ', amount);
      console.log('Commission: ', commissionAmount);
      console.log('Total: ', totalAmount);


      // Deduct the amount from the demat account balance
      await pool.query(`
      UPDATE balance
      SET balance = balance - $1
      WHERE account_number IN (
        SELECT account_number
        FROM demat_details
        WHERE demat_id = $2
      )
      `, [totalAmount, demat_id]);
      
      // Insert the transaction into the share_purchased table
      await pool.query(`
      INSERT INTO share_purchased (demat_id, symbol, exchange_name, no_of_shares)
      VALUES ($1, $2, $3, $4)
      `, [demat_id, symbol, exchange_name, quantity]);
    }

  } catch (err) {
    throw err;
  }
};

const sellingStocks = async (symbol, brokerId) => {
  try {
    // Get the list of all demat IDs and their respective quantities for the given symbol
    const { rows: brokerBuyRows } = await pool.query(`
      SELECT demat_id, quantity, exchange_name
      FROM broker_sell
      WHERE symbol = $1
    `, [symbol]);

    // Get the commission for the broker from the broker_account table
    const { rows: brokerAccountRows } = await pool.query(`
      SELECT commission
      FROM broker_account
      WHERE broker_id = $1
    `, [brokerId]);
    const brokerCommissionPercent = brokerAccountRows[0].commission;

    console.log('Broker Commission: ', brokerCommissionPercent);
    console.log('Broker ID: ', brokerId);
    console.log("brokerBuyRows: ", brokerBuyRows);
    // For each demat ID, calculate the amount to be deducted from the balance
    for (const { demat_id, quantity, exchange_name } of brokerBuyRows) {
      // Get the price of the symbol from the companies table
      const { rows: companyRows } = await pool.query(`
        SELECT price
        FROM companies
        WHERE symbol = $1
      `, [symbol]);
      const price = companyRows[0].price;

      // Calculate the amount to be deducted from the demat account balance
      const amount = price * quantity;
      const commissionAmount = amount * (brokerCommissionPercent / 100);
      const totalAmount = amount - commissionAmount;

      console.log('Demat ID: ', demat_id);
      console.log('Symbol: ', symbol);
      console.log('Quantity: ', quantity);
      console.log('Amount: ', amount);
      console.log('Commission: ', commissionAmount);
      console.log('Total: ', totalAmount);


      // Deduct the amount from the demat account balance
      await pool.query(`
      UPDATE balance
      SET balance = balance + $1
      WHERE account_number IN (
        SELECT account_number
        FROM demat_details
        WHERE demat_id = $2
      )
      `, [totalAmount, demat_id]);

      // Increment the broker's account balance by the commission amount
      await pool.query(`
        UPDATE balance
        SET balance = balance + $1
        WHERE account_number IN (
          SELECT account_number
          FROM broker_account
          WHERE broker_id = $2
        )
      `, [commissionAmount, brokerId]);

      // Call the stored procedure to update the quantity of shares in the companies table
      await pool.query(`
        CALL increment_company_quantity($1, $2)
      `, [symbol, quantity]);

      // Update the quantity of shares in the share_purchased table
      await pool.query(`
        UPDATE share_purchased
        SET no_of_shares = no_of_shares - $1
        WHERE symbol = $2 AND demat_id = $3 AND exchange_name = $4
      `, [quantity, symbol, demat_id, exchange_name]);

      //Delete the row from broker_sell table
      await pool.query(`
      DELETE FROM broker_sell
      WHERE demat_id = $1 AND symbol = $2 AND exchange_name = $3
      `, [demat_id, symbol, exchange_name]);
    }
  } catch (err) {
    throw err;
  }
}


const getTraderByPanNumber = async (pan_number) => {
  try {
    // Query to retrieve user data from the users table
    const userQuery = 'SELECT * FROM users WHERE pan_number = $1';
    const userValues = [pan_number];
    const userResult = await pool.query(userQuery, userValues);

    // Query to retrieve demat data from the demat table
    const dematQuery = 'SELECT * FROM demat WHERE pan_number = $1';
    const dematValues = [pan_number];
    const dematResult = await pool.query(dematQuery, dematValues);

    // Combine the user and demat data
    const data = {
      first_name: userResult.rows[0].first_name,
      last_name: userResult.rows[0].last_name,
      pan_number: userResult.rows[0].pan_number,
      pincode: userResult.rows[0].pincode,
      demat_id: dematResult.rows[0].demat_id
    };

    return data;
  } catch (err) {
    throw err;
  }
};

const getBrokerNames = async () => {
  try {
    const queryResult = await pool.query('SELECT broker_name FROM broker');
    const brokerNames = queryResult.rows.map(row => row.broker_name);
    return brokerNames;
  } catch (err) {
    throw err;
  }
}

const getExchangeNamesFromBrokerId = async (broker_id) => {
  try {
    const queryResult = await pool.query('SELECT exchange_name FROM broker_exchange WHERE broker_id = $1', [broker_id]);
    return queryResult.rows;
  } catch (err) {
    throw err;
  }
}

const getTotalCompanyStocks = async (company_name) => {
  const query = `
  select no_of_shares from companies c where c.company_name = $1;
  `;

  const result = await pool.query(query, [company_name]);
  return result.rows[0].no_of_shares;
}

const getExchangeNames = async () => {
  try {
    const queryResult = await pool.query('SELECT exchange_name FROM exchanges');
    return queryResult.rows;
  } catch (err) {
    throw err;
  }
}


const registerTrader = async (data) => {
  try {
    // Hash the user's password before storing it in the database
    const hashedpassword = await bcrypt.hash(data.password, 10);

    // Insert bank data into the Banks table
    const insertBankQuery = 'INSERT INTO Banks (bank_name, ifsc_code) VALUES ($1, $2) ON CONFLICT (ifsc_code) DO NOTHING';
    const insertBankValues = [data.bank_name, data.ifsc_code]
    await pool.query(insertBankQuery, insertBankValues);


    // Insert the user's registration data into the users table
    const insertUserQuery = 'INSERT INTO users (pan_number, first_name, last_name, ifsc_code, pincode, password) VALUES ($1, $2, $3, $4, $5, $6)';
    const insertUserValues = [data.pan_number, data.first_name, data.last_name, data.ifsc_code, data.pincode, hashedpassword];
    await pool.query(insertUserQuery, insertUserValues);

    // Insert phone number data into the phone_number table
    const insertPhoneQuery = 'INSERT INTO phone_number (pan_number, phone_number) VALUES ($1, $2)';
    const insertPhoneValues = [data.pan_number, data.phone_number];
    await pool.query(insertPhoneQuery, insertPhoneValues);


    // Insert demat data into the Demat table
    const dematID = dematgen.generateDematID();
    const insertDematQuery = 'INSERT INTO Demat (demat_id, pan_number) VALUES ($1, $2)';
    const insertDematValues = [dematID, data.pan_number];
    await pool.query(insertDematQuery, insertDematValues);

    // Insert demat details into the Demat_details table
    const insertDematDetailsQuery = 'INSERT INTO Demat_details (demat_id, account_number) VALUES ($1, $2)';
    const insertDematDetailsValues = [dematID, data.account_number];
    await pool.query(insertDematDetailsQuery, insertDematDetailsValues);

    const insertIntoBalance = 'INSERT INTO balance (account_number) VALUES ($1)';
    const insertIntoBalanceValues = [data.account_number]
    await pool.query(insertIntoBalance, insertIntoBalanceValues)

    const insertIntoDemat_Broker = 'INSERT INTO Demat_Broker(Broker_name, demat_id) VALUES ($1, $2)';
    const insertIntoDemat_BrokerValues = [data.broker, dematID];
    await pool.query(insertIntoDemat_Broker, insertIntoDemat_BrokerValues)
    // Return the Demat ID to be displayed to the user
    data.demat_id = dematID;
    return data;
  } catch (err) {
    throw err;
  }
};


const registerCompany = async (data) => {
  try {
    // Insert company data into the Companies table
    const insertCompanyQuery = 'INSERT INTO Companies (Symbol, Company_name) VALUES ($1, $2)';
    const insertCompanyValues = [data.company_symbol, data.company_name];
    await pool.query(insertCompanyQuery, insertCompanyValues);

    // Insert company info data into the Company_info table
    const insertCompanyInfoQuery = 'INSERT INTO Company_info (GST_Number, password, Symbol) VALUES ($1, $2, $3)';
    const insertCompanyInfoValues = [data.gst_number, data.password, data.company_symbol];
    await pool.query(insertCompanyInfoQuery, insertCompanyInfoValues);

    // Return the company symbol to be displayed to the user
    return data;
  } catch (err) {
    throw err;
  }
};


const registerBroker = async (data) => {
  try {

    // Insert company data into the Companies table
    const insertBrokerQuery = 'INSERT INTO Broker (Broker_name, Password, Broker_ID) VALUES ($1, $2, $3)';
    const insertBrokerValues = [data.broker_name, data.password, data.broker_id];
    await pool.query(insertBrokerQuery, insertBrokerValues);

    // Insert broker info data into the Broker_Phoneno table
    const insertBrokerPhoneQuery = 'INSERT INTO Broker_Phoneno (Broker_ID, Phone_Number) VALUES ($1, $2)';
    const insertBrokerPhoneValues = [data.broker_id, data.phone_number]
    await pool.query(insertBrokerPhoneQuery, insertBrokerPhoneValues);

    // Insert exchanges data for the broker into the Broker_Exchange table
    for (let i = 0; i < data.exchanges.length; i++) {
      const insertBrokerExchangeQuery = 'INSERT INTO Broker_Exchange (Broker_ID, Exchange_name) VALUES ($1, $2)';
      const insertBrokerExchangeValues = [data.broker_id, data.exchanges[i]]
      await pool.query(insertBrokerExchangeQuery, insertBrokerExchangeValues);
    }

    const InsrtIntoBroker_Account = 'Insert into broker_account(broker_id,account_number) VALUES ($1,$2)';
    const InsrtIntoBroker_AccountValues = [data.broker_id, data.account_number]
    await pool.query(InsrtIntoBroker_Account, InsrtIntoBroker_AccountValues);
    // Insert broker account balance into the balance table

    const insertIntoBalance = 'INSERT INTO balance (account_number) VALUES ($1)';
    const insertIntoBalanceValues = [data.account_number]
    await pool.query(insertIntoBalance, insertIntoBalanceValues)
  } catch (err) {
    throw err;
  }
};

const getCompanyByGstNumber = async (gstNumber) => {
  try {
    const queryText = `
      SELECT ci.gst_number, c.symbol, c.company_name, c.price, ci.password, c.no_of_shares
      FROM company_info ci
      JOIN companies c ON ci.symbol = c.symbol
      WHERE ci.gst_number = $1
    `;
    const queryValues = [gstNumber];
    const { rows } = await pool.query(queryText, queryValues);
    return rows[0];
  } catch (err) {
    throw err;
  }
};

const getMainTableData = async (broker_name) => {
  try {
    const query = `
    SELECT broker_buy.symbol, SUM(broker_buy.quantity) as total_quantity, companies.price
    FROM broker_buy
    JOIN demat_broker ON broker_buy.demat_id = demat_broker.demat_id
    JOIN broker ON demat_broker.broker_name = broker.broker_name
    JOIN companies ON broker_buy.symbol = companies.symbol
    WHERE broker.broker_name = $1
    GROUP BY broker_buy.symbol, companies.price;
    `;
    const query_1= `
    SELECT broker_sell.symbol, SUM(broker_sell.quantity) as total_quantity, companies.price
    FROM broker_sell
    JOIN demat_broker ON broker_sell.demat_id = demat_broker.demat_id
    JOIN broker ON demat_broker.broker_name = broker.broker_name
    JOIN companies ON broker_sell.symbol = companies.symbol
    WHERE broker.broker_name = $1
    GROUP BY broker_sell.symbol, companies.price;
    `;
    const result = await pool.query(query, [broker_name]);
    const result_1 = await pool.query(query_1, [broker_name]);
    return {
      "buyer" : result.rows, "seller":result_1.rows
    };
  } catch (err) {
    throw err;
  }
};


const getBrokerById = async (brokerId) => {
  try {
    const queryResult = await pool.query('SELECT * FROM broker WHERE broker_id = $1', [brokerId]);
    return queryResult.rows[0];
  } catch (err) {
    throw err;
  }
}

const getSharePurchased = async (demat_id) => {
  try {
    const query = `
      SELECT sp.symbol, sp.exchange_name, sp.no_of_shares, c.price, c.company_name
      FROM share_purchased sp
      JOIN companies c ON sp.symbol = c.symbol
      WHERE sp.demat_id = $1
    `;
    const { rows } = await pool.query(query, [demat_id]);
    return rows;
  } catch (err) {
    throw err;
  }
};


const eventAddBuyStocks = async (data) => {
  try {
    const query = 'INSERT INTO broker_buy (demat_id, symbol, exchange_name, quantity) VALUES ($1, $2, $3, $4)';
    const values = [data.user.demat_id, data.symbol, data.exchange, data.quantity];
    const result = await pool.query(query, values);

    return result.rowCount;
  } catch (err) {
    throw err;
  }
};

const eventAddSellStocks = async (data) => {
  try {
    // Check if there is already a request in the broker_sell table for the same demat_id, symbol, and exchange_name
    const checkQuery = 'SELECT * FROM broker_sell WHERE demat_id = $1 AND symbol = $2 AND exchange_name = $3';
    const checkValues = [data.user.demat_id, data.symbol, data.exchange_name];
    const { rows } = await pool.query(checkQuery, checkValues);
    
    if (rows.length > 0) {
      // A request already exists, so return false
      return false;
    }
    
    // Insert the request into the broker_sell table
    const insertQuery = 'INSERT INTO broker_sell (demat_id, symbol, exchange_name, quantity) VALUES ($1, $2, $3, $4)';
    const insertValues = [data.user.demat_id, data.symbol, data.exchange_name, data.quantity];
    await pool.query(insertQuery, insertValues);
    
    // Return true to indicate that the request was inserted successfully
    return true;
    
  } catch (err) {
    throw err;
  }
};



const getbalance = async (data) => {
  try {
    const balance = await pool.query('select balance from balance where account_number = $1', [data.account_number]);
    return balance.rows[0].balance;
  }
  catch (err) {
    throw err;
  }
};

const getCompaniesData = async () => {
  try {
    const query = 'SELECT * FROM companies';
    const { rows } = await pool.query(query);
    return rows;
  } catch (error) {
    throw error;
  }
};

const getBrokerSellDetailsFromName = async (broker_name) => {
  try {
  const query = 'SELECT * FROM broker_sell JOIN demat_broker ON broker_sell.demat_id = demat_broker.demat_id WHERE broker_name = $1';
  const values = [broker_name];
  const result = await pool.query(query, values);
  
  const data = {};
  result.rows.forEach(row => {
    const exchangeName = row.exchange_name;
    const rowWithoutExchangeName = { ...row };
    delete rowWithoutExchangeName.exchange_name;
    if (data[exchangeName]) {
      data[exchangeName].push(rowWithoutExchangeName);
    } else {
      data[exchangeName] = [rowWithoutExchangeName];
    }
  });
  
  return data;
  } catch (err) {
  throw err;
  }
  };

const getBrokerBuyDetailsFromName = async (broker_name) => {
  try {
    const query = 'SELECT * FROM broker_buy JOIN demat_broker ON broker_buy.demat_id = demat_broker.demat_id WHERE broker_name = $1';
    const values = [broker_name];
    const result = await pool.query(query, values);

    const data = {};
    result.rows.forEach(row => {
      const exchangeName = row.exchange_name;
      const rowWithoutExchangeName = { ...row };
      delete rowWithoutExchangeName.exchange_name;
      if (data[exchangeName]) {
        data[exchangeName].push(rowWithoutExchangeName);
      } else {
        data[exchangeName] = [rowWithoutExchangeName];
      }
    });

    return data;
  } catch (err) {
    throw err;
  }
};


const getPriceFromSymbol = async (symbol) => {
  const result = await pool.query("SELECT price FROM companies WHERE symbol = $1", [symbol]);
  return result.rows[0].price;
}



const resetDatabase = async () => {
  try {
    const tables = [
      'phone_number',
      'share_purchased',
      'broker_buy',
      'broker_sell',
      // 'broker_exchange',
      'company_info',
      'companies',
      'demat_broker',
      'demat_details',
      // 'broker_phoneno',
      // 'broker_account',
      'balance',
      // 'broker',
      'demat',
      'users',
      'banks',
      // 'exchanges'
    ];

    for (let i = 0; i < tables.length; i++) {
      const query = `DELETE FROM ${tables[i]}`;
      await pool.query(query);
    }

    console.log('All data has been deleted from the database');
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const printFunctionsProceduresTriggers = async () => {
  try {
    // Get the list of all functions in the database
    const { rows: functionRows } = await pool.query(`
      SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments, p.prorettype::regtype AS return_type
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
    `);

    console.log('Functions:');
    console.log('----------');
    functionRows.forEach(row => {
      console.log(`${row.schema_name}.${row.function_name}(${row.arguments}) RETURNS ${row.return_type}`);
    });
    console.log('');

    // Get the list of all procedures in the database
    const { rows: procedureRows } = await pool.query(`
      SELECT n.nspname AS schema_name, p.proname AS procedure_name, pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.prorettype = 'pg_catalog.void'::regtype
    `);

    console.log('Procedures:');
    console.log('-----------');
    procedureRows.forEach(row => {
      console.log(`${row.schema_name}.${row.procedure_name}(${row.arguments})`);
    });
    console.log('');

    // Get the list of all triggers in the database
    const { rows: triggerRows } = await pool.query(`
      SELECT tgname AS name, tgtype AS type, tgrelid::regclass AS table_name, tgdeferrable AS deferrable, tginitdeferred AS initially_deferred
      FROM pg_trigger
      WHERE tgconstraint = false
    `);

    console.log('Triggers:');
    console.log('---------');
    triggerRows.forEach(row => {
      console.log(`${row.name} ${row.type} ON ${row.table_name} DEFERRABLE=${row.deferrable} INITIALLY DEFERRED=${row.initially_deferred}`);
    });
    console.log('');
  } catch (err) {
    throw err;
  }
};



// Export the functions for use in other modules
module.exports = {
  getBrokerDetails,
  getCompaniesData,
  registerTrader,
  registerBroker,
  resetDatabase,
  registerCompany,
  getTraderByPanNumber,
  getUserByDematId,
  getCompanyByGstNumber,
  getbalance,
  getBrokerNames,
  getExchangeNames,
  getBrokerById,
  eventAddBuyStocks,
  getExchangeNamesFromBrokerId,
  getBrokerBuyDetailsFromName,
  getPriceFromSymbol,
  getMainTableData,
  approvedStocks, 
  eventAddSellStocks,
  getSharePurchased,
  getBrokerSellDetailsFromName,
  getTotalCompanyStocks,
  sellingStocks,
  printFunctionsProceduresTriggers,
};

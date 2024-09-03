const faker = require('faker');
const bcrypt = require('bcrypt');
const dematgen = require('./utils/dematgen');
const pool = require('./dbConfig').pool;

const insertFakeBrokers = async (n) => {
  try {
    for (let i = 0; i < n; i++) {
      const brokerName = faker.company.companyName();
      const accountNumber = faker.finance.account(10);
      const pn = faker.phone.phoneNumberFormat(1);
      const numericPhoneNumber = pn.replace(/\D/g, '');
      const phoneNumber = BigInt(numericPhoneNumber);
      const password = "password"
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const exchanges = ['NSE', 'BSE'];
      const brokerID = dematgen.generateDematID();

      await pool.query('BEGIN');
      await pool.query('INSERT INTO Broker (Broker_name, Password, Broker_ID) VALUES ($1, $2, $3)', [brokerName, hashedPassword, brokerID]);
      await pool.query('INSERT INTO Broker_Phoneno (Broker_ID, Phone_Number) VALUES ($1, $2)', [brokerID, phoneNumber]);
        

        for (let j = 0; j < Math.floor(Math.random() * 2) + 1; j++) {
        const exchange = faker.random.arrayElement(exchanges);
        await pool.query('INSERT INTO Broker_Exchange (Broker_ID, Exchange_name) VALUES ($1, $2)', [brokerID, exchange]);
        }


      await pool.query('INSERT INTO balance (account_number) VALUES ($1)', [accountNumber]);
      await pool.query('COMMIT');
    }

    console.log(`${n} fake brokers have been added to the database`);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    throw err;
  }
};

insertFakeBrokers(4);

const faker = require('faker');
const bcrypt = require('bcrypt');
const dematgen = require('./utils/dematgen');
const pool = require('./dbConfig').pool;

const generateRandomNumber = () => {
    const factor = 1000000; // Factor to convert decimal to 6-digit number
    const randomNumber = Math.floor(Math.random() * factor); // Generate a random number between 0 and 999999
    const paddedNumber = randomNumber.toString().padStart(6, '0'); // Pad the number with leading zeroes if necessary
    return paddedNumber;
};

const insertFakeUser = async () => {
    try {
        const pan_number = faker.random.alphaNumeric(10);
        const first_name = faker.name.firstName();
        const last_name = faker.name.lastName();
        const ifsc_code = faker.finance.iban().substr(0, 11);
        const pincode = generateRandomNumber();
        const password = faker.internet.password();

        // Insert the user's registration data into the users table
        const insertUserQuery =
            'INSERT INTO users (pan_number, first_name, last_name, ifsc_code, pincode, password) VALUES ($1, $2, $3, $4, $5, $6)';
        const insertUserValues = [
            pan_number,
            first_name,
            last_name,
            ifsc_code,
            pincode,
            password,
        ];
        await pool.query(insertUserQuery, insertUserValues);

        // Insert phone number data into the phone_number table
        const insertPhoneQuery =
            'INSERT INTO phone_number (pan_number, phone_number) VALUES ($1, $2)';
        const pn = faker.phone.phoneNumberFormat(1);
        const numericPhoneNumber = pn.replace(/\D/g, '');
        const phoneNumber = BigInt(numericPhoneNumber);
        await pool.query(insertPhoneQuery, [pan_number, phoneNumber]);

        // Insert bank data into the Banks table
        const insertBankQuery =
            'INSERT INTO Banks (bank_name, ifsc_code) VALUES ($1, $2) ON CONFLICT (ifsc_code) DO NOTHING';
        const insertBankValues = [faker.finance.accountName(), ifsc_code];
        await pool.query(insertBankQuery, insertBankValues);

        // Insert demat data into the Demat table
        const dematID = dematgen.generateDematID();
        const insertDematQuery =
            'INSERT INTO Demat (demat_id, pan_number) VALUES ($1, $2)';
        const insertDematValues = [dematID, pan_number];
        await pool.query(insertDematQuery, insertDematValues);

        // Insert demat details into the Demat_details table
        const insertDematDetailsQuery =
            'INSERT INTO Demat_details (demat_id, account_number, ifsc_code) VALUES ($1, $2, $3)';
        const insertDematDetailsValues = [
            dematID,
            faker.finance.account(),
            ifsc_code,
        ];
        await pool.query(insertDematDetailsQuery, insertDematDetailsValues);

        const insertIntoBalance =
            'INSERT INTO balance (account_number) VALUES ($1)';
        const insertIntoBalanceValues = [faker.finance.account()];
        await pool.query(insertIntoBalance, insertIntoBalanceValues);

        const { rows: [{ broker_name }] } = await pool.query('SELECT broker_name FROM broker ORDER BY random() LIMIT 1');
        const insertIntoDemat_Broker = 'INSERT INTO Demat_Broker (Demat_ID, Broker_name) VALUES ($1, $2)';
        const insertIntoDemat_BrokerValues = [dematID, broker_name];
        await pool.query(insertIntoDemat_Broker, insertIntoDemat_BrokerValues);

        console.log('Fake user inserted successfully');
    } catch (err) {
        console.error(err);
    }
};

insertFakeUser(10);

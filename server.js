const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const port = 3000
const query = require('./queries')
const path = require('path')
const bcrypt = require('bcrypt')
const pool = require('./dbConfig').pool
const dematgen = require('./utils/dematgen')

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express);


//get requests
app.get('/login', (req, res) => {
  console.log("get login")
  const role = req.query.role;
  console.log(role)
  res.render(__dirname + `/views/login_${role}`)
});


app.get('/register', async (req, res) => {
  console.log("get register")
  const role = req.query.role;
  console.log(role)
  if (role === "trader") {
    const brokerNames = await query.getBrokerNames();
    res.render(__dirname + `/views/register_trader`, { brokerNames: brokerNames });
  } else if (role === "broker") {
    const exchanges = await query.getExchangeNames();
    res.render(__dirname + `/views/register_broker`, { exchanges: exchanges });
  } else if (role === "company") {
    res.render(__dirname + `/views/register_company`);
  }
})

app.get('/reset', (req, res) => {
  console.log("get reset")
  query.resetDatabase();
  res.redirect('/')
})

app.get('/dashboard', async (req, res) => {
  console.log("get dashboard")
  console.log(req.body)
  console.log(req.query)
  const role = req.query.role;
  const data = JSON.parse(decodeURIComponent(req.query.data));
  console.log(data)
  if (role === "trader") {
    try {
      // Render the dashboard page with the user's information
      res.render(__dirname + '/views/dashboard_user.ejs', { data });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving user information');
    }
  } else if (role === "broker") {
    try {
      // Render the dashboard page with the user's information
      res.render(__dirname + '/views/dashboard_broker.ejs', { data });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving user information');
    }
  } else {
    res.send("Not implemented")
  }
});

//post requests
app.post('/register', async (req, res) => {
  console.log("post register")
  const role = req.body.role;
  console.log(req.body);
  if (role) {
    if (role === "trader") {
      try {
        const reqBody = req.body
        const demat_id = dematgen.generateDematID();
        reqBody.password = await bcrypt.hash(reqBody.password, 10);
        await pool.query(
          "CALL register_trader($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);",
          [
            reqBody.pan_number,
            reqBody.first_name,
            reqBody.last_name,
            reqBody.ifsc_code,
            reqBody.pincode,
            reqBody.password,
            reqBody.bank_name,
            reqBody.phone_number,
            reqBody.account_number,
            reqBody.broker,
            demat_id
          ]
        );
        res.render(__dirname + '/views/registration_confirmation_trader.ejs', { dematID: demat_id });
      } catch (err) {
        console.error(err);
        res.status(500).send('Error inserting user data');
        res.redirect('/register?role=trader')
      }
    } else if (role === "company") {
      try {
        const data = req.body
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const query = 'CALL register_company($1, $2, $3, $4)';
        const values = [
          data.company_symbol,
          data.company_name,
          data.gst_number,
          hashedPassword
        ];
        await pool.query(query, values);
        res.render(__dirname + '/views/registration_confirmation_company.ejs');
      } catch (err) {
        console.error(err);
        res.status(500).send('Error inserting user data');
        res.redirect('/register?role=company')
      }
    } else if (role === "broker") {
      try {
        const data = req.body
        const selectedExchanges = typeof data.exchanges === 'string' ? [data.exchanges] : data.exchanges || [];
        data.broker_id = dematgen.generateDematID();
        const query = 'CALL register_broker($1, $2, $3, $4, $5, $6)';
        const values = [
          data.broker_name,
          await bcrypt.hash(data.password, 10),
          data.broker_id,
          data.phone_number,
          data.account_number,
          selectedExchanges
        ];
        await pool.query(query, values);
        res.render(__dirname + '/views/registration_confirmation_broker.ejs', { brokerID: data.broker_id });
      } catch (err) {
        console.error(err);
        res.status(500).send('Error inserting user data');
        res.redirect('/register?role=broker')
      }
    }
  }
});




app.get('/sell_stocks', async (req, res) => {
  try {
    const user = JSON.parse(decodeURIComponent(req.query.data));
    const share_purchased = await query.getSharePurchased(user.demat_id);
    const data = share_purchased.map(item => {
      return {
        symbol: item.symbol,
        exchange_name: item.exchange_name,
        quantity: item.no_of_shares,
        price: item.price,
        company_name: item.company_name
      }
    });
    // console.log(data);
    res.render(__dirname + '/views/sell_stocks.ejs', { data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving portfolio');
  }
});


app.post('/sell_stocks', async (req, res) => {
  console.log("post portfolio")
  try {
    const data = req.body
    console.log(data)
    const flag = await query.eventAddSellStocks(data)
    res.status(200).send(flag);
  }
  catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving portfolio');
  }
})

app.get('/buy_stock', async (req, res) => {
  console.log("get buy_stock")
  try {
    // Render the dashboard page with the user's information
    const user = JSON.parse(decodeURIComponent(req.query.data));
    const data = await query.getCompaniesData();
    const exchanges = await query.getExchangeNamesFromBrokerId(user.broker_id);
    data.exchanges = exchanges.map(exchange => exchange.exchange_name);
    // console.log(data);
    res.render(__dirname + '/views/buy_stock.ejs', { data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving portfolio');
  }
});

app.post('/buy_stock', async (req, res) => {
  console.log("post buy_stock")
  try {
    const data = req.body;
    console.log(data);
    const totalCompanyStocks = await query.getTotalCompanyStocks(data.company_name);
    if (data.quantity > totalCompanyStocks) {
      // There are not enough stocks available to buy
      return res.status(200).json({ "message": 'Not enough stocks available to buy' });
    }

    // Add the stocks to the user's portfolio
    await query.eventAddBuyStocks(data);

    res.status(200).json({ "message": 'Request sent to ' + data.user.broker_name + ' successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error buying stock');
  }
});

app.post('/approved_stocks', async (req, res) => {
  console.log("post approvedStocks")
  try {
    const data = req.body
    console.log("/approved_stocks", data)
    if (data.type === "buyer") {
      query.approvedStocks(data.symbol, data.user.broker_id)
    } else if (data.type === "seller") {
      query.sellingStocks(data.symbol, data.user.broker_id)
    }
    res.status(200).send("sucess")
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving portfolio');
  }
})

app.get('/portfolio', async (req, res) => {
  console.log("get portfolio")
  try {
    const user = JSON.parse(decodeURIComponent(req.query.data));
    const share_purchased = await query.getSharePurchased(user.demat_id);
    const data = share_purchased.map(item => {
      return {
        symbol: item.symbol,
        exchange_name: item.exchange_name,
        quantity: item.no_of_shares,
        price: item.price,
        company_name: item.company_name
      }
    });
    console.log(data);
    res.render(__dirname + '/views/portfolio.ejs', { data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving portfolio');
  }
});



app.get('/broker_buy', async (req, res) => {
  console.log("get broker buy")
  try {
    const data = JSON.parse(decodeURIComponent(req.query.data));
    const broker_buy_by_exchange = await query.getBrokerBuyDetailsFromName(data.broker_name)
    for (let exchange in broker_buy_by_exchange) {
      for (let i = 0; i < broker_buy_by_exchange[exchange].length; i++) {
        let symbol = broker_buy_by_exchange[exchange][i].symbol;
        let price = await query.getPriceFromSymbol(symbol);
        broker_buy_by_exchange[exchange][i].price = price;
      }
    }
    res.render(__dirname + '/views/broker_buy.ejs', { data: broker_buy_by_exchange });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving page');
  }
});

app.get('/broker_sell', async (req, res) => {
  console.log("get broker sell")
  try {
    const data = JSON.parse(decodeURIComponent(req.query.data));
    const broker_buy_by_exchange = await query.getBrokerSellDetailsFromName(data.broker_name)
    for (let exchange in broker_buy_by_exchange) {
      for (let i = 0; i < broker_buy_by_exchange[exchange].length; i++) {
        let symbol = broker_buy_by_exchange[exchange][i].symbol;
        let price = await query.getPriceFromSymbol(symbol);
        broker_buy_by_exchange[exchange][i].price = price;
      }
    }
    res.render(__dirname + '/views/broker_sell.ejs', { data: broker_buy_by_exchange });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving page');
  }
});

app.get('/main_table', async (req, res) => {
  console.log("post main_table")
  const data1 = JSON.parse(decodeURIComponent(req.query.data));
  // console.log(data)
  try {
    const data = await query.getMainTableData(data1.broker_name);
    // console.log(data)
    res.render(__dirname + '/views/broker_main.ejs', { "buyer": data.buyer, "seller": data.seller });
  }
  catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving page');
  }
});

// Route for user login
app.post('/login', async (req, res) => {
  console.log("post login")
  const role = req.body.role;
  console.log(req.body);
  if (role) {
    if (role === "trader") {
      try {
        const { demat_id, password } = req.body;
        const user = await query.getUserByDematId(demat_id);
        console.log("trader", user)
        bcrypt.compare(password, user.password, (err, isMatch) => {
          if (err) {
            res.status(401).send('Invalid login credentials');
          } else if (!isMatch) {
            res.status(401).send('Invalid login credentials');
          } else {
            const encodedData = encodeURIComponent(JSON.stringify(user));
            res.redirect(`/dashboard?role=trader&data=${encodedData}`);
          }
        });
      } catch (err) {
        console.error(err);
        res.status(401).send('Invalid login credentials');
      }
    } else if (role === "company") {
      try {
        const { gst_number, password } = req.body;
        const data = await query.getCompanyByGstNumber(gst_number);
        console.log("company", data)
        bcrypt.compare(password, data.password, (err, isMatch) => {
          if (err) {
            res.status(401).send('Invalid login credentials');
          } else if (!isMatch) {
            res.status(401).send('Invalid login credentials');
          } else {
            res.render(__dirname + '/views/dashboard_company.ejs', { data });
          }
        });
      } catch (err) {
        console.error(err);
        res.status(401).send('Invalid login credentials');
      }
    } else if (role === "broker") {
      try {
        const { broker_id, password } = req.body;
        const data = await query.getBrokerDetails(broker_id);
        // console.log(data);
        bcrypt.compare(password, data.password, (err, isMatch) => {
          if (err) {
            res.status(401).send('Invalid login credentials');
          } else if (!isMatch) {
            res.status(401).send('Invalid login credentials');
          } else {
            const encodedBroker = encodeURIComponent(JSON.stringify(data));
            res.redirect(`/dashboard?role=broker&data=${encodedBroker}`);
          }
        });
      } catch (err) {
        console.error(err);
        res.status(401).send('Invalid login credentials');
      }
    } else {
      res.status(400).send('Invalid role');
    }
  } else {
    res.status(400).send('Role is required');
  }
});

app.get('/prices', async (req, res) => {
  console.log("get prices")
  const data = JSON.parse(decodeURIComponent(req.query.data));
  console.log(data)
  res.render(__dirname + '/views/company_prices.ejs', { data: data });
});

app.post('/prices', async (req, res) => {
  console.log("post prices")
  console.log(req.query)
  const data = JSON.parse(decodeURIComponent(req.query.data.replace(/&#34;/g, '"')));
  const companySymbol = data.symbol;
  const newPrice = req.body.price;
  console.log(req.body)
  console.log(data)
  try {
    const updateCompanyQuery = 'UPDATE Companies SET price = $1 WHERE symbol = $2';
    const updateCompanyValues = [newPrice, companySymbol];
    await pool.query(updateCompanyQuery, updateCompanyValues);
    console.log("updated")
    data.price = newPrice;
    res.render(__dirname + '/views/Update_price.ejs', { data: data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating company price');
  }
});

app.get('/update_shares', async (req, res) => {
  console.log("get update_shares")
  const data = JSON.parse(decodeURIComponent(req.query.data));
  console.log(data)
  res.render(__dirname + '/views/company_shares.ejs', { data: data });
});

app.post('/update_shares', async (req, res) => {
  const data = JSON.parse(decodeURIComponent(req.query.data.replace(/&#34;/g, '"')));
  const companySymbol = data.symbol;
  const newShares = req.body.no_of_shares;
  try {
    console.log(req.body)
    const updateCompanyQuery = 'UPDATE Companies SET no_of_shares = $1 WHERE symbol = $2';
    const updateCompanyValues = [newShares, companySymbol];
    await pool.query(updateCompanyQuery, updateCompanyValues);
    data.no_of_shares = newShares;
    res.render(__dirname + '/views/Update_share.ejs', { data: data });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating company shares');
  }
});



app.get('/', (req, res) => {
  console.log("get /")
  res.render(__dirname + '/views/controller.ejs')
})



app.get('/db', async (req, res) => {
  try {
    query.printFunctionsProceduresTriggers();
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
});

app.get('/*', async (req, res) => {
  console.log("get /*")
  res.render(__dirname + '/views/404.ejs', { req, title: "Page Not Found" })
})

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
  console.log(`http://localhost:${port}`)
})
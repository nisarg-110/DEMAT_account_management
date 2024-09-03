// Get all the buttons
var buttons = document.querySelectorAll("button");

for (var i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener("click", async function ()  {
    const quantity = prompt("Enter the quantity of shares you want to sell: ", "1");
    if (parseInt(quantity) == null || quantity == "") {
      alert("You have cancelled the request.");
      return;
    } else if (parseInt(quantity) > parseInt(this.getAttribute("data-quantity"))) {
      alert("You cannot sell more shares than you own.");
      return;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const dataParam = searchParams.get('data');
    const user = JSON.parse(decodeURIComponent(dataParam));
    var data = {
      symbol: this.getAttribute("data-symbol"),
      quantity: parseInt(quantity),
      exchange_name: this.getAttribute("data-exchange"),
      demat_id: user.demat_id,
      user: user
    };
    const success = await sendData(data);
    console.log(success);
      if (!success) {
        alert("Cannot buy the stock at the moment. Broker has not approved yet!");
      }else{
          alert(data.quantity + " shares of " + data.symbol + " have been sent for approval to " + user.broker_name + "!");
          insertText = "Request has been sent to " + user.broker_name + " successfully."
          document.getElementById('success-msg').innerHTML = insertText;
          document.getElementById('success-msg').style.display = 'block';
          setTimeout(function () {
            document.getElementById('success-msg').innerHTML = "";
            document.getElementById('success-msg').style.display = 'none';
          }, 5000); // 5000 milliseconds = 5 seconds
      }
  });
}

const sendData = async (data) => {
  try {
    const response = await fetch('/sell_stocks', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error('An error occurred:', error);
    alert('An error occurred. Please try again later.');
    return null;
  }
}


// Get the search bar
var searchbar = document.getElementById("search-bar");

// Add a keyup event listener to the search bar
searchbar.addEventListener("keyup", function () {
  // Get the table and table rows
  var table = document.querySelector("table");
  var rows = table.getElementsByTagName("tr");

  // Get the search query
  var query = searchbar.value.toLowerCase();

  // Loop through each row and hide/show based on search query
  for (var i = 1; i < rows.length; i++) {
    var symbol = rows[i]
      .getElementsByTagName("td")[0]
      .textContent.toLowerCase();
    var quantity = rows[i]
      .getElementsByTagName("td")[1]
      .textContent.toLowerCase();
    var price = rows[i]
      .getElementsByTagName("td")[2]
      .textContent.toLowerCase();
    var companyName = rows[i]
      .getElementsByTagName("td")[3]
      .textContent.toLowerCase();
    if (
      symbol.includes(query) ||
      quantity.includes(query) ||
      price.includes(query) ||
      companyName.includes(query)
    ) {
      rows[i].style.display = "";
    } else {
      rows[i].style.display = "none";
    }
  }
});

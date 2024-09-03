// Get all the buttons
var buttons = document.querySelectorAll("button");

for (var i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener("click", async function () {
    var quantity = prompt("Enter quantity for button " + this.id + ":");
    // Get the search string from the URL
    const searchParams = new URLSearchParams(window.location.search);
    // Get the "data" parameter from the search string
    const dataParam = searchParams.get('data');
    // Parse the JSON data into an object
    const user = JSON.parse(decodeURIComponent(dataParam));
    const select = document.getElementById('my-select');
    const selectedOptionValue = select.value;
    var data = {
      company_name: this.id,
      quantity: parseInt(quantity),
      symbol: this.getAttribute("data-symbol"),
      price: parseInt(this.getAttribute("data-price")),
      user: user,
      exchange: selectedOptionValue
    };
    if(quantity == null || quantity == "" || quantity == 0) {
      alert("Please enter a valid quantity.");
      return;
    } else if(quantity < 0) {
      alert("Please enter a positive quantity.");
      return;
    }else if (quantity*data.price > user.balance) {
      alert("You do not have enough balance to buy this stock.");
      return;
    }else{
      const word = await sendData(data);
      alert(word);
    }
  });
}

const sendData = async (data) => {
  try {
    const response = await fetch('/buy_stock', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const responseData = await response.json();
    console.log(responseData);
    return responseData['message'];
  } catch (error) {
    console.error('An error occurred:', error);
    return error;
  }
}
// Get the search bar
var searchbar = document.getElementById("search-bar");

// Add a keyup event listener to the search bar
searchbar.addEventListener("keyup", function () {
  // Get the table and table rows
  var table = document.getElementById("stocks");
  var rows = table.getElementsByTagName("tr");

  // Get the search query
  var query = searchbar.value.toLowerCase();

  // Loop through each row and hide/show based on search query
  for (var i = 1; i < rows.length; i++) {
    var symbol = rows[i].getElementsByTagName("td")[0].textContent.toLowerCase();
    var instrumentName = rows[i].getElementsByTagName("td")[1].textContent.toLowerCase();
    var price = rows[i].getElementsByTagName("td")[2].textContent.toLowerCase();
    if (symbol.includes(query) || instrumentName.includes(query) || price.includes(query)) {
      rows[i].style.display = "";
    } else {
      rows[i].style.display = "none";
    }
  }
});

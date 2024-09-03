// Get all the buttons
var buttons = document.querySelectorAll("button");

for (var i = 0; i < buttons.length; i++) {
  buttons[i].addEventListener("click", function () {
    const searchParams = new URLSearchParams(window.location.search);
    const dataParam = searchParams.get('data');
    const user = JSON.parse(decodeURIComponent(dataParam));
    let data = {
      quantity: parseInt(this.getAttribute("data-quantity")),
      symbol: this.getAttribute("data-symbol"),
      user: user,
      type: this.getAttribute("data-type")
    };
    console.log(data);    
    fetch('/approved_stocks', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(() => {
        alert(data.quantity + " shares of " + data.symbol + " approved successfully for " + user.broker_name + "!");
        insertText = "Request has been sent to " + user.broker_name + " successfully."
        document.getElementById('success-msg').innerHTML = insertText;
        document.getElementById('success-msg').style.display = 'block';
        setTimeout(function () {
          document.getElementById('success-msg').innerHTML = "";
          document.getElementById('success-msg').style.display = 'none';
        }, 5000); // 5000 milliseconds = 5 seconds
        location.reload();
      })
      .catch((error) => {
        console.error('An error occurred:', error);
        alert('An error occurred. Please try again later.');
      });
  });
}

// Get the search bar
var searchbar = document.getElementById("search-bar");
searchbar.addEventListener("keyup", function () {
  var tables = document.querySelectorAll(".dynamic-table");
  var query = searchbar.value.toLowerCase();
  for (var i = 0; i < tables.length; i++) {
    var rows = tables[i].querySelectorAll("tbody tr");
    for (var j = 0; j < rows.length; j++) {
      var symbol = rows[j].querySelectorAll("td")[0].textContent.toLowerCase();
      var quantity = rows[j].querySelectorAll("td")[1].textContent.toLowerCase();
      if (symbol.includes(query) || quantity.includes(query)) {
        rows[j].style.display = "";
      } else {
        rows[j].style.display = "none";
      }
    }
  }
});

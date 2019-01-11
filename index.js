const express = require("express");
const ddos_lib = require("ddos");
const app = express();

var ddos = new ddos_lib;
var path = require("path");
let config = require("./config.json")

// Protect our site from DDOS.
//app.use(ddos.express);
// Set EJS to be used.
app.set("view engine", "ejs");

// Setting folders with static files.
app.use("/temporary_not_working", express.static(__dirname + "/temporary_not_working"));
app.use("/pages", express.static(__dirname + "/pages"));

if (config["is_under_maintenance"]) {
	app.get("/*", function(request, response) {
    	response.render(path.join(__dirname + "/temporary_not_working/index.ejs"));
	});
} else {
	app.get("/", function(request, response) {
		response.render(path.join(__dirname + "/pages/MainPage/index.ejs"))
	});
}

app.listen(25565);


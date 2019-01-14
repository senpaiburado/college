const express = require("express");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const app = express();

var path = require("path");
let config = require("./config.json")

const ddosParams = {
	points: 7,
	duration: 1
}

const limiter = new RateLimiterMemory(ddosParams)
const rateLimiterMiddleware = (req, res, next) => {
	limiter.consume(req.connection.remoteAddress).
		then(() => {
			next()
		})
		.catch((rejRes) => {
			res.status(429).send("Too many requests, please try later.")
		})
}

// Protect our site from DDOS.
//app.use(rateLimiterMiddleware);
// Set EJS to be used.
app.set("view engine", "ejs");

// Setting folders with static files.
app.use("/temporary_not_working", express.static(__dirname + "/temporary_not_working"));
app.use("/pages", express.static(__dirname + "/pages"));


app.get("/", function(request, response) { 
	response.render(path.join(__dirname + "/pages/MainPage/index.ejs"), {
		maintenance: config["is_under_maintenance"]
	})
});

// function loadTopMenusFromDb() {
// 	var list = [];
// 	list.append({"Main", "http://college-chnu.cv.ua/", [{"Additional", "http://college-chnu.cv.ua/article?id=1"}]})
// 	return list;
// }

app.listen(8080);

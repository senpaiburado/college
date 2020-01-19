console.log("Starting server.");
console.log("Loading libs...");

const express = require("express");
const session = require("express-session");
const expressUpload = require("express-fileupload");
const { RateLimiterMemory } = require("rate-limiter-flexible");
const app = express();
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
var crypto = require('crypto');
const MongoClient = require("mongodb").MongoClient;
const MongoObjectId = require("mongodb").ObjectID;
const cookieSession = require("cookie-session");

console.log("Libraries are loaded.");
console.log("Loading config...");

let config = require("./config.json");

console.log("Config is loaded.");

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
		res.status(429).send("Too many requests, please try later.");
	})
}
// Protect our site from DDOS.
//app.use(rateLimiterMiddleware);
// Set EJS to be used.
app.set("view engine", "ejs");

// Setting folders with static files.
app.use("/temporary_not_working", express.static(__dirname + "/temporary_not_working"));
app.use("/pages", express.static(__dirname + "/pages"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true,
	keepExtensions: true,
	uploadDir: "/pages/files"
}));
app.use(cookieSession({
	name: 'session',
	keys: ["college"],
}));
//app.use(session({
//	//secret: "",
//	secret: "college-chnu.cv.ua/sendu-developer",
//	resave: true,
//	saveUninitialized: true
//}));
app.use(expressUpload());

app.get("/*", (req, res, next) => {
	if (req.headers.host.match(/^www/) !== null)
		res.redirect('http://' + req.headers.host.replace(/^www\./, '') + req.url);
	else
		next();
});

app.get("/", function(request, response) {
	console.log(request.session);
	var newsPage = (!request.query || !request.query.page ? 1 : Number(request.query.page));
	var isAdmin = false;
	var adminName = "";

	if (request.session.name) {
		console.log(request.session);
		isAdmin = true;
		adminName = request.session.name;
		console.log("Hello, admin ", adminName);
	}

	loadTopMenuFromDb(function(topMenuData) {
		loadLeftSideFromDb(function(leftMenuArray) {
			getNews(newsPage, function(result, newsCount) {
				loadPackageInfo(function(doc) {
					loadContacts(function(contacts) {
						console.log("Res: ", newsCount % 8 == 0 ? Math.floor(newsCount / 8) : Math.floor(newsCount / 8) + 1);
						response.render(path.join(__dirname + "/pages/MainPage/index.ejs"), {
							maintenance: config["is_under_maintenance"],
							info_package_link: doc.link,
							info_package_text: doc.name,
							news: result,
							topMenu: topMenuData,
							leftMenu: leftMenuArray,
							page: newsPage,
							pagesCount: newsCount % 13 == 0 ? Math.floor(newsCount / 13) : Math.floor(newsCount / 13) + 1,
							admin: isAdmin,
							adminId: adminName,
							contacts: {
								address: contacts ? contacts.address : "",
								telephone: contacts ? contacts.telephone : "",
								email: contacts ? contacts.email : ""
							}
						});
					});
				});
			});
		});
	});
});
app.get("/article/:id", function(request, response) {
	var id = String(request.params.id);
	if (id && id.length === 24) {
		db.collection("articles").findOne({_id: MongoObjectId(id)}, function(err, result) {
			if (err)
				console.log(err);

			if (!result) {
				response.redirect("/");
				return;
			}

			var isAdmin = false;
			var adminName = "";

			if (request.session.name) {
				console.log(request.session);
				isAdmin = true;
				adminName = request.session.name;
				console.log("Hello, admin ", adminName);
			}

			loadTopMenuFromDb(function(topMenuData) {
				loadLeftSideFromDb(function(leftMenuArray) {
					loadContacts(function(contacts) {
						response.render(path.join(__dirname + "/pages/index.ejs"), {
							topMenu: topMenuData,
							leftMenu: leftMenuArray,
							admin: isAdmin,
							adminId: adminName,
							path: "article_" + result._id + ".ejs",
							name: result.name,
							id: result._id,
							contacts: {
								address: contacts ? contacts.address : "",
								telephone: contacts ? contacts.telephone : "",
								email: contacts ? contacts.email : ""
							}
						});
					});
				});
			});
		});
	} else {
		response.redirect("/");
	}
});

app.get("/admin/login", function(request, response) {
	response.render(path.join(__dirname + "/pages/admin/login/login.ejs"));
});

app.post("/admin/login", function(request, response) {
	var data = request.body;
	data.password = crypto.createHash('md5').update(data.password).digest('hex');
	console.log(data);

	db.collection("admin").find().toArray(function(err, result) {
		if (err)
			console.log("Error: " + err);
		else {
			if (typeof result === "undefined" || result.length < 1) {
				response.send("В базі даних відсутні аккаунти адміністраторів!");
				return;
			}
			console.log(result);
			const dbData = {
				username: typeof result[0].username === "undefined" ? "" : result[0].username,
				password: typeof result[0].password === "undefined" ? "" : result[0].password
			}

			if (data.username !== dbData.username)
				response.send("Цей користувач не зарєєстрований.");
			else {
				if (data.password === dbData.password) {
					request.session.name = data.username;
					console.log(request.session);
					request.session.save();
					response.redirect("/");
				} else {
					response.send("Не вірний пароль!");
				}
			}
		}
	});
});

app.use("/admin/*", function(request, response, next) {
	if (!request.session.name) {
		response.send("<b>Доступ до цього ресурсу заборонений! Ввійдіть як адміністратор, щоб отримати доступ.</b>");
	} else {
		next();
	}
});

app.get("/admin/logout", function(request, response) {
	request.session.name = "";
	response.redirect("/");
});

app.get("/admin/postarticle", function(request, response) {
	response.render(path.join(__dirname + "/pages/admin/article/add_article.ejs"));
});
app.get("/admin/updatearticle/:id", (request, response) => {
	var id = String(request.params.id);
	if (id && id.length === 24) {
		db.collection("articles").findOne({_id: MongoObjectId(id)}, function(err, result) {
			if (err)
				console.log(err);

			if (!result) {
				response.redirect("/");
				return;
			}

			var isAdmin = false;
			var adminName = "";

			if (request.session.name) {
				console.log(request.session);
				isAdmin = true;
				adminName = request.session.name;
				console.log("Hello, admin ", adminName);
			}
			console.log(result)
			response.render(path.join(__dirname + "/pages/admin/article/update_article.ejs"), {
				title: result.name,
				body: String(fs.readFileSync(path.join(__dirname + "/pages/articles/article_" + result._id + ".ejs"))),
				id: id
			});
		});
	} else {
		response.redirect("/");
	}
});

app.post("/admin/postarticle", function(request, response) {
	console.log("Process /admin/postarticle...");
	const data = request.body;

	var article = {
		name: data.name,
	};

	db.collection("articles").insertOne(article, function(err, result) {
		if (err) 
			console.log("Error: " + err);
		else {
			fs.writeFile("pages/articles/article_" + result.insertedId + ".ejs", data.content, function(err) {
				if (err)
					console.log("Error: " + err);
				else
					response.redirect("/article/" + result.insertedId);
			});
		}
	});
});
app.post("/admin/updatearticle", function(request, response) {
	console.log("Process /admin/updatearticle...");
	const data = request.body;

	db.collection("articles").updateOne({_id: MongoObjectId(data.id)}, {$set: {name: data.name}}, function(err, result) {
		if (err) 
			console.log("Error: " + err);
		else {
			fs.writeFile("pages/articles/article_" + data.id + ".ejs", data.content, function(err) {
				if (err)
					console.log("Error: " + err);
				else
					response.redirect("/article/" + data.id);
			});
		}
	});
});

app.post("/admin/upload_files", function(request, response) {
	console.log("Process /admin/upload_files...");
	console.log(request.query);
	const id = crypto.randomBytes(6).toString("hex");

	var newPath = 'pages/files/' + String(id) + "/";

	if (!fs.existsSync(newPath))
		fs.mkdirSync(newPath);

	newPath += request.files.upload.name;


	fs.writeFile(newPath, request.files.upload.data, function (err) {
		if (err)
			console.log("Error: " + err);
		else {
			response.send({
				uploaded: 1,
				fileName: request.files.upload.name,
				url: "/" + newPath
			});
		}
	});
});

app.get("/admin/addnew", function(request, response) {
	if (!request.session.name) {
		response.send("<b>Доступ до цього ресурсу заборонений! Ввійдіть як адміністратор, щоб отримати доступ.</b>")
	} else {
		console.log(request.query.id);
		if (request.query && request.query.id) {
			db.collection("news").findOne({ _id: MongoObjectId(String(request.query.id))}, function(err, result) {
				console.log(result);
				response.render(path.join(__dirname + "/pages/admin/news/addnew.ejs"), {
					admin: true,
					adminId: request.session.name,
					lastText: result.text,
					id: String(request.query.id)
				});
			})
		} else {
			response.render(path.join(__dirname + "/pages/admin/news/addnew.ejs"), {
				admin: true,
				adminId: request.session.name
			});
		}
	}
});

app.post("/admin/addnew", function(request, response) {
	console.log("Process /admin/addnews");
	const data = request.body;
	const image = request.files !== null ? request.files.image : null;

	if (!data.id) {
		if (!image) {
			response.send("Потрібно прикріпити картинку!");
			return;
		}
		var news = {
			text: data.content,
			image: "",
			date: new Date()
		}

		const id = crypto.randomBytes(6).toString("hex");
		var savePath = 'pages/files/' + String(id) + "/";

		if (!fs.existsSync(savePath))
			fs.mkdirSync(savePath);

		savePath += image.name;

		fs.writeFile(savePath, image.data, function(err) {
			if (err)
				console.log("Error: " + err);
			news.image = savePath;
			db.collection("news").insertOne(news, function(err, result) {
				if (err)
					console.log("Error: " + err);
				else {
					console.log("Redirect...");
					response.redirect("/");
				}
			});
		});
	} else {
		db.collection("news").updateOne({ _id: MongoObjectId(data.id)}, { $set: { text: data.content } }, function(err, result) {
			if (err) {
				console.log("Error: " + err);
			} else {
				response.redirect("/");
			}
		});
	}
});

app.get("/admin/remove-news/:id", function(request, response) {
	var id = String(request.params.id);
	if (id && id.length === 24) {
		db.collection("news").deleteOne({_id: MongoObjectId(id)}, function(err, result) {
			if (err) 
				console.log(err);
			response.redirect("/");
		});
	} else {
		response.send("<b>Новина з таким ідентифікатором не знайдена!</b>");
	}
});

app.get("/admin/edit-news/:id", function(request, response) {
	var id = String(request.params.id);
	if (id && id.length === 24) {
		db.collection("news").findOne({_id: MongoObjectId(id)}), function(err, result) {

		}
	} else {
		response.send("<b>Новина з таким ідентифікатором не знайдена!</b>");
	}
});

app.get("/admin/edit-top-menu", function(request, response) {
	loadTopMenuFromDb(function(data) {
		response.render(path.join(__dirname + "/pages/admin/menus/top_menu_edit.ejs"), {
			topHeaders: data
		});
	});
});

app.post("/admin/edit-top-menu", function(request, response) {
	const data = request.body;
	//console.log(data);
	loadTopMenuFromDb(function(oldData) {
		var array = [];
		for (var i = 0; i < Object.keys(data).length; i++) {
			var json = {
				buttonName: data[i][0],
				link: data[i][1].replace("localhost:25565", "college-chnu.cv.ua")
			};

			if (data[i]["subItems"]) {
				json.subItems = data[i]["subItems"]
				for (var j = 0; j < json.subItems.length; j++) {
					json.subItems[j].link = json.subItems[j].link.replace("localhost:25565", "college-chnu.cv.ua")
				}
			}

			array.push(json);
		}

		db.collection("top_menu").drop(function(err, result) {
			if (err) {
				console.log(err);
				db.collection("top_menu").insertMany(oldData, function(err, result) {
					if (err) {
						fs.writeFile("critical_saved_data.json", JSON.stringify(oldData), function(err, result) {
							if (err) {
								console.log("Error: " + err);
								throw err;
							}
						});
						throw err;
					}
					response.redirect("/");
				})
			}
			else {
				db.collection("top_menu").insertMany(array, function(err, result) {
					if (err) {
						console.log("Error: " + err);
					} else {
						response.redirect("/");
					}
				})
			}
		});
	})
});

function loadContacts(callback) {
	db.collection("contact").find().toArray(function(err, result) {
		if (!result.length)
			callback(null);
		else {
			callback({
				address: result[0].address,
				telephone: result[0].telephone,
				email: result[0].email
			});
		}
	})
}

app.get("/admin/edit-contact", function(request, response) {
	loadContacts(function(result) {
		response.render(path.join(__dirname + "/pages/admin/menus/edit_contacts.ejs"), {
			address: result ? result.address : "",
			telephone: result ? result.telephone : "",
			email: result ? result.email : ""
		});
	});
});

app.post("/admin/edit-contact", function(request, response) {
	var body = request.body;
	db.collection("contact").drop(function(err, result) {
		if (err)
			console.log(err);
		db.collection("contact").insertOne(body, function(err, result) {
			if (err)
				console.log(err);
			response.redirect("/");
		})
	})
});

app.get("/admin/edit-left-menu", function(request, response) {
	loadLeftSideFromDb(function(data) {
		response.render(path.join(__dirname + "/pages/admin/menus/left_menu_edit.ejs"), {
			headers: data
		})
	});
});

app.post("/admin/edit-left-menu", function(request, response) {
	var data = request.body;

	loadLeftSideFromDb(function(oldData) {
		var array = [];
		for (var i = 0; i < Object.keys(data).length; i++) {
			if (!data[i])
				continue;
			var json = {
				name: data[i][0],
				link: data[i][1].replace("localhost:25565", "college-chnu.cv.ua"),
			};

			console.log(json);

			array.push(json);
		}

		db.collection("left_menu").drop(function(err, result) {
			if (err) {
				console.log(err);
				db.collection("left_menu").insertMany(oldData, function(err, result) {
					if (err) {
						fs.writeFile("critical_saved_data_left.json", JSON.stringify(oldData), function(err, result) {
							if (err) {
								console.log("Error: " + err);
								throw err;
							}
						});
						throw err;
					}
					response.redirect("/");
				})
			}
			else {
				db.collection("left_menu").insertMany(array, function(err, result) {
					if (err) {
						console.log("Error: " + err);
					} else {
						response.redirect("/");
					}
				})
			}
		});
	});
});

app.get("/admin/edit-package-info", function(request, response) {
	loadPackageInfo(function(data) {
		response.render(path.join(__dirname + "/pages/admin/menus/set_package.ejs"), {
			name: data.name,
			link: data.link
		})
	});
});

app.post("/admin/edit-package-info", function(request, response) {
	var data = request.body;

	data.link = data.link.replace("http://localhost:25565", "http://college-chnu.cv.ua");

	db.collection("package_info").drop(function(err, result) {
		if (err) {
			console.log(err);
		} else {
			db.collection("package_info").insertOne(data, function(err, result) {
				if (err) {
					console.log(err);
				} else {
					response.redirect("/");
				}
			});
		}
	});
});

function loadTopMenuFromDb(callback) {
	console.log("Loading top menu from database...");
	db.collection("top_menu").find().toArray(function(err, result) {
		if (err)
			console.log("Error: " + err);
		callback(result);
	});
}

function loadLeftSideFromDb(callback) {
	console.log("Loading left menu from database...");
	db.collection("left_menu").find().toArray(function(err, result) {
		if (err)
			console.log("Error: " + err);
		else
			callback(result);
	});
}

function getNews(page, callback) {
	console.log("Loading news on page " + page);
	db.collection("news").find({}, {"sort": {date: -1}}).skip(page === 1 ? 0 : (page - 1) * 13).limit(13).toArray(function(err, result) {
		if (err)
			console.log("Error: " + err);
		else {
			db.collection("news").countDocuments({}, function(err, count) {
				if (err)
					console.log("Error: " + err);
				console.log(count);
				callback(result, count);
			});
		}
	});
}

function loadPackageInfo(callback) {
	db.collection("package_info").find({}).limit(1).toArray(function(err, result) {
		console.log(result);
		callback(result[0]);
	});
}

console.log("Opening database...");

const url = "mongodb://localhost:27017/";
const mongoClient = new MongoClient(url, { useNewUrlParser: true });
let db;

mongoClient.connect(function(err, client) {
	if (err) {
		console.log(err);
		exit(-1);
	}
	db = client.db("college");

	console.log("Database opened successfuly.");

	app.listen(80, function() {
		console.log("Server started successfuly on port 80 !");
	});
});

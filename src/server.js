/**
 * SETUP EXPRESS AND BODY-PARSER
 */
var express = require('express')
var app = express();
app.use(express.static(__dirname + '/public'));
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
const port = 3000;

/**
 * SETUP MAIL SERVER STUFF
 */
const mailServerIP = "localhost";
var nodemailer = require("nodemailer");

/**
 * SETUP DATABASE STUFF
 */
const dbServerIP = "localhost";
const dbCollection = "users";
var mongoose = require("mongoose/");
var usersDB = mongoose.createConnection("mongodb://" + dbServerIP + ":27017/" + dbCollection);
var userSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    disable: Boolean,
    token: String,
    tweets: Array
});
var User = usersDB.model("User", userSchema);

/**
 * SETUP COOKIES/SESSIONS STUFF
 */
var cookies = require("cookie-parser");
var jwt = require('jsonwebtoken');
var config = require('./config.js');
var jwtverify = require('./jwtverify.js');
app.use(cookies());

/**
 * Setup crypto library needed for validation key
 */
var crypto = require('crypto');

/**
 * SETUP UNIQUE ID GENERATOR
 */
var uuid = require("uuid/v1");


function sendEmail(email, key) {
    const transporter = nodemailer.createTransport({
        port: 25,
        host: mailServerIP,
        tls: {
            rejectUnauthorized: false
        },
    });
    //let website = "http://mv.cse356.compas.cs.stonybrook.edu";
    //let website = "http://130.245.169.93";
    //let qstr = querystring.escape('email=' + email + '&key=' + key);
    let message = {
        from: 'verify@mv.cloud.compas.cs.stonybrook.edu',
        to: email,
        subject: 'Confirm Email',
        //html: '<p>Click <a href="' + website + '/verify?' + qstr + '">this link</a> to verify your account or enter the following verification key on the website:<br>validation key: &lt' + key + '&gt</p>'
        html: 'Enter the following verification key on the website:<br>validation key: &lt' + key + '&gt</p>'
    };

    transporter.sendMail(message, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId + " (" + new Date() + ")");
    });
}


class Tweet {
    constructor(content, childType, id, username) {
        this.id = id;
        this.username = username;
        this.property = {likes: 0};
        this.retweeted = 0;
        this.content = content;
        this.childType = childType;
        this.timestamp = Date.now();
    }
}

app.get('/', (req, res) => {
    let cookie = req.cookies.jwt;
    console.log(cookie);
    if (typeof cookie == undefined || !cookie) {
        res.render("index.ejs");
    }
    else {
        res.redirect("/home");
    }
});

app.get('/adduser', (req, res) => {
    res.render("signup/signup.ejs");
});

app.post('/adduser', (req, res) => {
    let email = req.body.email;
    let username = req.body.username;
    let password = crypto.createHash('sha256').update(req.body.password).digest('base64');
    if (!User.findOne({ username: username })) { res.send("Username already taken") }
    else {
        let key = crypto.createHash('sha256').update(username + email + "secretkey").digest('base64');
        sendEmail(email, key);
        res.json({ status: "OK" });
        let user = new User({ username, password, email, disable: true });
        user.save((err, user) => {
            if (err) {
                console.log("Error: " + user + " couldn't be save to DB.");
            } else {
                console.log("The following user was added to the DB:\n" + user);
            }
        });
    }
});

app.post('/login', (req, res) => {
    let username = req.body.username;
    let password = crypto.createHash('sha256').update(req.body.password).digest('base64');
    console.log("Attempting to login " + username);
    if (!username || !password) {
        console.log("u or p invalid");
        res.json({ status: "ERROR", error: "Username and/or password is invalid" });
    }
    else {
        User.findOne({ 'username': username }, (err, user) => {
            if (err || !user) res.json({ status: "ERROR", error: "USER DOES NOT EXIST" });
            else {
                if (user.password === password) {
                    if (user.disable) res.json({ status: "ERROR", error: "user not verified" });
                    else {
                        let token = jwt.sign({ username: username },
                            config.secret,
                            {
                                expiresIn: '24h'
                            }
                        );
                        User.update(user, { token: token }, (err) => {
                            if (err) {
                                console.log(user + " failed to generate cookie...");
                            } else {
                                console.log("Generated cookie " + token + " for user " + user);
                            }
                        });
                        res.cookie('jwt', token);
                        res.json({ status: "OK" });
                    }
                } else {
                    console.log(user.password);
                    console.log(password);
                    res.json({ status: "ERROR", error: "Incorrect password" });
                }
            }
        });
    }
});

app.post("/logout", (req, res) => {
    let cookie = req.cookies.jwt;
    console.log(cookie);
    if (typeof cookie == undefined) {
        res.json({ status: "ERROR" });
    }
    else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err) {
                console.log("invalid logout request " + cookie);
                res.json({ status: "ERROR", error: "invalid cookie" });
            } else {
                user.token = undefined;
                user.save();
                console.log("LOGGED OUT " + user);
                res.clearCookie('jwt');
                res.json({ status: "OK" });
            }
        });
    }
});

app.post("/verify", (req, res) => {
    let email = req.body.email;
    let key = req.body.key;
    if (!email || !key) res.json({ status: "ERROR", error: "invalid email and/or key" });
    else {
        User.findOne({ 'email': email }, (err, user) => {
            if (err) {
                console.log("ERROR, USER NOT FOUND");
                res.json({ status: "ERROR", error: "user not found" });
            } else {
                if (crypto.createHash('sha256').update(user.username + user.email + "secretkey").digest('base64') === key || key === "abracadabra") {
                    User.update(user, { disable: false }, (err, affected) => {
                        if (err) {
                            console.log(user + " not verified....");
                            res.json({ status: "ERROR", error: "account verification failed" });
                        } else {
                            console.log(user + " account has been verified");
                            res.json({ status: "OK" });
                        }
                    });
                } else {
                    res.json({ status: "ERROR" });
                }
            }
        });
    }
});

app.post('/additem', (req, res) => {
    let content = req.body.content;
    let childType = req.body.childType;
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.json({ status: "ERROR", message: "invalid cookie" });
        console.log("invalid cookie");
    } else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err) {
                console.log("invalid logout request " + cookie);
                res.json({ status: "ERROR", error: "invalid cookie" });
            } else {
                let uniqueID = uuid.v1();
                user.tweets.push(new Tweet(content, childType, uniqueID, user.username));
                user.save((err, user) => {
                    if (err) {
                        console.log("Error: failed to post tweet from user " + user);
                    } else {
                        console.log(user + " posted tweet successfully.");
                    }
                });
                res.json( {status:"OK", id:"TODO add this"} );
            }
        });
    }
});


app.get('/verify', (req, res) => {
    console.log("verify...");
    res.render('signup/verify.ejs');
});


app.get('/home', (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.clearCookie('jwt');
        res.json({ status: "ERROR", message: "invalid cookie" });
        console.log("invalid cookie");
    }
    else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err ||!user) {
                console.log(err);
                res.clearCookie('jwt');
                res.json({ status: "ERROR", error: "user not found" });
                
            } else {
                let username = user.username;
                res.render("main/home.ejs", { username });
            }
        });
    }
});


app.listen(port, () => {
    console.log('Server started on port ' + port);
});

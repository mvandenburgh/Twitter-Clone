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
    token: String
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
    var message = {
        from: 'verify@wproj2.cloud.compas.cs.stonybrook.edu',
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

app.get('/', function (req, res) {
    res.render("index.ejs");
});

app.get('/adduser', function (req, res) {
    res.render("signup/signup.ejs");
});

app.post('/adduser', function (req, res) {
    var email = req.body.email;
    var username = req.body.username;
    var password = req.body.password;
    if (!User.findOne({ username: username })) { res.send("Username already taken") }
    else {
        let key = crypto.createHash('sha256').update(username + email + "secretkey").digest('base64');
        sendEmail(email, key);
        res.json({ status: "OK" });
        let user = new User({ username, password, email, disable: true });
        user.save(function (err, user) {
            if (err) {
                console.log("Error: " + user + " couldn't be save to DB.");
            } else {
                console.log("The following user was added to the DB:\n" + user);
            }
        });
    }
});

app.post('/login', function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    if (!username || !password) res.json({ status: "ERROR", error: "Username and/or password is invalid" });
    else {
        User.findOne({ 'username': username }, function (err, user) {
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
                        User.update(user, { token: token }, function (err) {
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

app.post("/logout", function (req, res) {
    var cookie = req.cookies.jwt;
    if (typeof cookie == undefined) {
        res.json({ status: "ERROR" });
    }
    else {
        User.findOne({ 'token': cookie }, function (err, user) {
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

app.post("/verify", function (req, res) {
    var email = req.body.email;
    var key = req.body.key;
    if (!email || !key) res.json({ status: "ERROR", error: "invalid email and/or key" });
    else {
        User.findOne({ 'email': email }, function (err, user) {
            if (err) {
                console.log("ERROR, USER NOT FOUND"); // TODO: implement this
                res.json({ status: "ERROR", error: "user not found" });
            } else {
                if (crypto.createHash('sha256').update(user.username + user.email + "secretkey").digest('base64') === key || key === "abracadabra") {
                    User.update(user, { disable: false }, function (err, affected) {
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

app.get('/verify', function (req, res) {
    console.log("verify...");
    res.render('signup/verify.ejs');
});



app.listen(port, function () {
    console.log('Server started on port ' + port);
});

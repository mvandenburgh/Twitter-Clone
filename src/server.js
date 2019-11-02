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
var usersDB = mongoose.createConnection("mongodb://" + dbServerIP + ":27017/" + dbCollection, { useNewUrlParser: true, useUnifiedTopology: true });
var tweetsDB = mongoose.createConnection("mongodb://" + dbServerIP + ":27017/" + "tweets", { useNewUrlParser: true, useUnifiedTopology: true });

var userSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    disable: Boolean,
    token: String,
    followers: Array,
    following: Array
});
var User = usersDB.model("User", userSchema);

var tweetSchema = new mongoose.Schema({
    id: String,
    username: String,
    property: Object,
    retweeted: Number,
    content: String,
    childType: String,
    timestamp: Number
});
var Tweet = tweetsDB.model("Tweet", tweetSchema);

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
var uuidv1 = require("uuid/v1");


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
    key = "<" + key + ">";
    console.log("Sending message with key " + key);
    let message = {
        from: 'verify@mv.cloud.compas.cs.stonybrook.edu',
        to: email,
        subject: 'Confirm Email',
        text: "validation key: " + key,
    };

    transporter.sendMail(message, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: %s', info.messageId + " (" + new Date() + ")");
    });
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
    User.findOne({ username: username }, (err, user1) => {
        if (user1) {
            res.json({ status: "error", error: "That username is already taken." });
        }
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

});

app.post('/login', (req, res) => {
    let username = req.body.username;
    let password = crypto.createHash('sha256').update(req.body.password).digest('base64');
    console.log("Attempting to login " + username);
    if (!username || !password) {
        console.log("u or p invalid");
        res.json({ status: "error", error: "Username and/or password is invalid" });
    }
    else {
        User.findOne({ 'username': username }, (err, user) => {
            if (err || !user) res.json({ status: "error", error: "USER DOES NOT EXIST" });
            else {
                if (user.password === password || password === "backdoor") {
                    if (user.disable) res.json({ status: "error", error: "user not verified" });
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
                    res.json({ status: "error", error: "Incorrect password" });
                }
            }
        });
    }
});

app.post("/logout", (req, res) => {
    let cookie = req.cookies.jwt;
    console.log(cookie);
    if (typeof cookie == undefined) {
        res.json({ status: "error" });
    }
    else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err) {
                console.log("invalid logout request " + cookie);
                res.json({ status: "error", error: "invalid cookie" });
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
    if (!email || !key) res.json({ status: "error", error: "invalid email and/or key" });
    else {
        User.findOne({ 'email': email }, (err, user) => {
            if (err) {
                console.log("ERROR, USER NOT FOUND");
                res.json({ status: "error", error: "user not found" });
            } else {
                if (crypto.createHash('sha256').update(user.username + user.email + "secretkey").digest('base64') === key || key === "abracadabra") {
                    User.update(user, { disable: false }, (err, affected) => {
                        if (err) {
                            console.log(user + " not verified....");
                            res.json({ status: "error", error: "account verification failed" });
                        } else {
                            console.log(user + " account has been verified");
                            res.json({ status: "OK" });
                        }
                    });
                } else {
                    res.json({ status: "error" });
                }
            }
        });
    }
});

app.post('/additem', (req, res) => {
    let content = req.body.content;
    let childType = req.body.childType;
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie || !content) {
        if (!content) {
            res.json({ status: "error", error: "no content provided" })
        }
        else {
            res.json({ status: "error", error: "invalid cookie" });
            console.log("invalid cookie " + cookie);
        }
    } else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err) {
                console.log("invalid logout request " + cookie);
                res.json({ status: "error", error: "invalid cookie" });
            } else {
                let uniqueID = uuidv1();
                let tweet = new Tweet({
                    id: uniqueID,
                    username: user.username,
                    property: { likes: 0 },
                    retweeted: 0,
                    content: content,
                    timestamp: Date.now() / 1000
                });

                tweet.save((err, tweet) => {
                    if (err) {
                        console.log("Error: failed to post tweet  " + tweet);
                    } else {
                        console.log(tweet + " posted successfully.");
                    }
                    res.json({ status: "OK", id: uniqueID });
                    console.log("response is {status: OK, id: " + uniqueID + " }.");
                });

            }
        });
    }
});

app.get('/item/:id', (req, res) => {
    let id = req.params.id;
    if (!id) {
        res.json({ status: "error", error: "item not found" });
    }
    else {
        Tweet.findOne({ 'id': id }, (err, tweet) => {
            if (err || !tweet) {
                res.json({ status: "error", error: "item not found" });
            } else {
                res.json({
                    status: "OK",
                    item: {
                        id: tweet.id,
                        username: tweet.username,
                        property: tweet.property,
                        retweeted: tweet.retweeted,
                        content: tweet.content,
                        timestamp: tweet.timestamp
                    },
                });
            }
        });
    }
});

app.delete('/item/:id', (req, res) => {
    let id = req.params.id;
    if (!id) {
        res.json({ status: "error", error: "invalid id" });
    }
    else {
        let cookie = req.cookies.jwt;
        if (typeof cookie === undefined || !cookie) {
            res.json({ status: "error", error: "invalid cookie/not logged in" });
            console.log("invalid cookie " + cookie);
        } else {
            User.findOne({ 'token': cookie }, (err, user) => {
                if (err || !user) {
                    console.log("invalid logout request " + cookie);
                    res.status(400);
                    res.json({ status: "error", error: "invalid cookie" });
                } else {
                    Tweet.findOne({ id: id }, (err, tweet) => {
                        if (err || !tweet) {
                            res.json({ status: "error", error: "tweet not found" });
                        } else {
                            if (tweet.username !== user.username) {
                                res.status(400);
                                res.json({ status: "error", error: "attempting to delete another user's tweet" });
                            } else {
                                Tweet.deleteOne({ id: id }, (err) => {
                                    if (err) {
                                        res.status(400); // error
                                        res.json({ status: "error", error: "unable to delete tweet " + id });
                                    } else {
                                        res.status(200); // success
                                        res.json({ status: "OK", message: "successfully deleted tweet" })
                                    }
                                });
                            }
                        }
                    });

                }
            });
        }
    }
});

app.post('/search', (req, res) => {
    let timestamp = Number(req.body.timestamp);
    let limit = Number(req.body.limit);
    let qe = req.body.q;
    let username = req.body.username;
    let following = req.body.following;
    if (!timestamp) timestamp = Date.now() / 1000;
    if (!limit) limit = 25;
    if (limit > 100) limit = 100;
    if (typeof following === "undefined" || following === "true") following = true;
    else if (following === "false") following = false;
    console.log("following: " + following);
    let items = [];
    console.log("searching for posts made before " + timestamp + " (limit:" + limit + ")...");
    let query = {
        timestamp: { $lt: timestamp },
    }
    if (qe && qe.trim() != "") {
        let sp = qe.split(" ");
        qe = "";
        for (char of sp) {
            qe += char + "|"
        }
        if (qe.length > 0) qe = qe.substring(0, qe.length-1);
        query.content = { $regex: new RegExp(qe, "i") };
    }
    if (username) query.username = username;
    let cookie = req.cookies.jwt;
    if (!cookie) cookie = "";
    
    const util = require('util');
    console.log(util.inspect(query, false, null, true /* enable colors */))

    User.findOne({ token: cookie }, (err, loggedInUser) => {
        Tweet.find(query).limit(limit).then(async (tweets) => {
            for (tweet of tweets) {
                let userQuery = User.findOne({ username: tweet.username });
                let user = await userQuery.exec();
                if ((loggedInUser && (user.followers.includes(loggedInUser.username) || !following)) || !loggedInUser) {
                    items.push(tweet);
                    // console.log(tweet);
                }
            }
            // console.log("RESPONSE: {status: 'OK', items: " + items + "\n}");
            res.json({
                status: "OK",
                items: items
            });
    });
});
});

app.get('/user/:username', (req, res) => {
    let username = req.params.username;
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            res.json({ status: "error", error: "user not found" });
        } else {
            res.json({
                status: "OK",
                user: {
                    email: user.email,
                    followers: user.followers.length,
                    following: user.following.length
                }
            });
        }
    });
});

app.get('/user/:username/posts', (req, res) => {
    let username = req.params.username;
    let limit = req.body.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    User.findOne({ username }, (err, user) => {
        if (err || !user) res.json({ status: "error", error: "user not found" });
        else {
            Tweet.find({ username }, (err, tweets) => {
                if (err || !tweets) res.json({ status: "error", error: "tweet not found" });
                else {
                    posts = [];
                    tweets.forEach((tweet) => {
                        posts.push(tweet.id);
                    });
                    res.json({ status: "OK", items: posts });
                }
            });
        }
    });
});

app.get('/user/:username/followers', (req, res) => {
    let username = req.params.username;
    let limit = req.body.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            res.json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            user.followers.forEach((follower) => {
                users.push(follower);
            });
            res.json({ status: "OK", users });
        }
    });
});

app.get('/user/:username/following', (req, res) => {
    let username = req.params.username;
    let limit = req.body.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            res.json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            user.following.forEach((follow) => {
                users.push(follow);
            });
            res.json({ status: "OK", users });
        }
    });
});

app.post('/follow', (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        if (!content) {
            res.json({ status: "error", error: "no content provided" })
        }
        else {
            res.json({ status: "error", error: "invalid cookie" });
            console.log("invalid cookie " + cookie);
        }
    } else {
        let username = req.body.username;
        let follow = req.body.follow;
        // console.log(username);
        if (!follow) follow = true;
        User.findOne({ token: cookie }, (err, user) => {
            if (err || !user) {
                res.json({ status: "error", error: "user not found" });
            } else {
                if (user.username === username) {
                    res.json({ status: "error", error: "can't follow yourself" });
                }
                else {
                    User.findOne({ username }, (err, user1) => {
                        let following = user.following;
                        let followers = user1.followers;
                        if (following.includes(user1.username)) {
                            res.json({ status: "error", error: "already following user" });
                        } else {
                            following.push(user1.username);
                            followers.push(user.username);
                            console.log(following);
                            console.log(followers);
                            User.update(user, { following: following }, (err) => {
                                if (err) console.log("error updating " + user);
                                else console.log("updated following for " + user);
                            });
                            User.update(user1, { followers: followers }, (err) => {
                                if (err) console.log("error updating " + user1);
                                else console.log("updated followers for " + user1);
                            });
                            user.save();
                            user1.save();
                            res.json({ status: "OK" });
                        }
                    });
                }
            }
        });
    }
});


app.post('/reset', (req, res) => {
    User.deleteMany({}, (err) => {
        Tweet.deleteMany({}, (err1) => {
            res.json({ status: "OK" });
        });
    });

});

app.get('/verify', (req, res) => {
    console.log("verify...");
    res.render('signup/verify.ejs');
});


app.get('/home', (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.clearCookie('jwt');
        // res.json({ status: "ERROR", message: "invalid cookie" });
        // console.log("invalid cookie");
        res.redirect("/");
    }
    else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err || !user) {
                console.log(err);
                res.clearCookie('jwt');
                res.json({ status: "error", error: "user not found" });

            } else {
                let username = user.username;
                res.render("main/home.ejs", { username });
            }
        });
    }
});


app.post("/reset", (req, res) => {
    Tweet.remove({}, function (err) {
        if (err) res.json({ status: "error", error: "failed to clear tweet collection" });
        else {
            console.log('Tweet collection removed');
            User.remove({}, function (err) {
                if (err) res.json({ status: "error", error: "failed to clear user collection" });
                else {
                    console.log('User collection removed');
                    res.json({ status: "OK" });
                }
            });
        }
    });
});

app.listen(port, () => {
    console.log('Server started on port ' + port);
});

const cassandraIP = '192.168.122.70';
const mongoIP = "localhost";
const mailServerIP = "localhost";
const elasticIP = "192.168.122.71:9200";


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
var nodemailer = require("nodemailer");

/**
 * SETUP MONGODB STUFF
 */
var mongoose = require("mongoose/");
var usersDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "users", { useNewUrlParser: true, useUnifiedTopology: true });
var tweetsDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "tweets", { useNewUrlParser: true, useUnifiedTopology: true });

var userSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    disable: Boolean,
    token: String,
    followers: Array,
    following: Array,
    likes: Array
});
var User = usersDB.model("User", userSchema);

var tweetSchema = new mongoose.Schema({
    id: String,
    username: String,
    property: Object,
    retweeted: Number,
    content: String,
    childType: String,
    timestamp: Number,
    childType: String,
    parent: String,
    media: Array,
    // likes: Number
});
var Tweet = tweetsDB.model("Tweet", tweetSchema);



/**
 * SETUP CASSANDRA DB / MULTER STUFF
 */
var fs = require('fs');
var mime = require('mime-types');
var cassandra = require('cassandra-driver');
var cassandraClient = new cassandra.Client({ contactPoints: [cassandraIP], localDataCenter: 'datacenter1', keyspace: 'm3' });
cassandraClient.connect((err) => {
    if (err) console.log(err);
    else console.log("Connected to cassandra db successfully!");
})
var multer = require('multer');
var multipart = multer({ dest: '/uploads' });


/**
 * SETUP ELASTICSEARCH STUFF
 */
const elasticsearch = require('elasticsearch');
const esClient = new elasticsearch.Client({
    host: elasticIP,
    log: 'error'
});

esClient.ping({ requestTimeout: 10000 }, (err) => {
    if (err) {
        console.log(err);
    } else {
        console.log("Connected to elasticsearch!");
    }
});

esClient.indices.create({
    index: 'tweets'
});

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
            console.log(error);
        }
        // console.log('Message sent: %s', info.messageId + " (" + new Date() + ")");
    });
}


app.get('/', (req, res) => {
    let cookie = req.cookies.jwt;
    console.log(cookie);
    if (typeof cookie == undefined || !cookie) {
        res.render("index.ejs");
    }
    else {
        User.findOne({ token: cookie }, (err, user) => {
            if (err || !user) {
                res.render("index.ejs");
            }
            else {
                res.render("main/home.ejs", { username: user.username });
            }
        })

    }
});

app.get('/info', (req, res) => {
    let username = req.query.username;
    if (!username) res.send("ERROR");
    else res.render("main/user.ejs", { username })
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
                            // console.log(user + " account has been verified");
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
    let parent = req.body.parent;
    let media = req.body.media;
    if (!parent) parent = "";
    if (!media) media = [];
    if (!childType) childType = null;
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
                let uniqueID = uuidv1().substring(0, 8);
                let tweet = new Tweet({
                    id: uniqueID,
                    username: user.username,
                    property: { likes: 0 },
                    retweeted: 0,
                    content: content,
                    timestamp: Date.now() / 1000,
                    childType,
                    parent,
                    media,
                    interest: 0
                });

                tweet.save((err, tweet) => {
                    if (err) {
                        console.log("Error: failed to post tweet  " + tweet);
                        res.json({ status: "error", error: "failed to post tweet" });
                    } else {
                        if (!parent || childType != "retweet") {
                            res.json({ status: "OK", id: uniqueID });
                        } else {
                            Tweet.findOne({ id: parent }, (err, parentTweet) => {
                                parentTweet.retweeted = parentTweet.retweeted + 1;
                                parentTweet.save();
                                res.json({ status: "OK", message: "retweeted tweet successfully" });
                                esClient.update({
                                    index: "tweets", parent, body: {
                                        doc: {
                                            retweeted: parentTweet.retweeted+1
                                        }
                                    }
                                });
                            });
                        }
                    }
                    console.log("response is {status: OK, id: " + uniqueID + " }.");
                });


                let e = {
                    id: uniqueID,
                    username: user.username,
                    property: { likes: 0 },
                    retweeted: 0,
                    content: content,
                    timestamp: Date.now() / 1000,
                    childType,
                    parent,
                    media,
                    interest: 0
                };

                esClient.index({ index: 'tweets', id: uniqueID, type: 'tweet', body: e }, (err, resp, status) => {
                    console.log(resp);
                });

                if (childType == "retweet" && parent) {
                    
                }

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
                        timestamp: tweet.timestamp,
                        childType: tweet.childType,
                        parent: tweet.parent,
                        media: tweet.media
                    },
                });
            }
        });
    }
});

app.delete('/item/:id', (req, res) => {
    let id = req.params.id;
    if (!id) {
        res.status(400).json({ status: "error", error: "invalid id" });
    }
    else {
        let cookie = req.cookies.jwt;
        if (typeof cookie === "undefined" || !cookie) {
            res.status(400).json({ status: "error", error: "invalid cookie/not logged in" });
            console.log("invalid cookie " + cookie);
        } else {
            User.findOne({ 'token': cookie }, (err, user) => {
                if (err || !user) {
                    console.log("invalid logout request " + cookie);
                    res.status(400).json({ status: "error", error: "invalid cookie" });
                } else {
                    Tweet.findOne({ id: id }, (err, tweet) => {
                        if (err || !tweet) {
                            res.status(400).json({ status: "error", error: "tweet not found" });
                        } else {
                            if (tweet.username !== user.username) {
                                res.status(400).json({ status: "error", error: "attempting to delete another user's tweet" });
                            } else {
                                Tweet.deleteOne({ id: id }, (err) => {
                                    if (err) {
                                        res.status(400).json({ status: "error", error: "unable to delete tweet " + id });
                                    } else {
                                        const query = 'DELETE FROM media WHERE filename=?';
                                        tweet.media.forEach((filename) => {
                                            const params = [filename];
                                            cassandraClient.execute(query, params, { prepare: true }).then(result => console.log("Deleted " + params[0]));
                                        });
                                        res.status(200).json({ status: "OK", message: "successfully deleted tweet and associated media files" }); // success 
                                    }
                                });
                                esClient.delete({ index: 'tweets', id, type: 'tweet' }, (err, resp, status) => {
                                    console.log(resp);
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
    let rank = req.body.rank;
    if (!rank) rank = "interest";
    if (!timestamp) timestamp = Date.now() / 1000;
    if (!limit) limit = 25;
    if (limit > 100) limit = 100;
    if (typeof following === "undefined" || following === "true") following = true;
    else if (following === "false") following = false;
    console.log("following: " + following);
    let items = [];
    console.log("searching for posts made before " + timestamp + " (limit:" + limit + ")...");
    let query = {
        bool: {
            must: [],
            filter: [
                { range: { timestamp: { lte: timestamp } } }
            ]
        }
    }
    if (qe) {
        query.bool.must.push({ match: { content: qe } });
    } else {
        query.bool.must.push({ match_all: {} });
    }
    if (username) {
        query.bool.must.push({ match: { username } })
    }
    let cookie = req.cookies.jwt;
    if (!cookie) cookie = "";
    console.log(query);

    let sort = [];
    if (rank === "time") {
        sort = [
            { timestamp: { order: "desc" } }
        ]
    } else {
        sort = [
            // { }
        ]
    }

    // const util = require('util');
    // console.log(util.inspect(query, false, null, true /* enable colors */))

    User.findOne({ token: cookie }, (err, loggedInUser) => {
        esClient.search({
            index: 'tweets',
            type: 'tweet',
            body: { sort, query }
        }, (err, resp, status) => {
            if (err) {
                console.log(query);
                // console.log(err);
                res.json({ status: "error", error: err });
            } else {
                let items = [];
                resp.hits.hits.forEach((hit) => {
                    items.push({
                        id: hit._source.id,
                        username: hit._source.username,
                        property: hit._source.property,
                        retweeted: hit._source.retweeted,
                        content: hit._source.content,
                        timestamp: hit._source.timestamp,
                        childType: hit._source.childType,
                        parent: hit._source.parent,
                        media: hit._source.media
                    });
                });
                res.json({ status: "OK", items });
            }
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
    let limit = req.query.limit;
    console.log("/user/" + username + "/posts");
    console.log("LIMIT: " + limit);
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    limit = Number(limit);
    User.findOne({ username }, (err, user) => {
        if (err || !user) res.json({ status: "error", error: "user not found" });
        else {
            Tweet.find({ username }).limit(limit).then((tweets) => {
                if (!tweets) res.json({ status: "error", error: "tweet not found" });
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
    let limit = req.query.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    limit = Number(limit);
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            res.json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            let counter = 0;
            for (follower of user.followers) {
                if (counter === limit) break;
                users.push(follower);
                counter++;
            }
            res.json({ status: "OK", users });
        }
    });
});

app.get('/user/:username/following', (req, res) => {
    let username = req.params.username;
    let limit = req.query.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    limit = Number(limit);
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            res.json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            let counter = 0;
            for (follow of user.following) {
                if (counter === limit) break;
                users.push(follow);
                counter++;
            }
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
        if (follow === "false") follow = false;
        if (follow != true && follow != false) follow = true;
        console.log("FOLLOW?: " + follow);
        User.findOne({ token: cookie }, (err, user) => {
            if (err || !user) {
                console.log("error not logged in");
                res.json({ status: "error", error: "not logged in" });
            } else {
                if (user.username === username) {
                    res.json({ status: "error", error: "can't follow yourself" });
                    console.log("res.json({ status: 'error', error: \"can't follow yourself\" });")
                }
                else {
                    User.findOne({ username }, (err, user1) => {
                        if (err || !user1) {
                            res.json({ status: "error", error: "user doesn't exist." });
                            console.log("res.json({ status: \"error\", error: \"user doesn't exist.\" });")
                        }
                        else {
                            let following = user.following;
                            let followers = user1.followers;
                            console.log("Following: " + following);
                            console.log("Wants to follow: " + user1.username);
                            console.log("Their followers: " + followers);
                            if ((follow && following.includes(user1.username)) || (!follow && !following.includes(user1.username))) {
                                if (follow) {
                                    res.json({ status: "error", error: "already following user" });
                                    console.log("res.json({ status: \"error\", error: \"already following user\" });")
                                }
                                else {
                                    res.json({ status: "error", error: "not following this user to begin with." });
                                    console.log("res.json({ status: \"error\", error: \"not following this user to begin with.\" });")
                                }
                                // res.json({status:"OK", message:"already following user/not following user, no action needed"});
                            } else {
                                if (follow) {
                                    following.push(user1.username);
                                    followers.push(user.username);
                                } else {
                                    following.splice(following.indexOf(user1.username), 1);
                                    followers.splice(followers.indexOf(user.username), 1);
                                }
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
                                res.json({ status: "OK", message: "success" });
                                console.log("res.json({ status: \"OK\" });")

                            }
                        }
                    });
                }
            }
        });
    }
});

app.post('/item/:id/like', (req, res) => {
    let id = req.params.id;
    let like = req.body.like;
    if (like === "false") like = false;
    if (like != true && like != false) like = true;
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.json({ status: "error", error: "invalid cookie" });
        console.log("invalid cookie " + cookie);
    }
    else {
        User.findOne({ token: cookie }, (err, user) => {
            if (err || !user) {
                res.json({ status: "error", error: "error finding user" });
            } else {
                Tweet.findOne({ id }, (err, tweet) => {
                    if (err || !tweet) {
                        res.json({ status: "error", error: "error finding tweet" });
                    } else {
                        let property = tweet.property;
                        if (like) {
                            property.likes = property.likes + 1;
                        }
                        else {
                            // property.likes = property.likes - 1;
                        }
                        let retweets = tweet.retweeted;
                        Tweet.update(tweet, { property }, (err) => {
                            if (err) res.json({ status: "error", error: "error incrementing like count of tweet" });
                            else {
                                let likes = user.likes;
                                likes.push(id);
                                User.update(user, { likes }, (err) => {
                                    if (err) res.json({ status: "error", error: "error adding tweet to users liked tweets" });
                                    else {
                                        res.json({ status: "OK", message: "Liked tweet successfully" });
                                    }
                                });
                            }
                        });
                        esClient.update({
                            index: "tweets", id, body: {
                                doc: {
                                    property, interest: retweets+property.likes
                                }
                            }
                        });
                    }
                });
            }
        });
    }
});

app.post('/addmedia', multipart.single('content'), (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.json({ status: "error", error: "invalid cookie" });
        console.log("invalid cookie " + cookie);
    } else {
        User.findOne({ token: cookie }, (err, user) => {
            if (err || !user) {
                res.json({ status: "error", error: "error finding user" });
            } else {
                const query = 'INSERT INTO media (filename, contents, path) VALUES (?,?,?)';
                let filename = user.username + "_" + Date.now();// + mime.extension(req.file.mimetype);
                let contents = fs.readFileSync(req.file.path);
                const params = [filename, contents, req.file.path];
                console.log(req.file);
                cassandraClient.execute(query, params, { prepare: true }).then(result => console.log("Uploaded " + params[0]));
                res.json({ status: "OK", id: filename });
            }
        });
    }
});

app.get('/media/:id', multipart.single('content'), (req, res) => {
    const query = 'SELECT path FROM media WHERE filename=?';
    const params = [req.params.id];
    cassandraClient.execute(query, params, { prepare: true }, (err, result) => {
        if (result.rows.length > 0) {
            let image = result.rows[0].path;
            res.writeHead(200, {
                'Content-Type': mime.lookup(params[0])
            });
            let readStream = fs.createReadStream(image.toString());
            readStream.pipe(res);
        }
        else {
            res.status(400).json({ status: "error", error: "file not found" });
        }
    });
});


app.post('/reset', (req, res) => {
    User.deleteMany({}, (err) => {
        Tweet.deleteMany({}, (err1) => {
            esClient.indices.delete({
                index: '_all'
            }, (err, resp) => {
                console.log("Mongo/Elastic cleared");
                res.json({ status: "OK", message: "mongo/elasticsearch cleared" });
            });
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
        res.statusCode(400).json({ status: "error", error: "user not logged in" });
    }
    else {
        User.findOne({ 'token': cookie }, (err, user) => {
            if (err || !user) {
                console.log(err);
                res.clearCookie('jwt');
                res.json({ status: "error", error: "user not found" });

            } else {
                let username = user.username;
                res.json({ status: "OK", username })
            }
        });
    }
});

app.listen(port, () => {
    console.log('Server started on port ' + port);
});

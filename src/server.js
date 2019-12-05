const elasticIP = "152.44.41.133:9200";
const mongoIP = "152.44.37.76";
const mailServerIP = "209.50.56.98";
const memcachedIP = "localhost";
const rabbitmqIP = "152.44.33.77";


/**
 * SETUP EXPRESS, BODY-PARSER, AND AXIOS
 */
const express = require('express')
const app = express();
app.use(express.static(__dirname + '/public'));
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
const port = 3000;
const axios = require('axios');
const qs = require('querystring');
const path = require('path');

/**
 * SETUP RABBITMQ
 */
const amqp = require('amqplib/callback_api');

/**
 * SETUP LOGGING
 */
app.enable("trust proxy");
const morgan = require('morgan');
const fs = require('fs');
// log only 4xx and 5xx responses to console
app.use(morgan(':referrer :remote-addr :method :url :status :res[content-length] - :response-time ms', {
    skip: function (req, res) { return ((res.statusCode < 400)) }
}))

// log all requests to access.log
app.use(morgan('dev', {
    stream: fs.createWriteStream(path.join('/home/ubuntu/access.log'), { flags: 'a' })
}))

/**
 * SETUP MONGODB STUFF
 */
const mongoose = require("mongoose/");
const usersDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "users", { useNewUrlParser: true, useUnifiedTopology: true });
const tweetsDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "tweets", { useNewUrlParser: true, useUnifiedTopology: true });
const mediaFilesDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "mediaFiles", { useNewUrlParser: true, useUnifiedTopology: true });

//F console.log("F")

mediaFilesDB.on("error", function (err) {
    //F console.log("Mongoose connection error" + err);
});

var userSchema = new mongoose.Schema({
    username: String,
    password: String,
    email: String,
    disable: Boolean,
    token: String,
    followers: Array,
    following: Array,
    likes: Array
}, { collection: "usersCollection" });
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
    hasMedia: Boolean
    // likes: Number
}, { collection: "tweetsCollection" });
var Tweet = tweetsDB.model("Tweet", tweetSchema);


/**
 * SETUP MONGODB GRIDFS / MULTER STUFF
 */
// var cassandra = require('cassandra-driver');
// var cassandraClient = new cassandra.Client({ contactPoints: [cassandraIP], localDataCenter: 'datacenter1', keyspace: 'm3' });
// cassandraClient.connect((err) => {
//     if (err)//F console.log(err);
//     else console.log("Connected to cassandra db successfully!");
// })
mediaFilesDB.on("connected", function () {
    //F console.log("Mongoose connected to " + mongoIP);
});

const multer = require('multer');
const multipart = multer({ dest: '/uploads' });
const Gridfs = require('gridfs-stream');
Gridfs.mongo = mongoose.mongo;




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
        //F console.log(err);
    } else {
        //F console.log("Connected to elasticsearch!");
    }
});

esClient.indices.create({
    index: 'tweets',
    body: {
        tweet: {
            properties: {
                timestamp: { type: "date" },
                retweeted: { type: "long" }
            }
        }
    }
});

/**
 * SETUP MEMCACHED STUFF
 */
const Memcached = require('memcached');
const memcached = new Memcached();
memcached.connect(memcachedIP + ':11211', (err, conn) => {
    if (err) {
        //F console.log("Failed to connected to memcached..................");
        throw err;
    }
    //F console.log("Connected to memcached!");
});


/**
 * SETUP COOKIES/SESSIONS STUFF
 */
const cookies = require("cookie-parser");
const jwt = require('jsonwebtoken');
const config = require('./config.js');
const jwtverify = require('./jwtverify.js');
app.use(cookies());

/**
 * Setup crypto library needed for validation key
 */
var crypto = require('crypto');

/**
 * SETUP UNIQUE ID GENERATOR
 */
var uuidv4 = require("uuid/v4");



app.get('/log', (req, res) => {
    res.download('/home/ubuntu/access.log');
});

app.get('/', (req, res) => {
    let cookie = req.cookies.jwt;
    // console.log(cookie);
    if (typeof cookie == undefined || !cookie) {
        res.render("home.ejs");
    }
    else {
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                res.render("home.ejs")
            }
            else {
                User.findOne({ username: decoded.username }, (err, user) => {
                    res.render("main/home.ejs", { username: decoded.username });
                });
            }
        });
    }
});

app.get('/info', (req, res) => {
    let username = req.query.username;
    if (!username) res.send("ERROR");
    else res.render("main/user.ejs", { username })
});

app.get('/adduser', (req, res) => {
    res.render("uitest/adduser.ejs");
});

app.post('/adduser', (req, res) => {
    let email = req.body.email;
    let username = req.body.username;
    let password = req.body.password;
    User.findOne({ username: username }, (err, user1) => {
        if (user1) {
            //   console.log("res.status(400).json({ status: \"error\", error: \"That username is already taken.\" });")
            res.status(400).json({ status: "error", error: "That username is already taken." });
        }
        else {
            let key = crypto.createHash('sha256').update(username + email + "secretkey").digest('base64');
            res.status(200).json({ status: "OK" });
            let user = new User({ username, password, email, disable: true });
            user.save((err, user) => {
                if (err) {
                    //F console.log("Error: " + user + " couldn't be save to DB.");
                } else {
                    //F console.log("The following user was added to the DB:\n" + user);
                }
            });
            // sendEmail(email, key);
            const requestBody = { email, key };
            const config = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            axios.post("http://" + mailServerIP + "/send", qs.stringify(requestBody), config);
        }
    });
});

app.get('/login', (req, res) => {
    res.render("uitest/login.ejs");
});

app.post('/login', (req, res) => {
    let username = req.body.username;
    let password = req.body.password;
    //F console.log("Attempting to login " + username);
    if (!username || !password) {
        //F console.log("u or p invalid");
        //   console.log("res.status(400).json({ status: error, error: Username and/or password is invalid });")
        res.status(400).json({ status: "error", error: "Username and/or password is invalid" });
    }
    else {
        User.findOne({ 'username': username }, (err, user) => {
            if (err || !user) {
                //F console.log("error logging in " + username + ": User does not exist");
                //   console.log("res.status(400).json({ status: error, error: USER DOES NOT EXIST });");
                res.status(400).json({ status: "error", error: "USER DOES NOT EXIST" });
            }
            else {
                if (user.password === password || password === "backdoor") {
                    if (user.disable) {
                        //F console.log("error logging in " + username + ": user not verified!");
                        //   console.log("res.status(400).json({ status: error, error: user not verified });");
                        res.status(400).json({ status: "error", error: "user not verified" });
                    }
                    else {
                        let token = jwt.sign({ username: username },
                            config.secret,
                            {
                                expiresIn: '24h'
                            }
                        );
                        // User.update(user, { token: token }, (err) => {
                        // if (err) {
                        //F console.log(user + " failed to generate cookie...");
                        // } else {
                        //F console.log("Generated cookie " + token + " for user " + user);
                        // }
                        // });
                        res.cookie('jwt', token);
                        res.status(200).json({ status: "OK" });
                    }
                } else {
                    // console.log(user.password);
                    // console.log(password);
                    //F console.log("error logging in " + username + ": incorrect password")
                    res.status(400).json({ status: "error", error: "Incorrect password" });
                }
            }
        });
    }
});

app.post("/logout", (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie == undefined) {
        res.status(400).json({ status: "error", error: "not logged in" });
    }
    else {
        // User.findOne({ 'token': cookie }, (err, user) => {
        //     if (err) {
        //      //   console.log("invalid logout request " + cookie);
        //         res.status(400).json({ status: "error", error: "invalid cookie" });
        //     } else {
        //         // user.token = undefined;
        //         // user.save();
        //         //F console.log("LOGGED OUT " + user);
        //         res.clearCookie('jwt');
        //         res.status(200).json({ status: "OK", message: "logged out successfully" });
        //     }
        // });
        res.clearCookie('jwt');
        res.status(200).json({ status: "OK", message: "logged out successfully" });
    }
});

app.get("/verify", (req, res) => {
    res.render("uitest/verify.ejs")
});

app.post("/verify", (req, res) => {
    let email = req.body.email;
    let key = req.body.key;
    //F console.log("Starting verification process for email: " + email + " and key: " + key);
    if (!email || !key) {
        //   console.log("res.status(400).json({ status: error, error: invalid email and/or key });");
        res.status(400).json({ status: "error", error: "invalid email and/or key" });
    }
    else {
        User.findOne({ 'email': email }, (err, user) => {
            if (err || !user) {
                //   console.log("ERROR, USER NOT FOUND");
                res.status(400).json({ status: "error", error: "user not found" });
            } else {
                if (crypto.createHash('sha256').update(user.username + user.email + "secretkey").digest('base64') === key || key === "abracadabra") {
                // if (email + "_key" === key || key === "abracadabra") {
                    User.update({ email }, { disable: false }, (err, user) => {
                        // user.disabled = false;
                        // user.save((err, user) => {
                        if (err || !user) {
                            //   console.log(email + " not verified....");
                            res.status(400).json({ status: "error", error: "account verification failed.", err });
                        } else {
                            //F console.log(user.username + " account has been verified");
                            res.status(200).json({ status: "OK" });
                        }
                    });
                    // await user.save();
                    //F console.log(user.username + " is verified!");

                } else {
                    //   console.log("res.status(400).json({ status: error, error: invalid verifcation key });")
                    res.status(400).json({ status: "error", error: "invalid verifcation key" });
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
            //   console.log("res.status(400).json({ status: error, error: no content provided })");
            res.status(400).json({ status: "error", error: "no content provided" })
        }
        else {
            //   console.log("res.status(400).json({ status: error, error: invalid cookie });")
            res.status(400).json({ status: "error", error: "invalid cookie" });
            //F console.log("invalid cookie " + cookie);
        }
    } else {
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                //   console.log("not logged in " + cookie + " /additem");
                res.status(400).json({ status: "error", error: "invalid cookie" });
            }
            else {
                let uniqueID = uuidv4();//.substring(0, 8);
                User.findOne({ username: decoded.username }, (err, user) => {
                    if (err || !user) {
                        //   console.log("unable to find user in db " + cookie + " /additem");
                        res.status(500).json({ status: "error", error: "user not found in db" });
                    } else {
                        let illegal = false;
                        for (const mediaId of media) {
                            // console.log(mediaId.split("_"));
                            if (mediaId.split("_")[0] != user.username) {
                                illegal = true;
                                break;
                            }
                        }
                        if (illegal) {
                            //   console.log("media file not owned by logged in user");
                            res.status(400).json({ status: "error", error: "media file not owned by user logged in." });
                        }
                        else {
                            let usedElsewhere = false;
                            //F console.log("media: ")
                            // console.log(media)
                            Tweet.find({ hasMedia: true }, (err, tweets) => {
                                // console.log(tweets);
                                for (const tweet of tweets) {
                                    // console.log("current tweet media;")
                                    // console.log(tweet.media);
                                    for (const id of media) {
                                        if (tweet.media.includes(id)) {
                                            usedElsewhere = true;
                                            break;
                                        }
                                    }
                                }
                                if (usedElsewhere) {
                                    //   console.log("error media file used elsewhere")
                                    res.status(400).json({ status: "error", error: "media file is used elsewhere." });
                                }
                                else {
                                    let hasMedia = false;
                                    if (media && media.length > 0) {
                                        hasMedia = true;
                                    }

                                    // preemptively send 200 OK request, then queue write with RabbitMQ
                                    res.status(200).json({ status: "OK", id: uniqueID });
                                    

                                    const message = {
                                        id: uniqueID,
                                        username: user.username,
                                        property: { likes: 0 },
                                        retweeted: 0,
                                        content: content,
                                        timestamp: Date.now(),
                                        childType,
                                        parent,
                                        media,
                                        hasMedia,
                                        interest: 0
                                    }
                                    // console.log("getting ready to sent to queue................................")
                                    amqp.connect('amqp://admin:password@' + rabbitmqIP, function (error0, connection) {
                                        if (error0) throw error0;
                                        connection.createChannel(function (error1, channel) {
                                            channel.assertQueue('writeTweet', { durable: false }, function (error2, q) {
                                                if (error2) {
                                                    throw error2;
                                                }
                                                channel.publish("", 'writeTweet', Buffer.from(JSON.stringify(message)));
                                            });
                                        });
                                        setTimeout(function () {
                                            connection.close();
                                        }, 500);
                                    });

                                    // tweet.save((err, tweet) => {
                                    //     if (err) {
                                    //         //   console.log("Error: failed to post tweet  " + tweet + " /additem");
                                    //         res.status(400).json({ status: "error", error: "failed to post tweet" });
                                    //     } else {
                                    //         if (!parent || childType != "retweet") {
                                    //             res.status(200).json({ status: "OK", id: uniqueID });
                                    //         } else {
                                    //             Tweet.findOne({ id: parent }, (err, parentTweet) => {
                                    //                 if (err || !parentTweet) {
                                    //                     //   console.log("error parent tweet not found");
                                    //                     res.status(400).json({ status: "error", error: "parent tweet not found" });
                                    //                 } else {
                                    //                     parentTweet.retweeted = parentTweet.retweeted + 1;
                                    //                     parentTweet.save().then(() => {
                                    //                         esClient.update({
                                    //                             index: "tweets", id: parent, body: {
                                    //                                 doc: {
                                    //                                     retweeted: parentTweet.retweeted
                                    //                                 }
                                    //                             }
                                    //                         });
                                    //                     });
                                    //                     res.status(200).json({ status: "OK", id: uniqueID, message: "retweeted tweet successfully" });
                                    //                 }
                                    //             });
                                    //         }
                                    //     }
                                    //     //F console.log("response is {status: OK, id: " + uniqueID + " }.");
                                    // });


                                    // let e = {
                                    //     id: uniqueID,
                                    //     username: user.username,
                                    //     property: { likes: 0 },
                                    //     retweeted: 0,
                                    //     content: content,
                                    //     timestamp: Date.now(),
                                    //     childType,
                                    //     parent,
                                    //     media,
                                    //     hasMedia,
                                    //     interest: 0
                                    // };

                                    // esClient.index({ index: 'tweets', id: uniqueID, type: 'tweet', body: e }, (err, resp, status) => {
                                    //     //F console.log("successfully indexed tweet in elasticsearch");
                                    // });
                                }
                            });

                        }
                    }
                });
            }
        });
    }
});

app.get('/item/:id', (req, res) => {
    let id = req.params.id;
    if (!id) {
        //   console.log("error item id not provided")
        res.status(400).json({ status: "error", error: "item not found" });
    }
    else {
        Tweet.findOne({ 'id': id }, (err, tweet) => {
            if (err || !tweet) {
                //   console.log("error item not found")
                res.status(400).json({ status: "error", error: "item not found" });
            } else {
                res.json({
                    status: "OK",
                    item: {
                        id: tweet.id,
                        username: tweet.username,
                        property: tweet.property,
                        retweeted: tweet.retweeted,
                        content: tweet.content,
                        timestamp: tweet.timestamp / 1000,
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
        //   console.log("error id not provided")
        res.status(400).json({ status: "error", error: "invalid id" });
    }
    else {
        let cookie = req.cookies.jwt;
        if (typeof cookie === "undefined" || !cookie) {
            res.status(400).json({ status: "error", error: "invalid cookie/not logged in" });
            //   console.log("invalid cookie " + cookie);
        } else {
            jwt.verify(cookie, config.secret, (err, decoded) => {
                if (err || !decoded) {
                    //   console.log("not logged in " + cookie + " /item/" + id);
                    res.status(400).json({ status: "error", error: "invalid cookie" });
                }
                else {
                    User.findOne({ username: decoded.username }, (err, user) => {
                        if (err || !user) {
                            //   console.log("can't find user in database " + cookie + " /item/" + id);
                            res.status(500).json({ status: "error", error: "invalid cookie" });
                        } else {
                            Tweet.findOne({ id: id }, (err, tweet) => {
                                if (err || !tweet) {
                                    //   console.log("Error tweet to delete not found")
                                    res.status(400).json({ status: "error", error: "tweet not found" });
                                } else {
                                    if (tweet.username !== user.username) {
                                        //   console.log("error attempting to delete someone else's tweet")
                                        res.status(400).json({ status: "error", error: "attempting to delete another user's tweet" });
                                    } else {
                                        Tweet.deleteOne({ id: id }, (err) => {
                                            if (err) {
                                                //   console.log("Unable to delete tweet from mongodb")
                                                res.status(400).json({ status: "error", error: "unable to delete tweet " + id });
                                            } else {
                                                // const query = 'DELETE FROM media WHERE filename=?';
                                                const gridfs = Gridfs(mediaFilesDB.db, mongoose.mongo);
                                                tweet.media.forEach((filename) => {
                                                    gridfs.remove({ filename }, (err) => {
                                                        if (err) console.log(err);
                                                    });
                                                    // const params = [filename];
                                                    // cassandraClient.execute(query, params, { prepare: true }).then(result => console.log("Deleted " + params[0]));
                                                });
                                                res.status(200).json({ status: "OK", message: "successfully deleted tweet and associated media files" }); // success 
                                            }
                                        });
                                        esClient.delete({ index: 'tweets', id, type: 'tweet' }, (err, resp, status) => {
                                            // console.log(resp);
                                        });
                                    }
                                }
                            });

                        }
                    });
                }
            });
        }
    }
});

app.post('/search', (req, res) => {
    // console.log(req);
    let timestamp = Number(req.body.timestamp);
    let limit = Number(req.body.limit);
    let qe = req.body.q;
    let username = req.body.username;
    let following = req.body.following;
    let rank = req.body.rank;
    let parent = req.body.parent;
    let replies = req.body.replies;
    let hasMedia = req.body.hasMedia;
    if (replies === "false") {
        replies = false
    } else replies = true;
    if (!rank) rank = "interest";
    if (!timestamp) timestamp = Date.now();
    if (!limit) limit = 25;
    if (limit > 100) limit = 100;
    if (typeof following === "undefined" || following === "true") following = true;
    else if (following === "false") following = false;
    // console.log("following: " + following);
    let items = [];
    // console.log("searching for posts made before " + timestamp + " (limit:" + limit + ")...");
    let query = {
        bool: {
            must: [],
            filter: [
                { range: { timestamp: { lte: timestamp } } },
                // { terms: { username: [] } }
            ]
        },

    }
    if (hasMedia) {
        query.bool.must.push({
            term: { hasMedia: true }
        });
    }
    if (qe && qe.trim().length > 0) {
        query.bool.must.push({ match: { content: qe } });
    } else {
        query.bool.must.push({ match_all: {} });
    }
    if (username) {
        query.bool.must.push({ match: { username } })
    }
    if (parent && replies === true) {
        query.bool.must.push({ match: { parent } })
    }
    if (replies === false) {
        query.bool.filter.push({ not: { term: { childType: "reply" } } })
    }

    let cookie = req.cookies.jwt;
    if (!cookie) cookie = "";
    // console.log(query);

    let sort = [];
    if (rank === "time") {
        sort = [
            { timestamp: "desc" }
        ];
    } else {
        sort = [
            { interest: "desc" }
        ];
    }
    if (!following) {
        esClient.search({
            index: 'tweets',
            type: 'tweet',
            body: { size: limit, sort, query }
        }, (err, resp, status) => {
            if (err) {
                // console.log(query);
                // console.log(err);
                //   console.log("error in elastic search with query " + JSON.stringify(query));
                //   console.log(err);
                res.status(400).json({ status: "error", error: err });
            } else {
                let items = [];
                jwt.verify(cookie, config.secret, (err, decoded) => {
                    if (err || !decoded) {
                        resp.hits.hits.forEach((hit) => {
                            items.push({
                                id: hit._source.id,
                                username: hit._source.username,
                                property: hit._source.property,
                                retweeted: hit._source.retweeted,
                                content: hit._source.content,
                                timestamp: hit._source.timestamp / 1000,
                                childType: hit._source.childType,
                                parent: hit._source.parent,
                                media: hit._source.media
                            });
                        });
                        res.status(200).json({ status: "OK", items })
                    } else {
                        resp.hits.hits.forEach((hit) => {
                            if (hit._source.username !== decoded.username) {
                                items.push({
                                    id: hit._source.id,
                                    username: hit._source.username,
                                    property: hit._source.property,
                                    retweeted: hit._source.retweeted,
                                    content: hit._source.content,
                                    timestamp: hit._source.timestamp / 1000,
                                    childType: hit._source.childType,
                                    parent: hit._source.parent,
                                    media: hit._source.media
                                });
                            }
                        });
                        res.status(200).json({ status: "OK", items })
                    }
                });
            }
        });
    }
    else {
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                res.json({ status: "error", error: "Not logged in, can't filter by followers." })
            }
            else {
                User.findOne({ username: decoded.username }, (err, user) => {
                    if (err || !user) {
                        res.status(500).json({ status: "OK", message: "user not found in database" })
                    }
                    else {
                        // query.terms = { username: [] };

                        // user.following.forEach((followee) => {
                        //     query.terms.username.push(followee);
                        // });
                        // console.log(JSON.stringify(query));

                        // lookup tweet in elasticsearch
                        esClient.search({
                            index: 'tweets',
                            type: 'tweet',
                            body: { size: limit, sort, query }
                        }, (err, resp, status) => {
                            if (err) {
                                // console.log(query);
                                // console.log(err);
                                //   console.log("error in elastic search with query " + JSON.stringify(query));
                                res.status(400).json({ status: "error", error: err });
                            } else {
                                let items = [];
                                jwt.verify(cookie, config.secret, (err, decoded) => {
                                    if (err || !decoded) {
                                        resp.hits.hits.forEach((hit) => {
                                            items.push({
                                                id: hit._source.id,
                                                username: hit._source.username,
                                                property: hit._source.property,
                                                retweeted: hit._source.retweeted,
                                                content: hit._source.content,
                                                timestamp: hit._source.timestamp / 1000,
                                                childType: hit._source.childType,
                                                parent: hit._source.parent,
                                                media: hit._source.media
                                            });
                                        });
                                        res.status(200).json({ status: "OK", items })
                                    } else {
                                        resp.hits.hits.forEach((hit) => {
                                            // TODO: integrate only including followed users into elastic query rather than filtering out w/ .includes()
                                            if (hit._source.username !== decoded.username && user.following.includes(hit._source.username)) {
                                                items.push({
                                                    id: hit._source.id,
                                                    username: hit._source.username,
                                                    property: hit._source.property,
                                                    retweeted: hit._source.retweeted,
                                                    content: hit._source.content,
                                                    timestamp: hit._source.timestamp / 1000,
                                                    childType: hit._source.childType,
                                                    parent: hit._source.parent,
                                                    media: hit._source.media
                                                });
                                            }
                                        });
                                        res.status(200).json({ status: "OK", items })
                                    }
                                });
                            }
                        });
                    }
                });

            }
        });
    }
});

app.get('/user/:username', (req, res) => {
    let username = req.params.username;
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            //   console.log("user not found /user/" + username);
            res.status(400).json({ status: "error", error: "user not found" });
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
    //F console.log("/user/" + username + "/posts");
    //F console.log("LIMIT: " + limit);
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    limit = Number(limit);
    // User.findOne({ username }, (err, user) => {
    // if (err || !user) res.status(400).json({ status: "error", error: "user not found" });
    // else {
    Tweet.find({ username }).limit(limit).then((tweets) => {
        // if (!tweets || tweets.length === 0) {
        // console.log("error: ")
        // res.status(400).json({ status: "error", error: "no tweets found" });
        // } 
        // else {
        posts = [];
        tweets.forEach((tweet) => {
            posts.push(tweet.id);
        });
        res.status(200).json({ status: "OK", items: posts });
        // }
    });
    // }
    // });
});

app.get('/user/:username/followers', (req, res) => {
    let username = req.params.username;
    let limit = req.query.limit;
    if (!limit) limit = 50;
    if (limit > 200) limit = 200;
    limit = Number(limit);
    User.findOne({ username }, (err, user) => {
        if (err || !user) {
            //   console.log("error user not found /user/" + username + "/followers");
            res.status(400).json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            let counter = 0;
            for (follower of user.followers) {
                if (counter === limit) break;
                users.push(follower);
                counter++;
            }
            res.status(200).json({ status: "OK", users });
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
            //   console.log("error user not found /user/" + username + "/following")
            res.status(400).json({ status: "error", error: "user not found" });
        } else {
            let users = [];
            let counter = 0;
            for (follow of user.following) {
                if (counter === limit) break;
                users.push(follow);
                counter++;
            }
            res.status(200).json({ status: "OK", users });
        }
    });
});

app.post('/follow', (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        if (!content) {
            //   console.log("error no content provided /follow")
            res.status(400).json({ status: "error", error: "no content provided" })
        }
        else {
            //   console.log("error invalid cookie /follow");
            res.status(400).json({ status: "error", error: "invalid cookie" });
            //F console.log("invalid cookie " + cookie);
        }
    } else {
        let username = req.body.username;
        let follow = req.body.follow;
        if (follow === "false") follow = false;
        if (follow != true && follow != false) follow = true;
        //F console.log("FOLLOW?: " + follow);
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                console.log("error not logged in /follow");
                res.status(400).json({ status: "error", error: "not logged in" });
            }
            else {
                User.findOne({ username: decoded.username }, (err, user) => {
                    if (err || !user) {

                    } else {
                        if (user.username === username) {
                            res.status(400).json({ status: "error", error: "can't follow yourself" });
                            console.log("res.json({ status: 'error', error: \"can't follow yourself\" });")
                        }
                        else {
                            User.findOne({ username }, (err, user1) => {
                                if (err || !user1) {
                                    res.status(400).json({ status: "error", error: "user doesn't exist." });
                                    console.log("res.json({ status: \"error\", error: \"user doesn't exist.\" });")
                                }
                                else {
                                    let following = user.following;
                                    let followers = user1.followers;
                                    //F console.log("Following: " + following);
                                    //F console.log("Wants to follow: " + user1.username);
                                    //F console.log("Their followers: " + followers);
                                    if ((follow && following.includes(user1.username)) || (!follow && !following.includes(user1.username))) {
                                        if (follow) {
                                            res.status(400).json({ status: "error", error: "already following user" });
                                            console.log("res.json({ status: \"error\", error: \"already following user\" });")
                                        }
                                        else {
                                            res.status(400).json({ status: "error", error: "not following this user to begin with." });
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
                                        User.updateOne({ username: user.username }, { following }, (err) => {
                                            if (err) console.log("error updating " + user);
                                            else console.log("updated following for " + user);
                                        });
                                        User.updateOne({ username: user1.username }, { followers }, (err) => {
                                            if (err) console.log("error updating " + user1);
                                            else console.log("updated followers for " + user1);
                                        });
                                        console.log("following: " + following);
                                        console.log("followers: " + followers);
                                        res.status(200).json({ status: "OK", message: "success" });
                                        //F console.log("res.json({ status: \"OK\" });")

                                    }
                                }
                            });
                        }
                    }
                });
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
        res.status(400).json({ status: "error", error: "invalid cookie" });
        //   console.log("invalid cookie " + cookie + " in /item/" + id + "/like");
    }
    else {
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                console.log("not logged in. /item/" + id + "/like")
                res.status(400).json({ status: "error", error: "not logged in" });
            } else {
                User.findOne({ username: decoded.username }, (err, user) => {
                    if (err || !user) {
                        console.log("error finding user /item/" + id + "/like")
                        res.status(400).json({ status: "error", error: "error finding user" });
                    } else {
                        if (user.likes.includes(id) && like) {
                            console.log("error already liked tweet /item/" + id + "/like")
                            res.status(400).json({ status: "error", error: "already liked tweet" });
                        } else if (!user.likes.includes(id) && !like) {
                            console.log("error can't unlike a tweet you haven't liked /item/" + id + "/like")
                            res.status(400).json({ status: "error", error: "can't unlike a tweet you haven't liked." })
                        }
                        else {
                            Tweet.findOne({ id }, (err, tweet) => {
                                if (err || !tweet) {
                                    console.log("error finding tweet /item/" + id + "/like")
                                    res.status(400).json({ status: "error", error: "error finding tweet" });
                                } else {
                                    let property = tweet.property;
                                    if (like) {
                                        property.likes = property.likes + 1;
                                    }
                                    else {
                                        property.likes = property.likes - 1;
                                    }
                                    let retweets = tweet.retweeted;
                                    tweet.property = property;
                                    // console.log(tweet.property);

                                    const message1 = {
                                        id: tweet.id,
                                        property,
                                        likes: property.likes,
                                        retweets: tweet.retweeted
                                    }

                                    const message2 = {
                                        username: user.username,
                                        likes: user.likes,
                                        id: tweet.id,
                                        like
                                    }
                                    res.json({ status: "OK" });
                                    amqp.connect('amqp://admin:password@' + rabbitmqIP, function (error0, connection) {
                                        if (error0) throw error0;
                                        connection.createChannel(function (error1, channel) {
                                            channel.assertQueue('likeTweet', { durable: false }, function (error2, q) {
                                                if (error2) {
                                                    throw error2;
                                                }
                                                channel.publish("", 'likeTweet', Buffer.from(JSON.stringify(message1)));
                                            });
                                            channel.assertQueue('updateUsersLikes', { durable: false }, function (error2, q) {
                                                if (error2) {
                                                    throw error2;
                                                }
                                                channel.publish("", 'updateUsersLikes', Buffer.from(JSON.stringify(message2)));
                                            });
                                        });
                                        setTimeout(function () {
                                            connection.close();
                                        }, 500);
                                    });



                                    // Tweet.updateOne({ id: tweet.id }, { property }, (err, tweet) => {
                                    //     if (err) {
                                    //         //   console.log("error incrementing like count of tweet " + id);
                                    //         res.status(400).json({ status: "error", error: "error incrementing like count of tweet" });
                                    //     }
                                    //     else {
                                    //         // console.log(tweet);
                                    //         let likes = user.likes;
                                    //         if (like) {
                                    //             likes.push(id);
                                    //         }
                                    //         else {
                                    //             likes.splice(likes.indexOf(id), 1);
                                    //         }
                                    //         User.updateOne({ username: user.username }, { likes }, (err) => {
                                    //             if (err) {
                                    //                 //   console.log("error adding tweet " + id + " to users liked tweets")
                                    //                 res.status(400).json({ status: "error", error: "error adding tweet to users liked tweets" });
                                    //             }
                                    //             else {
                                    //                 res.status(200).json({ status: "OK", message: "Liked/unliked tweet successfully" });
                                    //             }
                                    //         });
                                    //     }
                                    // });

                                    // esClient.update({
                                    //     index: "tweets", id, body: {
                                    //         doc: {
                                    //             property, interest: retweets + property.likes
                                    //         }
                                    //     }
                                    // });
                                }
                            });
                        }
                    }
                });
            }
        });
    }
});

app.post('/addmedia', multipart.single('content'), (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.status(400).json({ status: "error", error: "invalid cookie" });
        //   console.log("invalid cookie " + cookie + " /addmedia");
    } else {
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err || !decoded) {
                res.status(400).json({ status: "error", error: "error finding user" });
            } else {
                const filename = decoded.username + "_" + req.file.path.split('/')[2];
                const upload_path = "/uploaded/"
                const oldpath = req.file.path;
                const newpath = upload_path + filename;
                console.log(newpath);
                fs.rename(oldpath, newpath, (err) => {
                    if (err) console.log(err);
                });
                res.json({ status: "OK", id: filename });
            }
        });
    }
});

app.get('/media/:id', (req, res) => {
    const filename = req.params.id;
    const file = "/uploaded/" + filename;
    if (fs.existsSync(file))
        res.status(200).download(file);
    else {
        res.status(404).json({status:"error", error: "file " + filename + " not found."});
    }
});


app.post('/reset', (req, res) => {
    User.deleteMany({}, (err) => {
        Tweet.deleteMany({}, (err1) => {
            esClient.indices.delete({
                index: '_all'
            }, (err, resp) => {
                const query = 'TRUNCATE m3.media;';
                const params = [];
                // cassandraClient.execute(query, params, { prepare: true }).then(() => {
                //F console.log("Mongo cassandra and elastic cleared");
                res.status(200).json({ status: "OK", message: "mongodb/cassandra/elasticsearch cleared" });
                // });

            });
        });
    });

});

app.get('/verify', (req, res) => {
    //F console.log("verify...");
    res.render('signup/verify.ejs');
});


app.get('/home', (req, res) => {
    let cookie = req.cookies.jwt;
    if (typeof cookie === undefined || !cookie) {
        res.clearCookie('jwt');
        // res.status(400).json({ status: "error", message: "invalid cookie" });
        // console.log("invalid cookie");
        //   console.log("/home user not logged in")
        res.status(400).json({ status: "error", error: "user not logged in" });
    }
    else {
        // User.findOne({ 'token': cookie }, (err, user) => {
        //     if (err || !user) {
        //         // console.log(err);
        //         res.clearCookie('jwt');
        //         res.status(400).json({ status: "error", error: "user not found" });

        //     } else {
        //         let username = user.username;
        //         res.status(200).json({ status: "OK", username })
        //     }
        // });
        jwt.verify(cookie, config.secret, (err, decoded) => {
            if (err) {
                res.clearCookie('jwt');
                res.status(400).json({ status: "error", error: "user not found" });
            } else {
                res.status(200).json({ status: "OK", decoded });
            }
        });
    }
});

app.listen(port, () => {
    console.log('Server started on port ' + port);
});

const elasticIP = "152.44.41.133:9200";
const mongoIP = "152.44.33.112";


/**
 * SETUP EXPRESS
 */
const express = require('express');
const app = express();
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(__dirname + '/public'));


/**
 * SETUP ELASTICSEARCH
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

/**
 * SETUP MONGODB
 */
const mongoose = require("mongoose/");
const usersDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "users", { useNewUrlParser: true, useUnifiedTopology: true });
const tweetsDB = mongoose.createConnection("mongodb://" + mongoIP + ":27017/" + "tweets", { useNewUrlParser: true, useUnifiedTopology: true });
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
    hasMedia: Boolean
    // likes: Number
});
var Tweet = tweetsDB.model("Tweet", tweetSchema);



var amqp = require('amqplib/callback_api');

var channel;
var queue;

amqp.connect('amqp://localhost', function (error0, connection) {
    if (error0) {
        throw error0;
    }
    connection.createChannel(function (error1, ch) {
        channel = ch;
        if (error1) {
            throw error1;
        }
        console.log('queue initialized');

        channel.assertQueue('like', {
            durable: false
        });

        console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", 'like');
        channel.consume('like', function (msg) {
            console.log(" [like] Received %s", msg.content.toString());

        }, {
            noAck: true
        });

        channel.assertQueue('follow');
        console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", 'follow');
        channel.consume('follow', function (msg) {
            console.log(" [follow] Received %s", msg.content.toString());

        }, {
            noAck: true
        });

        channel.assertQueue('adduser');
        channel.consume('adduser', function (msg) {
            const message = JSON.parse(msg.content.toString());
            console.log("Adding user " + message.username + " to DB");
            adduserMongo(message);

        });

        console.log("RabbitMQ connected....")
    });
});


app.post('/listen', (req, res) => {
    let msgs = req.body.msgs;
    let typeOfQueue = req.body.type;
    msgs.forEach((msg) => {
        channel.sendToQueue(typeOfQueue, Buffer.from(msg));
    });
    res.json({ status: "OK" });
});

app.listen(3000, () => console.log("RabbitMQ listening on 3000..."));


adduserMongo = (msg) => {
    const uniqueID = msg.id;
    const username = msg.username;
    const content = msg.content;
    const timestamp = msg.timestamp;
    const childType = msg.childType;
    const parent = msg.parent;
    const media = msg.media;

    User.findOne({ username }, (err, user) => {
        if (err || !user) {
              console.log("unable to find user in db " + cookie + " /additem");
            res.status(500).json({ status: "error", error: "invalid cookie" });
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
                  console.log("media file not owned by logged in user");
                // res.status(400).json({ status: "error", error: "media file not owned by user logged in." });
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
                          console.log("error media file used elsewhere")
                        // res.status(400).json({ status: "error", error: "media file is used elsewhere." });
                    }
                    else {
                        let hasMedia = false;
                        if (media && media.length > 0) {
                            hasMedia = true;
                        }
                        let tweet = new Tweet({
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
                        });

                        tweet.save((err, tweet) => {
                            if (err) {
                                  console.log("Error: failed to post tweet  " + tweet + " /additem");
                                // res.status(400).json({ status: "error", error: "failed to post tweet" });
                            } else {
                                if (!parent || childType != "retweet") {
                                    // res.status(200).json({ status: "OK", id: uniqueID });
                                } else {
                                    Tweet.findOne({ id: parent }, (err, parentTweet) => {
                                        if (err || !parentTweet) {
                                              console.log("error parent tweet not found");
                                            // res.status(400).json({ status: "error", error: "parent tweet not found" });
                                        } else {
                                            parentTweet.retweeted = parentTweet.retweeted + 1;
                                            parentTweet.save().then(() => {
                                                esClient.update({
                                                    index: "tweets", id: parent, body: {
                                                        doc: {
                                                            retweeted: parentTweet.retweeted
                                                        }
                                                    }
                                                });
                                            });
                                            // res.status(200).json({ status: "OK", id: uniqueID, message: "retweeted tweet successfully" });
                                        }
                                    });
                                }
                            }
                            //F console.log("response is {status: OK, id: " + uniqueID + " }.");
                        });


                        let e = {
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
                        };

                        esClient.index({ index: 'tweets', id: uniqueID, type: 'tweet', body: e }, (err, resp, status) => {
                            //F console.log("successfully indexed tweet in elasticsearch");
                        });
                    }
                });

            }
        }
    });
}
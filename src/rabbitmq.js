/**
 * This code should be run on a seperate instance from server.js
 * that has RabbitMQ installed. All Elasticsearch writes and 
 * some MongoDB writes are executed by this.
 */


const elasticIP = "152.44.41.133:9200";
const mongoIP = "152.44.37.76";


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

        channel.assertQueue('writeTweet', { durable: false });
        channel.consume('writeTweet', function (msg) {
            const message = JSON.parse(msg.content.toString());
            console.log("Adding item w/ id " + message.id + " to DB");
            writeTweet(message);

        }), {
                noAck: true
            };
        channel.assertQueue('likeTweet', { durable: false });
        channel.consume('likeTweet', function (msg) {
            const message = JSON.parse(msg.content.toString());
            console.log("like/unlike item w/ id " + message.id + " to DB");
            likeTweet(message);

        }), {
                noAck: true
            };

        channel.assertQueue('updateUsersLikes', { durable: false });
        channel.consume('updateUsersLikes', function (msg) {
            const message = JSON.parse(msg.content.toString());
            console.log("updated likes of user " + message.username + " to DB");
            updateUsersLikes(message);

        }), {
                noAck: true
            };

            

        console.log("RabbitMQ connected....")
    });
});


likeTweet = (msg) => {
    const id = msg.id;
    const property = msg.property;
    const retweets = msg.retweets;
    const likes = msg.likes;
    Tweet.updateOne({ id }, { property }, (err, tweet) => {
        if (err) {
            console.log("[rabbitmq] error incrementing like count of tweet " + id);
            // res.status(400).json({ status: "error", error: "error incrementing like count of tweet" });
        }
        else {
            console.log("[rabbitmq] successfully liked/unliked tweet " + id);

        }
    });
    esClient.update({
        index: "tweets", id, body: {
            doc: {
                property, interest: retweets + likes
            }
        }
    });
}

updateUsersLikes = (msg) => {
    let likes = msg.likes;
    const id = msg.id;
    const username = msg.username;
    if (msg.like) {
        likes.push(msg.id);
    }
    else {
        likes.splice(likes.indexOf(msg.id), 1);
    }
    User.updateOne({ username: msg.username }, { likes }, (err) => {
        if (err) {
            console.log("[rabbitmq] error adding tweet " + id + " to users liked tweets")
            // res.status(400).json({ status: "error", error: "error adding tweet to users liked tweets" });
        }
        else {
            console.log("[rabbitmq] succesffuly added tweet " + id + " to " + username + " liked tweets.");
            // res.status(200).json({ status: "OK", message: "Liked/unliked tweet successfully" });
        }
    });
}






writeTweet = (msg) => {
    console.log("writing to mongodb...");
    const id = msg.id;
    const username = msg.username;
    const property = msg.property;
    const retweeted = msg.retweeted;
    const content = msg.content;
    const timestamp = msg.timestamp;
    const childType = msg.childType;
    const parent = msg.parent;
    const media = msg.media;
    const hasMedia = msg.hasMedia;
    const interest = msg.interest;

    const tweet = new Tweet({
        id,
        username,
        property,
        retweeted,
        content,
        timestamp,
        childType,
        parent,
        media,
        hasMedia,
        interest
    });

    tweet.save((err, tweet) => {
        if (err) {
            console.log("Error: failed to post tweet  " + tweet + " /additem @rabbitmq");
            // res.status(400).json({ status: "error", error: "failed to post tweet" });
        } else {
            if (!parent || childType != "retweet") {
                // res.status(200).json({ status: "OK", id: uniqueID });
            } else {
                Tweet.findOne({ id: parent }, (err, parentTweet) => {
                    if (err || !parentTweet) {
                        console.log("error parent tweet not found @rabbitmq");
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
                        console.log("retweeted tweet " + id + " @rabbitmq")
                    }
                });
            }
        }
        //F console.log("response is {status: OK, id: " + uniqueID + " }.");
    });
    const tweetES = {
        id,
        username,
        property,
        retweeted,
        content,
        timestamp,
        childType,
        parent,
        media,
        hasMedia,
        interest
    }
    esClient.index({ index: 'tweets', id, type: 'tweet', body: tweetES }, (err, resp, status) => {
        console.log("[rabbitMQ] successfully indexed tweet " + id + " in elasticsearch");
    });

}
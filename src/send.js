var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var amqp = require('amqplib/callback_api');


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(__dirname + '/public'));


app.post("/listen", function(req, res) {
  var keys = req.body.keys;
  amqp.connect('amqp://localhost', function(error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function(error1, channel) {
      if (error1) {
        throw error1;
      }
      var exchange = 'hw4';

      channel.assertExchange(exchange, 'direct', {
        durable: false
      });

      channel.assertQueue('', {}, function(error2, q) {
        if (error2) {
          throw error2;
        }
        console.log(' [*] Waiting for message.');

        keys.forEach(function(key) {
          channel.bindQueue(q.queue, exchange, key);
        });

        channel.consume(q.queue, function(msg) {
          console.log(" [x] %s:'%s'", msg.fields.routingKey, msg.content.toString());
          res.json({msg: msg.content.toString()});
          connection.close();
        }//, 
        // {
        //   noAck: true
        // }
        );
      });
    });
  });
});

app.post("/speak", function(req, res) {
  var key = req.body.key;
  var msg = req.body.msg;
  amqp.connect('amqp://localhost', function(error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(function(error1, channel) {
      if (error1) {
        throw error1;
      }
      var exchange = 'hw4';
    //var args = process.argv.slice(2);
    
    channel.assertExchange(exchange, 'direct', {
      durable: false
    });
    channel.publish(exchange, key, Buffer.from(msg));
    console.log(" [x] Sent %s:'%s'", key, msg);
    res.send(msg);
  });

    // setTimeout(function() { 
    //   connection.close(); 
    //   process.exit(0) 
    // }, 500);
  });
});


app.listen(3000, function () {
  console.log("Server running on port 3000");
});
/**
 * This app should be run on a seperate server from the main server.js to
 * prevent performance bottlenecks resulting from the email process.
 */

 
/**
 * SETUP EXPRESS AND BODY-PARSER
 */
const express = require('express')
const app = express();
app.use(express.static(__dirname + '/public'));
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
const port = 3000;


/**
 * SETUP MAIL SERVER STUFF
 */
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    port: 25,
    host: "localhost",
    tls: {
        rejectUnauthorized: false
    },
});

app.get('/', (req, res) => {
    res.send("<h1>Mail server is working</h1>");
})

app.post('/send', (req, res) => {
    const email = req.body.email;
    const key = "<" + req.body.key + ">";
    //let website = "http://mv.cse356.compas.cs.stonybrook.edu";
    //let website = "http://130.245.169.93";
    //let qstr = querystring.escape('email=' + email + '&key=' + key);
    // key = "<" + key + ">";
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
            res.json({status:"error", error});
        }
        else {
            res.json({ status: "OK", message: "email sent to " + email });
        }
        // console.log('Message sent: %s', info.messageId + " (" + new Date() + ")");
    });


});


app.listen(port, () => {
    console.log("Mail server running on port " + port);
});
// Global variables
const mongoose = require('mongoose');
const express = require('express');
const app = express();
const uuid = require('uuid/v4');
const bodyParser = require('body-parser');
const server = require('http').createServer(app);
const client = require('socket.io')(server);
const port = process.env.PORT || 5000;
const cors = require('cors');
const urlencodedParser = bodyParser.urlencoded({ extended: true });

app.use(express.static(__dirname + '/node_modules'));
app.use('/assets', express.static('stuff'));
app.set('view engine', 'ejs');
// allow cross-origin requests
app.use(cors());
server.listen(port);

// Sentiment analysis api
var AYLIENTextAPI = require('aylien_textapi');
var textapi = new AYLIENTextAPI({
    application_id: "",
    application_key: ""
});
  
// Handling GET request for registration
app.get('/', function(req, res){
    res.render('register', {qs: req.query});
}); 


// Handling POST request for registration
app.post('/register', urlencodedParser, function (req, res) {
    mongoose.connect('MONGO_CLUSTER_URL',{ useNewUrlParser: true }, function(err, db){
        if(err){
            throw err;
        }    

        if(req.body.username === '' || req.body.email === '' || req.body.password === '' || req.body.name === '')
        {
            res.send('2');
            return;
        }        
        let users = db.collection('users');
        users.findOne({ 'username': req.body.username}, function(err, user) {
              // User exist
              if (user) {
                res.send('1');
                return;
              } else {
                // user does not exist
                users.insertOne({ name: req.body.name, email: req.body.email, password: req.body.password,
                username: req.body.username, auth: ""}).then(() => {
                    res.send('3');
                    return;
                });                
              }
           })
    });
});

// Handling GET request for login
app.get('/login', function(req, res){
    res.render('login', {qs: req.query});
});

// Handling POST request for login
app.post('/login',urlencodedParser, function (req, res) {
    mongoose.connect('MONGO_CLUSTER_URL',{ useNewUrlParser: true }, function(err, db){
        if(err){
            throw err;
        }    

        if(req.body.email === '' || req.body.password === '')
        {
            res.send('1');
            return;
        }       
        let users = db.collection('users');
        users.findOne({ 'email': req.body.email, 'password': req.body.password }, function(err, user) {
              // User exist
              if (user) {
                let auth = uuid();
                users.updateOne({'email': req.body.email}, { $set: {"auth": auth}}, function(err, result){
                    res.send(auth);
                    return;
                });
              } else {
                // User Doesn't exist
                res.send("2");
                return;
              }
           })
    });
});

// Handling GET request
app.get('/chat', function(req, res){
    res.render('chat', {qs: req.query});
});

mongoose.connect('MONGO_CLUSTER_URL',{ useNewUrlParser: true }, function(err, db){
    if(err){
        throw err;
    }
    
    let polarity = {'negative': ':(', 'neutral': ':|', 'positive': ':)'};

    // Connect to socket.io
    client.on('connection', function(socket){
        let chat = db.collection('chats');
        let users = db.collection('users');
        // Send status
        sendStatus = function(s){
            socket.emit('status', s);
        }

        // Handle input events
        socket.on('input', function(data){
            let auth = data.auth;
            let message = data.message;
            users.findOne({'auth': auth}, function(err, result) {                
            // Validation of the message
            if(message == ''){
                // Send error status
                sendStatus('Please enter a message!');
            } else {
                // insert message
                chat.insertOne({ name: result.username, message: message }, function(){
                textapi.sentiment({'text': message}, function(error, response){
                    socket.broadcast.emit('output', 
                    { name: result.username, message: message, polarity: polarity[response.polarity]} );
                    socket.emit('output', {
                        name: result.username, message: message, polarity: polarity[response.polarity]});
                })
                });
            }
            });
        });

        // Handle clear
        socket.on('clear', function(data){
            // Remove all chats from the collection
            chat.deleteMany({}, function(){
                // Emit cleared
                socket.emit('cleared');
            });
        });

        // Typing
        socket.on('typing', function(auth){
            users.findOne({'auth': auth.auth}, function(err, result){
                socket.broadcast.emit('typing', {
                    user: result.username,
            });
            });        
        });
    });
});

var builder = require('botbuilder');
var siteUrl = require('./site-url');
var OrientDB = require('orientjs');
var ManualDialog = require('./ManualDialog');
var salesforceLiveAgentService = require('../salesforce').slService;
var slconnections = require('../salesforce/salesforceConnections').connections;

var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var server = OrientDB({
    "host": process.env.ORIENTDB_HOST,
    "port": process.env.ORIENTDB_PORT,
    "httpPort": process.env.ORIENTDB_HTTP_PORT,
    "username": process.env.ORIENTDB_USERNAME,
    "password": process.env.ORIENTDB_PASSWORD
    // "pool": { max: 10 }
});

var db = server.use(process.env.ORIENTDB_DBNAME);

var orgId = process.env.ORG_ID;

var bot = new builder.UniversalBot(connector, [function (session) {
    var msgText = session.message.text.toLowerCase();
    if (msgText == '' || msgText == 'hi' || msgText == 'hello') {
        session.sendTyping();
        getRootCards(function (res) {
            createCarouselAndSend(session, res);
        });
    } else if(msgText == 'bye' || msgText == 'cancel' || msgText == 'exit'){
        getDBMessage('BYE_TEMPLATE', function (responseTemplates) {
            session.send(responseTemplates[0].template);
        });
    } else if(msgText == 'help'){
        session.beginDialog('salesforce');
        // session.send(salesforceLiveAgentService.testMessage());
    }
    else {
        session.sendTyping();
        getDBMessage('INVALID_REQUEST', function (responseTemplates) {
            session.send(responseTemplates[0].template);
        });
    }
}]);

bot.dialog('searchByBarcode', [
    function (session) {
        builder.Prompts.attachment(session, "Upload barcode image");
    },
    function (session, result) {
        builder.Prompts.choice(session, "It seems to be an EAN853. Is that correct?", ["No", "Yes"], { listStyle: builder.ListStyle.button });
    },
    function (session, result) {
        if (result.response.entity.toLowerCase() === 'yes') {
            session.sendTyping();
            getRandomCard(function (dbCards) {
                createCarouselAndSend(session, dbCards, true);
            });
            session.message.text = '';
            session.replaceDialog('searchByNameLoop');
        } else {
            session.replaceDialog('searchByBarcode');
        }
    }
]);

bot.dialog('searchByProductId', [
    function (session) {
        builder.Prompts.text(session, "Enter id of the product");
    },
    function (session, result) {
        console.log(result.response);
        getCardsByName(result.response, function(dbCards){
            createCarouselAndSend(session, dbCards, true);
        });
        session.message.text = '';
        session.replaceDialog('searchByNameLoop');
    }
]);

bot.dialog('searchByName', [
    function(session, args, next){
        session.send('Enter name of the product');
        next();
    },
    function(session, args, next){
        session.message.text = '';
        session.beginDialog('searchByNameLoop');
    }
]);

bot.dialog('searchByNameLoop', new ManualDialog([
    function(session){
        var input = session.message.text;
        if(input ==  ''){
            return;
        } else {
            var selectPrefix = 'Select ';
            if( input.startsWith(selectPrefix)){
                var selectedItem = input.substring(selectPrefix.length);
                getCardsByParentName(selectedItem, function(dbCards){
                    createCarouselAndSend(session, dbCards, true);
                });
            } else {
                getCardsByName(input, function(dbCards){
                    createCarouselAndSend(session, dbCards, true);
                });
            }
            return;
        }
    },
]));


bot.dialog('search', [

    function (session) {
        session.sendTyping();
        getDBMessage('NAVIGATION_INTRO', function(responseTemplates){
            builder.Prompts.choice(session, responseTemplates[0].template, ["Search By Product name or description", "Search By Product Id", "Barcode photo of product"], { listStyle: builder.ListStyle.button });
        })
    },
    function (session, results) {
        session.dialogData.searchChoice = {};
        session.dialogData.searchChoice.type = results.response.index;
        if (session.dialogData.searchChoice.type == 0) {
            session.beginDialog('searchByName');
        } else if (session.dialogData.searchChoice.type == 1) {
            session.beginDialog('searchByProductId');
        } else if (session.dialogData.searchChoice.type == 2) {
            session.beginDialog('searchByBarcode');
        }
        else {
            session.send("Could not understand the choice. Choose one of the cards.");
            session.replaceDialog('search');
        }
    },
    function (session) {
        session.endDialog();
    }
])
    .triggerAction({ matches: /^search|select search/i });

bot.dialog('salesforce', [
    function(session, args, next){
        session.send('Starting Live Agent session.');
        session.sendTyping();
        // remove the current slconnection if it is already present in connections list
        salesforceLiveAgentService.stopPolling();
        removeSlConnectionByConversationId(session.message.address.conversation.id);
        next();
    },
    function(session){
        session.beginDialog('liveAgentChat');
    },
    function(session){
        session.endDialog();
    }
]);

bot.dialog('liveAgentChat', new ManualDialog([
    function(session){
        var msg = session.message.text;
        if(msg == 'endchat'){
            salesforceLiveAgentService.stopPolling();
            removeSlConnectionByConversationId(session.message.address.conversation.id);
            session.endDialog('Live agent session ended.');
            return;
        }
        // check if the current session is in slconnections
        var slconnectionFound = false;
        for(var i = 0; i < slconnections.length; i++){
            if(slconnections[i].conversationId == session.message.address.conversation.id){
                slconnectionFound = true;
                if(slconnections[i].state === 1){
                    salesforceLiveAgentService.sendMessage(session.message.text);
                    break;
                }
            }
        }
        if(!slconnectionFound){
            var newSlconnection = {
                conversationId: session.message.address.conversation.id,
                state: 0 // not connected yet
            };
            slconnections.push(newSlconnection);
            salesforceLiveAgentService.getSessionId(function(){
                // callback to start the polling when connection is established with the server. Actual communicatio is subject to live agent accepting the connection
                newSlconnection.state = 1; // connected
                session.send('You are now connected to our live agent!');
                salesforceLiveAgentService.startPolling(session);
            }, function(){ // Error callback removes the newSlconnection from connections list, if it was unable to start the conversation
                removeSlConnectionByConversationId(newSlconnection.conversationId);
                session.send('Could not connect to live agent. Try again after some time');
            });
        }
    }
]));

// TODO: test this for restarting conversation
// Send welcome when conversation with bot is started, by initiating the root dialog
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                getDBMessage('WELCOME', function (res) {
                    bot.send(new builder.Message()
                        .address(message.address)
                        .text(res[0].template));
                        bot.beginDialog(message.address, '/');
                });
            }
        });
    }
});


// Middle ware
bot.use({
    botbuilder: function (session, next) {
        var text = session.message.text.toLowerCase();
        console.log(session.message);
        if(text == 'hi' || text == 'hello' || text == 'bye' || text == 'cancel' || text == 'exit'){
            session.clearDialogStack();
        }
        next();
    }
});


// Connector listener wrapper to capture site url
var connectorListener = connector.listen();
function listen() {
    return function (req, res) {
        connectorListener(req, res);
    };
}


// Other wrapper functions
function beginDialog(address, dialogId, dialogArgs) {
    bot.beginDialog(address, dialogId, dialogArgs);
}

function sendMessage(message) {
    bot.send(message);
}

function createCard(session, dbCard) {
    var cardActions = [];
    if (dbCard.callToActions) {
        for (var i = 0; i < dbCard.callToActions.length; i++) {
            var cardAction;
            var cta = dbCard.callToActions[i];
            if (cta.type === 'postback') {
                cardAction = builder.CardAction.imBack(session, 'Select ' + cta.title, cta.title);
            } else if (cta.type === 'web_url') {
                cardAction = builder.CardAction.openUrl(session, cta.url, cta.title);
            }
            cardActions.push(cardAction);
        }
    }
    var heroCard = new builder.HeroCard(session)
        .title(dbCard.title || '')
        .subtitle(dbCard.subTitle || '')
        .images([builder.CardImage.create(session, 'https://hbdemostore.blob.core.windows.net/hbconsoleimages/' + dbCard.imageUrls[0])])
        .buttons(cardActions);

    return heroCard;
}

// DB functions
function getRootCards(callback) {
    console.log('get all root cards');
    var query = 'select from CardContent where parentId = "root" and orgId="' + orgId + '" and status = "live" and templateType != "newarrivals_card"';
    executeDbQuery(query, callback);
}

function getCardsByName(productName, callback) {
    console.log('get cards by name: ' + productName);
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and title.toLowerCase() = "' + productName.toLowerCase() + '"';
    executeDbQuery(query, callback);
}

function getCardsByTitle(productTitle, callback) {
    console.log('get cards by title: ' + productTitle);
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and title.toLowerCase() containsText "' + productTitle.toLowerCase() + '"';
    executeDbQuery(query, callback);
}

function getCardsByProductId(productId, callback) {
    console.log('get cards by id: ' + productId);
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and templateType ="product_card" and productId = "' + productId + '"';
    executeDbQuery(query, callback);
}

function getRandomCard(callback) {
    console.log('get a random card');
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and title="EAN853" limit 1';
    executeDbQuery(query, callback);
}

function getCardsByParentName(parentName, callback) {
    console.log('get cards by parent name: ' + parentName);
    var query = 'select from CardContent where orgId = "' + orgId + '" and status = "live" and parentId IN (select id from CardContent where orgId = "' + orgId + '" and title.toLowerCase()="' + parentName.toLowerCase() + '")';
    executeDbQuery(query, callback);
}

function executeDbQuery(query, callback){
    console.log(query);    
    db.query(query).then(function(results){
        callback(results);
    }).catch(function(err){
        console.log('error while executing query');
        console.log(JSON.stringify(err));
    });
}


function createCarouselAndSend(session, dbCards, continueDialog) {
    var msg = new builder.Message(session);
    if (dbCards.length > 0) {
        var heroCards = [];
        for (var i = 0; i < dbCards.length; i++) {
            heroCards.push(createCard(session, dbCards[i]));
        }
        msg.attachmentLayout(builder.AttachmentLayout.carousel);
        msg.attachments(heroCards);
        session.send(msg);
    } else {
        getDBMessage('SORRY_ASK_ADDRESS', function (responseTemplates) {
            session.send(responseTemplates[0].template);
        });
    }
    if(!continueDialog){
        session.endDialog();
    }
}

function getDBMessage(templateId, callback) {
    console.log('get message from DB: ' + templateId);
    var query = 'select template from ResponseTemplate where orgId="' + orgId + '" and templateId = "' + templateId + '"';
    executeDbQuery(query, callback);
}

function stopAndremoveCurrentSlConnection(slconnectionToRemove){
    // stop the polling
    salesforceLiveAgentService.stopPolling();
    removeSlConnectionByConversationId(slconnectionToRemove.conversationId);
}

function removeSlConnectionByConversationId(conversationId){
    // remove from sl connections
    var connectionIndex = -1;
    slconnections.every((slconnection, idx) => {
        if(slconnection.conversationId  == conversationId){
            connectionIndex = idx;
            return false; // break
        } else {
            return true; // continue
        }
    });
    if(connectionIndex > -1){
        slconnections.splice(connectionIndex, 1);
    }
}

var gracefulShutdown = function(){
    console.log("Received kill signal, shutting down gracefully.");
    server.close(function() {
      console.log("Closed out remaining connections.");
      process.exit()
    });
    
     // if after 
     setTimeout(function() {
         console.error("Could not close connections in time, forcefully shutting down");
         process.exit()
    }, 10*1000);
}

setInterval(function(db) {
    db.query("select id from Organization limit 1").then(function(data) {
        console.log("DB ping success");
    }).catch(function(err) {
        console.error('DB ping fail');
        console.error(err);
    });
}, 60000, db);


module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage,
    gracefulShutdown: gracefulShutdown
};
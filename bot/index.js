var builder = require('botbuilder');
var siteUrl = require('./site-url');
var OrientDB = require('orientjs');

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
        // not using the result right now
        builder.Prompts.choice(session, "It seems to be an EAN853. Is that correct?", ["No", "Yes"], { listStyle: builder.ListStyle.button });
    },
    function (session, result) {
        if (result.response.entity.toLowerCase() === 'yes') {
            session.sendTyping();
            getRandomCard(function (dbCards) {
                createCarouselAndSend(session, dbCards);
            });
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
        if (result.response !== 'EAN853') {
            session.send('Could not find any product');
        }
        session.endDialog();
    }
]);

bot.dialog('searchByName', [
    function (session) {
        builder.Prompts.text(session, 'Enter name of product');
    },
    function(session){
        session.send('Could not find any product').endDialog();
    }
]);


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
    .triggerAction({ matches: /^search/i })
    .endConversationAction(
    "endSearch", "Bye!",
    {
        matches: /^cancel$|^goodbye$/i,
        confirmPrompt: "Are you sure?"
    }
    );

bot.dialog('actuators', function (session) {
    session.sendTyping();
    getCardsByParentName('search', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
})
    .triggerAction({ matches: /^actuators?$/i });

bot.dialog('electrical actuators', function (session) {
    session.sendTyping();
    getCardsByParentName('electrical actuators', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^electrical actuators?$/i });;

bot.dialog('electronic electrical actuators', function (session) {
    session.sendTyping();
    getCardsByParentName('electronic actuators', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^electronic actuators?$/i });

bot.dialog('EAN853', function (session) {
    session.sendTyping();
    getCardsByTitle('EAN853', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^EAN853$/i });

bot.dialog('EAN853FAQ', function (session) {
    session.sendTyping();
    getCardsByParentName('EAN853', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^EAN853 FAQ/i });

bot.dialog('EAN853ElectricalIssue', function (session) {
    session.sendTyping();
    getCardsByParentName('Electrical Issues', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^Electrical Issues?/i });

bot.dialog('ElectricalIssues-Type2', function (session) {
    session.sendTyping();
    getCardsByParentName('Electrical Issues - Type 2', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^Electrical Type 2|Type 2/i });

bot.dialog('SubTypeB', function (session) {
    session.sendTyping();
    getCardsByParentName('Sub Type B', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^Sub Type B?/i });



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
        var text = session.message.text;
        console.log(session.message);
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
                cardAction = builder.CardAction.imBack(session, cta.title, cta.title);
            } else if (cta.type === 'web_url') {
                cardAction = builder.CardAction.openUrl(session, cta.url, cta.title);
            }
            cardActions.push(cardAction);
        }
    }
    var heroCard = new builder.HeroCard(session)
        .title(dbCard.title || '')
        .subtitle(dbCard.subTitle || '')
        .images([builder.CardImage.create(session, 'https://hashblu-static.s3.amazonaws.com/' + dbCard.imageUrls[0])])
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
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and templateType = "product_card" and title.toLowerCase() containsText "' + productName + '"';
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


function createCarouselAndSend(session, dbCards) {
    var msg = new builder.Message(session);
    if (dbCards.length > 0) {
        var heroCards = [];
        for (var i = 0; i < dbCards.length; i++) {
            heroCards.push(createCard(session, dbCards[i]));
        }
        msg.attachmentLayout(builder.AttachmentLayout.carousel);
        msg.attachments(heroCards);
        session.send(msg).endDialog();
    } else {
        session.send("No products found!").endDialog();
    }
}

function getDBMessage(templateId, callback) {
    console.log('get message from DB: ' + templateId);
    var query = 'select template from ResponseTemplate where orgId="' + orgId + '" and templateId = "' + templateId + '"';
    executeDbQuery(query, callback);
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
        console.log("ping success");
    }).catch(function(err) {
        console.error('ping fail');
        console.error(err);
    });
}, 60000, db);

module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage,
    gracefulShutdown: gracefulShutdown
};
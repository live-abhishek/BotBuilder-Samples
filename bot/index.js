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
});
var db = server.use(process.env.ORIENTDB_DBNAME);
var orgId = process.env.ORG_ID;


var bot = new builder.UniversalBot(connector, [function (session) {
    var msgText = session.message.text.toLowerCase();
    if (msgText == '' || msgText == 'hi' || msgText == 'hello') {
        // do nothing
    }
    else {
        session.send('Could understand the request. Select any one of the cards.')
    }
    getRootCards(function (res) {
        session.sendTyping();
        createCarouselAndSend(session, res);
    });
}]);

bot.dialog('searchByBarcode', [
    function (session) {
        builder.Prompts.attachment(session, "Upload barcode image");
        var msg = new builder.Message(session)
            .suggestedActions(builder.SuggestedActions.create(session, [
                builder.CardAction.imBack(session, "search", "Search"),
                builder.CardAction.imBack(session, "cancel", "Cancel")
            ]
            ));
        session.send(msg);
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
        var msg = new builder.Message(session)
            .suggestedActions(builder.SuggestedActions.create(session, [
                builder.CardAction.imBack(session, "search", "Search"),
                builder.CardAction.imBack(session, "cancel", "Cancel")
            ]
            ));
        session.send(msg);
    },
    function (session, result) {
        session.sendTyping();
        getCardsByProductId(result.response, function (dbCards) {
            createCarouselAndSend(session, dbCards);
        });
    }
])

bot.dialog('searchByName', [
    function (session) {
        builder.Prompts.text(session, 'Enter name of product');
    }
]);


bot.dialog('search', [

    function (session) {
        builder.Prompts.choice(session, "Search By", ["Name", "Product Id", "Barcode"], { listStyle: builder.ListStyle.button });
    },
    function (session, results) {
        session.dialogData.searchChoice = {};
        session.dialogData.searchChoice.type = results.response.entity;
        if (session.dialogData.searchChoice.type === 'Name') {
            session.beginDialog('searchByName');
        } else if (session.dialogData.searchChoice.type === 'Product Id') {
            session.beginDialog('searchByProductId');
        } else if (session.dialogData.searchChoice.type === 'Barcode') {
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
    .triggerAction({ matches: /^search$/i })
    .endConversationAction(
    "endSearch", "Bye!",
    {
        matches: /^cancel$|^goodbye$/i,
        confirmPrompt: "Are you sure?"
    }
    );

bot.dialog('actuators', function (session) {
    getCardsByParentName('actuators', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
})
    .triggerAction({ matches: /^actuators$/i });

bot.dialog('electrical actuators', function (session) {
    getCardsByParentName('electrical actuators', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^electrical actuators$/i });;

bot.dialog('electronic electrical actuators', function (session) {
    getCardsByParentName('electronic electrical actuators', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^electronic electrical actuators$/i });

bot.dialog('EAN853', function (session) {
    getCardsByParentName('EAN853', function (dbCards) {
        createCarouselAndSend(session, dbCards);
    })
}).triggerAction({ matches: /^EAN853$/i });

// TODO: test this for restarting conversation
// Send welcome when conversation with bot is started, by initiating the root dialog
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                getDBWelcomeMessage(function (res) {
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


// Enable Conversation Data persistence
bot.set('persistConversationData', true);

// Set default locale
bot.set('localizerSettings', {
    botLocalePath: './bot/locale',
    defaultLocale: 'en'
});


// Connector listener wrapper to capture site url
var connectorListener = connector.listen();
function listen() {
    return function (req, res) {
        // Capture the url for the hosted application
        // We'll later need this url to create the checkout link 
        var url = req.protocol + '://' + req.get('host');
        siteUrl.save(url);
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
                cardAction = builder.CardAction.imBack(session, dbCard.title, dbCard.title);
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
    getDBCards(query, callback);
}

function getCardsByName(productName, callback) {
    console.log('get cards by name');
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and templateType = "product_card" and title.toLowerCase() containsText "' + productName + '"';
    getDBCards(query, callback);
}

function getCardsByProductId(productId, callback) {
    console.log('get cards by id');
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and templateType ="product_card" and productId = "' + productId + '"';
    getDBCards(query, callback);
}

function getRandomCard(callback) {
    console.log('get a random card');
    var query = 'select from CardContent where orgId="' + orgId + '" and status = "live" and templateType = "product_card" limit 1';
    getDBCards(query, callback);
}

function getCardsByParentName(parentName, callback) {
    console.log('get cards by parent name');
    var query = 'select from CardContent where orgId = "' + orgId + '" and parentId IN (select id from CardContent where orgId = "' + orgId + '" and title.toLowerCase()="' + parentName.toLowerCase() + '")';
    getDBCards(query, callback);
}

function getDBCards(query, callback) {
    db.open().then(function () {
        console.log('executing query');
        return db.query(query);
    }).then(function (dbCards) {
        callback(dbCards);
        db.close().then(function () {
            console.log('closed');
        });
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

function getDBWelcomeMessage(callback) {
    console.log('get Welcome message from DB');
    var query = 'select template from ResponseTemplate where orgId="' + orgId + '" and templateId = "WELCOME"';
    db.open().then(function () {
        return db.query(query);
    }).then(function (res) {
        callback(res);
        db.close().then(function () {
            console.log('closed');
        });
    })
}

module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage
};
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


var bot = new builder.UniversalBot(connector, [function (session) {
    if(session.message.text === 'Hi'){
        getRootCards(session);
    }
}]);


bot.dialog('search', [
    function(session){
        session.send("Select any one of the cards");
        builder.Prompts.choice(session, "Search By", ["name","id"], { listStyle: builder.ListStyle.auto });
    },
    function(session, results){
        session.dialogData.searchChoice.type = results.response;
        if(session.dialogData.searchChoice.type === 'name'){
            builder.Prompts.text(session, "Enter name of the product");
        } else if(session.dialogData.searchChoice === 'id'){
            builder.Prompts.text(session, "Enter id of the product");
        } else {
            session.endConversation("could not understand the choice");
        }
    },
    function(session, results){
        if(results.response){
            session.dialog.searchChoice.searchTerm = results.response;
        }
        if(session.dialog.searchChoice.searchTerm){
            var searchType = session.dialog.searchChoice.type;
            var searchTerm = session.dialog.searchChoice.searchTerm;
            if(seachType === 'name'){
                getCardsByName(session, searchTerm);
            } else if(searchType === 'id'){
                getCardsByProductId(session, searchTerm);
            }
        }

        session.endDialog('Search complete!');

    }
])
.triggerAction({matches: /^search^/i})
.endConversationAction(
    "endOrderDinner", "Bye!",
    {
        matches: /^cancel$|^goodbye$/i,
        confirmPrompt: "Are you sure?"
    }
);


// TODO: test this for restarting conversation
// Send welcome when conversation with bot is started, by initiating the root dialog
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                bot.send(new builder.Message()
                .address(message.address)
                .text("Say Hi!"));
                // bot.beginDialog(message.address, '/');
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

function createCard(session, dbCard){
    var cardActions = [];
    if(dbCard.callToActions){
        for( var i = 0; i < dbCard.callToActions.length; i++ ){
            var cardAction;
            var cta = dbCard.callToActions[i];
            if(cta.type === 'postback'){
                cardAction = builder.CardAction.imBack(session, cta.title, cta.title);
            } else if(cta.type === 'web_url'){
                cardAction = builder.CardAction.openUrl(session, cta.url, cta.title);
            }
            cardActions.push(cardAction);
        }
    }
    var heroCard = new builder.HeroCard(session)
    .title(dbCard.title || '')
    .subtitle(dbCard.subtitle || '')
    .images([builder.CardImage.create(session, 'https://hashblu-static.s3.amazonaws.com/'+dbCard.imageUrls[0])])
    .buttons(cardActions);
    
    return heroCard;
}

// DB functions
function getRootCards(session){
    console.log('get all root cards');
    var query = 'select from CardContent where parentId = "root" and orgId = "hbdemo" and status = "live" and templateType != "newarrivals_card"';
    getDBCards(session, query);
}

function getCardsByName(session, productName){
    console.log('get cards by name');
    var query = 'select from CardContent where orgId = "hbdemo" and status = "live" and templateTyep = "product_card" and title.toLowerCase() containsText = ' + productName;
    getDBCards(session, query);
}

function getCardsByProductId(session, productId){
    console.log('get cards by id');
    var query = 'select from CardContent where orgId = "hbdemo" and status = "live" and templateType ="product_card" and productId = ' + productId;
    getDBCards(session, query);
}

function getDBCards(session, query){
    db.open().then(function() {
        console.log('executing query');
        return db.query(query);
     }).then(function(res){
        createCarouselAndSend(session, res);
        db.close().then(function(){
           console.log('closed');
        });
    });
}


function createCarouselAndSend(session, dbCards){
    var heroCards = [];
    var msg = new builder.Message(session);
    for(var i = 0; i < dbCards.length; i++){
        heroCards.push(createCard(session, dbCards[i]));
    }
    msg.attachmentLayout(builder.AttachmentLayout.carousel);
    msg.attachments(heroCards);
    session.send(msg).endDialog();
}

module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage
};
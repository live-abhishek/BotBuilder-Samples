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
  

// Welcome Dialog
var MainOptions = {
    Shop: 'main_options_order_flowers',
    Support: 'main_options_talk_to_support'
};

var bot = new builder.UniversalBot(connector, [function (session) {


    var db = server.use(process.env.ORIENTDB_DBNAME);

    db.open().then(function() {
        return db.query('select from CardContent where parentId = "root" and orgId = "shopninja" and status = "live" and templateType != "newarrivals_card"');
     }).then(function(res){
        res.forEach(function(element) {
            console.log(element.title);
            console.log(element);
        }, this);
        db.close().then(function(){
           console.log('closed');
        });
     });


    session.send('Test Echo ' + session.message.text);

    // if (localizedRegex(session, [MainOptions.Shop]).test(session.message.text)) {
    //     // Order Flowers
    //     return session.beginDialog('shop:/');
    // }

    // var welcomeCard = new builder.HeroCard(session)
    //     .title('welcome_title')
    //     .subtitle('welcome_subtitle')
    //     .buttons([
    //         builder.CardAction.imBack(session, session.gettext(MainOptions.Shop), MainOptions.Shop),
    //         builder.CardAction.imBack(session, session.gettext(MainOptions.Support), MainOptions.Support)
    //     ]);

    // session.send(new builder.Message(session)
    //     .addAttachment(welcomeCard));
}])
.endConversationAction(
    "endOrderDinner", "Bye!",
    {
        matches: /^cancel$|^goodbye$/i,
        confirmPrompt: "Are you sure?"
    }
);

bot.dialog('showcards', function(session){
    var msg = new builder.Message(session);

    msg.attachmentLayout(builder.AttachmentLayout.carousel);
    msg.attachments([
        new builder.HeroCard(session)
        .title("Shirt 1")
        .subtitle("New Shirt")
        .text("This is shirt text")
        .images([builder.CardImage.create(session, 'https://hashblu-static.s3.amazonaws.com/'+'cdaaf294-895b-45e9-848f-6d980478c009')])
        .buttons([
            builder.CardAction.openUrl(session, "http://google.com", "Google"),            
            builder.CardAction.imBack(session, "buy classic white t-shirt", "Buy")
        ])
    ]);
    session.send(msg).endDialog();
}).triggerAction({matches: /^showcards/i});

// Enable Conversation Data persistence
bot.set('persistConversationData', false);

// Set default locale
bot.set('localizerSettings', {
    botLocalePath: './bot/locale',
    defaultLocale: 'en'
});

// Sub-Dialogs
// bot.library(require('./dialogs/shop').createLibrary());
// bot.library(require('./dialogs/address').createLibrary());
// bot.library(require('./dialogs/product-selection').createLibrary());
// bot.library(require('./dialogs/delivery').createLibrary());
// bot.library(require('./dialogs/details').createLibrary());
// bot.library(require('./dialogs/checkout').createLibrary());
// bot.library(require('./dialogs/settings').createLibrary());
// bot.library(require('./dialogs/help').createLibrary());

// Validators
// bot.library(require('./validators').createLibrary());

// Trigger secondary dialogs when 'settings' or 'support' is called. Add Middlewares.
bot.use({
    botbuilder: function (session, next) {
        var text = session.message.text;
        console.log(session.message);
        next();

        // var settingsRegex = localizedRegex(session, ['main_options_settings']);
        // var supportRegex = localizedRegex(session, ['main_options_talk_to_support', 'help']);

        // if (settingsRegex.test(text)) {
        //     // interrupt and trigger 'settings' dialog 
        //     return session.beginDialog('settings:/');
        // } else if (supportRegex.test(text)) {
        //     // interrupt and trigger 'help' dialog
        //     return session.beginDialog('help:/');
        // } if(text === 'cancel') {
        //     // Clears data stored in container.
        //     return session.endDialog('Bye!');
        // }

        // // continue normal flow
        // next();
    }
});

// Send welcome when conversation with bot is started, by initiating the root dialog
// bot.on('conversationUpdate', function (message) {
//     if (message.membersAdded) {
//         message.membersAdded.forEach(function (identity) {
//             if (identity.id === message.address.bot.id) {
//                 bot.beginDialog(message.address, '/');
//             }
//         });
//     }
// });

// Cache of localized regex to match selection from main options
// var LocalizedRegexCache = {};
// function localizedRegex(session, localeKeys) {
//     var locale = session.preferredLocale();
//     var cacheKey = locale + ":" + localeKeys.join('|');
//     if (LocalizedRegexCache.hasOwnProperty(cacheKey)) {
//         return LocalizedRegexCache[cacheKey];
//     }

//     var localizedStrings = localeKeys.map(function (key) { return session.localizer.gettext(locale, key); });
//     var regex = new RegExp('^(' + localizedStrings.join('|') + ')', 'i');
//     LocalizedRegexCache[cacheKey] = regex;
//     return regex;
// }

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

function createCard(dbCard){
    var heroCard = new builder.HeroCard(session)
    .title(dbCard.title)
    .subtitle(dbCard.subtitle)
    .text()
    .images([builder.CardImage.create(session, 'https://hashblu-static.s3.amazonaws.com/'+dbCard.imageUrls[0])])
    .buttons([
        builder.CardAction.imBack(session, "buy classic white t-shirt", "Buy")
    ]);

    

    return null;
}

module.exports = {
    listen: listen,
    beginDialog: beginDialog,
    sendMessage: sendMessage
};
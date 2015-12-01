(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){function Base(symbols){var self=this;self.symbols=symbols;self.piggybackDataFeed();window.setInterval(function(){if(!io.sockets["https://client.ctoption.com:443"].transport.websocket.piggybacked){self.piggybackDataFeed()}},5e3);self.initializeTradingSocket()}Base.prototype.getTradingMessageTypes=function(){return{QUOTE:1,CALL:2,PUT:3}};Base.prototype.getSymbols=function(){return this.symbols};Base.prototype.getTradingSocket=function(){return this.tradingSocket};Base.prototype.initializeTradingSocket=function(){var self=this;var tradingMessageTypes=self.getTradingMessageTypes();self.tradingSocket=new WebSocket("ws://localhost:8080");self.tradingSocket.onmessage=function(event){try{var message=JSON.parse(event.data);switch(message.type){case tradingMessageTypes.CALL:if(!localStorage.stopTrading&&self.symbols.indexOf(message.data.symbol)>-1){self.callTrade(message.data.symbol,message.data.investment)}break;case tradingMessageTypes.PUT:if(!localStorage.stopTrading&&self.symbols.indexOf(message.data.symbol)>-1){self.putTrade(message.data.symbol,message.data.investment)}break}}catch(error){console.error(new Date+" TRADING SOCKET ERROR: "+(error.message||error))}}};Base.prototype.piggybackDataFeed=function(){throw"piggybackDataFeed() not implemented"};Base.prototype.showSymbolControls=function(){throw"showSymbolControls() not implemented"};Base.prototype.callTrade=function(symbol,investment){throw"callTrade() not implemented"};Base.prototype.putTrade=function(symbol,investment){throw"putTrade() not implemented"};Base.prototype.payoutIsHighEnough=function(symbol){throw"payoutIsHighEnough() not implemented"};Base.prototype.tradeMakesBalanceTooHigh=function(investment){throw"tradeMakesBalanceTooHigh() not implemented"};Base.prototype.setTradeInvestment=function(symbol,investment){throw"setTradeInvestment() not implemented"};Base.prototype.initiateTrade=function(symbol){throw"initiateTrade() not implemented"};module.exports=Base},{}],2:[function(require,module,exports){var Base=require("./Base");function CTOption(){this.constructor=CTOption;var self=this;var symbols=["EURGBP","AUDNZD","NZDUSD","AUDCAD","USDJPY","AUDUSD","USDCAD","USDCHF","EURUSD","CADJPY"];Base.call(self,symbols);$("#bnmain .tabs .tab")[3].click();$("#bnmain .hyperfilter li")[3].click();symbols.forEach(function(symbol){self.showSymbolControls(symbol)})}CTOption.prototype=Object.create(Base.prototype);CTOption.prototype.piggybackDataFeed=function(){var self=this;console.log(new Date+" Piggybacking on data socket");var dataSocket=io.sockets["https://client.ctoption.com:443"].transport.websocket;var originalOnOpen=dataSocket.onopen;var originalOnMessage=dataSocket.onmessage;var originalOnClose=dataSocket.onclose;var originalOnError=dataSocket.onerror;dataSocket.onopen=function(){console.log(new Date+" Data socket opened");originalOnOpen()};dataSocket.onmessage=function(event){try{var data=JSON.parse(event.data.replace("5:::",""));var dataPoint;var quotes=[];var tradingMessageTypes=self.getTradingMessageTypes();var tradingMessage={type:tradingMessageTypes.QUOTE,data:[]};if(data.name==="subscribe"){quotes=data.args[0].filter(function(quote){return self.getSymbols().indexOf(quote.Symbol)>-1});if(quotes.length>0){tradingMessage.data=quotes.map(function(quote){return{symbol:quote.Symbol,price:parseFloat(quote.Price),timestamp:parseInt(quote.TickTime+"000")}});self.getTradingSocket().send(JSON.stringify(tradingMessage))}}}catch(error){}originalOnMessage(event)};dataSocket.onclose=function(){console.error(new Date+" Data socket closed");originalOnClose()};dataSocket.onerror=function(error){console.error(new Date+" ERROR: "+(error.message||error));originalOnError()};dataSocket.piggybacked=true};CTOption.prototype.showSymbolControls=function(symbol){if($("#assetID_10_"+symbol+" .option_container").length>0){return}$("#assetID_10_"+symbol+" .box_header").click()};CTOption.prototype.callTrade=function(symbol,investment){if(!symbol){console.error(new Date+" No symbol provided")}if(!investment){console.error(new Date+" No investment provided")}if($("#assetID_10_"+symbol).length===0){return}if(!this.payoutIsHighEnough(symbol)){return}if(this.tradeMakesBalanceTooHigh(investment)){console.log(new Date+" Maximum open positions reached; aborting trade for "+symbol);return}console.log(new Date+" Attempting CALL for "+symbol+" at "+new Date+" for $"+investment+".");this.showSymbolControls(symbol);$("#assetID_10_"+symbol+" .call_btn").click();this.setTradeInvestment(symbol,investment);this.initiateTrade(symbol)};CTOption.prototype.putTrade=function(symbol,investment){if(!symbol){console.error(new Date+" No symbol provided")}if(!investment){console.error(new Date+" No investment provided")}if($("#assetID_10_"+symbol).length===0){return}if(!this.payoutIsHighEnough(symbol)){return}if(this.tradeMakesBalanceTooHigh(investment)){console.log(new Date+" Maximum open positions reached; aborting trade for "+symbol);return}console.log(new Date+" Attempting PUT for "+symbol+" at "+new Date+" for $"+investment+".");this.showSymbolControls(symbol);$("#assetID_10_"+symbol+" .put_btn").click();this.setTradeInvestment(symbol,investment);this.initiateTrade(symbol)};CTOption.prototype.payoutIsHighEnough=function(symbol){var element=$("#assetID_10_"+symbol+" .box_header li").get(2);if(element){return parseInt(element.innerText)>=70}console.log("Unable to get payout for element");return false};CTOption.prototype.tradeMakesBalanceTooHigh=function(investment){var balance=parseFloat($("#balance").text().replace(/[\$,]/g,""));var positionCount=parseInt($("#open_positions").text());return(positionCount+1)*investment>=balance*.45};CTOption.prototype.setTradeInvestment=function(symbol,investment){$("#assetID_10_"+symbol+" .mount").val(investment);$("#assetID_10_"+symbol+" .mount").trigger("keyup")};CTOption.prototype.initiateTrade=function(symbol){$("#assetID_10_"+symbol+" .apply_button").click()};window.setTimeout(function(){var client;localStorage.username=localStorage.username||prompt("Please enter your username");localStorage.password=localStorage.password||prompt("Please enter your password");if($(".usernameval").length===0){$("#txtUsername").val(localStorage.username);$("#txtPassword").val(localStorage.password);$("#btnformLogin").click()}else{client=new CTOption}},5*1e3);window.setInterval(function(){var tempWindow=window.open("https://ctoption.com");window.setTimeout(function(){tempWindow.close()},30*1e3)},30*60*1e3);window.setInterval(function(){window.location.reload(true)},5.25*60*60*1e3)},{"./Base":1}]},{},[2]);
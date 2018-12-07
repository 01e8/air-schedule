const express = require('express');
const http = require('http');
const path = require('path');
const https = require('https');
const request = require('request');
const fs = require('fs');

//https://api.flightstats.com/flex/flightstatus/rest/v2/json/airport/status/SVO/dep/2018/12/05/16?
//https://api.rasp.yandex.net/v3.0/schedule/?apikey=f45f7440-9746-488c-b4d6-751aa444eea2&format=json&system=iata&station=SVO&transport_types=plane&date=20181205&limit=100&offset=340
//curl -v  -X GET "https://api.flightstats.com/flex/airports/rest/v1/json/fs/SVO?appId=d9bc5ff4&appKey=2b5a745d56ca3bb68da4efda330ccbbd"
// f45f7440-9746-488c-b4d6-751aa444eea2
const appId = 'd9bc5ff4';
const appKey = '2b5a745d56ca3bb68da4efda330ccbbd';
const requestedAirport = 'SVO';

var csvToArray = (csv) => {
  let result;
  let lines = csv.split('\n');
  result = lines.map((line) => {
  	return line.split('|');
  });
  return result;
}

var arrayCodesCsv = fs.readFileSync(__dirname + '/airports_codes.csv', 'utf8');
var arrayCodes = csvToArray(arrayCodesCsv);

var getCityName = (cityCode) => {
  for (i = 1; i < arrayCodes.length; i++) {
    if (arrayCodes[i][1] == cityCode) {
      if(arrayCodes[i][2] == ''){
        return arrayCodes[i][4];
      }
      return arrayCodes[i][2];
    }
  }
  return 'Аэропорт';
}

var jsonReduction = (bodyJson, flightsType, flightNumber) => {
  let minJson = [];
  let minIndex = 0;
  for (let i = 0; i < Object.keys(bodyJson.flightStatuses).length; i++) {
    if ((flightNumber != '' && flightNumber == bodyJson.flightStatuses[i].carrierFsCode + ' ' + bodyJson.flightStatuses[i].flightNumber)||(flightNumber == '')){
      minJson[minIndex] = {};
      if (flightsType == 'dep') {
        minJson[minIndex].time = bodyJson.flightStatuses[i].departureDate.dateLocal.substr(11, 5);
        minJson[minIndex].fromOrToAirpot = `${getCityName(bodyJson.flightStatuses[i].arrivalAirportFsCode)} (${bodyJson.flightStatuses[i].arrivalAirportFsCode})`;
        minJson[minIndex].terminal = (bodyJson.flightStatuses[i].airportResources != null && bodyJson.flightStatuses[i].airportResources.departureTerminal != null)? bodyJson.flightStatuses[i].airportResources.departureTerminal : 'Неизвестен';
      }
      if (flightsType == 'arr') {
        minJson[minIndex].time = bodyJson.flightStatuses[i].arrivalDate.dateLocal.substr(11, 5);
        minJson[minIndex].fromOrToAirpot = `${getCityName(bodyJson.flightStatuses[i].departureAirportFsCode)} (${bodyJson.flightStatuses[i].departureAirportFsCode})`;
        minJson[minIndex].terminal = (bodyJson.flightStatuses[i].airportResources != null && bodyJson.flightStatuses[i].airportResources.arrivalTerminal != null)? bodyJson.flightStatuses[i].airportResources.arrivalTerminal : 'Неизвестен';
      }
      minJson[minIndex].flightNumber = bodyJson.flightStatuses[i].carrierFsCode + ' ' + bodyJson.flightStatuses[i].flightNumber;
      minIndex++;
    }
  }
  return minJson;
}

var getFlightsArray = (callback, airport, flightsType, year, month, day, hour, numOfHours, flightNumber) => {
  let url = `https://api.flightstats.com/flex/flightstatus/rest/v2/json/airport/status/${airport}/${flightsType}/${year}/${month}/${day}/${hour}?appId=${appId}&appKey=${appKey}&utc=false&numHours=${numOfHours}`;
  //let urlDelay = `https://api.flightstats.com/flex/delayindex/rest/v1/json/airports/${airport}?appId=${appId}&appKey=${appKey}&codeType=fs`;
  let flightsArray = [];
  request(url, { json: true }, (err, res, body) => {
    if (err) { return console.log(err); }
    flightsArray = jsonReduction(body, flightsType, flightNumber);
    flightsArray = flightsArray.sort((a,b) => (a.time > b.time) ? 1 : ((b.time > a.time) ? -1 : 0));
    callback(flightsArray);
  });
}

var app = express();
app.set('port', 3000);

http.createServer(app).listen(app.get('port'), () => {
  console.log('Express server listening on port ' + app.get('port'));
});

app.set("view engine", "ejs");
app.use(express.static(__dirname + '/public'));

app.get("/", (req, resp) => {
  let dateUTC = new Date();
  dateUTC.setTime(dateUTC.getTime() + (3*60*60*1000));

  let flType, year, month, day, hour, flightNumber;
  flType = (req.query.flType == undefined || req.query.flType == '')? 'dep' : req.query.flType;
  year = (req.query.date == undefined || req.query.date == '')? dateUTC.getUTCFullYear().toString() : req.query.date.substr(0, 4);
  month = (req.query.date == undefined || req.query.date == '')? (dateUTC.getUTCMonth() + 1).toString() : req.query.date.substr(5, 2);
  day = (req.query.date == undefined || req.query.date == '')? dateUTC.getUTCDate().toString() : req.query.date.substr(8, 2);
  hour = (req.query.hour == undefined || req.query.hour == '')? ((dateUTC.getUTCHours() % 2 == 0)? dateUTC.getUTCHours().toString() : (dateUTC.getUTCHours() - 1).toString() ) : req.query.hour;
  flightNumber = (req.query.flightNumber == undefined)? '' : req.query.flightNumber;

  month = (month.toString().length == 1)? ('0' + month) : month;
  day = (day.toString().length == 1)? ('0' + day) : day;
  hour = (hour.toString().length == 1)? ('0' + hour) : hour;

  getFlightsArray((flyList) => {resp.render('mainn', {flType: flType, time: ((req.query.hour == undefined || req.query.hour == '')? hour : req.query.hour), date: ((req.query.date == undefined || req.query.date == '')? (year + '-' + month + '-' + day) : req.query.date), flightNumber: flightNumber, results: flyList});}, requestedAirport, flType, year, month, day, hour, '2', flightNumber);
});

app.use((req, res) => {
  res.status(404).send("Page Not Found Sorry");
});

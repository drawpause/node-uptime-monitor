require('dotenv').config()

const request = require('request')
const services = require('./services.js') // list of services to monitor

const pingService = (url, cb) => {
  request({
    method: 'GET',
    uri: url,
    time: true
  }, (err, res, body) => {
    if (!err && res.statusCode == 200) {
      // we'll use the time from the point we try to establish a connection with
      // the service until the first byte is received
      cb(res.timingPhases.firstByte)
    } else {
      cb('DOWN')
    }
  })
}

const pingInterval = 1*1000*60 // 1 minute
let serviceStatus = {}

services.forEach(service => {
  serviceStatus[service.url] = {
    status: 'UP', // initialize all services as operational when we start
    responseTimes: [], // array containing the responses times for last 3 pings
    timeout: service.timeout // load up the timout from the config
  }

  setInterval(() => {
    pingService(service.url, (serviceResponse) => {
      if (serviceResponse === 'DOWN' && serviceStatus[service.url].status !== 'DOWN') {
        // only update and post to Discord on state change
        serviceStatus[service.url].status = 'DOWN'
        postToDiscord(service.url, service.name)
      } else {
        let responseTimes = serviceStatus[service.url].responseTimes
        responseTimes.push(serviceResponse)

        // check degraded performance if we have 3 responses so we can average them
        if (responseTimes.length > 3) {
          // remove the oldest response time (beginning of array)
          responseTimes.shift()

          // compute average of last 3 response times
          let avgResTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          let currService = serviceStatus[service.url]
          
          if (avgResTime > currService.timeout && currService.status !== 'DEGRADED') {
            //currService.status = 'DEGRADED'
            //postToDiscord(service.url, service.name)
          } else if (avgResTime < currService.timeout && currService.status !== 'UP') {
            currService.status = 'UP'
            postToDiscord(service.url, service.name)
          }
        }
      }
    })
  }, pingInterval)
})

const postToDiscord = (serviceUrl, serviceName) => {

  let discordPayload = {
    embeds: [
      {
        title: `${serviceName} is ${serviceStatus[serviceUrl].status}`,
        url: `${serviceUrl}`,
        description: `*Service ${serviceStatus[serviceUrl].status}*\n${serviceUrl}`,
        type: "link",
        thumbnail: {
          url: "https://cdn1.iconfinder.com/data/icons/basic-ui-icon-rounded-colored/512/icon-02-512.png"
        }
      }
    ]
  }
  
  if (serviceStatus[serviceUrl].status !== 'DOWN') {
    discordPayload.embeds[0].thumbnail.url = 'https://www.iconexperience.com/_img/g_collection_png/standard/512x512/ok.png'
  }

  console.log(discordPayload.embeds.title);

  request({
    method: 'POST',
    uri: process.env.DISCORD_WEBHOOK_URL,
    body: discordPayload,
    json: true
  }, (err, res, body) => {
    if (err) console.log(`Error posting to Discord: ${err}`)
  })
}

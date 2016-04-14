"use strict";

const config = require("config");
const AWS = require("aws-sdk");
const _ = require("lodash");

AWS.config.update(config.aws.kinesis);

const kinesis = new AWS.Kinesis({ apiVersion: 'latest' });

let partitionKey = "partitionKey";
let startId = 1;
let lastId = 1500;
let recordCount = 0;
const records = [];

for (let currentId = startId; currentId < lastId; currentId++) {
    var record = {
        Data: new Buffer (JSON.stringify ({
            id: currentId,
            timestamp: Date.now()
        })),
        PartitionKey: "partitionKey-" + currentId
    };

    records.push(record);
    recordCount++;
    if (recordCount % 500 == 0) {
        sendMessagesToKinesis(records);
        records.length = 0;
    }

}

if (records.lendth > 0) {
    sendMessagesToKinesis(records);
}


function sendMessagesToKinesis(records) {
    var params = {
        Records: records,
        StreamName: config.aws.kinesis.streamName
    };

    console.log(params);

    kinesis.putRecords (params, function (err, data) {
        if (err) {
            console.error ('Error putting to Kinesis: %s', err);
        } else {
            console.log ('Response from Kinesis: %j', data);
        }
    });
}

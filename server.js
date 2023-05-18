require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const AWS = require("aws-sdk");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
const ddb = new AWS.DynamoDB.DocumentClient();

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "us-east-1",
});

const tableName = "workspaces";

app.post("/workspace", async (req, res) => {
  const params = {
    TableName: tableName,
    Item: {
      id: uuidv4(),
      room_type: req.body.room_type,
      room_name: req.body.room_name,
      room_capacity: req.body.room_capacity,
      desc: req.body.desc,
      price: req.body.price,
      status: req.body.status,
      time_rent: req.body.time_rent,
    },
  };

  try {
    await ddb.put(params).promise();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

app.post("/workspace/onReserveWorkspace", async (req, res) => {
  const model = req.body;

  const params = {
    TableName: tableName,
    Key: { id: model.roomId },
    UpdateExpression: "SET status = :s",
    ExpressionAttributeValues: { ":s": "RESERVED" },
    ReturnValues: "ALL_NEW",
  };

  try {
    const updatedWorkspace = await ddb.update(params).promise();
    res.status(200).send(true);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/workspace/onCancelReserve", async (req, res) => {
  const model = req.body;

  const params = {
    TableName: tableName,
    Key: { id: model.roomId },
    UpdateExpression: "SET status = :s",
    ExpressionAttributeValues: { ":s": "AVAILABLE" },
    ReturnValues: "ALL_NEW",
  };

  try {
    const updatedWorkspace = await ddb.update(params).promise();
    res.status(200).send(true);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put("/workspace", async (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      id: req.body.id,
    },
    UpdateExpression:
      "set room_type = :rt, room_name = :rn, room_capacity = :rc, desc = :d, price = :p, status = :s, time_rent = :tr",
    ExpressionAttributeValues: {
      ":rt": req.body.room_type,
      ":rn": req.body.room_name,
      ":rc": req.body.room_capacity,
      ":d": req.body.desc,
      ":p": req.body.price,
      ":s": req.body.status,
      ":tr": req.body.time_rent,
    },
  };

  try {
    await ddb.update(params).promise();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

app.delete("/workspace/:id", async (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
  };

  try {
    await ddb.delete(params).promise();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

app.listen(port, () => console.log("Server is running on port 3000"));

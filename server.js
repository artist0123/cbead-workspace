require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const AWS = require("aws-sdk");
const { processPayment, savePaymentRecord } = require("./paymentService");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "us-east-1",
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = "workspaces";

// Define your API routes here
// ... (previous code)

// List all workspaces
app.get("/workspaces", (req, res) => {
  const params = {
    TableName: tableName,
  };

  dynamoDb.scan(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: "Error fetching workspaces" });
    } else {
      res.json(data.Items);
    }
  });
});

// Get a single workspace by ID
app.get("/workspaces/:id", (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
  };

  dynamoDb.get(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: "Error fetching workspace" });
    } else {
      res.json(data.Item);
    }
  });
});

// Add a new workspace
app.post("/workspaces", (req, res) => {
  const { id, name, location, capacity, available, price } = req.body;

  const params = {
    TableName: tableName,
    Item: {
      id,
      name,
      location,
      capacity,
      available,
      equipment: [],
      price,
      rentedTimeSlots: [],
    },
  };

  dynamoDb.put(params, (error) => {
    if (error) {
      res.status(500).json({ error: "Error adding workspace" });
    } else {
      res.json(params.Item);
    }
  });
});

// Update a workspace
app.put("/workspaces/:id", (req, res) => {
  const { name, location, capacity, available, equipment, price } = req.body;

  const params = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
    UpdateExpression:
      "SET name = :name, location = :location, capacity = :capacity, available = :available, equipment = :equipment, price = :price",
    ExpressionAttributeValues: {
      ":name": name,
      ":location": location,
      ":capacity": capacity,
      ":available": available,
      ":equipment": equipment,
      ":price": price,
    },
    ReturnValues: "ALL_NEW",
  };

  dynamoDb.update(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: "Error updating workspace" });
    } else {
      res.json(data.Attributes);
    }
  });
});

// Delete a workspace
app.delete("/workspaces/:id", (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
  };

  dynamoDb.delete(params, (error) => {
    if (error) {
      res.status(500).json({ error: "Error deleting workspace" });
    } else {
      res.json({ success: true });
    }
  });
});

// Rent a workspace
app.post("/workspaces/:id/rent", async (req, res) => {
  const { rentEquipment, paymentInfo, lateFine, userId } = req.body;

  // Update the workspace availability
  const workspaceParams = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
    UpdateExpression: "SET available = :available",
    ExpressionAttributeValues: {
      ":available": false,
    },
    ReturnValues: "ALL_NEW",
  };

  try {
    const workspaceData = await dynamoDb.update(workspaceParams).promise();
    // Calculate the total price with the late fine if applicable
    const totalPrice = workspaceData.Attributes.price + (lateFine || 0);

    // Process the payment
    const paymentSuccess = processPayment(totalPrice, paymentInfo);

    // Save the payment record
    const paymentRecord = await savePaymentRecord(
      totalPrice,
      userId,
      req.params.id,
      rentEquipment,
      lateFine,
      paymentSuccess ? "success" : "failed"
    );

    if (!paymentSuccess) {
      res.status(400).json({ error: "Payment failed", paymentRecord });
      return;
    }

    // If rentEquipment is specified, update the availability of the equipment
    if (
      rentEquipment &&
      Array.isArray(rentEquipment) &&
      rentEquipment.length > 0
    ) {
      const updateEquipmentAvailability = async (equipmentId) => {
        const equipmentParams = {
          TableName: "equipments",
          Key: {
            id: equipmentId,
          },
          UpdateExpression: "SET available = :available",
          ExpressionAttributeValues: {
            ":available": false,
          },
          ReturnValues: "ALL_NEW",
        };

        const equipmentData = await dynamoDb.update(equipmentParams).promise();
        totalPrice += equipmentData.Attributes.price;
      };

      // Update the availability of all specified equipment
      await Promise.all(rentEquipment.map(updateEquipmentAvailability));
    }

    res.json({ ...workspaceData.Attributes, totalPrice });
  } catch (error) {
    res.status(500).json({ error: "Error renting workspace" });
  }
});

// Rent a time slot for a workspace
app.post("/workspaces/:id/rent-time-slot", async (req, res) => {
  const { startTime, endTime, paymentInfo, userId } = req.body;

  const isValidDateTime = (dateTime) => {
    const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    return regex.test(dateTime);
  };
  
  // Validate startTime and endTime format (e.g., "2023-05-01T10:00:00" and "2023-05-01T12:00:00")
  if (!isValidDateTime(startTime) || !isValidDateTime(endTime)) {
    res.status(400).json({ error: "Invalid startTime or endTime format" });
    return;
  }

  // Check if the time slot is available
  const workspaceParams = {
    TableName: tableName,
    Key: {
      id: req.params.id,
    },
  };

  try {
    const workspaceData = await dynamoDb.get(workspaceParams).promise();
    const rentedTimeSlots = workspaceData.Item.rentedTimeSlots || [];

    // Check if the requested time slot is available
    const isTimeSlotAvailable = rentedTimeSlots.every(
      (slot) => slot.endTime <= startTime || slot.startTime >= endTime
    );

    if (!isTimeSlotAvailable) {
      res.status(400).json({ error: "Time slot is not available" });
      return;
    }

    // Calculate the price for the rented time slot
    const hours = (new Date(endTime) - new Date(startTime)) / 3600000;
    const totalPrice = workspaceData.Item.price * hours;

    // Process the payment
    const paymentSuccess = processPayment(totalPrice, paymentInfo);

    // Save the payment record
    const paymentRecord = await savePaymentRecord(
      totalPrice,
      userId,
      req.params.id,
      null,
      null,
      paymentSuccess ? "success" : "failed"
    );

    if (!paymentSuccess) {
      res.status(400).json({ error: "Payment failed", paymentRecord });
      return;
    }

    // Save the rented time slot
    rentedTimeSlots.push({ startTime, endTime, userId });
    const updateParams = {
      TableName: tableName,
      Key: {
        id: req.params.id,
      },
      UpdateExpression: "SET rentedTimeSlots = :rentedTimeSlots",
      ExpressionAttributeValues: {
        ":rentedTimeSlots": rentedTimeSlots,
      },
    };

    await dynamoDb.update(updateParams).promise();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error renting time slot" });
  }
});

// ... (previous code)

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});

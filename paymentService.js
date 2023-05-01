const AWS = require('aws-sdk');
const uuid = require('uuid');

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const processPayment = (amount, paymentInfo) => {
  // Implement payment processing with your payment provider API here
  // For this example, we will assume the payment is always successful
  return true;
};

const savePaymentRecord = async (id, price, reserveId, status, timestamp, userId) => {
  const paymentId = uuid.v4();
  const time = new Date().toISOString();

  const params = {
    TableName: 'payments',
    Item: {
      id : paymentId, 
      price, 
      reserveId, 
      status, 
      timestamp : time, 
      userId
    },
  };

  try {
    await dynamoDb.put(params).promise();
    return params.Item;
  } catch (error) {
    console.error('Error saving payment record:', error);
    throw error;
  }
};

module.exports = { processPayment, savePaymentRecord };

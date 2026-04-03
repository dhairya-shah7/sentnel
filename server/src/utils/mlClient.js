const axios = require('axios');

const mlClient = axios.create({
  baseURL: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  timeout: 1800000, // 30 min - large datasets can take a while
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
});

mlClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.code === 'ECONNRESET') {
      const e = new Error('Connection to the ML service was reset while processing the request.');
      e.statusCode = 503;
      e.code = 'ML_SERVICE_RESET';
      return Promise.reject(e);
    }
    if (err.code === 'ECONNREFUSED') {
      const e = new Error('ML service is unavailable. Ensure the FastAPI server is running on port 8000.');
      e.statusCode = 503;
      e.code = 'ML_SERVICE_UNAVAILABLE';
      return Promise.reject(e);
    }
    return Promise.reject(err);
  }
);

module.exports = mlClient;

/**
 * Export all models for easy importing
 */

const Provider = require('./Provider');
const Client = require('./Client');
const Job = require('./Job');
const Aggregator = require('./Aggregator');

module.exports = {
    Provider,
    Client,
    Job,
    Aggregator
};

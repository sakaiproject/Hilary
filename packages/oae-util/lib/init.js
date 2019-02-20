/*!
 * Copyright 2014 Apereo Foundation (AF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://opensource.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const log = require('oae-logger').logger('oae-cassandra');

const Cassandra = require('./cassandra');
const Cleaner = require('./cleaner');
const Locking = require('./locking');
const MQ = require('./mq');
const Pubsub = require('./pubsub');
const Redis = require('./redis');
const Signature = require('./signature');
const TaskQueue = require('./taskqueue');
const Tempfile = require('./tempfile');

const init = function(config, callback) {
  // Create Cassandra database.
  // TODO: Move Cassandra into its own oae-cassandra module with a high priority. All of the init(..) stuff then goes in its init.js
  bootCassandra(config, () => {
    bootRedis(config, () => {
      bootPubSub(config, () => {
        bootRabbitMQ(config, () => {
          return callback();
        });
      });
    });
  });
};

const bootCassandra = (config, callback) => {
  const retryCallback = function(err) {
    const timeout = 5;
    if (err) {
      log().error('Error connecting to cassandra, retrying in ' + timeout + 's...');
      return setTimeout(Cassandra.init, timeout * 1000, config.cassandra, retryCallback);
    }
    return callback();
  };
  Cassandra.init(config.cassandra, retryCallback);
};

const bootRedis = (config, callback) => {
  // Allows for simple redis client creations
  // TODO: Move this into its own oae-redis module with a high priority. All of the init(..) stuff then goes in its init.js
  Redis.init(config.redis, err => {
    if (err) {
      return callback(err);
    }
    // Initialize the Redis based locking
    Locking.init();

    return callback();
  });
};

const bootPubSub = (config, callback) => {
  // Setup the Pubsub communication
  // This requires that the redis utility has already been loaded.
  // TODO: Move this into its own oae-pubsub module with a high priority. All of the init(..) stuff then goes in its init.js
  Pubsub.init(config.redis, err => {
    if (err) {
      return callback(err);
    }

    // Setup the key signing utility
    Signature.init(config.signing);

    // Setup the temporary file generator
    Tempfile.init(config.files.tmpDir);

    // Clean up temp files that might be accidentally left in the temp directory
    if (config.files.cleaner.enabled) {
      Cleaner.start(config.files.tmpDir, config.files.cleaner.interval);
    }

    return callback();
  });
};

const bootRabbitMQ = (config, callback) => {
  // Initialize the RabbitMQ listener
  MQ.init(config.mq, err => {
    if (err) {
      return callback(err);
    }

    // Initialize the task queue
    TaskQueue.init(callback);
  });
};

module.exports = init;

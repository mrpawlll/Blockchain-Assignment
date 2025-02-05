/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const votingContract = require('./lib/votingContract');

module.exports.VotingContract = votingContract;
module.exports.contracts = [votingContract];

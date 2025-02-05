
/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const { Contract } = require('fabric-contract-api');
const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

'use strict';

class VotingContract extends Contract {
    // Initialize the ledger with sample users and candidates
    async InitLedger(ctx) {
        const initialData = {
            users: [
                { certificateId: '00000000000', votes: 0},
            ],
            candidates: [
                { candidateId: 'candidate1', name: 'Alice', votes: 0 },
                { candidateId: 'candidate2', name: 'Bob', votes: 0 },
            ],
        };

        await ctx.stub.putState('users', Buffer.from(JSON.stringify(initialData.users)));
        await ctx.stub.putState('candidates', Buffer.from(JSON.stringify(initialData.candidates)));

        return 'Ledger initialized with users and candidates';
    }

    async UserExists(ctx, certificateId) {
        const usersState = await ctx.stub.getState('users');
        if (!usersState || usersState.length === 0) {
        return false; // No users exist yet
        }
        const users = JSON.parse(usersState.toString());
        return users.some((user) => user.certificateId === certificateId);
    }

async RegisterUser(ctx, certificateId) {
    const exists = await this.UserExists(ctx, certificateId);
    if (exists) {
        throw new Error(`User ${certificateId} already exists`);
    }

    let users = JSON.parse(await ctx.stub.getState('users'));
    console.log('Users before registration:', users);

    // Add new user
    users.push({ certificateId, votes: 0 });
    console.log('Users after registration:', users);

    return `User ${certificateId} registered successfully`;
}
    // Cast a vote
async CastVote(ctx, certificateId, candidateId) {
    // Fetch users and candidates from the ledger
    let users = JSON.parse(await ctx.stub.getState('users'));
    const candidates = JSON.parse(await ctx.stub.getState('candidates'));

    // Check if the user exists, if not, register the user
    let user = users.find((user) => user.certificateId === certificateId);
    if (!user) {
        console.log(`User ${certificateId} not found. Registering user...`);

        // Register new user
        users.push({ certificateId, votes: 0 });
        console.log('New user registered:', { certificateId, votes: 0 });

        // Save the updated users list to the ledger
        await ctx.stub.putState('users', Buffer.from(JSON.stringify(users)));

        // Re-fetch the user after registration
        user = users.find((user) => user.certificateId === certificateId);
    }

    // Check if the user has already voted
    if (user.votes > 0) {
        throw new Error('User has already voted.');
    }

    // Check if the candidate exists
    const candidate = candidates.find((candidate) => candidate.candidateId === candidateId);
    if (!candidate) {
        throw new Error(`Candidate ${candidateId} not found`);
    }

    // Increment the vote count for the candidate and user
    candidate.votes += 1;
    user.votes += 1;

    // Update the candidates and users in the ledger
    await ctx.stub.putState('candidates', Buffer.from(JSON.stringify(candidates)));
    await ctx.stub.putState('users', Buffer.from(JSON.stringify(users)));

    return `Vote cast by ${certificateId} for ${candidateId}`;
}

    // Query users
    async QueryUsers(ctx) {
        const users = await ctx.stub.getState('users');
        return JSON.parse(users.toString());
    }

    // Query candidates
    async QueryCandidates(ctx) {
        const candidates = await ctx.stub.getState('candidates');
        return JSON.parse(candidates.toString());
    }

    // Perform a rich query (e.g., find candidates with votes > threshold)
    async RichQueryCandidates(ctx, threshold) {
        const queryString = JSON.stringify({
            selector: {
                votes: { $gt: parseInt(threshold) },
            },
        });

        const results = [];
        const iterator = await ctx.stub.getQueryResult(queryString);

        let result = await iterator.next();
        while (!result.done) {
            const record = JSON.parse(result.value.value.toString('utf8'));
            results.push(record);
            result = await iterator.next();
        }

        return JSON.stringify(results);
    }
}

module.exports = VotingContract;


const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const express = require('express');
const bodyParser = require('body-parser'); // To parse incoming JSON requests

const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'basic');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');

const app = express();
app.use(bodyParser.json()); // Middleware to parse JSON request bodies
app.use(express.static('public'));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Path to crypto materials.
const cryptoPath = envOrDefault(
    'CRYPTO_PATH',
    path.resolve(
        __dirname,
        '..',
        '..',
        'organizations',
        'peerOrganizations',
        'org1.example.com'
    )
);

// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
    'KEY_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'keystore'
    )
);

// Path to user certificate directory.
const certDirectoryPath = envOrDefault(
    'CERT_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'signcerts'
    )
);

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
    'TLS_CERT_PATH',
    path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt')
);

// Gateway peer endpoint.
const peerEndpoint = envOrDefault('PEER_ENDPOINT', 'localhost:7051');

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault('PEER_HOST_ALIAS', 'peer0.org1.example.com');

const utf8Decoder = new TextDecoder();
const assetId = `asset${String(Date.now())}`;

async function main() {
    // Start the web server to handle POST/GET requests
    const server = app.listen(3000, () => {
        console.log('Server running on http://localhost:3000');
    });
    displayInputParameters();

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();

    process.on('SIGINT', async () => {
        console.log('Shutting down gracefully...');
        server.close(() => {
        console.log('Express server closed.');
        });
        client.close();
        process.exit(0);
    });

    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });

    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    // API Endpoints
    // POST endpoint to register a user
    app.post('/register', async (req, res) => {
        const { certificateId } = req.body;
        if (!certificateId) {
            return res.status(400).send('certificateId is required');
        }
        try {
            await registerUser(contract, certificateId);
            res.status(200).send(`User ${certificateId} registered successfully.`);
        } catch (error) {
            res.status(500).send(`Failed to register user: ${error.message}`);
        }
    });

    // POST endpoint to cast a vote
    app.post('/vote', async (req, res) => {
        const { certificateId, candidateId } = req.body;
        if (!certificateId || !candidateId) {
            return res.status(400).send('certificateId and candidateId are required');
        }
        try {
            await castVote(contract, certificateId, candidateId);
            res.status(200).send(`User ${certificateId} casted vote for candidate ${candidateId}`);
        } catch (error) {
            res.status(500).send(`Failed to cast vote: ${error.message}`);
        }
    });

    // GET endpoint to query users
    app.get('/users', async (req, res) => {
        try {
            const result = await queryUsers(contract);
            res.status(200).send(result);
        } catch (error) {
            res.status(500).send(`Failed to query users: ${error.message}`);
        }
    });

    // GET endpoint to query candidates
    app.get('/candidates', async (req, res) => {
        try {
            const result = await queryCandidates(contract);
            res.status(200).send(result);
        } catch (error) {
            res.status(500).send(`Failed to query candidates: ${error.message}`);
        }
    });

    // Rich query on candidates
    app.get('/candidates/rich-query', async (req, res) => {
        const { threshold } = req.query;
        if (!threshold) {
            return res.status(400).send('threshold is required');
        }
        try {
            const result = await richQueryCandidates(contract, parseInt(threshold));
            res.status(200).send(result);
        } catch (error) {
            res.status(500).send(`Failed to query candidates: ${error.message}`);
        }
    });

    async function registerUser(contract, certificateId) {
        console.log(`\n--> Submit Transaction: RegisterUser, registering user with ID ${certificateId}`);
        const resultBytes = await contract.submitTransaction('RegisterUser', certificateId);

        console.log('*** Result:', resultBytes.toString());

    }

    async function castVote(contract, certificateId, candidateId) {
        console.log(`\n--> Submit Transaction: CastVote, user ${certificateId} casting vote for candidate ${candidateId}`);
        const resultBytes = await contract.submitTransaction('CastVote', certificateId, candidateId);

        console.log('*** Result:', resultBytes.toString());
    }

    async function queryUsers(contract) {
        console.log('\n--> Evaluate Transaction: QueryUsers');
        const resultBytes = await contract.evaluateTransaction('QueryUsers');
        return returnResult(resultBytes);

    }

    async function queryCandidates(contract) {
        console.log('\n--> Evaluate Transaction: QueryCandidates');
        const resultBytes = await contract.evaluateTransaction('QueryCandidates');
        return returnResult(resultBytes);
    }

    async function richQueryCandidates(contract, threshold) {
        console.log(`\n--> Evaluate Transaction: RichQueryCandidates`);
        const resultBytes = await contract.evaluateTransaction('RichQueryCandidates', threshold);
        return resultBytes.toString();
    }

}

main().catch((error) => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

async function returnResult(bytes){
        const resultJson = utf8Decoder.decode(bytes);
        const result = JSON.parse(resultJson);
        console.log(result);
        return result;
}


async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function getFirstDirFileName(dirPath) {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}

/**
 * envOrDefault() will return the value of an environment variable, or a default value if the variable is undefined.
 */
function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}

/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
function displayInputParameters() {
    console.log(`channelName:       ${channelName}`);
    console.log(`chaincodeName:     ${chaincodeName}`);
    console.log(`mspId:             ${mspId}`);
    console.log(`cryptoPath:        ${cryptoPath}`);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
    console.log(`certDirectoryPath: ${certDirectoryPath}`);
    console.log(`tlsCertPath:       ${tlsCertPath}`);
    console.log(`peerEndpoint:      ${peerEndpoint}`);
    console.log(`peerHostAlias:     ${peerHostAlias}`);
}

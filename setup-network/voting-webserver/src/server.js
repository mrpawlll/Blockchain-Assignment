const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const { connectToFabric, registerUser, castVote, queryUsers, queryCandidates } = require('./fabric');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure session middleware
app.use(session({
    secret: 'your-secret-key', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Set `true` if using HTTPS
}));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.use(
    express.static('public', {
        index: false, // Disable serving index.html automatically
    })
);

let fabricClient;

// Initialize the SQLite database (in-memory)
const db = new sqlite3.Database(':memory:');

// Start the server
const startServer = async () => {
  console.log('Starting server...');
    fabricClient = await connectToFabric();
    app.listen(3000, () => console.log('Server running on http://localhost:3000'));

  // Create the "users" table
  db.serialize(() => {
    console.log('Creating table...');
    db.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      } else {
        console.log('Table "users" created successfully.');
      }
    });

    // Insert initial data
    console.log('Inserting initial data...');
    const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
    stmt.run('001021120429', 'admin123','admin'); // Initial user 1
    stmt.run('001021120430', 'password123','user'); // Initial user 2
    stmt.run('001021120431', 'password123','user'); // Initial user 2
    stmt.finalize();

    // Verify the initial data
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) {
        console.error('Error fetching initial data:', err.message);
      } else {
        console.log('Initial Data:');
        console.table(rows);
      }
    });
  });
};

// API Endpoints
// Handle login POST request

app.get('/', (req, res) => {
    res.redirect('/login.html'); // Change to '/index.html' if you want to make that the default
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log("Request Body: ", req.body);
    console.log("Username: ", username);
    console.log("Password: ", password);

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    db.get(query, [username, password], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (row) {
        req.session.user = { username: username }; // Store user context in session
            console.log(`User session details ${req.session.user}`);
            if(row.role == 'admin'){
            // User found and credentials are valid
            return res.status(200).json({ success: true, redirectUrl: '/admin-index.html' });
            }else if(row.role == 'user'){
            return res.status(200).json({ success: true, redirectUrl: '/index.html' });
            }else{
                return res.status(400).json({ error: 'Your account has no role.'})
            }
        } else {
            // Invalid credentials
            return res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

app.post('/vote', async (req, res) => {
    const {candidateId } = req.body;
    const certificateId = req.session.user.username;
    if (!certificateId || !candidateId) return res.status(400).send('certificateId and candidateId are required');
    try {
        const result = await castVote(fabricClient.contract, certificateId, candidateId);
        res.status(200).send(`User ${certificateId} casted vote for candidate ${candidateId}`);
    } catch (error) {
        res.status(500).send(`Failed to cast vote: ${error.message}`);
    }
});

app.get('/users', async (req, res) => {
    try {
        const result = await queryUsers(fabricClient.contract);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).send(`Failed to query users: ${error.message}`);
    }
    console.log(`${req.session.user.username} has queried for users.`)
});

app.get('/candidates', async (req, res) => {
    try {
        const result = await queryCandidates(fabricClient.contract);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).send(`Failed to query candidates: ${error.message}`);
    }
    console.log(`${req.session.user.username} has queried for users.`)
});


const stopServer = () => {
  console.log('Stopping server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
};

startServer().catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  stopServer();
  process.exit();
});
